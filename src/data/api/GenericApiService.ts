/**
 * Shared OpenAI-compatible API service: streaming, retries, vision payloads
 * @module GenericApiService
 * @author ssrjkk
 */

import type { ApiResult } from './types';
import { getModelInfo } from './types';
import type { AiProvider } from './types';
import { metricsCollector } from '../../lib/metrics';
import { RateLimiter } from '../../lib/rateLimiter';
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

interface ApiError extends Error {
  status?: number;
  retryAfterMs?: number;
}

/** Status is authoritative; message matching only covers transport-level failures. */
function isRetryableError(error: ApiError): boolean {
  if (typeof error.status === 'number') {
    return error.status === 429 || (error.status >= 500 && error.status <= 599);
  }
  const lower = error.message.toLowerCase();
  return ['network', 'timeout', 'fetch', 'econnreset', 'econnrefused'].some(e => lower.includes(e));
}

/** `Retry-After` is either delta-seconds or an HTTP date. */
function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string }; message?: { content?: string }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface StreamResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  malformedFrames: number;
  /** True when the stream ended because the producer sent `[DONE]`. */
  completed: boolean;
}

function retryDelayMs(attempt: number): number {
  const baseDelay = Math.min(Math.pow(2, attempt) * LIMITS.retryBaseDelayMs, LIMITS.retryMaxDelayMs);
  const jitterArray = new Uint32Array(1);
  crypto.getRandomValues(jitterArray);
  const jitter = baseDelay * LIMITS.retryJitterFactor * ((jitterArray[0]! / 0xFFFFFFFF) * 2 - 1);
  return Math.round(baseDelay + jitter);
}

export interface GenericApiConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  apiUrl: string;
  providerName: string;
  provider: AiProvider;
  extraHeaders?: Record<string, string>;
  temperature?: number;
}

export interface GenericExecuteOptions {
  systemPrompt: string;
  userMessage: string;
  screenshotBase64?: string | null;
  signal?: AbortSignal;
  taskType?: string;
  onChunk?: (text: string) => void;
  maxRetries?: number;
  onRetryAttempt?: (attempt: number, delay: number, error: string) => void;
}

/** Failure of a single HTTP attempt, kept structured so the retry loop can classify it. */
interface AttemptFailure {
  message: string;
  status?: number;
  retryAfterMs?: number;
  aborted: boolean;
}

export class GenericApiService {
  protected config: GenericApiConfig;
  private abortController: AbortController | null = null;
  private requestId = 0;

  constructor(config: GenericApiConfig) {
    this.config = config;
  }

  setModel(model: string): void {
    this.config.model = model;
  }

  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }

  abort(): void {
    this.requestId++;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /** Only attach the image when the selected model can actually take one. */
  private supportsVision(): boolean {
    return getModelInfo(this.config.provider, this.config.model)?.supportsVision === true;
  }

  /** Requesting more output than the selected model allows is a hard 400. */
  private maxTokensForModel(): number {
    const ceiling = getModelInfo(this.config.provider, this.config.model)?.maxTokens;
    return ceiling ? Math.min(this.config.maxTokens, ceiling) : this.config.maxTokens;
  }

  private buildMessages(options: GenericExecuteOptions): unknown[] {
    const { systemPrompt, userMessage, screenshotBase64 } = options;
    const messages: unknown[] = [{ role: 'system', content: systemPrompt }];
    if (screenshotBase64 && this.supportsVision()) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userMessage },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
        ],
      });
    } else {
      messages.push({ role: 'user', content: userMessage });
    }
    return messages;
  }

  private isOffline(): boolean {
    // Only an explicit `false` means offline. `navigator.onLine` is `undefined`
    // in embedded webviews and older engines, and treating that as "offline"
    // blocked every request outright.
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  /** Pre-flight guards shared by both `execute` and `executeWithRetry`. */
  private preflight(): string | null {
    if (!this.config.apiKey) return 'API key is required';
    if (this.isOffline()) return 'No internet connection';
    if (!RateLimiter.consumeSlot()) {
      return `Rate limit exceeded. Please wait ${RateLimiter.getResetTime()} seconds.`;
    }
    return null;
  }

  private beginRequest(): { requestId: number; controller: AbortController } {
    // A new request supersedes the previous one.
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    return { requestId: ++this.requestId, controller };
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    currentRequestId: number,
    onChunk?: (text: string) => void,
  ): Promise<StreamResult> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let malformedFrames = 0;
    let completed = false;
    let superseded = false;

    const consume = (raw: string): void => {
      const payload = raw.trim();
      if (!payload) return;
      if (payload === SSE_DONE) {
        completed = true;
        return;
      }
      try {
        const parsed: StreamChunk = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          text += delta;
          onChunk?.(delta);
        }
        if (parsed.usage) {
          inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
          outputTokens = parsed.usage.completion_tokens ?? outputTokens;
        }
        if (parsed.choices?.[0]?.finish_reason) completed = true;
      } catch {
        // One garbled frame must not silently truncate the whole answer, but it
        // has to be counted so the caller can surface it.
        malformedFrames++;
      }
    };

    try {
      while (!completed) {
        const { done, value } = await reader.read();
        if (done) break;
        if (currentRequestId !== this.requestId) {
          superseded = true;
          await reader.cancel().catch(() => {});
          break;
        }
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          consume(frame.data);
        }
      }

      if (!superseded) {
        // Flush the decoder (multi-byte character split across the last chunk)
        // and the parser (final frame without its trailing blank line).
        for (const frame of parser.flush()) consume(frame.data);
      }
    } finally {
      try { reader.releaseLock(); } catch { /* already released after cancel */ }
    }

    return { text, inputTokens, outputTokens, malformedFrames, completed };
  }

  /** One HTTP attempt, including the provider-response handling. */
  private async attempt(options: GenericExecuteOptions, requestId: number, signal: AbortSignal): Promise<AttemptFailure | ApiResult> {
    const { systemPrompt, userMessage, taskType, onChunk } = options;
    const startTime = Date.now();
    const label = taskType || this.config.providerName;

    const streaming = typeof onChunk === 'function';
    const streamChunk = onChunk;
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.buildMessages({ systemPrompt, userMessage, screenshotBase64: options.screenshotBase64 }),
      max_tokens: this.maxTokensForModel(),
      stream: streaming,
    };
    if (streaming) body.stream_options = { include_usage: true };
    if (this.config.temperature !== undefined) body.temperature = this.config.temperature;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      ...this.config.extraHeaders,
    };

    const timeout = withTimeoutSignal([signal], LIMITS.requestTimeoutMs);
    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: combineSignals([signal, timeout.signal]),
      });

      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => null);
        const providerMessage =
          typeof (errorData as { error?: { message?: unknown } } | null)?.error?.message === 'string'
            ? ((errorData as { error: { message: string } }).error.message)
            : null;
        return {
          message: redactSecrets(providerMessage || `${this.config.providerName} API error: ${response.status}`),
          status: response.status,
          retryAfterMs: parseRetryAfter(response.headers?.get?.('retry-after')),
          aborted: false,
        };
      }

      if (streaming) {
        if (!response.body) return { message: 'No response body', aborted: false };
        const stream = await this.readStream(response.body, requestId, onChunk);
        const responseTime = Date.now() - startTime;

        if (stream.text.length === 0) {
          metricsCollector.recordRequest(label, false, undefined, responseTime);
          const detail = stream.malformedFrames > 0 ? ` (${stream.malformedFrames} unreadable stream frames)` : '';
          return { success: false, error: `No response from model${detail}` };
        }
        if (requestId !== this.requestId) {
          return { success: false, error: ABORT_ERROR };
        }
        metricsCollector.recordRequest(label, true, stream.outputTokens, responseTime);
        return { success: true, output: stream.text, usage: { inputTokens: stream.inputTokens, outputTokens: stream.outputTokens } };
      }

      const data: {
        choices?: Array<{ message?: { content?: unknown }; finish_reason?: string | null }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      } = await response.json();

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        metricsCollector.recordRequest(label, false, undefined, Date.now() - startTime);
        return { success: false, error: 'No response from model' };
      }
      streamChunk?.(content);
      metricsCollector.recordRequest(label, true, data.usage?.completion_tokens, Date.now() - startTime);
      return {
        success: true,
        output: content,
        usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens },
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const aborted = error.name === 'AbortError' || signal.aborted || requestId !== this.requestId;
      if (aborted) return { message: ABORT_ERROR, aborted: true };
      return { message: redactSecrets(error.message || 'Request failed'), aborted: false };
    } finally {
      timeout.dispose();
    }
  }

  private isApiResult(value: AttemptFailure | ApiResult): value is ApiResult {
    return (value as ApiResult).success !== undefined;
  }

  private recordFailure(label: string | undefined, failure: AttemptFailure): void {
    if (failure.aborted) return;
    metricsCollector.recordRequest(label || this.config.providerName, false, undefined, 0);
  }

  /** Single HTTP attempt — no retries. */
  async execute(options: GenericExecuteOptions): Promise<ApiResult> {
    const guard = this.preflight();
    if (guard) return { success: false, error: guard };

    const { requestId, controller } = this.beginRequest();
    const outcome = await this.attempt(options, requestId, combineSignals([options.signal, controller.signal]));
    if (!this.isApiResult(outcome)) {
      this.recordFailure(options.taskType, outcome);
      return outcome.aborted ? { success: false, error: ABORT_ERROR } : { success: false, error: outcome.message };
    }
    return outcome;
  }

  async executeWithRetry(options: GenericExecuteOptions): Promise<ApiResult> {
    const maxRetries = Math.max(0, options.maxRetries ?? LIMITS.maxRetries);
    let lastError = 'Request failed';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const guard = this.preflight();
      if (guard) return { success: false, error: guard };

      const { requestId, controller } = this.beginRequest();
      const outcome = await this.attempt(options, requestId, combineSignals([options.signal, controller.signal]));

      if (this.isApiResult(outcome)) {
        if (outcome.success) return outcome;
        // A completed-but-empty response is terminal, not retryable.
        return outcome;
      }

      if (outcome.aborted) return { success: false, error: ABORT_ERROR };

      lastError = outcome.message;
      this.recordFailure(options.taskType, outcome);

      if (attempt >= maxRetries) break;

      const retryable = isRetryableError(
        Object.assign(new Error(lastError), { status: outcome.status, retryAfterMs: outcome.retryAfterMs }),
      );
      if (!retryable) return { success: false, error: lastError };

      const delayMs = Math.min(outcome.retryAfterMs ?? retryDelayMs(attempt), LIMITS.retryMaxDelayMs);
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