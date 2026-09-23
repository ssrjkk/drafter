import { GenericApiService } from './GenericApiService';
import { getDefaultApiUrl } from './types';

interface NovitaConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export class NovitaApiService extends GenericApiService {
  constructor(config: NovitaConfig) {
    super({ ...config, apiUrl: getDefaultApiUrl('novita'), provider: 'novita', providerName: 'Novita AI', temperature: 0.7 });
  }
}
