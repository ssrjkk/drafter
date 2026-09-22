import { describe, it, expect, beforeEach } from 'vitest';
import { migrateLocalStorageKeys, migrateLegacyStorage } from '../lib/legacyMigration';
import { STORAGE_KEYS } from '../lib/constants';

describe('legacyMigration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('migrateLocalStorageKeys()', () => {
    it('copies legacy keys to their renamed counterparts', () => {
      localStorage.setItem('qa-api-key', 'encrypted-key');
      localStorage.setItem('qa-copilot-theme', 'light');
      localStorage.setItem('qa-copilot-locale', 'ru');

      migrateLocalStorageKeys();

      expect(localStorage.getItem(STORAGE_KEYS.apiKey)).toBe('encrypted-key');
      expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('light');
      expect(localStorage.getItem(STORAGE_KEYS.locale)).toBe('ru');
    });

    it('never overwrites a value that already exists under the new key', () => {
      localStorage.setItem('qa-api-key', 'old');
      localStorage.setItem(STORAGE_KEYS.apiKey, 'current');

      migrateLocalStorageKeys();

      expect(localStorage.getItem(STORAGE_KEYS.apiKey)).toBe('current');
    });

    it('moves backup entries along with the backup index', () => {
      localStorage.setItem('qa-helper-backup-a', '{"id":"a"}');
      localStorage.setItem('qa-helper-backup-b', '{"id":"b"}');
      localStorage.setItem('qa-helper-backup-index', '["a","b"]');

      migrateLocalStorageKeys();

      expect(localStorage.getItem(`${STORAGE_KEYS.backupPrefix}a`)).toBe('{"id":"a"}');
      expect(localStorage.getItem(`${STORAGE_KEYS.backupPrefix}b`)).toBe('{"id":"b"}');
      expect(localStorage.getItem(STORAGE_KEYS.backupIndex)).toBe('["a","b"]');
    });

    it('reports how many values were migrated', () => {
      expect(migrateLocalStorageKeys()).toBe(0);
      localStorage.setItem('qa-api-key', 'x');
      expect(migrateLocalStorageKeys()).toBe(1);
    });

    it('is a no-op when there is nothing to migrate', () => {
      localStorage.setItem(STORAGE_KEYS.theme, 'dark');
      expect(migrateLocalStorageKeys()).toBe(0);
      expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('dark');
    });
  });

  describe('migrateLegacyStorage()', () => {
    it('migrates localStorage on first run and sets the flag', async () => {
      localStorage.setItem('qa-copilot-theme', 'light');

      await migrateLegacyStorage();

      expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('light');
      expect(localStorage.getItem(STORAGE_KEYS.migrated)).toBe('true');
    });

    it('short-circuits once the migration flag is set', async () => {
      localStorage.setItem(STORAGE_KEYS.migrated, 'true');
      localStorage.setItem('qa-copilot-theme', 'light');

      await migrateLegacyStorage();

      expect(localStorage.getItem(STORAGE_KEYS.theme)).toBeNull();
    });
  });
});
