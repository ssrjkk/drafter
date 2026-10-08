/**
 * Regression tests for provider routing, key isolation and circuit-breaker
 * bookkeeping in UnifiedAiService.
 *
 * The two bugs these cover were severe: every non-Anthropic provider failed its
 * *first* request with "API key is required" (the key was only injected for
 * Claude), and switching to an unconfigured provider kept the previous
 * provider's key, shipping it to a different origin.
 *
 * @module UnifiedAiService tests
 * @author ssrjkk
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUnifiedAiService } from '../data/api/UnifiedAiService';
import type { AiProvider } from '../data/api/types';

const executed: Array<{ provider: AiProvider; options: Record<string, unknown> }> = [];
let mockResult: { success: boolean; output?: string; error?: string } = { success: true, output: 'ok' };

vi.mock('../data/api/GenericApiService', () => ({
  GenericApiService: class {
    apiKey: string;
    model: string;
    constructor(config: { apiKey: string; model: string }) {
      this.apiKey = config.apiKey;
      this.model = config.model;
    }
    setApiKey(key: string) { this.apiKey = key; }
    setModel(model: string) { this.model = model; }
    abort() {}
    async execute(options: Record<string, unknown>) {
      executed.push({ provider: currentProvider, options });
      return mockResult;
    }
    async executeWithRetry(options: Record<string, unknown>) {
      executed.push({ provider: currentProvider, options });
      return mockResult;
    }
  },
}));

vi.mock('../data/api/ClaudeApiService', () => ({
  ClaudeApiService: class {
    apiKey = '';
    model: string;
    constructor(config: { model: string }) { this.model = config.model; }
    setModel(model: string) { this.model = model; }
    abort() {}
    async execute(options: Record<string, unknown>) {
      executed.push({ provider: currentProvider, options });
      return mockResult;
    }
    async executeWithRetry(options: Record<string, unknown>) {
      executed.push({ provider: currentProvider, options });
      return mockResult;
    }
  },
}));

let currentProvider: AiProvider = 'claude';

function makeService() {
  executed.length = 0;
  currentProvider = 'claude';
  mockResult = { success: true, output: 'ok' };
  return createUnifiedAiService();
}

const baseOptions = { systemPrompt: 'sys', userMessage: 'msg' };

describe('UnifiedAiService — API key routing', () => {
  beforeEach(() => makeService());

  it.each<AiProvider>(['groq', 'openai', 'gemini', 'openrouter', 'deepseek', 'together', 'novita', 'lepton'])(
    'sends the key on the first request to %s',
    async provider => {
      const service = makeService();
      service.setProvider(provider, 'test-key-123');

      const result = await service.execute(baseOptions);

      expect(result.success).toBe(true);
      expect(executed).toHaveLength(1);
      // The bug: this was undefined/'' for every provider except Claude, so the
      // first Execute after switching provider always failed.
      expect(executed[0]!.options.apiKey).toBe('test-key-123');
    },
  );

  it('sends the key on the first request to claude', async () => {
    const service = makeService();
    service.setProvider('claude', 'claude-key');
    await service.execute(baseOptions);
    expect(executed[0]!.options.apiKey).toBe('claude-key');
  });

  it('ignores a caller-supplied apiKey', async () => {
    // A stale store key must never override the configured one, otherwise it
    // can be sent to the wrong provider.
    const service = makeService();
    service.setProvider('groq', 'configured-key');
    // `apiKey` is deliberately not part of the public signature; cast because
    // the whole point is that it is ignored when it *is* present.
    await service.execute({ ...baseOptions, apiKey: 'stale-other-provider-key' } as typeof baseOptions);
    expect(executed[0]!.options.apiKey).toBe('configured-key');
  });

  it('does not reuse the previous provider key when switching to an unconfigured one', async () => {
    const service = makeService();
    service.setProvider('claude', 'sk-ant-secret');
    service.setProvider('groq', '');

    // Guard: an empty key must be rejected outright, never silently falling
    // back to the Claude key.
    const result = await service.execute(baseOptions);
    expect(result.success).toBe(false);
    expect(result.error).toContain('API key is required');
    expect(executed).toHaveLength(0);
  });

  it('refuses to execute without a key for any provider', async () => {
    const service = makeService();
    service.setProvider('openai', '');
    const result = await service.executeWithRetry(baseOptions);
    expect(result.success).toBe(false);
    expect(result.error).toBe('openai API key is required.');
  });

  it('surfaces a provider failure without throwing', async () => {
    const service = makeService();
    service.setProvider('groq', 'k');
    mockResult = { success: false, error: 'Upstream exploded' };
    const result = await service.execute(baseOptions);
    expect(result).toEqual({ success: false, error: 'Upstream exploded' });
  });
});

describe('UnifiedAiService — circuit breaker', () => {
  beforeEach(() => makeService());

  it('does not trip on user cancellation', async () => {
    const service = makeService();
    service.setProvider('groq', 'k');

    for (let i = 0; i < 5; i++) {
      mockResult = { success: false, error: 'Request aborted' };
      await service.execute(baseOptions);
    }

    // Three cancels used to open the circuit for 60s and lock the provider.
    mockResult = { success: true, output: 'ok' };
    const result = await service.execute(baseOptions);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it.each(['API key is required.', 'No internet connection', 'Unauthorized 401', 'invalid x-api-key'])(
    'does not trip on %s',
    async error => {
      const service = makeService();
      service.setProvider('groq', 'k');
      for (let i = 0; i < 5; i++) {
        mockResult = { success: false, error };
        await service.execute(baseOptions);
      }
      mockResult = { success: true, output: 'ok' };
      expect((await service.execute(baseOptions)).success).toBe(true);
    },
  );

  it('trips after repeated genuine failures', async () => {
    const service = makeService();
    service.setProvider('groq', 'k');

    for (let i = 0; i < 3; i++) {
      mockResult = { success: false, error: 'Server error: 503 upstream unavailable' };
      await service.execute(baseOptions);
    }

    const result = await service.execute(baseOptions);
    expect(result.success).toBe(false);
    expect(result.error).toContain('circuit breaker open');
  });

  it('a success clears the failure streak', async () => {
    const service = makeService();
    service.setProvider('groq', 'k');

    mockResult = { success: false, error: 'Server error: 503 unavailable' };
    await service.execute(baseOptions);
    await service.execute(baseOptions);

    mockResult = { success: true, output: 'ok' };
    await service.execute(baseOptions);

    // Two more failures must not reach the threshold of three.
    mockResult = { success: false, error: 'Server error: 503 unavailable' };
    await service.execute(baseOptions);
    await service.execute(baseOptions);

    mockResult = { success: true, output: 'ok' };
    expect((await service.execute(baseOptions)).success).toBe(true);
  });

  it('keeps breakers independent per provider', async () => {
    const service = makeService();
    service.setProvider('groq', 'k');
    for (let i = 0; i < 3; i++) {
      mockResult = { success: false, error: 'Server error: 503 unavailable' };
      await service.execute(baseOptions);
    }

    service.setProvider('deepseek', 'k2');
    mockResult = { success: true, output: 'ok' };
    expect((await service.execute(baseOptions)).success).toBe(true);
  });
});

describe('UnifiedAiService — abort', () => {
  beforeEach(() => makeService());

  it('aborts without throwing when nothing is running', () => {
    const service = makeService();
    expect(() => service.abort()).not.toThrow();
  });

  it('reaches the provider service', async () => {
    const abortSpy = vi.fn();
    vi.doMock('../data/api/GroqApiService', () => ({
      GroqApiService: class {
        setApiKey() {}
        setModel() {}
        abort = abortSpy;
        async execute() { return { success: true, output: 'ok' }; }
      },
    }));

    const service = makeService();
    service.setProvider('groq', 'k');
    await service.execute(baseOptions);
    service.abort();

    expect(abortSpy).toHaveBeenCalled();
    vi.doUnmock('../data/api/GroqApiService');
  });
});
