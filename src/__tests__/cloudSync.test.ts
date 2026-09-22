import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Project, MemoryEntry } from '../types';

const mockProjects: Project[] = [
  { id: 1, name: 'Test Project', description: 'A test', created_at: '2025-01-01', updated_at: '2025-01-01' },
];

const mockEntries: MemoryEntry[] = [
  { id: 1, project_id: 1, category: 'bug_patterns', key: 'auth', value: 'Login fails', confidence: 0.9, created_at: '2025-01-01', updated_at: '2025-01-01' },
];

vi.mock('../lib/keyManagement', () => ({
  keyManager: {
    isReady: vi.fn(() => false),
    encryptApiKey: vi.fn(async (k: string) => `enc_${k}`),
    decryptApiKey: vi.fn(async (k: string) => k.replace('enc_', '')),
  },
}));

const KEYS = {
  syncStatus: 'drafter-sync-status',
  syncConfig: 'drafter-sync-config',
  syncBackup: 'drafter-sync-backup-data',
} as const;

describe('CloudSyncService', () => {
  let svc: InstanceType<typeof import('../lib/cloudSync').CloudSyncService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    const mod = await import('../lib/cloudSync');
    svc = new mod.CloudSyncService({ provider: 'local' });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('constructor', () => {
    it('uses default provider', () => {
      expect(svc.getConfig().provider).toBe('local');
    });
  });

  describe('onStatusChange', () => {
    it('calls listener immediately with current status', () => {
      const listener = vi.fn();
      svc.onStatusChange(listener);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'idle' }));
    });

    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = svc.onStatusChange(listener);
      unsub();
      svc['status'] = { lastSync: null, status: 'synced', entriesCount: 0 };
      svc['notifyListeners']();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies on status change', () => {
      const listener = vi.fn();
      svc.onStatusChange(listener);
      listener.mockClear();
      svc['status'] = { lastSync: null, status: 'synced', entriesCount: 0 };
      svc['saveStatus']();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns a copy of status', () => {
      const s1 = svc.getStatus();
      const s2 = svc.getStatus();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });
  });

  describe('configure', () => {
    it('saves config to localStorage', async () => {
      await svc.configure({ provider: 'supabase', apiKey: 'key123' });
      expect(svc.getConfig().provider).toBe('supabase');
      const stored = JSON.parse(localStorage.getItem(KEYS.syncConfig)!);
      expect(stored.provider).toBe('supabase');
    });

    it('marks config as manually set', async () => {
      await svc.configure({ provider: 'firebase' });
      expect(svc['configManuallySet']).toBe(true);
    });
  });

  describe('exportData', () => {
    it('returns structured export', async () => {
      const result = await svc.exportData(mockProjects, mockEntries);
      expect(result.version).toBe(1);
      expect(result.projects).toEqual(mockProjects);
      expect(result.memoryEntries).toEqual(mockEntries);
      expect(result.exportedAt).toBeDefined();
    });
  });

  describe('importData', () => {
    it('rejects non-object input', async () => {
      expect(await svc.importData('123')).toBeNull();
      expect(await svc.importData('null')).toBeNull();
    });

    it('rejects prototype pollution via constructor key', async () => {
      const payload = '{"projects":[{"name":"p"}],"constructor":{"prototype":{"evil":true}}}';
      expect(await svc.importData(payload)).toBeNull();
    });

    it('rejects prototype pollution via __proto__ key', async () => {
      const payload = '{"projects":[{"name":"p"}],"__proto__":{"evil":true}}';
      expect(await svc.importData(payload)).toBeNull();
    });

    it('rejects missing projects', async () => {
      expect(await svc.importData('{}')).toBeNull();
      expect(await svc.importData(JSON.stringify({ memoryEntries: [] }))).toBeNull();
    });

    it('accepts valid import', async () => {
      const data = JSON.stringify({ projects: [{ name: 'p' }], memoryEntries: [] });
      const result = await svc.importData(data);
      expect(result).not.toBeNull();
      expect(result!.projects).toHaveLength(1);
    });

    it('filters invalid memory entries', async () => {
      const data = JSON.stringify({
        projects: [{ name: 'p' }],
        memoryEntries: [{ key: 'k', value: 'v' }, { nope: true }, null],
      });
      const result = await svc.importData(data);
      expect(result!.memoryEntries).toHaveLength(1);
    });

    it('handles missing memoryEntries gracefully', async () => {
      const data = JSON.stringify({ projects: [{ name: 'p' }] });
      const result = await svc.importData(data);
      expect(result!.memoryEntries).toEqual([]);
    });
  });

  describe('syncToLocal', () => {
    it('stores data in localStorage', async () => {
      const ok = await svc.syncToLocal(mockProjects, mockEntries);
      expect(ok).toBe(true);
      const stored = localStorage.getItem(KEYS.syncBackup);
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed.projects).toEqual(mockProjects);
    });

    it('updates status on success', async () => {
      await svc.syncToLocal(mockProjects, mockEntries);
      expect(svc.getStatus().status).toBe('synced');
      expect(svc.getStatus().entriesCount).toBe(2);
    });

    it('handles quota exceeded', async () => {
      const orig = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });
      await expect(svc.syncToLocal(mockProjects, mockEntries)).rejects.toThrow('quota exceeded');
      localStorage.setItem = orig;
    });
  });

  describe('syncToCloud', () => {
    it('syncs to local provider', async () => {
      const ok = await svc.syncToCloud(mockProjects, mockEntries);
      expect(ok).toBe(true);
    });

    it('throws on unknown provider', async () => {
      (svc as unknown as { config: { provider: string } }).config.provider = 'unknown' as never;
      const ok = await svc.syncToCloud(mockProjects, mockEntries);
      expect(ok).toBe(false);
      expect(svc.getStatus().status).toBe('error');
    });
  });

  describe('syncFromCloud', () => {
    it('returns null if no local backup', async () => {
      const result = await svc.syncFromCloud();
      expect(result).toBeNull();
    });

    it('restores from local backup', async () => {
      const data = JSON.stringify({ version: 1, projects: mockProjects, memoryEntries: mockEntries });
      localStorage.setItem(KEYS.syncBackup, data);
      const result = await svc.syncFromCloud();
      expect(result).not.toBeNull();
      expect(result!.projects).toEqual(mockProjects);
    });
  });

  describe('generateShareLink / parseShareLink', () => {
    it('round-trips data', () => {
      const link = svc.generateShareLink(mockProjects, mockEntries);
      expect(link).toContain('?share=');
      const parsed = svc.parseShareLink(link);
      expect(parsed).not.toBeNull();
      expect(parsed!.projects).toEqual(mockProjects);
      expect(parsed!.memoryEntries).toEqual(mockEntries);
    });

    it('returns null for invalid link', () => {
      expect(svc.parseShareLink('https://example.com')).toBeNull();
    });

    it('rejects prototype pollution via __proto__', () => {
      const payload = '{"projects":[{"name":"p"}],"__proto__":{"evil":true}}';
      const share = btoa(encodeURIComponent(payload));
      expect(svc.parseShareLink(`https://example.com?share=${share}`)).toBeNull();
    });

    it('rejects prototype pollution via constructor', () => {
      const payload = '{"projects":[{"name":"p"}],"constructor":{"prototype":{"evil":true}}}';
      const share = btoa(encodeURIComponent(payload));
      expect(svc.parseShareLink(`https://example.com?share=${share}`)).toBeNull();
    });
  });

  describe('backupToFile / restoreFromFile', () => {
    it('clearLocalBackup and hasLocalBackup', async () => {
      expect(svc.hasLocalBackup()).toBe(false);
      await svc.syncToLocal(mockProjects, mockEntries);
      expect(svc.hasLocalBackup()).toBe(true);
      svc.clearLocalBackup();
      expect(svc.hasLocalBackup()).toBe(false);
    });
  });

  describe('loadStatus', () => {
    it('loads saved status from localStorage', async () => {
      localStorage.setItem(KEYS.syncStatus, JSON.stringify({
        lastSync: '2025-01-01T00:00:00Z',
        status: 'synced',
        entriesCount: 5,
      }));
      const mod = await import('../lib/cloudSync');
      const s = new mod.CloudSyncService({ provider: 'local' });
      expect(s.getStatus().status).toBe('synced');
      expect(s.getStatus().entriesCount).toBe(5);
    });

    it('ignores invalid saved status', async () => {
      localStorage.setItem(KEYS.syncStatus, JSON.stringify({ status: 'invalid' }));
      const mod = await import('../lib/cloudSync');
      const s = new mod.CloudSyncService({ provider: 'local' });
      expect(s.getStatus().status).toBe('idle');
    });
  });

  describe('withRetry', () => {
    it('retries failed operations', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'ok';
      });
      const resultPromise = svc['withRetry'](fn);
      await vi.advanceTimersByTimeAsync(4000);
      expect(await resultPromise).toBe('ok');
      expect(attempts).toBe(3);
    });

    it('throws after max retries', async () => {
      const fn = vi.fn(async () => { throw new Error('always fail'); });
      const resultPromise = svc['withRetry'](fn);
      const rejectionHandler = vi.fn();
      resultPromise.catch(rejectionHandler);
      await vi.advanceTimersByTimeAsync(10000);
      expect(rejectionHandler).toHaveBeenCalledWith(expect.objectContaining({ message: 'always fail' }));
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
