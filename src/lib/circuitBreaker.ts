/**
 * Circuit Breaker pattern for preventing cascading failures in external service calls.
 *
 * States:
 * - CLOSED: Normal operation. Failures are counted.
 * - OPEN: Service is failing. All calls are rejected immediately for `resetTimeout` ms.
 * - HALF_OPEN: Testing if service recovered. One probe call is allowed through.
 *
 * @author ssrjkk
 * @example
 * ```ts
 * const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60000 });
 * const result = await breaker.execute(() => fetch('/api/data'));
 * ```
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit. @default 3 */
  failureThreshold: number;
  /** Time in ms to wait before transitioning from OPEN to HALF_OPEN. @default 60000 */
  resetTimeout: number;
  /** Time window in ms for counting failures. If no failure occurs within this window, counter resets. @default 30000 */
  monitoringWindow: number;
  /** Optional callback when state changes. */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  lastStateChangeTime: number;
  successCount: number;
  totalRequests: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private lastStateChangeTime = Date.now();
  private totalRequests = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 3,
      resetTimeout: config.resetTimeout ?? 60000,
      monitoringWindow: config.monitoringWindow ?? 30000,
      onStateChange: config.onStateChange,
    };
  }

  /** Current circuit state. */
  getState(): CircuitState {
    this.evaluateState();
    return this.state;
  }

  /** Configured cooldown the caller has to honour while the circuit is OPEN. */
  getResetTimeout(): number {
    return this.config.resetTimeout;
  }

  /** Milliseconds left before an OPEN circuit accepts a probe again. */
  getRemainingOpenTime(): number {
    this.evaluateState();
    if (this.state !== 'open') return 0;
    return Math.max(0, this.config.resetTimeout - (Date.now() - this.lastStateChangeTime));
  }

  /**
   * Record an outcome observed *outside* `execute()` — e.g. an `ApiResult`
   * whose failure never surfaced as a thrown error. Without this the breaker
   * can never observe a success and stays stuck in HALF_OPEN forever.
   */
  recordSuccess(): void {
    this.totalRequests++;
    this.onSuccess();
  }

  /** Record a failure observed outside `execute()`. */
  recordFailure(): void {
    this.totalRequests++;
    this.onFailure();
  }

  /** Read-only stats snapshot. */
  getStats(): Readonly<CircuitBreakerStats> {
    this.evaluateState();
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChangeTime: this.lastStateChangeTime,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
    };
  }

  /**
   * Execute a function through the circuit breaker.
   * @throws {CircuitBreakerOpenError} when circuit is OPEN
   * @throws whatever the wrapped function throws
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.evaluateState();
    this.totalRequests++;

    if (this.state === 'open') {
      throw new CircuitBreakerOpenError(
        `Circuit breaker is OPEN. Retry after ${this.getRemainingOpenTime()}ms.`,
        this.getRemainingOpenTime()
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Manually reset the circuit to CLOSED state. */
  reset(): void {
    this.transitionTo('closed');
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.lastFailureTime = 0;
    this.lastStateChangeTime = Date.now();
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.successCount++;

    if (this.state === 'half_open') {
      this.transitionTo('closed');
    }
  }

  private onFailure(): void {
    const now = Date.now();

    // Reset counter if outside monitoring window. lastFailureTime === 0 means
    // "no failure recorded yet", not "one failure long ago" — skipping the
    // reset there would silently raise the effective threshold.
    if (this.lastFailureTime !== 0 && now - this.lastFailureTime > this.config.monitoringWindow) {
      this.failureCount = 0;
    }

    this.lastFailureTime = now;
    this.failureCount++;

    if (this.state === 'half_open') {
      this.transitionTo('open');
      return;
    }

    if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private evaluateState(): void {
    if (this.state !== 'open') return;

    const elapsed = Date.now() - this.lastStateChangeTime;
    if (elapsed >= this.config.resetTimeout) {
      this.transitionTo('half_open');
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    this.lastStateChangeTime = Date.now();

    if (newState === 'closed') {
      this.failureCount = 0;
    }

    this.config.onStateChange?.(oldState, newState);
  }
}

/** Error thrown when circuit breaker is in OPEN state. */
export class CircuitBreakerOpenError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}
