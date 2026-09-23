/**
 * Provider and model selection dropdowns
 * @module ProviderModelSelector
 * @author ssrjkk
 */

import { memo } from 'react';
import { PROVIDER_INFO, PROVIDER_MODELS, type AiProvider } from '../../data/api/types';
import { useAppStore } from '../../store/useAppStore';
import { t } from '../../lib/i18n';

export const ProviderModelSelector = memo(function ProviderModelSelector() {
  const provider = useAppStore((s) => s.provider);
  const setProvider = useAppStore((s) => s.setProvider);
  const model = useAppStore((s) => s.model);
  const setModel = useAppStore((s) => s.setModel);

  const providers = (Object.keys(PROVIDER_INFO) as AiProvider[]).filter((p) => PROVIDER_MODELS[p]?.length > 0);
  const models = PROVIDER_MODELS[provider] || [];

  const handleProviderChange = (newProvider: AiProvider) => {
    setProvider(newProvider);
    const defaultModel = PROVIDER_MODELS[newProvider]?.find((m) => m.default)?.id || PROVIDER_MODELS[newProvider]?.[0]?.id;
    if (defaultModel) {
      setModel(defaultModel);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={provider}
        onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
        className="text-sm bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 focus:border-purple-500 transition-colors"
        aria-label={t('provider.provider')}
      >
        {providers.map((p) => (
          <option key={p} value={p}>
            {PROVIDER_INFO[p].name}
          </option>
        ))}
      </select>
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="text-sm bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 focus:border-purple-500 transition-colors"
        aria-label={t('provider.model')}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.free ? ` (${t('provider.free')})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
});
