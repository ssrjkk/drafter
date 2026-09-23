/**
 * Lepton AI API service
 * @module LeptonApiService
 * @author ssrjkk
 */

import { GenericApiService } from './GenericApiService';
import { getDefaultApiUrl } from './types';

interface LeptonConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export class LeptonApiService extends GenericApiService {
  constructor(config: LeptonConfig) {
    super({ ...config, apiUrl: getDefaultApiUrl('lepton'), provider: 'lepton', providerName: 'Lepton AI', temperature: 0.7 });
  }
}
