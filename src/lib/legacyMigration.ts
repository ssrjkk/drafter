/**
 * One-time migration of persisted state from the pre-rename ("QA Copilot") keys.
 *
 * The project was renamed to Drafter, which changed every storage identifier.
 * Without this migration an existing install would silently lose its settings,
 * API key and its whole SQLite database.
 *
 * The migration is strictly additive and never destructive:
 * - it only writes a target value when the target does not exist yet
 * - it never creates a database that did not already exist
 * - when the target database has to be created, it is created with its object
 *   store, because opening a database at its current version does NOT fire
 *   `onupgradeneeded` and would otherwise leave a store-less database behind
 * - it is fully best-effort and never blocks or breaks app startup
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

  // Backups are stored as `<prefix><id>`. Move those entries too, otherwise the
  // copied index would reference backups that no longer exist.
  const legacyPrefix = LEGACY_STORAGE_KEYS.backupPrefix;
  if (legacyPrefix) {
    try {
      const currentPrefix = STORAGE_KEYS.backupPrefix;
      const pending: Array<[string, string]> = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(legacyPrefix)) continue;
        const currentKey = currentPrefix + key.slice(legacyPrefix.length);
        if (localStorage.getItem(currentKey) !== null) continue;
        const value = localStorage.getItem(key);
        if (value !== null) pending.push([currentKey, value]);
      }
      for (const [key, value] of pending) {
        localStorage.setItem(key, value);
        migrated += 1;
      }
    } catch {
      // Best effort.
    }
  }

  return migrated;
}

/**
 * Open a database and report whether it had to be created.
 *
 * Opening without an explicit version lets us detect a pre-existing database
 * through `onupgradeneeded`: it only fires when the database did not exist. A
 * database we just created by accident is deleted again, so the migration never
 * leaves empty databases behind. `createStore` is applied only at creation
 * time, which is the sole moment a schema can be defined without bumping the
 * version.
 */
function openDatabase(
  name: string,
  createStore?: string,
): Promise<{ db: IDBDatabase; created: boolean } | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    let created = false;
    try {
      request = indexedDB.open(name);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      created = true;
      if (!createStore) return;
      const db = request.result;
      if (!db.objectStoreNames.contains(createStore)) {
        db.createObjectStore(createStore);
      }
    };

    request.onsuccess = () => resolve({ db: request.result, created });
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/** Close and remove a database that the migration created by accident. */
function discardDatabase(db: IDBDatabase, name: string): void {
  db.close();
  try {
    indexedDB.deleteDatabase(name);
  } catch {
    // Best effort.
  }
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
  const legacyResult = await openDatabase(legacy);
  if (!legacyResult) return false;

  if (legacyResult.created) {
    // The legacy database never existed, so there is nothing to migrate.
    discardDatabase(legacyResult.db, legacy);
    return false;
  }

  try {
    if (!legacyResult.db.objectStoreNames.contains(store)) return false;

    const entries = await readAll(legacyResult.db, store);
    if (entries.length === 0) return false;

    const currentResult = await openDatabase(current, store);
    if (!currentResult) return false;

    try {
      if (!currentResult.db.objectStoreNames.contains(store)) return false;
      // Never overwrite data the renamed database already holds.
      if (!currentResult.created && (await readAll(currentResult.db, store)).length > 0) {
        return false;
      }
      await writeAll(currentResult.db, store, entries);
      return true;
    } finally {
      currentResult.db.close();
    }
  } finally {
    legacyResult.db.close();
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

    // Without IndexedDB there is no legacy database to move.
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
