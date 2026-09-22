/**
 * Main application content orchestrator
 * @module AppContent
 * @author ssrjkk
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { Onboarding, hasSeenOnboarding } from '../modals/Onboarding';
import { MainLayout } from '../layout/MainLayout';
import { useTheme, useKeyboardShortcuts } from '../../hooks';
import { useDatabase } from '../../hooks/useDatabase';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useProjectData } from '../../hooks/useProjectData';
import { useExecution } from '../../hooks/useExecution';
import { useCodebase } from '../../hooks/useCodebase';
import { useMemoryEntries } from '../../hooks/useMemoryEntries';
import { validateApiKey, copyToClipboard } from '../../lib';
import { SECURITY_CONFIG } from '../../config';
import { useClaudeApi } from '../../presentation';
import { useAppStore } from '../../store/useAppStore';

type UseDatabaseReturn = ReturnType<typeof useDatabase>;

interface AppContentProps {
  db: UseDatabaseReturn;
}

export const AppContent = memo(function AppContent({ db }: AppContentProps) {
  const output = useAppStore((s) => s.output);
  const setError = useAppStore((s) => s.setError);
  const setApiKeyValid = useAppStore((s) => s.setApiKeyValid);
  const apiKey = useAppStore((s) => s.apiKey);
  const showApiKeyInput = useAppStore((s) => s.showApiKeyInput);
  const setShowApiKeyInput = useAppStore((s) => s.setShowApiKeyInput);
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);
  const currentMemory = useAppStore((s) => s.currentMemory);
  const apiKeyValid = useAppStore((s) => s.apiKeyValid);
  const memoryEntries = useAppStore((s) => s.memoryEntries);
  const selectedTask = useAppStore((s) => s.selectedTask);
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const setScreenshotBase64 = useAppStore((s) => s.setScreenshotBase64);
  const context = useAppStore((s) => s.context);
  const setContext = useAppStore((s) => s.setContext);
  const isLoading = useAppStore((s) => s.isLoading);
  const error = useAppStore((s) => s.error);
  const sessions = useAppStore((s) => s.sessions);
  const agentSteps = useAppStore((s) => s.agentSteps);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const outputRef = useRef<HTMLDivElement>(null);
  const { toggleTheme } = useTheme();
  const isOnline = useOnlineStatus();
  const [contextError, setContextError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const handleCopy = useCallback(() => copyToClipboard(output), [output]);

  const {
    projects,
    selectedProject,
    handleSaveMemory,
    handleCreateProject,
    handleLoadSession,
    clearConversationHistory,
  } = useProjectData(db);

  const { codebaseProvider, handleConnect, handleDisconnect } = useCodebase();

  const { handleExecute, handleReset } = useExecution(selectedProject, codebaseProvider, db);

  const {
    handleAddEntry,
    handleDeleteEntry,
    handleUpdateEntry,
    handleSync,
    handleExportProject,
    handleImportProject,
  } = useMemoryEntries(selectedProject, db);

  const { rateLimitInfo } = useClaudeApi();

  const handleExecuteRef = useRef<(() => Promise<void>) | null>(null);

  useKeyboardShortcuts(
    [
      {
        key: 'Enter',
        modifiers: ['ctrl'],
        action: () => handleExecuteRef.current?.(),
        description: 'Execute',
      },
      {
        key: 'Escape',
        action: () => setShowApiKeyInput(false),
        description: 'Close modal',
      },
      {
        key: 't',
        modifiers: ['ctrl'],
        action: toggleTheme,
        description: 'Toggle theme',
      },
    ],
    !isLoading,
  );

  useEffect(() => {
    if (!isOnline) {
      setError('No internet connection');
    } else if (error === 'No internet connection') {
      setError(null);
    }
  }, [isOnline, setError, error]);

  useEffect(() => {
    const validation = validateApiKey(apiKey);
    setApiKeyValid(validation.valid);
    if (!validation.valid && validation.error && !showApiKeyInput) {
      setError(validation.error);
    }
  }, [apiKey, showApiKeyInput, setApiKeyValid, setError]);

  useEffect(() => {
    handleExecuteRef.current = handleExecute;
  }, [handleExecute]);

  useEffect(() => {
    const handleResetTask = () => handleReset();
    const handleExecuteTask = () => { void handleExecute(); };
    const handleCopyOutput = () => handleCopy();
    window.addEventListener('reset-task', handleResetTask);
    window.addEventListener('execute-task', handleExecuteTask);
    window.addEventListener('copy-output', handleCopyOutput);
    return () => {
      window.removeEventListener('reset-task', handleResetTask);
      window.removeEventListener('execute-task', handleExecuteTask);
      window.removeEventListener('copy-output', handleCopyOutput);
    };
  }, [handleReset, handleExecute, handleCopy]);

  const sidebar = (
    <Sidebar
      projects={projects}
      selectedProject={selectedProject}
      onSelectProject={setSelectedProject}
      onCreateProject={handleCreateProject}
      onDeleteProject={db.deleteProject}
      onSaveMemory={handleSaveMemory}
      currentMemory={currentMemory}
      rateLimitInfo={rateLimitInfo}
      apiKeyValid={apiKeyValid}
      onSetApiKey={() => setShowApiKeyInput(true)}
      isOnline={isOnline}
      isDbReady={db.isDbReady}
      memoryEntries={memoryEntries}
      onAddMemoryEntry={handleAddEntry}
      onDeleteMemoryEntry={handleDeleteEntry}
      onUpdateMemoryEntry={handleUpdateEntry}
      onSync={handleSync}
      onExportProject={handleExportProject}
      onImportProject={handleImportProject}
    />
  );

  const main = (
    <MainContent
      selectedTask={selectedTask}
      onSelectTask={setSelectedTask}
      context={context}
      onContextChange={setContext}
      output={output}
      loading={isLoading}
      error={error || db.error}
      maxContextLength={SECURITY_CONFIG.maxContextLength}
      apiKeyValid={apiKeyValid}
      onExecute={handleExecute}
      onReset={handleReset}
      onCopy={handleCopy}
      contextError={contextError}
      onContextError={setContextError}
      outputRef={outputRef}
      sessions={sessions}
      onLoadSession={handleLoadSession}
      onClearHistory={() => selectedProject && clearConversationHistory(selectedProject)}
      agentSteps={agentSteps}
      agentMode={mode === 'agent'}
      codebaseConnected={!!codebaseProvider}
      onModeChange={setMode}
      codebaseProvider={codebaseProvider}
      onCodebaseConnect={handleConnect}
      onCodebaseDisconnect={handleDisconnect}
      onScreenshotChange={setScreenshotBase64}
    />
  );

  return (
    <>
      <MainLayout sidebar={sidebar} main={main} />
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}
    </>
  );
});
