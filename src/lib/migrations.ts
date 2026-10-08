/**
 * Versioned database migration system
 * @module migrations
 * @author ssrjkk
 */

import type { Database } from 'sql.js';
import { ErrorService } from './errorService';
import { ErrorCode } from './constants';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    up: (db) => {
      db.run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        memory TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        task_type TEXT NOT NULL,
        context TEXT,
        output TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS screenshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER,
        image_data TEXT NOT NULL,
        analysis_result TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS conversation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        task_type TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )`);
    },
  },
  {
    version: 2,
    name: 'memory entries table',
    up: (db) => {
      db.run(`CREATE TABLE IF NOT EXISTS memory_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        confidence REAL DEFAULT 0.8,
        source_task_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )`);
      db.run('CREATE INDEX IF NOT EXISTS idx_memory_project ON memory_entries(project_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_memory_category ON memory_entries(category)');
    },
  },
  {
    version: 3,
    name: 'project indexes',
    up: (db) => {
      db.run('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_conv_project ON conversation_history(project_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_screenshots_task ON screenshots(task_id)');
    },
  },
];

const MIGRATION_TABLE = '_schema_migrations';

/** Highest migration version in this build. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

/** Tables every build must end up with. */
const REQUIRED_TABLES = ['projects', 'tasks', 'screenshots', 'conversation_history', 'memory_entries'];

for (let i = 0; i < MIGRATIONS.length; i++) {
  const expected = i + 1;
  if (MIGRATIONS[i]!.version !== expected) {
    throw new Error(`migrations: expected contiguous versions 1..${LATEST_SCHEMA_VERSION}`);
  }
}

function ensureMigrationTable(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

function getAppliedVersions(db: Database): Set<number> {
  const result = db.exec(`SELECT version FROM ${MIGRATION_TABLE}`);
  const versions = new Set<number>();
  if (result[0]) {
    for (const row of result[0].values) {
      const v = row?.[0];
      if (typeof v === 'number') versions.add(v);
      // SQLite may hand back TEXT for a hand-edited or foreign database.
      else if (typeof v === 'string' && /^\d+$/.test(v)) versions.add(Number(v));
    }
  }
  return versions;
}

export function getSchemaVersion(db: Database): number {
  ensureMigrationTable(db);
  const versions = getAppliedVersions(db);
  if (versions.size === 0) return 0;
  return Math.max(...versions);
}

/** Tables missing after a migration run — a non-empty list means a broken schema. */
export function verifySchema(db: Database): string[] {
  try {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const present = new Set<string>();
    for (const row of result[0]?.values ?? []) {
      if (typeof row[0] === 'string') present.add(row[0]);
    }
    return REQUIRED_TABLES.filter(t => !present.has(t));
  } catch {
    return [...REQUIRED_TABLES];
  }
}

export interface MigrationResult {
  applied: number;
  currentVersion: number;
  /** Non-null when a migration failed; the caller must surface it. */
  error: string | null;
}

export function runMigrations(db: Database): MigrationResult {
  ensureMigrationTable(db);
  const alreadyApplied = getAppliedVersions(db);
  let count = 0;

  for (const migration of MIGRATIONS) {
    if (alreadyApplied.has(migration.version)) continue;

    try {
      db.run('BEGIN TRANSACTION');
      migration.up(db);
      db.run(
        `INSERT INTO ${MIGRATION_TABLE} (version, name) VALUES (?, ?)`,
        [migration.version, migration.name],
      );
      db.run('COMMIT');
      count++;
    } catch (err) {
      try { db.run('ROLLBACK'); } catch { /* ignore */ }
      const message = err instanceof Error ? err.message : String(err);
      ErrorService.reportAsync(ErrorCode.DB_INIT, err, { migration: migration.name });
      // Previously this was swallowed with a recoverable report, so every read
      // below silently returned "no data" on a half-migrated database.
      return { applied: count, currentVersion: getSchemaVersion(db), error: `${migration.name}: ${message}` };
    }
  }

  const missing = verifySchema(db);
  if (missing.length > 0) {
    const message = `missing tables: ${missing.join(', ')}`;
    ErrorService.reportAsync(ErrorCode.DB_INIT, new Error(message));
    return { applied: count, currentVersion: getSchemaVersion(db), error: message };
  }

  return { applied: count, currentVersion: getSchemaVersion(db), error: null };
}
