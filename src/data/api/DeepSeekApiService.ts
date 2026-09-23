import { GenericApiService } from './GenericApiService';
import { getDefaultApiUrl } from './types';

interface DeepSeekConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export class DeepSeekApiService extends GenericApiService {
  constructor(config: DeepSeekConfig) {
    super({ ...config, apiUrl: getDefaultApiUrl('deepseek'), provider: 'deepseek', providerName: 'DeepSeek' });
  }
}
