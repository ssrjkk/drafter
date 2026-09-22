/**
 * One-time migration of persisted state from the pre-rename ("QA Copilot") keys.
 *
 * The project was renamed to Drafter, which changed every storage identifier.
 * Without this migration an existing install would silently lose its settings
 * and its whole SQLite database. Migration runs once, is fully best-effort and
 * never blocks or breaks app startup.
 *
 * @module legacyMigration
 * @author ssrjkk
 */

import { ErrorCode, LEGACY_STORAGE_KEYS, STORAGE_KEYS } from './constants';
import { ErrorService } from './errorService';

interface LegacyDatabase {
  legacy: string;
  current: string;
  store: string;
}

const LEGACY_DATABASES: LegacyDatabase[] = [
  { legacy: 'qa-helper-db', current: 'drafter-db', store: 'database' },
  { legacy: 'qa-copilot-keys', current: 'drafter-keys', store: 'key-vault' },
];

/** Copy every legacy localStorage value that has no counterpart yet. */
export function migrateLocalStorageKeys(): number {
  if (typeof localStorage === 'undefined') return 0;

  let migrated = 0;
  for (const [name, legacyKey] of Object.entries(LEGACY_STORAGE_KEYS)) {
    if (!legacyKey) continue;
    const currentKey = STORAGE_KEYS[name as keyof typeof STORAGE_KEYS];
    try {
      if (localStorage.getItem(currentKey) !== null) continue;
      const legacyValue = localStorage.getItem(legacyKey);
      if (legacyValue === null) continue;
      localStorage.setItem(currentKey, legacyValue);
      migrated += 1;
    } catch {
      // Storage unavailable or full — skip this key, keep going.
    }
  }
  return migrated;
}

function openDatabase(name: string, version: number): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, version);
    } catch {
      resolve(null);
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    // Never create stores on the legacy database: a missing store is how we
    // detect that the legacy database never existed in the first place.
  });
}

function readAll(db: IDBDatabase, store: string): Promise<Array<[IDBValidKey, unknown]>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).openCursor();
    const entries: Array<[IDBValidKey, unknown]> = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        entries.push([cursor.key, cursor.value]);
        cursor.continue();
      } else {
        resolve(entries);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

function writeAll(db: IDBDatabase, store: string, entries: Array<[IDBValidKey, unknown]>): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    for (const [key, value] of entries) objectStore.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Copy a legacy IndexedDB database into its renamed counterpart. */
async function migrateDatabase({ legacy, current, store }: LegacyDatabase): Promise<boolean> {
  const legacyDb = await openDatabase(legacy, 1);
  if (!legacyDb) return false;

  try {
    if (!legacyDb.objectStoreNames.contains(store)) return false;

    const entries = await readAll(legacyDb, store);
    if (entries.length === 0) return false;

    const currentDb = await openDatabase(current, 1);
    if (!currentDb) return false;

    try {
      if (!currentDb.objectStoreNames.contains(store)) return false;
      const existing = await readAll(currentDb, store);
      if (existing.length > 0) return false;
      await writeAll(currentDb, store, entries);
      return true;
    } finally {
      currentDb.close();
    }
  } finally {
    legacyDb.close();
  }
}

/**
 * Migrate renamed localStorage keys and IndexedDB databases.
 * Safe to call on every startup — it short-circuits once the flag is set.
 */
export async function migrateLegacyStorage(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if (localStorage.getItem(STORAGE_KEYS.migrated) === 'true') return;
  } catch {
    return;
  }

  try {
    migrateLocalStorageKeys();

    if (typeof indexedDB !== 'undefined') {
      for (const database of LEGACY_DATABASES) {
        await migrateDatabase(database);
      }
    }

    localStorage.setItem(STORAGE_KEYS.migrated, 'true');
  } catch (err) {
    ErrorService.reportAsync(ErrorCode.STORAGE_LOAD, err, { operation: 'legacyMigration' });
  }
}
