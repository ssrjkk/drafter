/**
 * Multi-tab lock using BroadcastChannel
 * @module tabLock
 * @author ssrjkk
 */

const CHANNEL_NAME = 'drafter-lock';
const LOCK_TIMEOUT_MS = 5000;

interface LockEntry {
  id: string;
  timeout: ReturnType<typeof setTimeout>;
}

class TabLock {
  private channel: BroadcastChannel | null = null;
  private locks = new Map<string, LockEntry>();
  private pendingRequests = new Map<string, { resolve: (granted: boolean) => void }>();

  init(): void {
    if (this.channel) return;
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (e) => this.handleMessage(e.data);
    } catch {
      // BroadcastChannel not supported
    }
  }

  destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    for (const lock of this.locks.values()) {
      clearTimeout(lock.timeout);
    }
    this.locks.clear();
    this.pendingRequests.clear();
  }

  async acquire(key: string, timeoutMs = LOCK_TIMEOUT_MS): Promise<boolean> {
    const channel = this.channel;
    if (!channel) return true;

    const lockId = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.locks.delete(key);
        this.pendingRequests.delete(key);
        resolve(false);
      }, timeoutMs);

      this.locks.set(key, { id: lockId, timeout });
      this.pendingRequests.set(key, { resolve });

      channel.postMessage({ type: 'acquire', key, id: lockId });
    });
  }

  release(key: string): void {
    const lock = this.locks.get(key);
    if (lock) {
      clearTimeout(lock.timeout);
      this.locks.delete(key);
      if (this.channel) {
        this.channel.postMessage({ type: 'release', key });
      }
    }
  }

  private handleMessage(data: { type: string; key: string; id: string }): void {
    switch (data.type) {
      case 'acquire': {
        const existing = this.locks.get(data.key);
        if (existing && existing.id !== data.id) {
          this.channel?.postMessage({ type: 'busy', key: data.key, id: existing.id });
        } else {
          this.channel?.postMessage({ type: 'acquired', key: data.key, id: data.id });
        }
        break;
      }
      case 'acquired': {
        const pending = this.pendingRequests.get(data.key);
        if (pending) {
          this.pendingRequests.delete(data.key);
          pending.resolve(true);
        }
        break;
      }
      case 'busy': {
        const pending = this.pendingRequests.get(data.key);
        if (pending) {
          this.pendingRequests.delete(data.key);
          const lock = this.locks.get(data.key);
          if (lock) clearTimeout(lock.timeout);
          this.locks.delete(data.key);
          pending.resolve(false);
        }
        break;
      }
      case 'release': {
        // Another tab released a lock — we can now acquire
        break;
      }
    }
  }

  isLocked(key: string): boolean {
    return this.locks.has(key);
  }
}

export const tabLock = new TabLock();
