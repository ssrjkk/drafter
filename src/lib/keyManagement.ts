/**
 * Master password key management with IndexedDB vault
 * @module keyManagement
 * @author ssrjkk
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';

const DB_NAME = 'drafter-keys';
const DB_VERSION = 1;
const STORE_NAME = 'key-vault';
const SALT_KEY = 'master-salt';
const VERIFY_KEY = 'verify-token';
const PBKDF2_ITERATIONS = 100_000;
const IV_LENGTH = 12;

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result as T | undefined);
  });
}

async function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(value, key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptWith(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return arrayBufferToBase64(combined.buffer);
}

async function decryptWith(key: CryptoKey, encoded: string): Promise<string> {
  const combined = base64ToArrayBuffer(encoded);
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );
  return new TextDecoder().decode(decrypted);
}

const VERIFY_PLAINTEXT = 'drafter-verify';
const LEGACY_VERIFY_PLAINTEXT = 'qa-copilot-verify';

export class KeyManager {
  private masterKey: CryptoKey | null = null;
  private _verified = false;

  async hasStoredSalt(): Promise<boolean> {
    const db = await openDB();
    try {
      const salt = await idbGet<Uint8Array>(db, SALT_KEY);
      return salt !== undefined;
    } finally {
      db.close();
    }
  }

  async initialize(password: string): Promise<void> {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const db = await openDB();
    try {
      const storedSalt = await idbGet<ArrayBuffer>(db, SALT_KEY);
      const storedVerify = await idbGet<string>(db, VERIFY_KEY);

      if (!storedSalt) {
        const newSalt = crypto.getRandomValues(new Uint8Array(16));
        await idbPut(db, SALT_KEY, newSalt.buffer);
        const newKey = await deriveKey(password, newSalt);
        const verifyToken = await encryptWith(newKey, VERIFY_PLAINTEXT);
        await idbPut(db, VERIFY_KEY, verifyToken);
        this.masterKey = newKey;
      } else {
        if (!storedVerify) {
          throw new Error('Corrupted key store — reset required');
        }
        const key = await deriveKey(password, new Uint8Array(storedSalt));
        const decrypted = await decryptWith(key, storedVerify);
        if (decrypted !== VERIFY_PLAINTEXT && decrypted !== LEGACY_VERIFY_PLAINTEXT) {
          throw new Error('Invalid master password');
        }
        this.masterKey = key;
        // Upgrade vaults written before the rename to the current verify token.
        if (decrypted !== VERIFY_PLAINTEXT) {
          await idbPut(db, VERIFY_KEY, await encryptWith(key, VERIFY_PLAINTEXT));
        }
      }

      this._verified = true;
    } finally {
      db.close();
    }
  }

  async encryptApiKey(apiKey: string): Promise<string> {
    if (!this.masterKey) throw new Error('KeyManager not initialized');
    return encryptWith(this.masterKey, apiKey);
  }

  async decryptApiKey(encrypted: string): Promise<string> {
    if (!this.masterKey) throw new Error('KeyManager not initialized');
    return decryptWith(this.masterKey, encrypted);
  }

  isReady(): boolean {
    return this._verified && this.masterKey !== null;
  }

  clear(): void {
    this.masterKey = null;
    this._verified = false;
  }
}

export const keyManager = new KeyManager();
