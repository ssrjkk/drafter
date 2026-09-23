/**
 * Zustand application state store
 * @module useAppStore
 * @author ssrjkk
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { LIMITS, PROTOTYPE_POLLUTION_KEYS } from '../lib/constants';
import type { MemoryEntry } from '../types/memory';
import type { AgentStep } from '../data/agent/types';
import type { Session } from '../domain/entities/Session';
import type { AiProvider } from '../data/api/types';

interface AppState {
  selectedTask: string | null;
  setSelectedTask: (task: string | null) => void;

  context: string;
  setContext: (context: string) => void;

  output: string;
  setOutput: (output: string | ((prev: string) => string)) => void;

  screenshotBase64: string | null;
  setScreenshotBase64: (screenshot: string | null) => void;

  selectedProject: number | null;
  setSelectedProject: (id: number | null) => void;

  currentMemory: string;
  setCurrentMemory: (memory: string) => void;

  memoryEntries: MemoryEntry[];
  setMemoryEntries: (entries: MemoryEntry[]) => void;
  addMemoryEntry: (entry: MemoryEntry) => void;
  removeMemoryEntry: (id: number) => void;
  updateMemoryEntry: (id: number, updates: Partial<MemoryEntry>) => void;

  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;

  showApiKeyInput: boolean;
  setShowApiKeyInput: (show: boolean) => void;

  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  error: string | null;
  setError: (error: string | null) => void;

  apiKey: string;
  setApiKey: (key: string) => void;

  apiKeyValid: boolean;
  setApiKeyValid: (valid: boolean) => void;

  provider: AiProvider;
  setProvider: (provider: AiProvider) => void;

  model: string;
  setModel: (model: string) => void;

  agentSteps: AgentStep[];
  setAgentSteps: (steps: AgentStep[] | ((prev: AgentStep[]) => AgentStep[])) => void;
  addAgentStep: (step: AgentStep) => void;

  mode: 'prompt' | 'agent';
  setMode: (mode: 'prompt' | 'agent') => void;

  codebaseLoaded: boolean;
  setCodebaseLoaded: (loaded: boolean) => void;

  resetTask: () => void;
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    selectedTask: null,
    setSelectedTask: (task) => set((state) => { state.selectedTask = task; }),

    context: '',
    setContext: (context) => set((state) => { state.context = context; }),

    output: '',
    setOutput: (output) => set((state) => {
      state.output = typeof output === 'function' ? output(state.output) : output;
    }),

    screenshotBase64: null,
    setScreenshotBase64: (screenshot) => set((state) => { state.screenshotBase64 = screenshot; }),

    selectedProject: null,
    setSelectedProject: (id) => set((state) => { state.selectedProject = id; }),

    currentMemory: '',
    setCurrentMemory: (memory) => set((state) => { state.currentMemory = memory; }),

    memoryEntries: [],
    setMemoryEntries: (entries) => set((state) => { state.memoryEntries = entries; }),
    addMemoryEntry: (entry) => set((state) => { state.memoryEntries.push(entry); }),
    removeMemoryEntry: (id) => set((state) => {
      state.memoryEntries = state.memoryEntries.filter((e: MemoryEntry) => e.id !== id);
    }),
    updateMemoryEntry: (id, updates) => set((state) => {
      const entry = state.memoryEntries.find((e: MemoryEntry) => e.id === id);
      if (entry) {
        const safe = Object.keys(updates).reduce((acc, k) => {
          if (!PROTOTYPE_POLLUTION_KEYS.has(k)) acc[k] = (updates as Record<string, unknown>)[k];
          return acc;
        }, {} as Record<string, unknown>);
        Object.assign(entry, safe);
      }
    }),

    sessions: [],
    setSessions: (sessions) => set((state) => { state.sessions = sessions; }),
    addSession: (session) => set((state) => {
      state.sessions.unshift(session);
      if (state.sessions.length > LIMITS.maxSessions) state.sessions.length = LIMITS.maxSessions;
    }),

    showApiKeyInput: false,
    setShowApiKeyInput: (show) => set((state) => { state.showApiKeyInput = show; }),

    isLoading: false,
    setIsLoading: (loading) => set((state) => { state.isLoading = loading; }),

    error: null,
    setError: (error) => set((state) => { state.error = error; }),

    apiKey: '',
    setApiKey: (key) => set((state) => { state.apiKey = key; }),

    apiKeyValid: false,
    setApiKeyValid: (valid) => set((state) => { state.apiKeyValid = valid; }),

    provider: 'claude',
    setProvider: (provider) => set((state) => { state.provider = provider; }),

    model: 'claude-sonnet-4-20250514',
    setModel: (model) => set((state) => { state.model = model; }),

    agentSteps: [],
    setAgentSteps: (steps) => set((state) => {
      state.agentSteps = typeof steps === 'function' ? steps(state.agentSteps) : steps;
    }),
    addAgentStep: (step) => set((state) => {
      state.agentSteps.push(step);
      if (state.agentSteps.length > LIMITS.maxAgentSteps) {
        state.agentSteps = state.agentSteps.slice(-LIMITS.maxAgentSteps);
      }
    }),

    mode: 'prompt',
    setMode: (mode) => set((state) => { state.mode = mode; }),

    codebaseLoaded: false,
    setCodebaseLoaded: (loaded) => set((state) => { state.codebaseLoaded = loaded; }),

    resetTask: () => set((state) => {
      state.context = '';
      state.output = '';
      state.screenshotBase64 = null;
      state.error = null;
      state.agentSteps = [];
    }),
  }))
);
