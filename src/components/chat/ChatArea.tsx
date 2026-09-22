/**
 * Chat input/output area with undo/redo
 * Composes ChatHeader, ChatActions, ChatOutput sub-components
 * @module ChatArea
 * @author ssrjkk
 */

import { memo, useCallback, useState, RefObject } from 'react';
import { GlassCard, AutoResizeTextarea } from '../ui';
import { ChatHeader } from './ChatHeader';
import { LazyExportPanel, LazyMetricsDashboard, LazySuspense } from '../features/LazyComponents';
import { ChatActions } from './ChatActions';
import { ChatOutput } from './ChatOutput';
import { t } from '../../lib/i18n';
import type { AgentStep } from '../../data/agent/types';

interface ChatAreaProps {
  context: string;
  onContextChange: (value: string) => void;
  output: string;
  loading: boolean;
  error: string | null;
  maxContextLength: number;
  selectedTask: string | null;
  apiKeyValid: boolean;
  onExecute: () => void;
  onReset: () => void;
  onCopy: () => void;
  contextError: string | null;
  onContextError: (error: string | null) => void;
  outputRef?: RefObject<HTMLDivElement | null>;
  agentSteps?: AgentStep[];
  agentMode?: boolean;
  codebaseConnected?: boolean;
}

export const ChatArea = memo(function ChatArea({
  context,
  onContextChange,
  output,
  loading,
  error,
  maxContextLength,
  selectedTask,
  apiKeyValid,
  onExecute,
  onReset,
  onCopy,
  contextError,
  onContextError,
  outputRef,
  agentSteps,
}: ChatAreaProps) {
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const handleShowExport = useCallback(() => setShowExportPanel(prev => !prev), []);

  const canExecute =
    selectedTask &&
    (context.trim() || selectedTask === 'screenshot_analysis') &&
    apiKeyValid;

  const hints = [
    t('chat.hintLogin'),
    t('chat.hintRestApi'),
    t('chat.hintNavbar'),
    t('chat.hintCheckout'),
  ];

  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <ChatHeader
          context={context}
          onContextChange={onContextChange}
          maxContextLength={maxContextLength}
        />
        <AutoResizeTextarea
          value={context}
          onChange={e => { onContextChange(e.target.value); if (e.target.value.length > 20) onContextError(null); }}
          placeholder={t('chat.placeholder')}
          maxLength={maxContextLength}
          className="min-h-32"
          aria-label={t('chat.taskInputLabel')}
        />
        {contextError && (
          <p className="text-amber-400 text-xs mt-2 animate-slideUp">
            ⚠️ {contextError}
          </p>
        )}
        {!context && selectedTask && !loading && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-gray-500">{t('chat.tryLabel')}</span>
            {hints.map(hint => (
              <button
                key={hint}
                onClick={() => onContextChange(hint)}
                className="text-xs px-2.5 py-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                {hint}
              </button>
            ))}
          </div>
        )}
      </GlassCard>

      <ChatActions
        loading={loading}
        canExecute={!!canExecute}
        hasOutput={!!output}
        onExecute={onExecute}
        onReset={onReset}
        apiKeyValid={apiKeyValid}
      />

      {error && (
        <div
          className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-sm animate-slideUp"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-medium">{t('chat.errorTitle')}</p>
              <p className="mt-1 opacity-80">{error}</p>
            </div>
          </div>
        </div>
      )}

      {(output || loading) && (
        <div className="animate-slideUp">
          <ChatOutput
            output={output}
            loading={loading}
            onCopy={onCopy}
            onShowExport={handleShowExport}
            outputRef={outputRef}
            agentSteps={agentSteps}
          />

          {showExportPanel && output && (
            <LazySuspense>
              <LazyExportPanel
                output={output}
                context={context}
                taskType={selectedTask || undefined}
                onClose={() => setShowExportPanel(false)}
              />
            </LazySuspense>
          )}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={() => setShowMetrics(!showMetrics)}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center gap-1"
        >
          📊 {showMetrics ? t('chat.hideMetrics') : t('chat.showMetrics')}
        </button>
      </div>

      {showMetrics && (
        <LazySuspense>
          <LazyMetricsDashboard onClose={() => setShowMetrics(false)} />
        </LazySuspense>
      )}
    </div>
  );
});
