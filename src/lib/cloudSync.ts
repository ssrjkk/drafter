/**
 * Cloud synchronization service
 * @module cloudSync
 * @author ssrjkk
 */

import type { Project } from '../types';
import type { MemoryEntry } from '../types/memory';
import { keyManager } from './keyManagement';
import { isValidUrl } from './utils';
import { ErrorService } from './errorService';
import { ErrorCode, STORAGE_KEYS, PROTOTYPE_POLLUTION_KEYS } from './constants';

function hasDangerousKeys(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).some(k => PROTOTYPE_POLLUTION_KEYS.has(k));
}

export interface CloudConfig {
  provider: 'local' | 'firebase' | 'supabase';
  apiKey?: string;
  projectId?: string;
  url?: string;
}

export interface SyncStatus {
  lastSync: string | null;
  status: 'idle' | 'syncing' | 'synced' | 'error';
  error?: string;
  entriesCount: number;
}

export interface SyncData {
  version: number;
  exportedAt: string;
  projects: Project[];
  memoryEntries: MemoryEntry[];
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

export class CloudSyncService {
  private config: CloudConfig;
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  private status: SyncStatus = {
    lastSync: null,
    status: 'idle',
    entriesCount: 0,
  };
  private configReady: Promise<void>;
  private configManuallySet = false;

  constructor(config: CloudConfig = { provider: 'local' }) {
    this.config = config;
    this.loadStatus();
    this.configReady = this.loadConfig();
  }

  private loadStatus(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.syncStatus);
      if (saved) {
        const parsed = JSON.parse(saved);
        const VALID_STATUSES = ['idle', 'syncing', 'synced', 'error'];
        if (parsed && typeof parsed === 'object' && VALID_STATUSES.includes(parsed.status)) {
          this.status = parsed;
        }
      }
    } catch {
      if (import.meta.env.DEV) console.warn('[cloudSync] Failed to load sync status');
      ErrorService.reportAsync(ErrorCode.CLOUD_SYNC, new Error('Failed to load sync status'), { operation: 'loadStatus' });
    }
  }

  private saveStatus(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.syncStatus, JSON.stringify(this.status));
      this.notifyListeners();
    } catch {
      if (import.meta.env.DEV) console.warn('[cloudSync] Failed to save sync status');
      ErrorService.reportAsync(ErrorCode.CLOUD_SYNC, new Error('Failed to save sync status'), { operation: 'saveStatus' });
    }
  }

  private async loadConfig(): Promise<void> {
    if (this.configManuallySet) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.syncConfig);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        if (parsed && typeof parsed.provider === 'string') {
          const VALID_PROVIDERS: CloudConfig['provider'][] = ['local', 'firebase', 'supabase'];
          const provider = VALID_PROVIDERS.includes(parsed.provider as CloudConfig['provider']) ? parsed.provider as CloudConfig['provider'] : 'local';
          const config: CloudConfig = {
            provider,
            apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : undefined,
            projectId: typeof parsed.projectId === 'string' ? parsed.projectId : undefined,
            url: typeof parsed.url === 'string' ? parsed.url : undefined,
          };
          if (config.apiKey && keyManager.isReady()) {
            try {
              const decrypted = await keyManager.decryptApiKey(config.apiKey);
              if (decrypted) this.config = { ...config, apiKey: decrypted };
              else this.config = config;
            } catch {
              this.config = config;
            }
          } else {
            this.config = config;
          }
        }
      }
    } catch {
      if (import.meta.env.DEV) console.warn('[cloudSync] Failed to load config');
      ErrorService.reportAsync(ErrorCode.CLOUD_CONFIG, new Error('Failed to load config'), { operation: 'loadConfig' });
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.status));
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  async configure(config: CloudConfig): Promise<void> {
    this.config = config;
    this.configManuallySet = true;
    try {
      const toStore = { ...config };
      if (toStore.apiKey && keyManager.isReady()) {
        toStore.apiKey = await keyManager.encryptApiKey(toStore.apiKey);
      }
      localStorage.setItem(STORAGE_KEYS.syncConfig, JSON.stringify(toStore));
    } catch {
      if (import.meta.env.DEV) console.warn('[cloudSync] Failed to save config');
      ErrorService.reportAsync(ErrorCode.CLOUD_CONFIG, new Error('Failed to save config'), { operation: 'configure' });
    }
  }

  getConfig(): CloudConfig {
    return { ...this.config };
  }

  async exportData(projects: Project[], memoryEntries: MemoryEntry[]): Promise<SyncData> {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      projects,
      memoryEntries,
    };
  }

  async importData(jsonString: string): Promise<{ projects: Project[]; memoryEntries: MemoryEntry[] } | null> {
    try {
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (!data || typeof data !== 'object') return null;
      if (hasDangerousKeys(data as Record<string, unknown>)) return null;
      if (!Array.isArray(data.projects)) return null;
      if (data.projects.length > 0 && typeof data.projects[0] !== 'object') return null;
      if (data.projects.length > 0 && typeof data.projects[0].name !== 'string') return null;
      if (data.memoryEntries !== undefined && !Array.isArray(data.memoryEntries)) return null;

      const validEntries = Array.isArray(data.memoryEntries)
        ? data.memoryEntries.filter(
            (e: unknown): e is MemoryEntry => e != null && typeof e === 'object' && 'key' in e && 'value' in e && typeof (e as MemoryEntry).key === 'string' && typeof (e as MemoryEntry).value === 'string',
          )
        : [];

      return {
        projects: data.projects as Project[],
        memoryEntries: validEntries,
      };
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.CLOUD_IMPORT, err, { operation: 'importData' });
      return null;
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRY_ATTEMPTS) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Max retry attempts exceeded');
  }

  async syncToCloud(projects: Project[], memoryEntries: MemoryEntry[]): Promise<boolean> {
    await this.configReady;
    this.status = { ...this.status, status: 'syncing', error: undefined };
    this.saveStatus();

    try {
      let success = false;
      switch (this.config.provider) {
        case 'local':
          success = await this.syncToLocal(projects, memoryEntries);
          break;
        case 'firebase':
          success = await this.withRetry(() => this.syncToFirebase(projects, memoryEntries));
          break;
        case 'supabase':
          success = await this.withRetry(() => this.syncToSupabase(projects, memoryEntries));
          break;
        default:
          throw new Error('Unknown provider');
      }
      return success;
    } catch (err) {
      this.status = {
        ...this.status,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown sync error',
      };
      this.saveStatus();
      return false;
    }
  }

  async syncToLocal(projects: Project[], memoryEntries: MemoryEntry[]): Promise<boolean> {
    const data = await this.exportData(projects, memoryEntries);
    try {
      localStorage.setItem(STORAGE_KEYS.syncBackup, JSON.stringify(data, null, 2));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        throw new Error('Local storage quota exceeded — reduce data size or clear storage');
      }
      throw err;
    }
    this.status = {
      lastSync: new Date().toISOString(),
      status: 'synced',
      entriesCount: projects.length + memoryEntries.length,
    };
    this.saveStatus();
    return true;
  }

  private async syncToFirebase(projects: Project[], memoryEntries: MemoryEntry[]): Promise<boolean> {
    if (!this.config.apiKey || !this.config.url) {
      throw new Error('Firebase config missing');
    }
    if (!isValidUrl(this.config.url)) {
      throw new Error('Invalid Firebase URL');
    }
    
    const data = await this.exportData(projects, memoryEntries);
    const response = await fetch(`${this.config.url}/sync.json`, {
      method: 'PUT',
      headers: new Headers({
        'Authorization': `Bearer ${this.config.apiKey}`,
      }),
      body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error('Firebase sync failed');

    this.status = {
      lastSync: new Date().toISOString(),
      status: 'synced',
      entriesCount: projects.length + memoryEntries.length,
    };
    this.saveStatus();
    return true;
  }

  private async syncToSupabase(projects: Project[], memoryEntries: MemoryEntry[]): Promise<boolean> {
    if (!this.config.url || !this.config.apiKey) {
      throw new Error('Supabase config missing');
    }
    if (!isValidUrl(this.config.url)) {
      throw new Error('Invalid Supabase URL');
    }

    const data = await this.exportData(projects, memoryEntries);
    const response = await fetch(`${this.config.url}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.config.apiKey,
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ data }),
    });

    if (!response.ok) throw new Error('Supabase sync failed');

    this.status = {
      lastSync: new Date().toISOString(),
      status: 'synced',
      entriesCount: projects.length + memoryEntries.length,
    };
    this.saveStatus();
    return true;
  }

  async syncFromCloud(): Promise<{ projects: Project[]; memoryEntries: MemoryEntry[] } | null> {
    await this.configReady;
    try {
      let data: { projects: Project[]; memoryEntries: MemoryEntry[] } | null = null;
      
      switch (this.config.provider) {
        case 'local': {
          const stored = localStorage.getItem(STORAGE_KEYS.syncBackup);
          if (!stored) return null;
          data = await this.importData(stored);
          break;
        }
        case 'firebase': {
          if (!this.config.apiKey || !this.config.url) return null;
          if (!isValidUrl(this.config.url)) return null;
          const response = await this.withRetry(() => 
            fetch(`${this.config.url}/sync.json`, {
              headers: new Headers({
                'Authorization': `Bearer ${this.config.apiKey}`,
              }),
            })
          );
          if (!response.ok) return null;
          const json = await response.json();
          const raw = typeof json === 'string' ? json : JSON.stringify(json);
          data = await this.importData(raw);
          break;
        }
        case 'supabase': {
          if (!this.config.url || !this.config.apiKey) return null;
          if (!isValidUrl(this.config.url)) return null;
          const response = await this.withRetry(() => fetch(`${this.config.url}/sync`, {
            headers: new Headers({
              'apikey': this.config.apiKey || '',
              'Authorization': `Bearer ${this.config.apiKey}`,
            }),
          }));
          if (!response.ok) return null;
          const { data: jsonData } = await response.json();
          if (jsonData === undefined || jsonData === null) return null;
          const raw = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
          data = await this.importData(raw);
          break;
        }
        default:
          return null;
      }
      
      if (data) {
        this.status = {
          ...this.status,
          status: 'synced',
          lastSync: new Date().toISOString(),
        };
        this.saveStatus();
      }
      
      return data;
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.CLOUD_SYNC, err, { operation: 'syncFromCloud', provider: this.config.provider });
      return null;
    }
  }

  generateShareLink(projects: Project[], memoryEntries: MemoryEntry[]): string {
    const data = btoa(encodeURIComponent(JSON.stringify({ projects, memoryEntries })));
    return `${window.location.origin}?share=${data}`;
  }

  parseShareLink(url: string): { projects: Project[]; memoryEntries: MemoryEntry[] } | null {
    try {
      const params = new URL(url).searchParams;
      const share = params.get('share');
      if (!share) return null;
      const decoded = JSON.parse(decodeURIComponent(atob(share)));
      if (!decoded || typeof decoded !== 'object') return null;
      if (hasDangerousKeys(decoded as Record<string, unknown>)) return null;
      if (!Array.isArray(decoded.projects)) return null;
      if (decoded.projects.length > 0 && typeof decoded.projects[0].name !== 'string') return null;
      const validEntries = Array.isArray(decoded.memoryEntries)
        ? decoded.memoryEntries.filter(
            (e: unknown): e is MemoryEntry => e != null && typeof e === 'object' && 'key' in e && 'value' in e && typeof (e as MemoryEntry).key === 'string' && typeof (e as MemoryEntry).value === 'string',
          )
        : [];
      return { projects: decoded.projects as Project[], memoryEntries: validEntries };
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.CLOUD_IMPORT, err, { operation: 'parseShareLink' });
      return null;
    }
  }

  async backupToFile(projects: Project[], memoryEntries: MemoryEntry[]): Promise<void> {
    const data = await this.exportData(projects, memoryEntries);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drafter-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async restoreFromFile(file: File): Promise<{ projects: Project[]; memoryEntries: MemoryEntry[] } | null> {
    try {
      const text = await file.text();
      return await this.importData(text);
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.CLOUD_IMPORT, err, { operation: 'restoreFromFile' });
      return null;
    }
  }

  clearLocalBackup(): void {
    localStorage.removeItem(STORAGE_KEYS.syncBackup);
  }

  hasLocalBackup(): boolean {
    return localStorage.getItem(STORAGE_KEYS.syncBackup) !== null;
  }
}

export const cloudSync = new CloudSyncService();
