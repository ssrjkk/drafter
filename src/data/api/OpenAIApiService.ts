/**
 * OpenAI API service
 * @module OpenAIApiService
 * @author ssrjkk
 */

import { GenericApiService } from './GenericApiService';
import { getDefaultApiUrl } from './types';

interface OpenAIConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export class OpenAIApiService extends GenericApiService {
  constructor(config: OpenAIConfig) {
    super({ ...config, apiUrl: getDefaultApiUrl('openai'), provider: 'openai', providerName: 'OpenAI' });
  }
}
