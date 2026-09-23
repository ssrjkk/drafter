import type { AiProvider } from '../../config/security';
export type { AiProvider };

export interface ApiConfig {
  baseUrl: string;
  model: string;
  maxTokens: number;
  anthropicVersion?: string;
  provider: AiProvider;
}

export interface ApiRequest {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
  model: string;
}

export interface StreamingMessage {
  type: 'content_block_delta' | 'message_delta' | 'message_start' | 'message_stop';
  delta?: { text?: string; type?: string };
  usage?: { output_tokens: number };
}

export interface ApiResult {
  success: boolean;
  output?: string;
  error?: string;
  usage?: { outputTokens?: number; inputTokens?: number };
}

export interface ExecuteOptions {
  systemPrompt: string;
  userMessage: string;
  screenshotBase64?: string | null;
  signal?: AbortSignal;
  taskType?: string;
  onChunk?: (text: string) => void;
}

export interface RateLimitInfo {
  remaining: number;
  resetIn: number;
}

export interface ClaudeContentBlock {
  type: 'text' | 'image';
  source?: {
    type: 'base64' | 'url';
    media_type: string;
    data: string;
  };
  text?: string;
}

export interface AiModel {
  id: string;
  name: string;
  provider: AiProvider;
  maxTokens: number;
  supportsVision: boolean;
  free?: boolean;
  default?: boolean;
  description?: string;
}

export function getModelInfo(provider: AiProvider, modelId: string): AiModel | undefined {
  return PROVIDER_MODELS[provider]?.find(m => m.id === modelId);
}

export function getDefaultModelForProvider(provider: AiProvider): AiModel {
  const models = PROVIDER_MODELS[provider];
  if (!models || models.length === 0) {
    throw new Error(`No models defined for provider: ${provider}`);
  }
  return models.find(m => m.default) ?? models[0]!;
}

export function getVisionProviders(): AiProvider[] {
  return (Object.keys(PROVIDER_MODELS).filter((k): k is AiProvider => k in PROVIDER_MODELS)).filter(p =>
    PROVIDER_MODELS[p].some(m => m.supportsVision)
  );
}

export const PROVIDER_MODELS: Record<AiProvider, AiModel[]> = {
  claude: [
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      provider: 'claude',
      maxTokens: 8192,
      supportsVision: true,
      free: false,
      default: true,
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      provider: 'claude',
      maxTokens: 8192,
      supportsVision: true,
      free: false,
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku (Fast)',
      provider: 'claude',
      maxTokens: 8192,
      supportsVision: true,
      free: false,
    },
  ],
  groq: [
    {
      id: 'llama-3.3-70b-versatile',
      name: 'Llama 3.3 70B (Fast)',
      provider: 'groq',
      maxTokens: 8192,
      supportsVision: false,
      free: true,
      default: true,
      description: 'Best speed/quality balance',
    },
    {
      id: 'mixtral-8x7b-32768',
      name: 'Mixtral 8x7B',
      provider: 'groq',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
      description: 'Good for complex reasoning',
    },
    {
      id: 'llama-3.1-8b-instant',
      name: 'Llama 3.1 8B (Fastest)',
      provider: 'groq',
      maxTokens: 8192,
      supportsVision: false,
      free: true,
      description: 'Fastest, good for simple tasks',
    },
    {
      id: 'gemma2-9b-it',
      name: 'Gemma 2 9B',
      provider: 'groq',
      maxTokens: 8192,
      supportsVision: false,
      free: true,
    },
  ],
  openai: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      maxTokens: 16384,
      supportsVision: true,
      free: false,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini (Fast)',
      provider: 'openai',
      maxTokens: 16384,
      supportsVision: true,
      free: false,
      default: true,
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      provider: 'openai',
      maxTokens: 4096,
      supportsVision: true,
      free: false,
    },
  ],
  gemini: [
    {
      id: 'gemini-1.5-flash-8b',
      name: 'Gemini 1.5 Flash 8B (Free)',
      provider: 'gemini',
      maxTokens: 8192,
      supportsVision: true,
      free: true,
      description: 'Best free option',
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      provider: 'gemini',
      maxTokens: 8192,
      supportsVision: true,
      free: true,
      default: true,
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      provider: 'gemini',
      maxTokens: 8192,
      supportsVision: true,
      free: true,
    },
    {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash (Experimental)',
      provider: 'gemini',
      maxTokens: 8192,
      supportsVision: true,
      free: true,
    },
  ],
  openrouter: [
    {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek Chat (Free)',
      provider: 'openrouter',
      maxTokens: 8192,
      supportsVision: false,
      free: true,
      default: true,
      description: 'Best free model on OpenRouter',
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct',
      name: 'Llama 3.3 70B',
      provider: 'openrouter',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
    },
    {
      id: 'qwen/qwen-2.5-72b-instruct',
      name: 'Qwen 2.5 72B',
      provider: 'openrouter',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
    },
    {
      id: 'google/gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash',
      provider: 'openrouter',
      maxTokens: 8192,
      supportsVision: true,
      free: true,
    },
    {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'openrouter',
      maxTokens: 8192,
      supportsVision: true,
      free: false,
    },
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openrouter',
      maxTokens: 16384,
      supportsVision: true,
      free: true,
    },
  ],
  deepseek: [
    {
      id: 'deepseek-chat',
      name: 'DeepSeek Chat (Free)',
      provider: 'deepseek',
      maxTokens: 8192,
      supportsVision: false,
      free: true,
      default: true,
      description: 'Truly free, no credit card',
    },
    {
      id: 'deepseek-coder',
      name: 'DeepSeek Coder',
      provider: 'deepseek',
      maxTokens: 16384,
      supportsVision: false,
      free: true,
      description: 'Specialized in code generation',
    },
  ],
  together: [
    {
      id: 'meta-llama/Llama-3.3-70B-Instruct',
      name: 'Llama 3.3 70B',
      provider: 'together',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
      default: true,
    },
    {
      id: 'Qwen/Qwen2.5-72B-Instruct',
      name: 'Qwen 2.5 72B',
      provider: 'together',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
    },
    {
      id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      name: 'Mixtral 8x7B',
      provider: 'together',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
    },
    {
      id: 'deepseek-ai/DeepSeek-V3',
      name: 'DeepSeek V3',
      provider: 'together',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
    },
  ],
  novita: [
    {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek Chat',
      provider: 'novita',
      maxTokens: 8192,
      supportsVision: false,
      free: true,
      default: true,
    },
    {
      id: 'qwen/qwen2.5-72b-instruct',
      name: 'Qwen 2.5 72B',
      provider: 'novita',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct',
      name: 'Llama 3.3 70B',
      provider: 'novita',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
    },
    {
      id: 'google/gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash',
      provider: 'novita',
      maxTokens: 8192,
      supportsVision: true,
      free: true,
    },
  ],
  lepton: [
    {
      id: 'llama-3.3-70b-instruct',
      name: 'Llama 3.3 70B',
      provider: 'lepton',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
      default: true,
    },
    {
      id: 'qwen2.5-72b-instruct',
      name: 'Qwen 2.5 72B',
      provider: 'lepton',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
    },
    {
      id: 'mixtral-8x7b-instruct',
      name: 'Mixtral 8x7B',
      provider: 'lepton',
      maxTokens: 32768,
      supportsVision: false,
      free: true,
    },
  ],
};

export const PROVIDER_INFO: Record<AiProvider, { name: string; apiUrl: string; docsUrl: string; free: boolean; authType: string }> = {
  claude: {
    name: 'Claude (Anthropic)',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    docsUrl: 'https://docs.anthropic.com/claude/reference/messages_post',
    free: false,
    authType: 'x-api-key',
  },
  groq: {
    name: 'Groq',
    apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
    docsUrl: 'https://console.groq.com/docs/models',
    free: true,
    authType: 'bearer',
  },
  openai: {
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    free: false,
    authType: 'bearer',
  },
  gemini: {
    name: 'Google Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    free: true,
    authType: 'bearer',
  },
  openrouter: {
    name: 'OpenRouter (Free)',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    docsUrl: 'https://openrouter.ai/docs',
    free: true,
    authType: 'bearer',
  },
  deepseek: {
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    docsUrl: 'https://platform.deepseek.com/docs',
    free: true,
    authType: 'bearer',
  },
  together: {
    name: 'Together AI',
    apiUrl: 'https://api.together.xyz/v1/chat/completions',
    docsUrl: 'https://docs.together.ai',
    free: true,
    authType: 'bearer',
  },
  novita: {
    name: 'Novita AI',
    apiUrl: 'https://api.novita.ai/v3/openai/chat/completions',
    docsUrl: 'https://novita.ai/docs',
    free: true,
    authType: 'bearer',
  },
  lepton: {
    name: 'Lepton AI',
    apiUrl: 'https://api.lepton.ai/api/v1/chat_completions',
    docsUrl: 'https://www.lepton.ai/docs',
    free: true,
    authType: 'bearer',
  },
};

export function getDefaultApiUrl(provider: AiProvider): string {
  return PROVIDER_INFO[provider].apiUrl;
}
