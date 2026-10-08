/**
 * Low-level SQL helper functions for sql.js
 * @module dbHelpers
 * @author ssrjkk
 */

import type { Database } from 'sql.js';
import { ErrorService } from './errorService';
import { ErrorCode } from './constants';

export function rowToObject(columns: string[], values: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => { obj[col] = i < values.length ? values[i] : null; });
  return obj;
}

export function queryAll<T>(db: Database, sql: string, params?: (string | number | null)[]): T[] {
  let stmt: ReturnType<Database['prepare']> | null = null;
  try {
    // prepare() was outside the try, so a malformed statement threw instead of
    // returning [] — which made a corrupt schema surface as an exception from
    // some read paths and as "no data" from others.
    stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      results.push(rowToObject(cols, vals) as T);
    }
    return results;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[dbHelpers] queryAll failed:', sql, err);
    } else {
      ErrorService.reportAsync(ErrorCode.DB_QUERY, err, { operation: 'queryAll' });
    }
    return [];
  } finally {
    try { stmt?.free(); } catch { /* already freed */ }
  }
}

export function queryOne<T>(db: Database, sql: string, params?: (string | number | null)[]): T | undefined {
  let stmt: ReturnType<Database['prepare']> | null = null;
  try {
    stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    if (!stmt.step()) return undefined;
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    return rowToObject(cols, vals) as T;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[dbHelpers] queryOne failed:', sql, err);
    } else {
      ErrorService.reportAsync(ErrorCode.DB_QUERY, err, { operation: 'queryOne' });
    }
    return undefined;
  } finally {
    try { stmt?.free(); } catch { /* already freed */ }
  }
}

/**
 * sql.js dispatches on the argument list: `run(sql)` goes through
 * `sqlite3_exec` (many statements) while `run(sql, params)` takes the
 * prepare/step path (exactly one). Passing params with a multi-statement
 * string silently applies only the first statement, so reject it outright.
 */
export function safeRun(db: Database, sql: string, params?: (string | number | null)[]): string | null {
  if (params && /;\s*\S/.test(sql)) {
    return 'safeRun: multi-statement SQL is not allowed when parameters are bound';
  }
  try {
    db.run(sql, params);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Nested transactions used to issue a plain `BEGIN`, which SQLite rejects —
 * and the `ROLLBACK` in the catch then discarded the *outer* transaction.
 * SAVEPOINTs make nesting safe.
 */
let transactionDepth = 0;

export async function execTransaction(db: Database, saveDb: () => void | Promise<void>, operations: (() => void)[]): Promise<string | null> {
  const depth = transactionDepth++;
  const begin = depth === 0 ? 'BEGIN TRANSACTION' : `SAVEPOINT sp_${depth}`;
  const commit = depth === 0 ? 'COMMIT' : `RELEASE sp_${depth}`;
  const rollback = depth === 0 ? 'ROLLBACK' : `ROLLBACK TO sp_${depth}`;

  try {
    db.run(begin);
    for (const op of operations) op();
    db.run(commit);
    // Persist only after COMMIT — saving mid-transaction calls db.export(),
    // which in sql.js >= 1.10 closes and reopens the handle and therefore
    // rolls the transaction back.
    await saveDb();
    return null;
  } catch (err) {
    try { db.run(rollback); } catch { /* best-effort */ }
    const msg = err instanceof Error ? err.message : String(err);
    if (import.meta.env.DEV) {
      console.warn('[dbHelpers] transaction failed:', msg);
    } else {
      ErrorService.reportAsync(ErrorCode.DB_TRANSACTION, err, { operation: 'transaction' });
    }
    return msg;
  } finally {
    transactionDepth = Math.max(0, depth);
  }
}

export function insertAndReturnId(db: Database, saveDb: () => void | Promise<void>, sql: string, params?: (string | number | null)[]): number {
  try {
    db.run(sql, params);
    saveDb();
    const result = db.exec("SELECT last_insert_rowid() as id");
    const firstRow = result[0]?.values[0]?.[0];
    return firstRow != null ? Number(firstRow) : -1;
  } catch (err) {
    ErrorService.reportAsync(ErrorCode.DB_INSERT, err, { sql });
    return -1;
  }
}

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function buildUpdateQuery<T extends Record<string, unknown>>(table: string, data: T, id: number): { sql: string; params: (string | number | null)[] } | null {
  if (!SAFE_IDENTIFIER.test(table)) return null;

  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'id') continue;
    if (value !== undefined && SAFE_IDENTIFIER.test(key)) {
      fields.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }

  if (fields.length === 0) return null;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  return { sql: `UPDATE ${table} SET ${fields.join(', ')} WHERE id = ?`, params: values };
}
