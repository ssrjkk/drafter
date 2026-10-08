/**
 * Streaming, cancellation and retry regression tests for ClaudeApiService.
 * @module ClaudeApiService streaming tests
 * @author ssrjkk
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeApiService } from '../data/api/ClaudeApiService';
import { RateLimiter } from '../lib/rateLimiter';

vi.mock('../lib/metrics', () => ({
  metricsCollector: { recordRequest: vi.fn() },
}));

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

function streamOf(frames: string[]): Response {
  const encoded = frames.map(f => new TextEncoder().encode(f));
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

function errorResponse(status: number, message: string, headers: Record<string, string> = {}) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message } }),
    headers: new Headers(headers),
  } as unknown as Response;
}

function makeService() {
  return new ClaudeApiService({
    apiKey: 'sk-ant-test',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-test',
    maxTokens: 1024,
    anthropicVersion: '2023-06-01',
    provider: 'claude',
  } as ConstructorParameters<typeof ClaudeApiService>[0]);
}

const opts = { apiKey: 'sk-ant-test', systemPrompt: 's', userMessage: 'm' };

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

describe('ClaudeApiService request shape', () => {
  it('sends the Anthropic auth headers', async () => {
    mockFetch.mockResolvedValueOnce(streamOf(['data: {"type":"message_stop"}\n\n']));

    await makeService().execute(opts);

    const [, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({
      'x-api-key': 'sk-ant-test',
      'anthropic-version': '2023-06-01',
    });
  });

  it('rejects a missing key before any request', async () => {
    const result = await makeService().execute({ systemPrompt: 's', userMessage: 'm' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('API key is required');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('ClaudeApiService streaming', () => {
  it('treats a mid-stream error frame as a failure, not a success', async () => {
    // The bug: the `type:"error"` frame matched no branch and was swallowed,
    // so a truncated answer came back as `{ success: true }` and got saved.
    mockFetch.mockResolvedValueOnce(
      streamOf([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"partial"}}\n\n',
        'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
      ]),
    );

    const result = await makeService().execute(opts);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Overloaded');
  });

  it('marks output truncated at the token limit', async () => {
    mockFetch.mockResolvedValueOnce(
      streamOf([
        'data: {"type":"content_block_delta","delta":{"text":"half an answer"}}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":10}}\n\n',
      ]),
    );

    const result = await makeService().execute(opts);
    expect(result.success).toBe(true);
    expect(result.output).toContain('half an answer');
    expect(result.output).toContain('token limit');
  });

  it('keeps the final frame with no trailing blank line', async () => {
    mockFetch.mockResolvedValueOnce(
      streamOf([
        'data: {"type":"content_block_delta","delta":{"text":"a"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":"b"}}',
      ]),
    );

    const result = await makeService().execute(opts);
    expect(result.output).toBe('ab');
  });

  it('reports token usage from the stream', async () => {
    mockFetch.mockResolvedValueOnce(
      streamOf([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":42}}}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":"x"}}\n\n',
        'data: {"type":"message_delta","usage":{"output_tokens":7}}\n\n',
      ]),
    );

    const result = await makeService().execute(opts);
    expect(result.usage).toEqual({ inputTokens: 42, outputTokens: 7 });
  });
});

describe('ClaudeApiService cancellation', () => {
  it('aborts the underlying fetch', async () => {
    // abort() used to only bump a counter, so Anthropic kept streaming and
    // billing until the socket closed.
    let captured: AbortSignal | undefined;
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => {
      captured = init.signal as AbortSignal;
      return Promise.resolve(streamOf([]));
    });

    const svc = makeService();
    const promise = svc.execute(opts);
    svc.abort();
    await promise;

    expect(captured).toBeDefined();
    expect(captured!.aborted).toBe(true);
  });

  it('does not report a cancelled run as a successful answer', async () => {
    const svc = makeService();
    const promise = svc.execute(opts);
    svc.abort();
    const result = await promise;

    // Previously this fell through to `{ success: true, output: '' }`.
    expect(result.success).toBe(false);
  });
});

describe('ClaudeApiService retries', () => {
  it('retries a 429', async () => {
    mockFetch.mockResolvedValue(errorResponse(429, 'rate_limit_error', { 'retry-after': '1' }));

    const onRetryAttempt = vi.fn();
    const result = await makeService().executeWithRetry({ ...opts, maxRetries: 2, onRetryAttempt });

    expect(result.success).toBe(false);
    // The status used to be dropped, so classification fell back to regexing the
    // message text and 429/529 were never retried.
    expect(onRetryAttempt).toHaveBeenCalled();
  });

  it('retries a 5xx', async () => {
    mockFetch.mockResolvedValue(errorResponse(529, 'Overloaded'));

    const onRetryAttempt = vi.fn();
    await makeService().executeWithRetry({ ...opts, maxRetries: 1, onRetryAttempt });
    expect(onRetryAttempt).toHaveBeenCalled();
  });

  it('does not retry a 400', async () => {
    mockFetch.mockResolvedValue(errorResponse(400, 'invalid request'));

    await makeService().executeWithRetry({ ...opts, maxRetries: 3 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('redacts a provider-echoed credential', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(401, 'invalid x-api-key: sk-ant-api03-abcdefghijklmnopqrst'),
    );

    const result = await makeService().execute(opts);
    expect(result.error).not.toContain('sk-ant-api03-abcdefghijklmnopqrst');
    expect(result.error).toContain('[REDACTED]');
  });
});