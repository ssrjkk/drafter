/**
 * IndexedDB storage with LocalStorage fallback and AES-GCM encryption
 * @module storage
 * @author ssrjkk
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';
import { ErrorService } from './errorService';
import { ErrorCode, STORAGE_KEYS } from './constants';

const DB_NAME = 'drafter-db';
const DB_VERSION = 1;
const STORE_NAME = 'database';
const DB_KEY = 'app-state';

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
    localStorage.setItem(STORAGE_KEYS.lsPassphrase, arrayBufferToBase64(passphrase.buffer));
  } catch {
    // localStorage full or unavailable — ephemeral key
  }
  return crypto.subtle.importKey('raw', passphrase, 'PBKDF2', false, ['deriveKey']);
}

function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

async function deriveLsAesKey(passphrase: CryptoKey): Promise<CryptoKey> {
  const salt = new TextEncoder().encode('drafter-ls-salt');
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
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
    const base64Length = Math.ceil(data.length / 3) * 4;
    const estimatedSize = base64Length + 16;
    if (estimatedSize > this.maxSize) {
      throw new Error(`Data too large: ${estimatedSize} bytes (max: ${this.maxSize})`);
    }

    const passphrase = await getLsCryptoKey();
    const aesKey = await deriveLsAesKey(passphrase);
    const iv = generateIv();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      data,
    );
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    try {
      localStorage.setItem(DB_KEY, arrayBufferToBase64(combined.buffer));
    } catch {
      ErrorService.reportAsync(ErrorCode.STORAGE_SAVE, 'LocalStorage write failed');
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
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        ciphertext,
      );
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

export async function createStorageProvider(): Promise<StorageProvider> {
  if (typeof indexedDB === 'undefined') {
    return new LocalStorageFallback();
  }

  try {
    const testDb = indexedDB.open('drafter-test', 1);
    return new Promise((resolve) => {
      testDb.onsuccess = () => {
        const db = testDb.result;
        db.close();
        indexedDB.deleteDatabase('drafter-test');
        resolve(new IndexedDBStorage());
      };
      testDb.onerror = () => {
        indexedDB.deleteDatabase('drafter-test');
        resolve(new LocalStorageFallback());
      };
      testDb.onblocked = () => {
        indexedDB.deleteDatabase('drafter-test');
        resolve(new LocalStorageFallback());
      };
    });
  } catch {
    if (import.meta.env.DEV) console.warn('[storage] Failed to probe IndexedDB');
    return new LocalStorageFallback();
  }
}
