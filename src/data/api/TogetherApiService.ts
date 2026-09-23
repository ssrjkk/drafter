import { GenericApiService } from './GenericApiService';
import { getDefaultApiUrl } from './types';

interface TogetherConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export class TogetherApiService extends GenericApiService {
  constructor(config: TogetherConfig) {
    super({ ...config, apiUrl: getDefaultApiUrl('together'), provider: 'together', providerName: 'Together AI', temperature: 0.7 });
  }
}
