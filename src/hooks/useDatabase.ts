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
import { runMigrations, getSchemaVersion, LATEST_SCHEMA_VERSION } from '../lib/migrations';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../lib/base64';
import { ErrorService } from '../lib/errorService';
import { ErrorCode, STORAGE_KEYS, LIMITS } from '../lib/constants';
import type { Project } from '../types';
import type { MemoryEntry } from '../types/memory';

/**
 * Snapshot taken *before* migrations run, so a schema upgrade that goes wrong
 * is always recoverable. It lives in the same localStorage the previous
 * (write-only) unload dump used, so it is short-lived rather than a permanent
 * plaintext duplicate of the whole database.
 */
function writeRecoverySnapshot(data: Uint8Array): void {
  try {
    localStorage.setItem(STORAGE_KEYS.dbUnsaved, arrayBufferToBase64(data));
  } catch {
    // Quota exceeded or storage unavailable — migrations are still attempted.
  }
}

function tryLoadRecoverySnapshot(): Uint8Array | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.dbUnsaved);
    if (!raw) return null;
    const bytes = new Uint8Array(base64ToArrayBuffer(raw));
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function clearRecoverySnapshot(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.dbUnsaved);
  } catch { /* storage unavailable */ }
}

export function useDatabase() {
  const [dbService, setDbService] = useState<DatabaseService | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
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
      ErrorService.reportAsync(ErrorCode.DB_SAVE, err);
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
            const bytes = tryLoadRecoverySnapshot();
            if (bytes) {
              try {
                database = new SQL.Database(bytes);
                await storage.save(database.export());
              } catch {
                database = new SQL.Database();
              }
            } else {
              database = new SQL.Database();
            }
          }
        } else {
          database = new SQL.Database();
        }

        const needsMigration = getSchemaVersion(database) < LATEST_SCHEMA_VERSION;
        if (needsMigration) writeRecoverySnapshot(database.export());

        const { applied, currentVersion, error: migrationError } = runMigrations(database);

        if (migrationError) {
          // A half-applied schema is indistinguishable from an empty database
          // to every query below, so it must be reported instead of swallowed.
          const msg = `Database migration failed (schema v${currentVersion}): ${migrationError}. A pre-migration recovery snapshot was kept.`;
          ErrorService.reportAsync(ErrorCode.DB_INIT, new Error(msg));
          if (mounted) setError(msg);
          return;
        }

        if (needsMigration) clearRecoverySnapshot();

        if (applied > 0) {
          const exported = database.export();
          await storage.save(exported);
        }

        const service = new DatabaseService(database, async () => {
          if (saveTimeout) clearTimeout(saveTimeout);
          saveTimeout = setTimeout(async () => {
            saveTimeout = null;
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
          setError('Database was corrupted — restored from the last recovery snapshot. Some recent data may be missing.');
        }
        performance.mark('db:init:end');
        performance.measure('db:init', 'db:init:start', 'db:init:end');
      } catch (err) {
        if (mounted) {
          const msg = err instanceof Error ? err.message : 'Unknown database error';
          setError(msg);
          ErrorService.report(ErrorCode.DB_INIT, msg, undefined, false);
        }
      }
    };

    initDb();

    return () => {
      mounted = false;
      // Run the pending write instead of discarding it: clearing the timer
      // silently dropped the user's last edit when the component unmounted.
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
        void (async () => {
          try {
            const current = dbRef.current;
            if (!current) return;
            const storage = await createStorageProvider();
            await storage.save(current.export());
          } catch (err) {
            ErrorService.reportAsync(ErrorCode.DB_SAVE, err);
          }
        })();
      }
      // sql.js keeps the sqlite3 handle in a process-wide WASM heap; without
      // close() every remount leaks a whole database.
      try { dbRef.current?.close(); } catch { /* already closed */ }
      dbRef.current = null;
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
    const success = await dbService.deleteProject(id);
    if (!success) {
      setProjects(dbService.getProjects());
    }
  }, [dbService]);

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
