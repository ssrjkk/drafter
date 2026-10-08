/**
 * Task execution hook with agent and prompt modes
 * @module useExecution
 * @author ssrjkk
 */

import { useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { QA_SYSTEM_PROMPT, SCREENSHOT_SYSTEM_PROMPT, buildPrompt } from '../config';
import { useClaudeApi, useUseCases } from '../presentation';
import { QaAgent } from '../data/agent';
import { ErrorService } from '../lib/errorService';
import { redactSecrets } from '../data/api/requestUtils';
import { SECURITY_CONFIG } from '../config';
import type { CodebaseProvider } from '../data/codebase/CodebaseProvider';
import type { useDatabase } from './useDatabase';

type UseDatabaseReturn = ReturnType<typeof useDatabase>;

export function useExecution(
  selectedProject: number | null,
  codebaseProvider: CodebaseProvider | null,
  db: UseDatabaseReturn,
) {
  const setIsLoading = useAppStore((s) => s.setIsLoading);
  const setError = useAppStore((s) => s.setError);
  const setOutput = useAppStore((s) => s.setOutput);
  const setAgentSteps = useAppStore((s) => s.setAgentSteps);
  const addAgentStep = useAppStore((s) => s.addAgentStep);
  const addSession = useAppStore((s) => s.addSession);
  const resetTask = useAppStore((s) => s.resetTask);
  const { execute: executeApi, abort: abortApi } = useClaudeApi();
  const { aiService } = useUseCases();
  const { createTask, getProject } = db;
  const agentRef = useRef<QaAgent | null>(null);
  const isExecutingRef = useRef(false);
  /**
   * Incremented on every run and on every reset. The agent loop has no
   * cancellation signal of its own, so a cancelled run used to resolve later
   * and persist its truncated output over whatever the user had moved on to.
   */
  const generationRef = useRef(0);

  const invalidateGeneration = useCallback(() => {
    generationRef.current++;
  }, []);

  useEffect(() => {
    // Invalidating on unmount discards any in-flight run, so a late resolution
    // cannot write a partial result into the database.
    return () => {
      invalidateGeneration();
      agentRef.current?.abort();
      abortApi();
    };
  }, [abortApi, invalidateGeneration]);

  const saveResult = useCallback((output: string, context: string) => {
    const s = useAppStore.getState();
    if (!selectedProject || !s.selectedTask || !output) return;
    createTask({
      projectId: selectedProject,
      taskType: s.selectedTask,
      // Never persist an over-length context: it would be reloaded and
      // re-sent verbatim on the next run.
      context: context.slice(0, SECURITY_CONFIG.maxContextLength),
      output,
    });
    addSession({
      task_type: s.selectedTask,
      context: context.slice(0, SECURITY_CONFIG.maxContextLength),
      output,
      created_at: new Date().toISOString(),
    });
  }, [selectedProject, createTask, addSession]);

  const handleExecute = useCallback(async () => {
    if (isExecutingRef.current) return;
    const s = useAppStore.getState();
    if (!s.selectedTask || !s.apiKey) return;
    if (s.mode === 'agent' && !codebaseProvider) return;

    // The documented 10k limit was only enforced as a textarea `maxLength`;
    // a session reloaded from SQLite bypassed it entirely and was shipped
    // to the provider verbatim.
    const context = s.context.slice(0, SECURITY_CONFIG.maxContextLength);

    // Sync provider and model from store to aiService
    aiService.setProvider(s.provider, s.apiKey, s.model);

    const generation = ++generationRef.current;
    isExecutingRef.current = true;
    performance.mark('execute:start');
    try {
      if (s.mode === 'agent' && codebaseProvider) {
        setIsLoading(true);
        setError(null);
        setOutput('');
        setAgentSteps([]);

        const agent = new QaAgent(codebaseProvider, aiService);
        agentRef.current = agent;

        try {
          const result = await agent.run(context, {
            onChunk: (chunk) => {
              if (generation !== generationRef.current) return;
              setOutput((prev) => prev + chunk);
            },
            onStep: (step) => {
              if (generation !== generationRef.current) return;
              addAgentStep(step);
            },
          });

          // Superseded by Reset/unmount: do not persist a partial answer.
          if (generation !== generationRef.current) return;
          if (result.output) {
            saveResult(result.output, context);
          }
        } catch (err) {
          if (generation !== generationRef.current) return;
          const msg = err instanceof Error ? err.message : 'Unknown error';
          setError(redactSecrets(msg));
          ErrorService.report('AGENT_EXECUTION', redactSecrets(msg), { mode: 'agent' });
        } finally {
          if (generation === generationRef.current) {
            setIsLoading(false);
            isExecutingRef.current = false;
          }
          agentRef.current = null;
        }
        return;
      }

      let systemPrompt = QA_SYSTEM_PROMPT;
      let userPrompt = context;

      if (s.selectedTask === 'screenshot_analysis' && s.screenshotBase64) {
        systemPrompt = SCREENSHOT_SYSTEM_PROMPT;
      } else {
        const project = selectedProject ? getProject(selectedProject) : undefined;
        const { system, user } = buildPrompt(s.selectedTask, context, project?.memory);
        systemPrompt = system;
        userPrompt = user;
      }

      const result = await executeApi({
        apiKey: s.apiKey,
        systemPrompt,
        userMessage: userPrompt,
        screenshotBase64: s.screenshotBase64,
        onChunk: (chunk) => {
          if (generation !== generationRef.current) return;
          setOutput((prev) => prev + chunk);
        },
      });

      if (generation !== generationRef.current) return;
      if (result.success && result.output) {
        setOutput(result.output);
        saveResult(result.output, context);
      }
    } catch (err) {
      if (generation !== generationRef.current) return;
      const msg = redactSecrets(err instanceof Error ? err.message : 'Unknown error');
      setError(msg);
      ErrorService.report('API_EXECUTION', msg, { task: s.selectedTask });
    } finally {
      if (generation === generationRef.current) {
        setIsLoading(false);
        isExecutingRef.current = false;
        performance.mark('execute:end');
        performance.measure('execute', 'execute:start', 'execute:end');
      }
    }
  }, [selectedProject, executeApi, getProject, codebaseProvider, aiService, setIsLoading, setError, setOutput, setAgentSteps, addAgentStep, saveResult]);

  const handleReset = useCallback(() => {
    // Invalidate the in-flight run before aborting it, so its late resolution
    // is discarded rather than saved.
    invalidateGeneration();
    agentRef.current?.abort();
    abortApi();
    isExecutingRef.current = false;
    resetTask();
  }, [abortApi, resetTask, invalidateGeneration]);

  return {
    handleExecute,
    handleReset,
    abortApi,
  };
}
