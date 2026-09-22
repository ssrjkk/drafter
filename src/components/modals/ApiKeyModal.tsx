/**
 * API key configuration modal
 * @module ApiKeyModal
 * @author ssrjkk
 */

import { useState } from 'react';
import { saveApiKey } from '../../lib';
import { useAppStore } from '../../store/useAppStore';
import { PROVIDER_INFO, type AiProvider } from '../../data/api/types';
import { Modal } from '../ui';
import { ErrorService } from '../../lib/errorService';
import { ErrorCode } from '../../lib/constants';
import { t } from '../../lib/i18n';

interface ApiKeyModalProps {
  onClose: () => void;
  provider?: AiProvider;
}

export function ApiKeyModal({ onClose, provider = 'claude' }: ApiKeyModalProps) {
  const store = useAppStore();
  const [key, setKey] = useState(store.apiKey || '');
  const [saving, setSaving] = useState(false);
  const providerInfo = PROVIDER_INFO[provider];

  const handleSave = async () => {
    if (!key.trim()) return;
    setSaving(true);
    try {
      store.setApiKey(key);
      await saveApiKey(key);
      store.setShowApiKeyInput(false);
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.API_KEY_INVALID, err);
      store.setError(t('apiKey.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={t('apiKey.title', { provider: providerInfo.name })}>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {providerInfo.free ? t('apiKey.freeTier') : t('apiKey.paid')} · {t('apiKey.getKeyAt')}{' '}
        <a
          href={providerInfo.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-600 dark:text-purple-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
        >
          {new URL(providerInfo.docsUrl).hostname}
        </a>
      </p>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        placeholder={t('apiKey.placeholder')}
        aria-label={t('apiKey.label')}
        autoFocus
        className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-4 py-3 text-gray-900 dark:text-white placeholder-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 focus:border-purple-500 transition-colors"
      />
      <div className="flex gap-3 mt-4">
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 px-4 py-2 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !key.trim()}
          className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
        >
          {saving ? t('apiKey.saving') : t('common.save')}
        </button>
      </div>
    </Modal>
  );
}
