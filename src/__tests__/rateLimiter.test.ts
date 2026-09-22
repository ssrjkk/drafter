import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../lib/rateLimiter';

const LS_KEY = 'drafter-rate-limit';

describe('RateLimiter', () => {
  beforeEach(() => {
    localStorage.clear();
    RateLimiter.reset();
    RateLimiter.init({ rateLimitWindow: 60000, maxRequestsPerWindow: 10 });
  });

  describe('init()', () => {
    it('applies custom config', () => {
      RateLimiter.init({ rateLimitWindow: 30000, maxRequestsPerWindow: 5 });
      const cfg = RateLimiter.getConfig();
      expect(cfg.windowMs).toBe(30000);
      expect(cfg.maxRequests).toBe(5);
    });

    it('defaults to 60s window and 10 requests', () => {
      const cfg = RateLimiter.getConfig();
      expect(cfg.windowMs).toBe(60000);
      expect(cfg.maxRequests).toBe(10);
    });
  });

  describe('consumeSlot()', () => {
    it('returns true when under limit', () => {
      RateLimiter.init({ rateLimitWindow: 60000, maxRequestsPerWindow: 3 });
      expect(RateLimiter.consumeSlot()).toBe(true);
    });

    it('returns false when at limit', () => {
      RateLimiter.init({ rateLimitWindow: 60000, maxRequestsPerWindow: 2 });
      RateLimiter.consumeSlot();
      RateLimiter.consumeSlot();
      expect(RateLimiter.consumeSlot()).toBe(false);
    });

    it('tracks request count', () => {
      RateLimiter.init({ rateLimitWindow: 60000, maxRequestsPerWindow: 5 });
      RateLimiter.consumeSlot();
      RateLimiter.consumeSlot();
      expect(RateLimiter.getRequestCount()).toBe(2);
    });
  });

  describe('getRemaining()', () => {
    it('returns max when no requests made', () => {
      expect(RateLimiter.getRemaining()).toBe(10);
    });

    it('decreases after consuming slots', () => {
      RateLimiter.init({ rateLimitWindow: 60000, maxRequestsPerWindow: 3 });
      RateLimiter.consumeSlot();
      RateLimiter.consumeSlot();
      expect(RateLimiter.getRemaining()).toBe(1);
    });

    it('never goes below zero', () => {
      RateLimiter.init({ rateLimitWindow: 60000, maxRequestsPerWindow: 1 });
      RateLimiter.consumeSlot();
      RateLimiter.consumeSlot();
      expect(RateLimiter.getRemaining()).toBe(0);
    });
  });

  describe('getResetTime()', () => {
    it('returns 0 when no requests', () => {
      expect(RateLimiter.getResetTime()).toBe(0);
    });

    it('returns seconds until oldest request expires', () => {
      RateLimiter.consumeSlot();
      const resetTime = RateLimiter.getResetTime();
      expect(resetTime).toBeGreaterThan(0);
      expect(resetTime).toBeLessThanOrEqual(60);
    });
  });

  describe('getTimeUntilNextSlot()', () => {
    it('returns 0 when slots available', () => {
      expect(RateLimiter.getTimeUntilNextSlot()).toBe(0);
    });

    it('returns seconds until next slot when at capacity', () => {
      RateLimiter.init({ rateLimitWindow: 60000, maxRequestsPerWindow: 1 });
      RateLimiter.consumeSlot();
      const wait = RateLimiter.getTimeUntilNextSlot();
      expect(wait).toBeGreaterThan(0);
      expect(wait).toBeLessThanOrEqual(60);
    });
  });

  describe('reset()', () => {
    it('clears all requests', () => {
      RateLimiter.init({ rateLimitWindow: 60000, maxRequestsPerWindow: 5 });
      RateLimiter.consumeSlot();
      RateLimiter.consumeSlot();
      RateLimiter.reset();
      expect(RateLimiter.getRequestCount()).toBe(0);
      expect(RateLimiter.getRemaining()).toBe(5);
    });
  });

  describe('recordRequest()', () => {
    it('adds a request without consuming a slot', () => {
      RateLimiter.recordRequest();
      expect(RateLimiter.getRequestCount()).toBe(1);
      expect(RateLimiter.getRemaining()).toBe(9);
    });
  });

  describe('window expiry', () => {
    it('removes expired requests after time passes', () => {
      vi.useFakeTimers();
      RateLimiter.init({ rateLimitWindow: 10000, maxRequestsPerWindow: 2 });
      RateLimiter.consumeSlot();
      RateLimiter.consumeSlot();
      expect(RateLimiter.consumeSlot()).toBe(false);

      vi.advanceTimersByTime(11000);
      expect(RateLimiter.getRemaining()).toBe(2);
      expect(RateLimiter.consumeSlot()).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('persistence', () => {
    it('init saves state to localStorage', () => {
      RateLimiter.init({ rateLimitWindow: 60000, maxRequestsPerWindow: 5 });

      const saved = localStorage.getItem(LS_KEY);
      expect(saved).toBeTruthy();
      const parsed = JSON.parse(saved!);
      expect(parsed.config.windowMs).toBe(60000);
      expect(parsed.config.maxRequests).toBe(5);
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem(LS_KEY, '{invalid json');
      RateLimiter.init({ rateLimitWindow: 60000, maxRequestsPerWindow: 10 });
      expect(RateLimiter.getRequestCount()).toBe(0);
    });
  });
});
