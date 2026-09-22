/**
 * Chat action buttons (execute, reset)
 * @module ChatActions
 * @author ssrjkk
 */

import { RippleButton } from '../ui';
import { t } from '../../lib/i18n';

function LoadingIndicator() {
  return <span className="inline-block min-w-12">...</span>;
}

interface ChatActionsProps {
  loading: boolean;
  canExecute: boolean;
  hasOutput: boolean;
  onExecute: () => void;
  onReset: () => void;
  apiKeyValid: boolean;
}

export function ChatActions({
  loading,
  canExecute,
  hasOutput,
  onExecute,
  onReset,
  apiKeyValid,
}: ChatActionsProps) {
  return (
    <>
      <div className="flex items-center gap-4">
        <RippleButton
          onClick={onExecute}
          disabled={!canExecute || loading}
          className="flex-1 !py-4 text-base"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="flex items-center">
                {t('chat.generatingButton')}<LoadingIndicator />
              </span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              🚀 {t('chat.execute')}
            </span>
          )}
        </RippleButton>
        {(hasOutput || loading) && (
          <RippleButton onClick={onReset} variant="secondary">
            ↺ {t('chat.reset')}
          </RippleButton>
        )}
      </div>

      {!apiKeyValid && !loading && (
        <p className="text-xs text-center text-gray-500">
          {t('chat.apiKeyHint')}
        </p>
      )}
    </>
  );
}
