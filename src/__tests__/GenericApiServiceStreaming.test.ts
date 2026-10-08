/**
 * Streaming, cancellation and retry regression tests for GenericApiService
 * (all OpenAI-compatible providers).
 * @module GenericApiService streaming tests
 * @author ssrjkk
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericApiService } from '../data/api/GenericApiService';
import { RateLimiter } from '../lib/rateLimiter';
import { ABORT_ERROR } from '../data/api/requestUtils';

vi.mock('../lib/metrics', () => ({
  metricsCollector: { recordRequest: vi.fn() },
}));

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

/** Build a Response whose body yields the given chunks and then ends. */
function streamOf(chunks: Array<Uint8Array | string>): Response {
  const encoded = chunks.map(c => (typeof c === 'string' ? new TextEncoder().encode(c) : c));
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () => {
          if (index >= encoded.length) return Promise.resolve({ done: true, value: undefined });
          return Promise.resolve({ done: false, value: encoded[index++] });
        },
        cancel: () => Promise.resolve(),
        releaseLock: () => {},
      }),
    },
  } as unknown as Response;
}

function generic() {
  return new GenericApiService({
    apiKey: 'test-key',
    model: 'test-model',
    maxTokens: 1024,
    apiUrl: 'https://api.example.com/v1/chat/completions',
    providerName: 'TestProvider',
    provider: 'deepseek',
  });
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(headers),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  RateLimiter.reset();
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, writable: true, configurable: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('GenericApiService streaming', () => {
  it('does not lose the final frame when it has no trailing blank line', async () => {
    // The old parser popped `lines.pop()` into lineBuffer and dropped it at EOF.
    mockFetch.mockResolvedValueOnce(
      streamOf(['data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"}}]}']),
    );

    const chunks: string[] = [];
    const result = await generic().execute({
      systemPrompt: 's',
      userMessage: 'm',
      onChunk: t => chunks.push(t),
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('Hello');
    expect(chunks.join('')).toBe('Hello');
  });

  it('handles CRLF framing and stops at [DONE]', async () => {
    mockFetch.mockResolvedValueOnce(
      streamOf([
        'data: {"choices":[{"delta":{"content":"a"}}]}\r\n\r\n',
        'data: [DONE]\r\n\r\n',
        'data: {"choices":[{"delta":{"content":"never"}}]}\r\n\r\n',
      ]),
    );

    const result = await generic().execute({
      systemPrompt: 's',
      userMessage: 'm',
      onChunk: () => {},
    });

    expect(result.output).toBe('a');
  });

  it('decodes a multi-byte character split across two chunks', async () => {
    const frame = 'data: {"choices":[{"delta":{"content":"→"}}]}';
    const bytes = new TextEncoder().encode(frame);
    const start = bytes.indexOf(0xe2); // first byte of the UTF-8 sequence
    expect(start).toBeGreaterThan(0);

    mockFetch.mockResolvedValueOnce(
      streamOf([bytes.slice(0, start + 1), bytes.slice(start + 1)]),
    );

    const result = await generic().execute({
      systemPrompt: 's',
      userMessage: 'm',
      onChunk: () => {},
    });

    // Without `{ stream: true }` on the decoder this arrives as U+FFFD.
    expect(result.output).toBe('→');
  });

  it('reports unreadable frames instead of silently truncating', async () => {
    mockFetch.mockResolvedValueOnce(streamOf(['data: {oops\n\n']));

    const result = await generic().execute({
      systemPrompt: 's',
      userMessage: 'm',
      onChunk: () => {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('unreadable stream frames');
  });

  it('reports an empty stream as a failure', async () => {
    mockFetch.mockResolvedValueOnce(streamOf(['data: [DONE]\n\n']));

    const result = await generic().execute({
      systemPrompt: 's',
      userMessage: 'm',
      onChunk: () => {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No response from model');
  });
});

describe('GenericApiService cancellation', () => {
  it('returns the shared abort message when the caller cancels', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    });

    const result = await generic().execute({
      systemPrompt: 's',
      userMessage: 'm',
      signal: controller.signal,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(ABORT_ERROR);
  });

  it('does not retry an aborted request', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(() => {
      controller.abort();
      return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });

    await generic().executeWithRetry({
      systemPrompt: 's',
      userMessage: 'm',
      signal: controller.signal,
      maxRetries: 3,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('execute() performs exactly one attempt', async () => {
    // execute() used to delegate to executeWithRetry, so "one call" was four.
    mockFetch.mockResolvedValue(jsonResponse({ error: { message: 'unavailable' } }, 503));

    await generic().execute({ systemPrompt: 's', userMessage: 'm' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('GenericApiService retries', () => {
  it('retries 5xx up to maxRetries', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: { message: 'unavailable' } }, 503));

    const result = await generic().executeWithRetry({
      systemPrompt: 's',
      userMessage: 'm',
      maxRetries: 2,
    });

    expect(result.success).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry 4xx', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: { message: 'bad request' } }, 400));

    await generic().executeWithRetry({ systemPrompt: 's', userMessage: 'm', maxRetries: 3 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('redacts a provider-echoed API key', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: { message: 'Incorrect API key provided: sk-proj-abcdefghijklmnop. Please retry.' } }, 401),
    );

    const result = await generic().execute({ systemPrompt: 's', userMessage: 'm' });
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('sk-proj-abcdefghijklmnop');
    expect(result.error).toContain('[REDACTED]');
  });

  it('honours a Retry-After header', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: { message: 'slow down' } }, 429, { 'retry-after': '1' }),
    );

    const onRetryAttempt = vi.fn();
    await generic().executeWithRetry({
      systemPrompt: 's',
      userMessage: 'm',
      maxRetries: 1,
      onRetryAttempt,
    });

    expect(onRetryAttempt).toHaveBeenCalledWith(1, 1000, expect.any(String));
  });

  it('returns offline immediately without any request', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, writable: true, configurable: true });

    const result = await generic().executeWithRetry({ systemPrompt: 's', userMessage: 'm', maxRetries: 3 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('No internet connection');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('GenericApiService rate limiting', () => {
  it('applies the client-side limit to every provider', async () => {
    // Previously only Claude consulted RateLimiter, so the documented
    // "10 requests / 60s" was unenforced for 8 of the 9 providers.
    const svc = generic();
    mockFetch.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));

    const max = RateLimiter.getConfig().maxRequests;
    for (let i = 0; i < max; i++) {
      await svc.execute({ systemPrompt: 's', userMessage: 'm' });
    }

    const blocked = await svc.execute({ systemPrompt: 's', userMessage: 'm' });
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain('Rate limit exceeded');
  });
});