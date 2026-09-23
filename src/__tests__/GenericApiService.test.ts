import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericApiService } from '../data/api/GenericApiService';

vi.mock('../lib/metrics', () => ({
  metricsCollector: { recordRequest: vi.fn() },
}));

vi.mock('../lib/constants', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/constants')>();
  return {
    ...original,
    LIMITS: { ...original.LIMITS, retryBaseDelayMs: 0, retryMaxDelayMs: 0, retryJitterFactor: 0 },
  };
});

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('GenericApiService', () => {
  let svc: GenericApiService;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, writable: true, configurable: true });
    svc = new GenericApiService({
      apiKey: 'test-key',
      model: 'test-model',
      maxTokens: 4096,
      apiUrl: 'https://api.example.com/v1/chat/completions',
      provider: 'deepseek',
      providerName: 'TestProvider',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('setModel updates model', async () => {
    svc.setModel('new-model');
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    await svc.execute({ systemPrompt: 'sys', userMessage: 'msg' });
    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe('new-model');
  });

  it('setApiKey updates api key', async () => {
    svc.setApiKey('new-key');
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    await svc.execute({ systemPrompt: 'sys', userMessage: 'msg' });
    const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer new-key');
  });

  it('returns error when no api key', async () => {
    const noKeySvc = new GenericApiService({
      apiKey: '',
      model: 'm',
      maxTokens: 100,
      apiUrl: 'https://x.com',
      provider: 'deepseek',
      providerName: 'X',
    });
    const result = await noKeySvc.execute({ systemPrompt: 's', userMessage: 'm' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('API key is required');
  });

  it('execute returns success on valid response', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({
      choices: [{ message: { content: 'hello' } }],
      usage: { completion_tokens: 10, prompt_tokens: 5 },
    }));
    const result = await svc.execute({ systemPrompt: 'sys', userMessage: 'msg' });
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello');
    expect(result.usage?.outputTokens).toBe(10);
    expect(result.usage?.inputTokens).toBe(5);
  });

  it('execute returns error on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Unauthorized' } }),
    } as Response);
    const result = await svc.execute({ systemPrompt: 's', userMessage: 'm' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unauthorized');
  });

  it('execute returns error when no choices', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ choices: [] }));
    const result = await svc.execute({ systemPrompt: 's', userMessage: 'm' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No response');
  });

  it('execute retries on 5xx errors', async () => {
    const errorResp = { ok: false, status: 503, json: () => Promise.resolve({}) } as Response;
    const successResp = mockJsonResponse({ choices: [{ message: { content: 'recovered' } }] });

    mockFetch.mockResolvedValueOnce(errorResp);
    mockFetch.mockResolvedValueOnce(successResp);

    const result = await svc.executeWithRetry({ systemPrompt: 's', userMessage: 'm', maxRetries: 1 });
    expect(result.success).toBe(true);
    expect(result.output).toBe('recovered');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('execute aborts in-flight request', async () => {
    let rejectFetch!: (e: Error) => void;
    mockFetch.mockImplementation(() => new Promise((_r, reject) => { rejectFetch = reject; }));
    const abortPromise = svc.execute({ systemPrompt: 's', userMessage: 'm' });
    svc.abort();
    rejectFetch(new DOMException('Aborted', 'AbortError'));
    const result = await abortPromise;
    expect(result.success).toBe(false);
  });

  it('sends extra headers when configured', async () => {
    const svcWithHeaders = new GenericApiService({
      apiKey: 'k',
      model: 'm',
      maxTokens: 100,
      apiUrl: 'https://x.com',
      provider: 'deepseek',
      providerName: 'X',
      extraHeaders: { 'X-Custom': 'test' },
    });
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    await svcWithHeaders.execute({ systemPrompt: 's', userMessage: 'm' });
    const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['X-Custom']).toBe('test');
  });

  it('includes temperature in body when configured', async () => {
    const svcTemp = new GenericApiService({
      apiKey: 'k',
      model: 'm',
      maxTokens: 100,
      apiUrl: 'https://x.com',
      provider: 'deepseek',
      providerName: 'X',
      temperature: 0.7,
    });
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    await svcTemp.execute({ systemPrompt: 's', userMessage: 'm' });
    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(body.temperature).toBe(0.7);
  });

  it('returns offline error when navigator.onLine is false', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, writable: true, configurable: true });
    const result = await svc.execute({ systemPrompt: 's', userMessage: 'm' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No internet');
  });

  it('retries maxRetries times then fails', async () => {
    const errorResp = { ok: false, status: 500, json: () => Promise.resolve({}) } as Response;
    mockFetch.mockResolvedValue(errorResp);
    const result = await svc.executeWithRetry({ systemPrompt: 's', userMessage: 'm', maxRetries: 2 });
    expect(result.success).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
