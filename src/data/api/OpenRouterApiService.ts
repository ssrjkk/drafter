import { GenericApiService } from './GenericApiService';
import { getDefaultApiUrl } from './types';
import { APP_WEBSITE, APP_NAME, APP_AUTHOR } from '../../lib/constants';

interface OpenRouterConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  apiUrl?: string;
}

export class OpenRouterApiService extends GenericApiService {
  constructor(config: OpenRouterConfig) {
    super({
      ...config,
      apiUrl: config.apiUrl || getDefaultApiUrl('openrouter'),
      provider: 'openrouter',
      providerName: 'OpenRouter',
      extraHeaders: {
        'HTTP-Referer': APP_WEBSITE,
        'X-Title': `${APP_NAME} by ${APP_AUTHOR}`,
      },
    });
  }
}
