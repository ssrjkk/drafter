/**
 * Telemetry buffer for client-side observability.
 *
 * Opt-in by default: the static deployments have no `/api/telemetry`
 * endpoint at all, so previously every 30s produced a pointless request while
 * the user had no way to turn it off.
 * @module telemetry
 * @author ssrjkk
 */

export interface TelemetryEvent {
  name: string;
  attributes: Record<string, string | number | boolean>;
  timestamp: number;
  severity: 'info' | 'warning' | 'error';
}

const OPT_IN_KEY = 'drafter-telemetry-opt-in';

class TelemetryBuffer {
  private buffer: TelemetryEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private handleVisibility: (() => void) | null = null;
  private endpoint = '/api/telemetry';
  private maxBufferSize = 50;
  private flushMs = 30_000;
  private enabled = false;

  /** Explicit user consent; persisted so it survives reloads. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try { localStorage.setItem(OPT_IN_KEY, enabled ? '1' : '0'); } catch { /* storage unavailable */ }
    if (!enabled) {
      this.clear();
      this.stopTimerOnly();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  start(): void {
    if (this.flushInterval || !this.enabled) return;
    this.flushInterval = setInterval(() => this.flush(), this.flushMs);
    this.handleVisibility = () => {
      if (document.visibilityState === 'hidden') this.flush();
    };
    window.addEventListener('visibilitychange', this.handleVisibility);
  }

  private stopTimerOnly(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    if (this.handleVisibility) {
      window.removeEventListener('visibilitychange', this.handleVisibility);
      this.handleVisibility = null;
    }
  }

  stop(): void {
    this.stopTimerOnly();
    this.flush();
  }

  /** Restore the persisted consent choice. Call once at startup. */
  restorePreference(): void {
    let stored: string | null = null;
    try { stored = localStorage.getItem(OPT_IN_KEY); } catch { /* storage unavailable */ }
    this.enabled = stored === '1';
  }

  record(name: string, attributes: Record<string, string | number | boolean> = {}, severity: 'info' | 'warning' | 'error' = 'info'): void {
    if (!this.enabled) return;
    this.buffer.push({ name, attributes, timestamp: Date.now(), severity });
    if (this.buffer.length >= this.maxBufferSize) this.flush();
  }

  recordPerformance(name: string, durationMs: number): void {
    this.record('perf', { name, durationMs }, durationMs > 1000 ? 'warning' : 'info');
  }

  recordError(code: string, message: string): void {
    this.record('error', { code, message }, 'error');
  }

  recordUserAction(action: string, target?: string): void {
    this.record('user_action', { action, target: target || '' });
  }

  private async flush(): Promise<void> {
    if (!this.enabled || this.buffer.length === 0) return;
    const events = this.buffer.splice(0);
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        keepalive: true,
      });
    } catch {
      // Endpoint missing (static hosting) — drop events, don't block the UI.
      if (import.meta.env.DEV) {
        console.warn(`[telemetry] Failed to flush ${events.length} events`);
      }
    }
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer.length = 0;
  }
}

export const telemetry = new TelemetryBuffer();
