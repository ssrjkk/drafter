import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    get store() { return store; },
  };
}

describe('AttemptsLimiter', () => {
  let ls: ReturnType<typeof mockLocalStorage>;
  let AttemptsLimiter: typeof import('../lib/attemptsLimiter')['AttemptsLimiter'];

  beforeEach(async () => {
    ls = mockLocalStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true });
    vi.useFakeTimers();
    // The limiter keeps module-level state, so each test needs a clean slate —
    // and resetting must also clear the consecutive-failure counter.
    ({ AttemptsLimiter } = await import('../lib/attemptsLimiter'));
    AttemptsLimiter.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts unlocked with 5 attempts', () => {
    expect(AttemptsLimiter.isLocked()).toBe(false);
    expect(AttemptsLimiter.getRemainingAttempts()).toBe(5);
  });

  it('records failures and decreases attempts', () => {
    AttemptsLimiter.recordFailure();
    expect(AttemptsLimiter.getRemainingAttempts()).toBe(4);

    AttemptsLimiter.recordFailure();
    expect(AttemptsLimiter.getRemainingAttempts()).toBe(3);
  });

  it('locks after 5 failures', () => {
    for (let i = 0; i < 5; i++) {
      AttemptsLimiter.recordFailure();
    }
    expect(AttemptsLimiter.isLocked()).toBe(true);
    expect(AttemptsLimiter.getRemainingLockoutMs()).toBeGreaterThan(0);
  });

  it('unlocks after lockout expires but does not refill the attempt budget', () => {
    for (let i = 0; i < 5; i++) {
      AttemptsLimiter.recordFailure();
    }
    expect(AttemptsLimiter.isLocked()).toBe(true);

    // The visible failure timestamps age out of the 5-minute window, but the
    // consecutive-failure counter does not: resetting it on expiry granted a
    // fresh 5 guesses every 5 minutes forever (~1 440/day).
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    expect(AttemptsLimiter.isLocked()).toBe(false);
    expect(AttemptsLimiter.getRemainingAttempts()).toBe(0);
  });

  it('escalates the lockout with each subsequent round of failures', () => {
    for (let i = 0; i < 5; i++) AttemptsLimiter.recordFailure();
    const first = AttemptsLimiter.getRemainingLockoutMs();
    expect(first).toBeGreaterThan(0);

    vi.advanceTimersByTime(first + 1000);
    expect(AttemptsLimiter.isLocked()).toBe(false);

    for (let i = 0; i < 5; i++) AttemptsLimiter.recordFailure();
    expect(AttemptsLimiter.isLocked()).toBe(true);
    // Doubled, not reset.
    expect(AttemptsLimiter.getRemainingLockoutMs()).toBeGreaterThan(first);
  });

  it('reset clears all state', () => {
    AttemptsLimiter.recordFailure();
    AttemptsLimiter.recordFailure();
    AttemptsLimiter.reset();
    expect(AttemptsLimiter.isLocked()).toBe(false);
    expect(AttemptsLimiter.getRemainingAttempts()).toBe(5);
  });

  it('returns correct max attempts and lockout', () => {
    expect(AttemptsLimiter.getMaxAttempts()).toBe(5);
    expect(AttemptsLimiter.getLockoutMs()).toBe(5 * 60 * 1000);
  });
});
