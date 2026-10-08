/**
 * Brute force protection for master password attempts
 * @module attemptsLimiter
 * @author ssrjkk
 */

import { STORAGE_KEYS, ErrorCode } from './constants';
import { ErrorService } from './errorService';

const MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

interface AttemptState {
  /** Timestamps of recent failures, used for the visible attempt counter. */
  failures: number[];
  lockedUntil: number | null;
  /** Never cleared by expiry, so guessing does not reset on a timer. */
  consecutiveFailures: number;
}

function emptyState(): AttemptState {
  return { failures: [], lockedUntil: null, consecutiveFailures: 0 };
}

function loadState(): AttemptState {
  if (typeof localStorage === 'undefined') return emptyState();
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.attempts);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        const now = Date.now();
        const validFailures = Array.isArray(parsed.failures)
          ? parsed.failures.filter((t: number) => now - t < BASE_LOCKOUT_MS)
          : [];
        const lockedUntil = typeof parsed.lockedUntil === 'number' && parsed.lockedUntil > now
          ? parsed.lockedUntil
          : null;
        return {
          failures: validFailures,
          lockedUntil,
          consecutiveFailures: typeof parsed.consecutiveFailures === 'number'
            ? parsed.consecutiveFailures
            : validFailures.length,
        };
      }
    }
  } catch {
    if (import.meta.env.DEV) console.warn('[attemptsLimiter] Failed to load state');
    ErrorService.reportAsync(ErrorCode.AUTH, new Error('Failed to load attempts state'));
  }
  return emptyState();
}

function saveState(state: AttemptState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.attempts, JSON.stringify(state));
  } catch {
    if (import.meta.env.DEV) console.warn('[attemptsLimiter] Failed to save state');
  }
}

let state = loadState();

/** Exponential back-off, capped at a day. */
function lockoutMs(consecutiveFailures: number): number {
  return Math.min(MAX_LOCKOUT_MS, BASE_LOCKOUT_MS * 2 ** Math.max(0, consecutiveFailures - MAX_ATTEMPTS));
}

function cleanOldFailures(): void {
  const now = Date.now();
  state.failures = state.failures.filter(t => now - t < BASE_LOCKOUT_MS);
  // Only the timer is cleared. Previously `failures` was reset here too, which
  // granted a fresh 5 guesses every 5 minutes forever (~1 440/day).
  if (state.lockedUntil && state.lockedUntil <= now) {
    state.lockedUntil = null;
  }
}

export const AttemptsLimiter = {
  isLocked(): boolean {
    cleanOldFailures();
    return Boolean(state.lockedUntil && state.lockedUntil > Date.now());
  },

  getRemainingLockoutMs(): number {
    cleanOldFailures();
    if (!state.lockedUntil) return 0;
    return Math.max(0, state.lockedUntil - Date.now());
  },

  getRemainingAttempts(): number {
    cleanOldFailures();
    // Based on the consecutive-failure counter, not the ageing timestamps:
    // counting timestamps handed out a fresh budget every 5 minutes.
    return Math.max(0, MAX_ATTEMPTS - state.consecutiveFailures);
  },

  recordFailure(): void {
    cleanOldFailures();
    state.failures.push(Date.now());
    state.consecutiveFailures++;

    const windowMs = lockoutMs(state.consecutiveFailures);
    if (state.consecutiveFailures >= MAX_ATTEMPTS) {
      state.lockedUntil = Date.now() + windowMs;
      ErrorService.report(ErrorCode.AUTH, 'Too many failed password attempts — locked out', {
        attempts: state.failures.length,
        consecutiveFailures: state.consecutiveFailures,
        lockoutMs: windowMs,
      }, false);
    }
    saveState(state);
  },

  reset(): void {
    state = emptyState();
    saveState(state);
  },

  getMaxAttempts(): number {
    return MAX_ATTEMPTS;
  },

  getLockoutMs(): number {
    return BASE_LOCKOUT_MS;
  },
};
