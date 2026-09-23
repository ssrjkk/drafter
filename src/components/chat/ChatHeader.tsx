/**
 * Chat input header with undo/redo and word count
 * @module ChatHeader
 * @author ssrjkk
 */

import { useMemo, useEffect, memo } from 'react';
import { ContextPresets } from '../panels/ContextPresets';
import { ProviderModelSelector } from '../selectors/ProviderModelSelector';
import { useHistory } from '../../hooks/useHistory';
import { t } from '../../lib/i18n';

interface ChatHeaderProps {
  context: string;
  onContextChange: (value: string) => void;
  maxContextLength: number;
}

export const ChatHeader = memo(function ChatHeader({ context, onContextChange, maxContextLength }: ChatHeaderProps) {
  const { state: historyState, setState: setHistoryState, canUndo, canRedo, undo, redo } = useHistory(context);
  const { present } = historyState;

  // Keep the undo/redo stack in step when the context is replaced from the
  // outside (preset selection, loading a session) instead of by typing.
  useEffect(() => {
    if (context !== present) {
      setHistoryState(context, true);
    }
  }, [context, present, setHistoryState]);

  const handleContextChange = (value: string) => {
    setHistoryState(value);
    onContextChange(value);
  };

  const handleUndo = () => {
    const previous = historyState.past[historyState.past.length - 1];
    if (previous === undefined) return;
    undo();
    onContextChange(previous);
  };

  const handleRedo = () => {
    const next = historyState.future[0];
    if (next === undefined) return;
    redo();
    onContextChange(next);
  };

  const wordCount = useMemo(() => context.trim().split(/\s+/).filter(Boolean).length, [context]);
  const charCount = context.length;

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('chat.taskDescription')}</h3>
        <ContextPresets onSelect={handleContextChange} currentContext={context} />
        <ProviderModelSelector />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className={`p-1.5 rounded-lg transition-colors ${
            canUndo
              ? 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
          }`}
          aria-label={t('chat.undoLabel')}
          title={t('chat.undoLabel')}
        >
          ↶
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className={`p-1.5 rounded-lg transition-colors ${
            canRedo
              ? 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
          }`}
          aria-label={t('chat.redoLabel')}
          title={t('chat.redoLabel')}
        >
          ↷
        </button>
        <span className="text-xs text-gray-500 ml-2" aria-live="polite">
          {t('chat.wordCount', { count: String(wordCount), chars: String(charCount), max: String(maxContextLength) })}
        </span>
      </div>
    </div>
  );
});
