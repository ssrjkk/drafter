/**
 * Shared OpenAI-compatible API service: streaming, retries, vision payloads
 * @module GenericApiService
 * @author ssrjkk
 */

import type { ApiResult } from './types';
import { getModelInfo } from './types';
import type { AiProvider } from './types';
import { metricsCollector } from '../../lib/metrics';
import { LIMITS } from '../../lib/constants';

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

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function backoff(delayMs: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
  });
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

  async execute(options: GenericExecuteOptions): Promise<ApiResult> {
    return this.executeWithRetry(options);
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    currentRequestId: number,
    onChunk?: (text: string) => void,
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let lineBuffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (currentRequestId !== this.requestId) {
          await reader.cancel().catch(() => {});
          break;
        }

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;
          try {
            const parsed: StreamChunk = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;
            if (delta) {
              text += delta;
              onChunk?.(delta);
            }
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
              outputTokens = parsed.usage.completion_tokens ?? outputTokens;
            }
          } catch { /* malformed SSE frame, skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { text, inputTokens, outputTokens };
  }

  async executeWithRetry(options: GenericExecuteOptions): Promise<ApiResult> {
    const { systemPrompt, userMessage, signal, taskType, onChunk, maxRetries = 3 } = options;
    const startTime = Date.now();
    const currentRequestId = ++this.requestId;

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const ownSignal = this.abortController.signal;

    let lastError = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (!this.config.apiKey) {
          return { success: false, error: 'API key is required' };
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return { success: false, error: 'No internet connection' };
        }

        const streaming = typeof onChunk === 'function';
        const body: Record<string, unknown> = {
          model: this.config.model,
          messages: this.buildMessages({ systemPrompt, userMessage, screenshotBase64: options.screenshotBase64 }),
          max_tokens: this.maxTokensForModel(),
          stream: streaming,
        };
        if (streaming) {
          body.stream_options = { include_usage: true };
        }
        if (this.config.temperature !== undefined) {
          body.temperature = this.config.temperature;
        }

        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          ...this.config.extraHeaders,
        };

        const response = await fetch(this.config.apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: signal
            ? AbortSignal.any([signal, ownSignal])
            : ownSignal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const msg = errorData.error?.message || `${this.config.providerName} API error: ${response.status}`;
          const retryAfterSec = Number(response.headers?.get?.('retry-after'));
          throw Object.assign(new Error(msg), {
            status: response.status,
            ...(Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? { retryAfterMs: retryAfterSec * 1000 } : {}),
          });
        }

        if (streaming) {
          if (!response.body) {
            throw new Error('No response body');
          }
          const { text, inputTokens, outputTokens } = await this.readStream(response.body, currentRequestId, onChunk);
          metricsCollector.recordRequest(taskType || this.config.providerName, true, outputTokens, Date.now() - startTime);
          return {
            success: text.length > 0,
            output: text,
            usage: { inputTokens, outputTokens },
            ...(text.length === 0 ? { error: 'No response from model' } : {}),
          };
        }

        const data = await response.json();

        if (data.choices?.[0]) {
          const responseTime = Date.now() - startTime;
          const content: string = data.choices[0]?.message?.content ?? '';
          const inputTokens: number | undefined = data.usage?.prompt_tokens;
          const outputTokens: number | undefined = data.usage?.completion_tokens;
          metricsCollector.recordRequest(taskType || this.config.providerName, true, outputTokens, responseTime);
          options.onChunk?.(content);
          return {
            success: true,
            output: content,
            usage: { outputTokens, inputTokens },
          };
        }

        return { success: false, error: 'No response from model' };
      } catch (err) {
        const error: ApiError = err instanceof Error ? err : new Error(String(err));
        lastError = error.message;

        if (error.name === 'AbortError') {
          return { success: false, error: 'Request aborted' };
        }

        if (attempt < maxRetries && isRetryableError(error)) {
          const delay = error.retryAfterMs ?? retryDelayMs(attempt);
          options.onRetryAttempt?.(attempt + 1, delay, error.message);
          try {
            await backoff(delay, signal);
          } catch {
            return { success: false, error: 'Request aborted' };
          }
          continue;
        }

        const responseTime = Date.now() - startTime;
        metricsCollector.recordRequest(taskType || this.config.providerName, false, undefined, responseTime);
        return { success: false, error: error.message };
      }
    }

    return { success: false, error: `Max retries exceeded. Last error: ${lastError}` };
  }
}
