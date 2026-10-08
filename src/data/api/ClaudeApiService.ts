/**
 * Anthropic Claude API service with streaming SSE
 * @module ClaudeApiService
 * @author ssrjkk
 */

import type { ApiConfig, ApiResult, ClaudeContentBlock } from './types';
import { RateLimiter } from '../../lib/rateLimiter';
import { metricsCollector } from '../../lib/metrics';
import { LIMITS } from '../../lib/constants';
import {
  ABORT_ERROR,
  SSE_DONE,
  SseParser,
  combineSignals,
  delay,
  redactSecrets,
  withTimeoutSignal,
} from './requestUtils';

/** Everything a single attempt needs to report back to the retry loop. */
interface AttemptFailure {
  message: string;
  status?: number;
  retryAfterMs?: number;
  aborted: boolean;
  /** `offline` and `unknown` must not be retried. */
  retryable: boolean;
}

export interface ClaudeExecuteOptions {
  apiKey?: string;
  systemPrompt: string;
  userMessage: string;
  screenshotBase64?: string | null;
  signal?: AbortSignal;
  taskType?: string;
  onChunk?: (text: string) => void;
}

export class ClaudeApiService {
  private config: ApiConfig;
  private requestId = 0;
  private abortController: AbortController | null = null;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  setModel(model: string): void {
    this.config = { ...this.config, model };
  }

  /**
   * Cancellation must actually stop the HTTP request. Bumping `requestId`
   * alone left Anthropic streaming (and billing) until the socket closed.
   */
  abort(): void {
    this.requestId++;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private isOffline(): boolean {
    // Only an explicit `false` means offline — `navigator.onLine` is not
    // defined in every environment.
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  private preflight(apiKey: string | undefined): string | null {
    if (!apiKey) return 'API key is required';
    if (this.isOffline()) return 'No internet connection';
    if (!RateLimiter.consumeSlot()) {
      return `Rate limit exceeded. Please wait ${RateLimiter.getResetTime()} seconds.`;
    }
    return null;
  }

  private static parseRetryAfter(header: string | null | undefined): number | undefined {
    if (!header) return undefined;
    const seconds = Number(header.trim());
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    return undefined;
  }

  /** Retry only what is worth retrying; HTTP status beats message guessing. */
  private classify(status: number | undefined, message: string): { retryable: boolean } {
    if (this.isOffline()) return { retryable: false };
    if (typeof status === 'number') {
      if (status === 429) return { retryable: true };
      if (status >= 500) return { retryable: true };
      return { retryable: false };
    }
    const lower = message.toLowerCase();
    return { retryable: ['overloaded', 'fetch', 'network', 'timeout', 'econnreset', 'ECONNRESET'].some(t => lower.includes(t)) };
  }

  private calculateBackoff(attempt: number): number {
    const delayMs = Math.min(LIMITS.retryBaseDelayMs * Math.pow(2, attempt), LIMITS.retryMaxDelayMs);
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const jitter = delayMs * LIMITS.retryJitterFactor * ((array[0]! / 0xFFFFFFFF) * 2 - 1);
    return Math.round(delayMs + jitter);
  }

  private async attempt(options: ClaudeExecuteOptions, apiKey: string, requestId: number, signal: AbortSignal): Promise<AttemptFailure | ApiResult> {
    const { systemPrompt, userMessage, screenshotBase64, taskType, onChunk } = options;
    const startTime = Date.now();
    const label = taskType || 'claude';

    const messages: { role: 'user' | 'assistant'; content: string | ClaudeContentBlock[] }[] = [
      { role: 'user', content: userMessage },
    ];
    if (screenshotBase64) {
      messages[0]!.content = [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } },
        { type: 'text', text: userMessage },
      ];
    }

    const requestBody: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages,
      stream: true,
    };

    let fullResponse = '';
    let outputTokens = 0;
    let inputTokens = 0;

    const timeout = withTimeoutSignal([signal], LIMITS.requestTimeoutMs);
    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': this.config.anthropicVersion || '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: combineSignals([signal, timeout.signal]),
      });

      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => null);
        const providerMessage =
          typeof (errorData as { error?: { message?: unknown } } | null)?.error?.message === 'string'
            ? (errorData as { error: { message: string } }).error.message
            : null;
        const message = redactSecrets(providerMessage || `API request failed: ${response.status}`);
        metricsCollector.recordRequest(label, false, 0, Date.now() - startTime);
        return {
          message,
          status: response.status,
          retryAfterMs: ClaudeApiService.parseRetryAfter(response.headers?.get?.('retry-after')),
          aborted: false,
          retryable: this.classify(response.status, message).retryable,
        };
      }

      if (!response.body) {
        metricsCollector.recordRequest(label, false, 0, Date.now() - startTime);
        return { message: 'No response body', aborted: false, retryable: false };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseParser();
      let completed = false;
      let streamError: string | null = null;
      let stoppedForMaxTokens = false;

      const consume = (payload: string): void => {
        if (payload === SSE_DONE) {
          completed = true;
          return;
        }
        if (!payload) return;
        try {
          const parsed = JSON.parse(payload) as {
            type?: string;
            delta?: { text?: string; stop_reason?: string | null };
            message?: { usage?: { input_tokens?: number } };
            usage?: { output_tokens?: number };
            error?: { type?: string; message?: string };
          };

          // Anthropic can fail *mid-stream*; treating the error frame as an
          // unknown chunk returned a truncated answer as a complete success.
          if (parsed.type === 'error') {
            streamError = redactSecrets(parsed.error?.message || parsed.error?.type || 'Stream error');
            return;
          }
          if (parsed.type === 'content_block_delta' && typeof parsed.delta?.text === 'string') {
            fullResponse += parsed.delta.text;
            onChunk?.(parsed.delta.text);
          }
          if (parsed.delta?.stop_reason === 'max_tokens') stoppedForMaxTokens = true;
          if (parsed.type === 'message_start' && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens ?? 0;
          }
          if (parsed.type === 'message_delta' && parsed.usage?.output_tokens) {
            outputTokens = parsed.usage.output_tokens;
          }
        } catch {
          /* malformed SSE chunk, skip */
        }
      };

      try {
        while (!completed && !streamError) {
          const { done, value } = await reader.read();
          if (done) break;
          if (requestId !== this.requestId) {
            await reader.cancel().catch(() => {});
            return { message: ABORT_ERROR, aborted: true, retryable: false };
          }
          for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
            consume(frame.data);
          }
        }
        if (!streamError) {
          for (const frame of parser.flush()) consume(frame.data);
        }
      } finally {
        try { reader.releaseLock(); } catch { /* already released after cancel */ }
      }

      if (streamError) {
        metricsCollector.recordRequest(label, false, 0, Date.now() - startTime);
        const message = streamError as string;
        return { message, aborted: false, retryable: this.classify(undefined, message).retryable };
      }
      if (requestId !== this.requestId) {
        return { message: ABORT_ERROR, aborted: true, retryable: false };
      }

      const responseTime = Date.now() - startTime;
      if (fullResponse.length === 0) {
        metricsCollector.recordRequest(label, false, 0, responseTime);
        return { message: 'No response from model', aborted: false, retryable: true };
      }

      metricsCollector.recordRequest(label, true, outputTokens, responseTime);
      const output = stoppedForMaxTokens ? `${fullResponse}\n\n[Truncated: the model hit its token limit.]` : fullResponse;
      return { success: true, output, usage: { outputTokens, inputTokens } };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const aborted = error.name === 'AbortError' || signal.aborted || requestId !== this.requestId;
      metricsCollector.recordRequest(label, false, 0, Date.now() - startTime);
      if (aborted) return { message: ABORT_ERROR, aborted: true, retryable: false };
      const message = redactSecrets(error.message || 'Request failed');
      return { message, aborted: false, retryable: this.classify(undefined, message).retryable };
    } finally {
      timeout.dispose();
    }
  }

  async execute(options: ClaudeExecuteOptions): Promise<ApiResult> {
    const apiKey = options.apiKey;
    const guard = this.preflight(apiKey);
    if (guard) return { success: false, error: guard };

    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    const requestId = ++this.requestId;

    const outcome = await this.attempt(options, apiKey!, requestId, combineSignals([options.signal, controller.signal]));
    if ('success' in outcome) return outcome;
    return { success: false, error: outcome.message };
  }

  async executeWithRetry(options: ClaudeExecuteOptions & {
    maxRetries?: number;
    onRetryAttempt?: (attempt: number, delay: number, error: string) => void;
  }): Promise<ApiResult> {
    const apiKey = options.apiKey;
    const guard = this.preflight(apiKey);
    if (guard) return { success: false, error: guard };

    const maxRetries = Math.max(0, options.maxRetries ?? LIMITS.maxRetries);
    let lastError = 'Request failed';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      this.abortController?.abort();
      const controller = new AbortController();
      this.abortController = controller;
      const requestId = ++this.requestId;

      const outcome = await this.attempt(options, apiKey!, requestId, combineSignals([options.signal, controller.signal]));
      if ('success' in outcome) return outcome;
      if (outcome.aborted) return { success: false, error: ABORT_ERROR };
      if (!outcome.retryable || attempt >= maxRetries) return { success: false, error: outcome.message };

      lastError = outcome.message;
      const delayMs = Math.min(outcome.retryAfterMs ?? this.calculateBackoff(attempt), LIMITS.retryMaxDelayMs);
      options.onRetryAttempt?.(attempt + 1, delayMs, lastError);
      try {
        await delay(delayMs, options.signal);
      } catch {
        return { success: false, error: ABORT_ERROR };
      }
    }

    return { success: false, error: redactSecrets(`Max retries exceeded. Last error: ${lastError}`) };
  }
}