/**
 * Master password key management with IndexedDB vault
 * @module keyManagement
 * @author ssrjkk
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './base64';
import { KDF } from './constants';

const DB_NAME = 'drafter-keys';
const DB_VERSION = 1;
const STORE_NAME = 'key-vault';
const SALT_KEY = 'master-salt';
const VERIFY_KEY = 'verify-token';
const IV_LENGTH = KDF.IV_BYTES;
const MIN_PASSWORD_LENGTH = 8;
/** Consecutive wrong guesses before an exponential cool-down kicks in. */
const LOCKOUT_THRESHOLD = 5;
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000;

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

async function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

/**
 * Throttling state lives *inside* the vault, not in the UI: `initialize()` is
 * an exported method on a module singleton, so with the counter in the modal
 * an attacker could call `keyManager.initialize(guess)` from the console an
 * unlimited number of times.
 */
interface UnlockGate {
  failures: number;
  lockedUntil: number;
}

const GATE_KEY = 'unlock-gate';

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    KDF.NAME,
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: KDF.NAME, salt, iterations: KDF.ITERATIONS, hash: KDF.HASH },
    keyMaterial,
    { name: 'AES-GCM', length: KDF.KEY_BITS },
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

/** Thrown for a truncated store; distinct from a wrong password. */
export class VaultCorruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultCorruptedError';
  }
}

export class VaultLockedError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Too many failed attempts. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = 'VaultLockedError';
    this.retryAfterMs = retryAfterMs;
  }
}

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

  private static readGate(gate: UnlockGate | undefined): UnlockGate {
    return gate ?? { failures: 0, lockedUntil: 0 };
  }

  /** Exponential cool-down; the counter is never reset by expiry. */
  private static lockoutMs(failures: number): number {
    return Math.min(MAX_LOCKOUT_MS, 2 ** Math.max(0, failures - LOCKOUT_THRESHOLD) * 1000);
  }

  /**
   * Derive (or verify) the master key.
   *
   * Throttling and the corruption check live here rather than in the UI so a
   * caller cannot bypass them.
   */
  async initialize(password: string): Promise<void> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const db = await openDB();
    try {
      const gate = KeyManager.readGate(await idbGet<UnlockGate>(db, GATE_KEY));
      const now = Date.now();
      if (gate.lockedUntil > now) {
        throw new VaultLockedError(gate.lockedUntil - now);
      }

      const storedSalt = await idbGet<ArrayBuffer>(db, SALT_KEY);
      const storedVerify = await idbGet<string>(db, VERIFY_KEY);

      if (storedSalt && !storedVerify) {
        // Not a wrong password: the store is truncated. Counting these against
        // the lockout used to leave the user locked out with no way back.
        throw new VaultCorruptedError('Key store is incomplete — reset the vault to continue');
      }

      try {
        if (!storedSalt) {
          const newSalt = crypto.getRandomValues(new Uint8Array(KDF.SALT_BYTES));
          const newKey = await deriveKey(password, newSalt);
          const verifyToken = await encryptWith(newKey, VERIFY_PLAINTEXT);
          // Write the token before the salt: a crash in between then leaves an
          // ignorable salt, never an unusable salt with no token.
          await idbPut(db, VERIFY_KEY, verifyToken);
          await idbPut(db, SALT_KEY, newSalt);
          this.masterKey = newKey;
        } else {
          const key = await deriveKey(password, new Uint8Array(storedSalt));
          const decrypted = await decryptWith(key, storedVerify!);
          if (decrypted !== VERIFY_PLAINTEXT && decrypted !== LEGACY_VERIFY_PLAINTEXT) {
            throw new Error('Invalid master password');
          }
          this.masterKey = key;
          // Upgrade vaults written before the rename to the current verify token.
          if (decrypted !== VERIFY_PLAINTEXT) {
            await idbPut(db, VERIFY_KEY, await encryptWith(key, VERIFY_PLAINTEXT));
          }
        }
      } catch (err) {
        if (err instanceof VaultCorruptedError) throw err;
        const failures = gate.failures + 1;
        const lockedUntil = failures >= LOCKOUT_THRESHOLD
          ? now + KeyManager.lockoutMs(failures)
          : 0;
        await idbPut(db, GATE_KEY, { failures, lockedUntil } satisfies UnlockGate);
        throw err;
      }

      await idbPut(db, GATE_KEY, { failures: 0, lockedUntil: 0 } satisfies UnlockGate);
      this._verified = true;
    } finally {
      db.close();
    }
  }

  /** Wipe the vault. The user must re-enter their API key afterwards. */
  async reset(): Promise<void> {
    const db = await openDB();
    try {
      await idbDelete(db, SALT_KEY);
      await idbDelete(db, VERIFY_KEY);
      await idbDelete(db, GATE_KEY);
    } finally {
      db.close();
    }
    this.clear();
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
