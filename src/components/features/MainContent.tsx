/**
 * Main content area with tabs and lazy loading
 * @module MainContent
 * @author ssrjkk
 */

import { memo, useState, RefObject } from 'react';
import { TaskSelector } from '../selectors/TaskSelector';
import { LazyChatArea, LazyCodebasePanel, LazySessionHistory, LazyScreenshotUploader, LazySuspense } from './LazyComponents';
import { Tabs } from '../ui';
import type { TabType } from '../../types';
import type { AgentStep } from '../../data/agent/types';
import type { CodebaseProvider } from '../../data/codebase/CodebaseProvider';
import type { Session } from '../../domain/entities/Session';

interface MainContentProps {
  selectedTask: string | null;
  onSelectTask: (task: string | null) => void;
  context: string;
  onContextChange: (context: string) => void;
  output: string;
  loading: boolean;
  error: string | null;
  maxContextLength: number;
  apiKeyValid: boolean;
  onExecute: () => void;
  onReset: () => void;
  onCopy: () => void;
  contextError: string | null;
  onContextError: (error: string | null) => void;
  outputRef: RefObject<HTMLDivElement | null>;
  sessions: Session[];
  onLoadSession: (session: Session) => void;
  onClearHistory: () => void;
  agentSteps?: AgentStep[];
  agentMode?: boolean;
  codebaseConnected?: boolean;
  onModeChange?: (mode: 'prompt' | 'agent') => void;
  codebaseProvider?: CodebaseProvider | null;
  onCodebaseConnect?: (provider: CodebaseProvider) => void;
  onCodebaseDisconnect?: () => void;
  onScreenshotChange: (base64: string | null) => void;
}

export const MainContent = memo(function MainContent({
  selectedTask,
  onSelectTask,
  context,
  onContextChange,
  output,
  loading,
  error,
  maxContextLength,
  apiKeyValid,
  onExecute,
  onReset,
  onCopy,
  contextError,
  onContextError,
  outputRef,
  sessions,
  onLoadSession,
  onClearHistory,
  agentSteps,
  agentMode,
  codebaseConnected,
  onModeChange,
  codebaseProvider,
  onCodebaseConnect,
  onCodebaseDisconnect,
  onScreenshotChange,
}: MainContentProps) {
  const [activeTab, setActiveTab] = useState<TabType>('new');

  const mainTabs = [
    { id: 'new', label: 'New', icon: '✨' },
    { id: 'history', label: 'History', icon: '📜', badge: sessions.length > 0 ? sessions.length : undefined },
  ];

  const modeTabs = [
    { id: 'prompt', label: 'Prompt', accentColor: 'indigo' },
    { id: 'agent', label: 'Agent', accentColor: 'emerald' },
  ];

  if (selectedTask === 'screenshot_analysis') {
    return (
      <div className="space-y-6">
        <LazySuspense>
          <LazyScreenshotUploader
            context={context}
            onContextChange={onContextChange}
            maxContextLength={maxContextLength}
            onError={onContextError}
            error={error}
            onScreenshotChange={onScreenshotChange}
          />
        </LazySuspense>

        <LazySuspense>
          <LazyChatArea
            context={context}
            onContextChange={onContextChange}
            output={output}
            loading={loading}
            error={error}
            maxContextLength={maxContextLength}
            selectedTask={selectedTask}
            apiKeyValid={apiKeyValid}
            onExecute={onExecute}
            onReset={onReset}
            onCopy={onCopy}
            contextError={contextError}
            onContextError={onContextError}
            outputRef={outputRef}
            agentSteps={agentSteps}
            agentMode={agentMode}
            codebaseConnected={codebaseConnected}
          />
        </LazySuspense>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs tabs={mainTabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as TabType)} />

      {activeTab === 'history' ? (
        <LazySuspense>
          <LazySessionHistory
            sessions={sessions}
            onLoadSession={onLoadSession}
            onClearHistory={onClearHistory}
          />
        </LazySuspense>
      ) : (
        <>
          {!selectedTask && (
            <div className="text-center py-2">
              <p className="text-sm text-gray-500">Pick a task type below to get started</p>
            </div>
          )}
          <TaskSelector selectedTask={selectedTask} onSelect={onSelectTask} />

          <LazySuspense>
            <LazyCodebasePanel
              provider={codebaseProvider ?? null}
              onConnect={onCodebaseConnect ?? (() => {})}
              onDisconnect={onCodebaseDisconnect ?? (() => {})}
            />
          </LazySuspense>

          {codebaseConnected && onModeChange && (
            <Tabs
              tabs={modeTabs}
              activeTab={agentMode ? 'agent' : 'prompt'}
              onChange={(id) => onModeChange(id as 'prompt' | 'agent')}
            />
          )}

          {selectedTask && (
            <LazySuspense>
              <LazyChatArea
                context={context}
                onContextChange={onContextChange}
                output={output}
                loading={loading}
                error={error}
                maxContextLength={maxContextLength}
                selectedTask={selectedTask}
                apiKeyValid={apiKeyValid}
                onExecute={onExecute}
                onReset={onReset}
                onCopy={onCopy}
                contextError={contextError}
                onContextError={onContextError}
                outputRef={outputRef}
                agentSteps={agentSteps}
                agentMode={agentMode}
                codebaseConnected={codebaseConnected}
              />
            </LazySuspense>
          )}
        </>
      )}
    </div>
  );
});
