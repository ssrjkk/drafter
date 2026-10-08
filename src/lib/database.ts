/**
 * Database service wrapping sql.js with CRUD operations
 * @module database
 * @author ssrjkk
 */

import type { Database } from 'sql.js';
import type { Project, Task, ConversationMessage } from '../types';
import type { MemoryEntry } from '../types/memory';
import { mapRowToMemoryEntry } from '../domain/entities/Memory';
import { queryAll, queryOne, safeRun, execTransaction, buildUpdateQuery } from './dbHelpers';
import { ErrorService } from './errorService';
import { ErrorCode } from '../lib/constants';

export class DatabaseService {
  private lastError: string | null = null;
  private isInitialized = false;

  constructor(private db: Database, private saveDb: () => void | Promise<void>) {}

  getLastError(): string | null {
    return this.lastError;
  }

  clearError(): void {
    this.lastError = null;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  setInitialized(value: boolean): void {
    this.isInitialized = value;
  }

  async execTransaction(operations: (() => void)[]): Promise<boolean> {
    const error = await execTransaction(this.db, this.saveDb, operations);
    if (error) {
      this.lastError = error;
      return false;
    }
    this.clearError();
    return true;
  }

  private safeRun(sql: string, params?: (string | number | null)[]): boolean {
    const error = safeRun(this.db, sql, params);
    if (error) {
      this.lastError = error;
      return false;
    }
    this.clearError();
    return true;
  }

  private queryAll<T>(sql: string, params?: (string | number | null)[]): T[] {
    return queryAll<T>(this.db, sql, params);
  }

  private queryOne<T>(sql: string, params?: (string | number | null)[]): T | undefined {
    return queryOne<T>(this.db, sql, params);
  }

  private insertAndReturnId(sql: string, params?: (string | number | null)[]): number {
    // Branch on safeRun's return value: `lastError` is shared instance state, so
    // a stale error from an earlier failed statement could make a *successful*
    // insert report -1.
    if (!this.safeRun(sql, params)) return -1;
    try {
      this.saveDb();
      const result = this.db.exec("SELECT last_insert_rowid() as id");
      const firstRow = result[0]?.values[0]?.[0];
      return firstRow != null ? Number(firstRow) : -1;
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.DB_INSERT, err, { sql: sql.slice(0, 100) });
      return -1;
    }
  }

  getProjects(): Project[] {
    return this.queryAll<Project>("SELECT * FROM projects ORDER BY updated_at DESC");
  }

  getProject(id: number): Project | undefined {
    return this.queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]);
  }

  createProject(name: string, description: string = ""): number {
    return this.insertAndReturnId(
      "INSERT INTO projects (name, description, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
      [name, description],
    );
  }

  updateProject(id: number, updates: Partial<Project>): boolean {
    const result = buildUpdateQuery('projects', updates as Record<string, unknown>, id);
    if (!result) return false;
    if (!this.safeRun(result.sql, result.params)) return false;
    this.saveDb();
    return true;
  }

  updateProjectMemory(id: number, memory: string): void {
    this.safeRun("UPDATE projects SET memory = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [memory, id]);
    this.saveDb();
  }

  async deleteProject(id: number): Promise<boolean> {
    return this.execTransaction([
      () => this.db.run("DELETE FROM screenshots WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)", [id]),
      () => this.db.run("DELETE FROM tasks WHERE project_id = ?", [id]),
      () => this.db.run("DELETE FROM conversation_history WHERE project_id = ?", [id]),
      () => this.db.run("DELETE FROM memory_entries WHERE project_id = ?", [id]),
      () => this.db.run("DELETE FROM projects WHERE id = ?", [id]),
    ]);
  }

  getTasks(projectId: number, limit?: number): Task[] {
    const sql = limit 
      ? "SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC LIMIT ?" 
      : "SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC";
    return this.queryAll<Task>(sql, limit ? [projectId, limit] : [projectId]);
  }

  createTask(projectId: number, taskType: string, context: string, output: string): number {
    return this.insertAndReturnId(
      "INSERT INTO tasks (project_id, task_type, context, output, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
      [projectId, taskType, context, output],
    );
  }

  async batchCreateTasks(tasks: Array<{ projectId: number; taskType: string; context: string; output: string }>): Promise<number[]> {
    const results: number[] = [];
    const operations: (() => void)[] = tasks.map(task => () => {
      this.db.run(
        "INSERT INTO tasks (project_id, task_type, context, output, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
        [task.projectId, task.taskType, task.context, task.output]
      );
      const result = this.db.exec("SELECT last_insert_rowid() as id");
      const firstRow = result[0]?.values[0]?.[0];
      results.push(firstRow != null ? Number(firstRow) : -1);
    });
    // On rollback the collected ids refer to rows that no longer exist, so
    // report failure rather than a plausible-looking success.
    const committed = await this.execTransaction(operations);
    return committed ? results : [];
  }

  getDatabase(): Database {
    return this.db;
  }

  addConversationMessage(projectId: number, role: 'user' | 'assistant', content: string, taskType?: string): number {
    return this.insertAndReturnId(
      "INSERT INTO conversation_history (project_id, role, content, task_type, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
      [projectId, role, content, taskType || null],
    );
  }

  getConversationHistory(projectId: number, limit: number = 50): ConversationMessage[] {
    return this.queryAll<ConversationMessage>(
      "SELECT * FROM conversation_history WHERE project_id = ? ORDER BY created_at DESC LIMIT ?",
      [projectId, limit]
    ).reverse();
  }

  clearConversationHistory(projectId: number): void {
    this.safeRun("DELETE FROM conversation_history WHERE project_id = ?", [projectId]);
    this.saveDb();
  }

  getRecentSessions(projectId: number, limit: number = 10): Array<{ task_type: string; context: string; output: string; created_at: string }> {
    // DISTINCT included created_at, so this was just "the last N tasks" with
    // duplicates and no deduplication at all.
    return this.queryAll(
      "SELECT task_type, context, output, created_at FROM tasks WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
      [projectId, limit]
    );
  }

  getMemoryEntries(projectId: number, category?: string): MemoryEntry[] {
    const sql = category
      ? "SELECT * FROM memory_entries WHERE project_id = ? AND category = ? ORDER BY created_at DESC"
      : "SELECT * FROM memory_entries WHERE project_id = ? ORDER BY created_at DESC";
    // Must go through the row mapper: raw rows carry whatever category was
    // persisted, and an unknown one used to throw during render.
    return this.queryAll<Record<string, unknown>>(sql, category ? [projectId, category] : [projectId])
      .map(mapRowToMemoryEntry);
  }

  createMemoryEntry(entry: Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>): number {
    return this.insertAndReturnId(
      "INSERT INTO memory_entries (project_id, category, key, value, confidence, source_task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
      [entry.project_id, entry.category, entry.key, entry.value, entry.confidence, entry.source_task_id || null],
    );
  }

  async batchCreateMemoryEntries(entries: Array<Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>>): Promise<number[]> {
    const results: number[] = [];
    const operations: (() => void)[] = entries.map(entry => () => {
      this.db.run(
        "INSERT INTO memory_entries (project_id, category, key, value, confidence, source_task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
        [entry.project_id, entry.category, entry.key, entry.value, entry.confidence, entry.source_task_id || null]
      );
      const result = this.db.exec("SELECT last_insert_rowid() as id");
      const firstRow = result[0]?.values[0]?.[0];
      results.push(firstRow != null ? Number(firstRow) : -1);
    });
    const committed = await this.execTransaction(operations);
    return committed ? results : [];
  }

  updateMemoryEntry(id: number, updates: Partial<MemoryEntry>): boolean {
    const result = buildUpdateQuery('memory_entries', updates as Record<string, unknown>, id);
    if (!result) return false;
    if (!this.safeRun(result.sql, result.params)) return false;
    this.saveDb();
    return true;
  }

  deleteMemoryEntry(id: number): void {
    this.safeRun("DELETE FROM memory_entries WHERE id = ?", [id]);
    this.saveDb();
  }

  searchMemoryEntries(projectId: number, searchTerm: string): MemoryEntry[] {
    // An empty term would escape to '%%' and dump the whole project.
    if (!searchTerm) return [];
    const escaped = searchTerm.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const term = `%${escaped}%`;
    return this.queryAll<Record<string, unknown>>(
      "SELECT * FROM memory_entries WHERE project_id = ? AND (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\') ORDER BY created_at DESC",
      [projectId, term, term]
    ).map(mapRowToMemoryEntry);
  }

  getMemoryStats(projectId: number): { total: number; categories: Record<string, number> } {
    const rows = this.queryAll<{ category: string; count: number }>(
      "SELECT category, COUNT(*) as count FROM memory_entries WHERE project_id = ? GROUP BY category",
      [projectId],
    );
    const categories: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      categories[row.category] = row.count;
      total += row.count;
    }
    return { total, categories };
  }

  initMemoryTable(): void {
    this.safeRun(
      "CREATE TABLE IF NOT EXISTS memory_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, category TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, confidence REAL DEFAULT 0.8, source_task_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (project_id) REFERENCES projects(id))"
    );
    this.safeRun("CREATE INDEX IF NOT EXISTS idx_memory_project ON memory_entries(project_id)");
    this.safeRun("CREATE INDEX IF NOT EXISTS idx_memory_category ON memory_entries(category)");
    this.saveDb();
  }

  vacuum(): void {
    this.db.run("VACUUM");
  }

  getDatabaseSize(): number {
    const countResult = this.db.exec("PRAGMA page_count");
    const pageCount = countResult[0]?.values[0]?.[0];
    if (pageCount == null) return 0;
    const sizeResult = this.db.exec("PRAGMA page_size");
    const pageSize = sizeResult[0]?.values[0]?.[0];
    return Number(pageCount) * Number(pageSize || 4096);
  }

  exportAll(): { projects: Project[]; tasks: Task[]; memoryEntries: MemoryEntry[] } {
    return {
      projects: this.getProjects(),
      tasks: this.queryAll<Task>("SELECT * FROM tasks"),
      memoryEntries: this.queryAll<MemoryEntry>("SELECT * FROM memory_entries")
    };
  }
}
