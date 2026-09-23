/**
 * Groq API service
 * @module GroqApiService
 * @author ssrjkk
 */

import { GenericApiService } from './GenericApiService';
import { getDefaultApiUrl } from './types';

interface GroqConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export class GroqApiService extends GenericApiService {
  constructor(config: GroqConfig) {
    super({ ...config, apiUrl: getDefaultApiUrl('groq'), provider: 'groq', providerName: 'Groq' });
  }
}
