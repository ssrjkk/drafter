/**
 * Google Gemini service via its OpenAI-compatible endpoint
 * @module GeminiApiService
 * @author ssrjkk
 */

import { GenericApiService } from './GenericApiService';
import { getDefaultApiUrl } from './types';

interface GeminiConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export class GeminiApiService extends GenericApiService {
  constructor(config: GeminiConfig) {
    super({ ...config, apiUrl: getDefaultApiUrl('gemini'), provider: 'gemini', providerName: 'Google Gemini' });
  }
}
