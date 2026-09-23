/**
 * Unified AI service routing to provider-specific implementations
 * Services are lazily imported via dynamic import() for code splitting
 * @module UnifiedAiService
 * @author ssrjkk
 */

import type { AiProvider, ApiResult } from './types';
import { PROVIDER_MODELS, getDefaultModelForProvider, getVisionProviders, getDefaultApiUrl } from './types';
import { CircuitBreaker } from '../../lib/circuitBreaker';

export interface UnifiedAiService {
  execute(options: {
    systemPrompt: string;
    userMessage: string;
    screenshotBase64?: string | null;
    signal?: AbortSignal;
    taskType?: string;
    onChunk?: (text: string) => void;
  }): Promise<ApiResult>;

  executeWithRetry(options: {
    systemPrompt: string;
    userMessage: string;
    screenshotBase64?: string | null;
    signal?: AbortSignal;
    taskType?: string;
    maxRetries?: number;
    onRetryAttempt?: (attempt: number, delay: number, error: string) => void;
    onChunk?: (text: string) => void;
  }): Promise<ApiResult>;

  abort(): void;
  setApiKey(apiKey: string): void;
  setModel(model: string): void;
  setProvider(provider: AiProvider, apiKey?: string, model?: string): void;
  getProvider(): AiProvider;
  supportsVision(): boolean;
}

interface LazyService {
  setApiKey?(apiKey: string): void;
  setModel(model: string): void;
  abort(): void;
  execute(options: {
    systemPrompt: string;
    userMessage: string;
    screenshotBase64?: string | null;
    signal?: AbortSignal;
    taskType?: string;
    onChunk?: (text: string) => void;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    maxTokens?: number;
  }): Promise<ApiResult>;
  executeWithRetry(options: {
    systemPrompt: string;
    userMessage: string;
    screenshotBase64?: string | null;
    signal?: AbortSignal;
    taskType?: string;
    maxRetries?: number;
    onRetryAttempt?: (attempt: number, delay: number, error: string) => void;
    onChunk?: (text: string) => void;
    apiKey?: string;
  }): Promise<ApiResult>;
}

const VISION_PROVIDERS = getVisionProviders();

function makeDefaultModels(): Map<AiProvider, string> {
  const map = new Map<AiProvider, string>();
    for (const p of Object.keys(PROVIDER_MODELS).filter((k): k is AiProvider => k in PROVIDER_MODELS)) {
    map.set(p, getDefaultModelForProvider(p).id);
  }
  return map;
}

async function importService(provider: AiProvider): Promise<LazyService> {
  const d = makeDefaultModels();
  const m = (p: AiProvider): string => d.get(p) ?? getDefaultModelForProvider(p).id;

  switch (provider) {
    case 'claude': {
      const { ClaudeApiService } = await import('./ClaudeApiService');
      return new ClaudeApiService({
        baseUrl: getDefaultApiUrl('claude'),
        model: m('claude'),
        maxTokens: 8192,
        anthropicVersion: '2023-06-01',
        provider: 'claude',
      });
    }
    case 'groq': {
      const { GroqApiService } = await import('./GroqApiService');
      return new GroqApiService({ apiKey: '', model: m('groq'), maxTokens: 8192 });
    }
    case 'openai': {
      const { OpenAIApiService } = await import('./OpenAIApiService');
      return new OpenAIApiService({ apiKey: '', model: m('openai'), maxTokens: 16384 });
    }
    case 'gemini': {
      const { GeminiApiService } = await import('./GeminiApiService');
      return new GeminiApiService({ apiKey: '', model: m('gemini'), maxTokens: 8192 });
    }
    case 'lepton': {
      const { LeptonApiService } = await import('./LeptonApiService');
      return new LeptonApiService({ apiKey: '', model: m('lepton'), maxTokens: 32768 });
    }
    case 'openrouter': {
      const { OpenRouterApiService } = await import('./OpenRouterApiService');
      return new OpenRouterApiService({ apiKey: '', model: m('openrouter'), maxTokens: 8192 });
    }
    case 'deepseek': {
      const { DeepSeekApiService } = await import('./DeepSeekApiService');
      return new DeepSeekApiService({ apiKey: '', model: m('deepseek'), maxTokens: 8192 });
    }
    case 'together': {
      const { TogetherApiService } = await import('./TogetherApiService');
      return new TogetherApiService({ apiKey: '', model: m('together'), maxTokens: 32768 });
    }
    case 'novita': {
      const { NovitaApiService } = await import('./NovitaApiService');
      return new NovitaApiService({ apiKey: '', model: m('novita'), maxTokens: 8192 });
    }
    default:
      throw new Error(`Provider ${provider} not implemented`);
  }
}

class UnifiedAiServiceImpl implements UnifiedAiService {
  private services = new Map<AiProvider, LazyService>();
  private currentProvider: AiProvider = 'claude';
  private currentApiKey = '';
  private circuitBreakers: Map<AiProvider, CircuitBreaker> = new Map();

  constructor() {
  for (const p of Object.keys(PROVIDER_MODELS).filter((k): k is AiProvider => k in PROVIDER_MODELS)) {
      this.circuitBreakers.set(p, new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 60000,
        monitoringWindow: 30000,
      }));
    }
  }

  getCircuitBreaker(provider: AiProvider): CircuitBreaker | undefined {
    return this.circuitBreakers.get(provider);
  }

  private async ensureService(provider: AiProvider): Promise<LazyService> {
    const existing = this.services.get(provider);
    if (existing) return existing;
    const service = await importService(provider);
    this.services.set(provider, service);
    return service;
  }

  private async syncServiceConfig(provider: AiProvider): Promise<void> {
    const svc = this.services.get(provider);
    if (!svc) return;
    if (typeof svc.setApiKey === 'function') {
      svc.setApiKey(this.currentApiKey);
    }
  }

  setProvider(provider: AiProvider, apiKey?: string, model?: string): void {
    this.currentProvider = provider;
    if (apiKey) this.currentApiKey = apiKey;
    const resolvedModel = model ?? getDefaultModelForProvider(provider).id;
    const svc = this.services.get(provider);
    if (svc) {
      if (typeof svc.setApiKey === 'function' && apiKey) {
        svc.setApiKey(apiKey);
      }
      svc.setModel(resolvedModel);
    }
  }

  getProvider(): AiProvider {
    return this.currentProvider;
  }

  setApiKey(apiKey: string): void {
    this.currentApiKey = apiKey;
    const svc = this.services.get(this.currentProvider);
    if (svc && typeof svc.setApiKey === 'function') {
      svc.setApiKey(apiKey);
    }
  }

  setModel(model: string): void {
    const svc = this.services.get(this.currentProvider);
    if (svc) {
      svc.setModel(model);
    }
  }

  supportsVision(): boolean {
    return VISION_PROVIDERS.includes(this.currentProvider);
  }

  private checkCircuitBreaker(): ApiResult | null {
    const cb = this.circuitBreakers.get(this.currentProvider);
    if (cb && cb.getState() === 'open') {
      const stats = cb.getStats();
      const remainingMs = 60000 - (Date.now() - stats.lastStateChangeTime);
      return {
        success: false,
        error: `Service temporarily unavailable (circuit breaker open). Retry in ${Math.ceil(remainingMs / 1000)}s.`,
      };
    }
    return null;
  }

  private recordCircuitBreakerResult(result: ApiResult, cb: CircuitBreaker | undefined): void {
    if (!cb) return;
    if (!result.success && result.error && !result.error.includes('API key') && !result.error.includes('circuit breaker')) {
      cb.execute(() => Promise.reject(new Error(result.error))).catch(() => {});
    }
  }

  private getApiKeyError(): string | null {
    if (this.currentApiKey) return null;
    return `${this.currentProvider} API key is required.`;
  }

  private ensureApiKey(): ApiResult | null {
    const err = this.getApiKeyError();
    return err ? { success: false, error: err } : null;
  }

  private buildExecuteOpts(options: {
    systemPrompt: string;
    userMessage: string;
    screenshotBase64?: string | null;
    signal?: AbortSignal;
    taskType?: string;
    onChunk?: (text: string) => void;
  }): Parameters<LazyService['execute']>[0] {
    return this.currentProvider === 'claude'
      ? { apiKey: this.currentApiKey, ...options }
      : { ...options };
  }

  private async dispatchExecute(method: 'execute' | 'executeWithRetry', opts: Parameters<LazyService[typeof method]>[0]): Promise<ApiResult> {
    const service = await this.ensureService(this.currentProvider);
    try {
      return await service[method](opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async execute(options: {
    systemPrompt: string;
    userMessage: string;
    screenshotBase64?: string | null;
    signal?: AbortSignal;
    taskType?: string;
    onChunk?: (text: string) => void;
  }): Promise<ApiResult> {
    const cbCheck = this.checkCircuitBreaker();
    if (cbCheck) return cbCheck;

    const keyErr = this.ensureApiKey();
    if (keyErr) return keyErr;

    await this.syncServiceConfig(this.currentProvider);
    const cb = this.circuitBreakers.get(this.currentProvider);
    const opts = this.buildExecuteOpts(options);

    let result: ApiResult;
    try {
      result = await this.dispatchExecute('execute', opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      cb?.execute(() => Promise.reject(new Error(msg))).catch(() => {});
      return { success: false, error: msg };
    }

    this.recordCircuitBreakerResult(result, cb);
    return result;
  }

  async executeWithRetry(options: {
    systemPrompt: string;
    userMessage: string;
    screenshotBase64?: string | null;
    taskType?: string;
    maxRetries?: number;
    signal?: AbortSignal;
    onRetryAttempt?: (attempt: number, delay: number, error: string) => void;
    onChunk?: (text: string) => void;
  }): Promise<ApiResult> {
    const cbCheck = this.checkCircuitBreaker();
    if (cbCheck) return cbCheck;

    const keyErr = this.ensureApiKey();
    if (keyErr) return keyErr;

    await this.syncServiceConfig(this.currentProvider);
    const cb = this.circuitBreakers.get(this.currentProvider);
    const opts = this.buildExecuteOpts(options);

    let result: ApiResult;
    try {
      result = await this.dispatchExecute('executeWithRetry', opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      cb?.execute(() => Promise.reject(new Error(msg))).catch(() => {});
      return { success: false, error: msg };
    }

    this.recordCircuitBreakerResult(result, cb);
    return result;
  }

  abort(): void {
    const svc = this.services.get(this.currentProvider);
    if (svc) svc.abort();
  }
}

export function createUnifiedAiService(): UnifiedAiService {
  return new UnifiedAiServiceImpl();
}
