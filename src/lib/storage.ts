/**
 * IndexedDB storage with LocalStorage fallback and AES-GCM encryption
 * @module storage
 * @author ssrjkk
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';
import { ErrorService } from './errorService';
import { ErrorCode, STORAGE_KEYS, KDF } from './constants';

const DB_NAME = 'drafter-db';
const DB_VERSION = 1;
const STORE_NAME = 'database';
const DB_KEY = 'drafter-db-v1';
const LS_SALT_KEY = 'drafter-ls-salt';

async function getLsCryptoKey(): Promise<CryptoKey> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.lsPassphrase);
    if (stored) {
      const raw = base64ToArrayBuffer(stored);
      return crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
    }
  } catch {
    // localStorage unavailable — generate fresh key
  }
  const passphrase = crypto.getRandomValues(new Uint8Array(32));
  try {
    localStorage.setItem(STORAGE_KEYS.lsPassphrase, arrayBufferToBase64(passphrase));
  } catch {
    // Without a persisted passphrase a new key is minted on every call, so
    // save() and load() can never round-trip. Fail loudly instead of silently
    // losing the user's data on the next reload.
    throw new Error('LocalStorage is unavailable: cannot persist the storage encryption key');
  }
  return crypto.subtle.importKey('raw', passphrase, 'PBKDF2', false, ['deriveKey']);
}

function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

/** Random per-install salt: a constant salt derives the same key everywhere. */
function getLsSalt(): Uint8Array {
  const existing = localStorage.getItem(LS_SALT_KEY);
  if (existing) {
    try {
      const decoded = new Uint8Array(base64ToArrayBuffer(existing));
      if (decoded.byteLength >= 16) return decoded;
    } catch { /* regenerate below */ }
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(LS_SALT_KEY, arrayBufferToBase64(salt));
  return salt;
}

async function deriveLsAesKey(passphrase: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: getLsSalt(), iterations: KDF.ITERATIONS, hash: KDF.HASH },
    passphrase,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface StorageProvider {
  save(data: Uint8Array): Promise<void>;
  load(): Promise<Uint8Array | null>;
  clear(): Promise<void>;
  getSize(): Promise<number>;
}

export class IndexedDBStorage implements StorageProvider {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  private async getDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initDatabase();
    return this.initPromise;
  }

  private initDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        this.initPromise = null;
        reject(new Error('IndexedDB unavailable (Firefox private mode)'));
        return;
      }

      request.onerror = () => {
        this.initPromise = null;
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onclose = () => { this.db = null; };
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  async save(data: Uint8Array): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, DB_KEY);

      request.onerror = () => reject(new Error('Failed to save to IndexedDB'));
      request.onsuccess = () => resolve();
    });
  }

  async load(): Promise<Uint8Array | null> {
    try {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(DB_KEY);

        request.onerror = () => reject(new Error('Failed to load from IndexedDB'));
        request.onsuccess = () => resolve(request.result || null);
      });
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.STORAGE_LOAD, err);
      return null;
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(DB_KEY);

        request.onerror = () => reject(new Error('Failed to clear IndexedDB'));
        request.onsuccess = () => resolve();
      });
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.STORAGE_CLEAR, err);
    }
  }

  async getSize(): Promise<number> {
    const data = await this.load();
    return data ? data.byteLength : 0;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export class LocalStorageFallback implements StorageProvider {
  private readonly maxSize = 5 * 1024 * 1024;

  async save(data: Uint8Array): Promise<void> {
    const passphrase = await getLsCryptoKey();
    const aesKey = await deriveLsAesKey(passphrase);
    const iv = generateIv();
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data),
    );
    const combined = new Uint8Array(iv.length + encrypted.length);
    combined.set(iv, 0);
    combined.set(encrypted, iv.length);

    const encoded = arrayBufferToBase64(combined);
    // Check the *stored* size: base64 of (iv + ciphertext + GCM tag) is what
    // actually has to fit, and it is always larger than the plaintext.
    if (encoded.length > this.maxSize) {
      throw new Error(`Data too large: ${encoded.length} bytes (max: ${this.maxSize})`);
    }

    try {
      localStorage.setItem(DB_KEY, encoded);
    } catch (err) {
      // Swallowing this made every save look successful while nothing was
      // written, so the user lost the session on reload.
      ErrorService.reportAsync(ErrorCode.STORAGE_SAVE, err);
      throw err;
    }
  }

  async load(): Promise<Uint8Array | null> {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(DB_KEY);
    } catch {
      return null;
    }
    if (!saved) return null;

    try {
      const combined = base64ToArrayBuffer(saved);
      if (combined.byteLength < 12) return null;
      const iv = new Uint8Array(combined.slice(0, 12));
      const ciphertext = combined.slice(12);
      const passphrase = await getLsCryptoKey();
      const aesKey = await deriveLsAesKey(passphrase);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
      return new Uint8Array(decrypted);
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.DECRYPT, err);
      return null;
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(DB_KEY);
    } catch {
      // localStorage unavailable
    }
  }

  async getSize(): Promise<number> {
    try {
      const data = localStorage.getItem(DB_KEY);
      return data ? data.length : 0;
    } catch {
      return 0;
    }
  }
}

/**
 * The provider is a singleton: creating a new one per save opened a fresh
 * IndexedDB connection each time (and leaked it), plus two extra open/delete
 * cycles for the availability probe — on *every* repository write.
 */
let cachedProvider: Promise<StorageProvider> | null = null;

export function createStorageProvider(): Promise<StorageProvider> {
  if (cachedProvider) return cachedProvider;
  cachedProvider = probeStorage().catch(err => {
    // Do not memoise a failed probe: IndexedDB can recover (private-mode
    // toggles, quota changes) and the user should not be stuck with a fallback.
    cachedProvider = null;
    throw err;
  });
  return cachedProvider;
}

async function probeStorage(): Promise<StorageProvider> {
  if (typeof indexedDB === 'undefined') {
    return new LocalStorageFallback();
  }

  return new Promise<StorageProvider>((resolve) => {
    let testDb: IDBOpenDBRequest;
    try {
      testDb = indexedDB.open('drafter-test', 1);
    } catch {
      resolve(new LocalStorageFallback());
      return;
    }
    const fallback = () => {
      try { indexedDB.deleteDatabase('drafter-test'); } catch { /* ignore */ }
      resolve(new LocalStorageFallback());
    };
    testDb.onsuccess = () => {
      testDb.result.close();
      try { indexedDB.deleteDatabase('drafter-test'); } catch { /* ignore */ }
      resolve(new IndexedDBStorage());
    };
    testDb.onerror = fallback;
    testDb.onblocked = fallback;
  });
}

/** Test seam: drop the memoised provider so a new probe runs. */
export function resetStorageProvider(): void {
  cachedProvider = null;
}
