/**
 * Database initialization and CRUD hook with migrations
 * @module useDatabase
 * @author ssrjkk
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { DatabaseService } from '../lib/database';
import { createStorageProvider } from '../lib/storage';
import { runMigrations } from '../lib/migrations';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../lib/base64';
import { ErrorService } from '../lib/errorService';
import { ErrorCode, STORAGE_KEYS, LIMITS } from '../lib/constants';
import type { Project } from '../types';
import type { MemoryEntry } from '../types/memory';

export function useDatabase() {
  const [dbService, setDbService] = useState<DatabaseService | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [db, setDb] = useState<Database | null>(null);
  const dbRef = useRef<Database | null>(null);
  const [dbVersion, setDbVersion] = useState(0);

  const saveDb = useCallback(async () => {
    if (!db) return;
    try {
      const exported = db.export();
      const storage = await createStorageProvider();
      await storage.save(exported);
    } catch (err) {
      const msg = `Failed to save database: ${err instanceof Error ? err.message : String(err)}`;
      setError(msg);
      ErrorService.reportAsync('DB_SAVE', err);
    }
  }, [db]);

  useEffect(() => {
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const initDb = async () => {
      try {
        performance.mark('db:init:start');
        // Always load the published asset by name: sql.js exposes a "browser" export
        // condition whose glue asks for sql-wasm-browser.wasm, which we do not ship, so
        // the request would fall through to the SPA index.html and fail with a WASM
        // magic-word CompileError.
        const SQL = await initSqlJs({ locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm` });
        const storage = await createStorageProvider();

        let database: Database;
        let corrupted = false;
        const savedData = await storage.load();

        if (savedData) {
          try {
            database = new SQL.Database(savedData);
          } catch {
            corrupted = true;
            try {
              const backup = localStorage.getItem(STORAGE_KEYS.dbBackup);
              if (backup) {
                const bytes = new Uint8Array(base64ToArrayBuffer(backup));
                database = new SQL.Database(bytes);
                const exported = database.export();
                await storage.save(exported);
              } else {
                database = new SQL.Database();
              }
            } catch {
              database = new SQL.Database();
            }
          }
        } else {
          database = new SQL.Database();
        }

        const { applied, currentVersion } = runMigrations(database);

        if (applied > 0) {
          const exported = database.export();
          await storage.save(exported);
        }

        const service = new DatabaseService(database, async () => {
          if (saveTimeout) clearTimeout(saveTimeout);
          saveTimeout = setTimeout(async () => {
            try {
              const exported = database.export();
              await storage.save(exported);
            } catch (err) {
              ErrorService.reportAsync(ErrorCode.DB_SAVE, err);
            }
          }, LIMITS.debounceSaveMs);
        });

        if (!mounted) return;
        setDb(database);
        setDbService(service);
        setProjects(service.getProjects());
        setIsDbReady(true);
        setDbVersion(currentVersion);
        if (corrupted) {
          setError('Database was corrupted — restored from backup. Some recent data may be missing.');
        }
        performance.mark('db:init:end');
        performance.measure('db:init', 'db:init:start', 'db:init:end');
      } catch (err) {
        if (mounted) {
          const msg = err instanceof Error ? err.message : 'Unknown database error';
          setError(msg);
          ErrorService.report('DB_INIT', msg, undefined, false);
        }
      }
    };

    initDb();

    const handleBeforeUnload = () => {
      const currentDb = dbRef.current;
      if (currentDb) {
        try {
          const exported = currentDb.export();
          const base64 = arrayBufferToBase64(exported.buffer);
          localStorage.setItem(STORAGE_KEYS.dbUnsaved, base64);
        } catch { /* best effort */ }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      mounted = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  }, []);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    if (!dbService) return;
    setProjects(dbService.getProjects());
  }, [dbService]);

  const createProject = useCallback((name: string) => {
    if (!dbService) return;
    const tempId = Date.now();
    const optimisticProject: Project = {
      id: tempId,
      name,
      description: '',
      memory: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setProjects(prev => [optimisticProject, ...prev]);
    const id = dbService.createProject(name);
    if (id > 0) {
      setProjects(dbService.getProjects());
    } else {
      setProjects(prev => prev.filter(p => p.id !== tempId));
    }
    return id;
  }, [dbService]);

  const deleteProject = useCallback(async (id: number) => {
    if (!dbService || id <= 0) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    if (selectedProject === id) setSelectedProject(null);
    const success = await dbService.deleteProject(id);
    if (!success) {
      setProjects(dbService.getProjects());
    }
  }, [dbService, selectedProject, setSelectedProject]);

  const updateProjectMemory = useCallback((id: number, memory: string) => {
    if (!dbService || id <= 0) return;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, memory, updated_at: new Date().toISOString() } : p));
    dbService.updateProjectMemory(id, memory);
  }, [dbService]);

  const getProject = useCallback((id: number) => {
    return dbService?.getProject(id);
  }, [dbService]);

  const createTask = useCallback((data: { projectId: number; taskType: string; context: string; output: string }) => {
    if (!dbService) return;
    dbService.createTask(data.projectId, data.taskType, data.context, data.output);
  }, [dbService]);

  const getRecentSessions = useCallback((projectId: number, limit: number) => {
    return dbService?.getRecentSessions(projectId, limit) || [];
  }, [dbService]);

  const clearConversationHistory = useCallback((projectId: number) => {
    if (!dbService) return;
    dbService.clearConversationHistory(projectId);
  }, [dbService]);

  const getMemoryEntries = useCallback((projectId: number) => {
    return dbService?.getMemoryEntries(projectId) || [];
  }, [dbService]);

  const createMemoryEntry = useCallback((entry: Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>) => {
    if (!dbService) return -1;
    return dbService.createMemoryEntry(entry);
  }, [dbService]);

  const updateMemoryEntry = useCallback((id: number, updates: Partial<MemoryEntry>) => {
    if (!dbService) return;
    dbService.updateMemoryEntry(id, updates);
  }, [dbService]);

  const deleteMemoryEntry = useCallback((id: number) => {
    if (!dbService) return;
    dbService.deleteMemoryEntry(id);
  }, [dbService]);

  return {
    db,
    saveDb,
    dbService,
    projects,
    selectedProject,
    setSelectedProject,
    isDbReady,
    error,
    dbVersion,
    createProject,
    deleteProject,
    updateProjectMemory,
    getProject,
    createTask,
    getRecentSessions,
    clearConversationHistory,
    getMemoryEntries,
    createMemoryEntry,
    updateMemoryEntry,
    deleteMemoryEntry
  };
}
