/**
 * Regression tests for the request plumbing shared by every provider.
 * @module requestUtils tests
 * @author ssrjkk
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ABORT_ERROR,
  SseParser,
  combineSignals,
  delay,
  redactSecrets,
  withTimeoutSignal,
} from '../data/api/requestUtils';

describe('combineSignals', () => {
  it('returns an already-aborted signal when any input is aborted', () => {
    const aborted = AbortSignal.abort();
    const live = new AbortController().signal;
    expect(combineSignals([live, aborted]).aborted).toBe(true);
  });

  it('propagates a later abort', () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineSignals([a.signal, b.signal]);
    expect(combined.aborted).toBe(false);
    b.abort();
    expect(combined.aborted).toBe(true);
  });

  it('works without AbortSignal.any', () => {
    const original = AbortSignal.any;
    // The fallback path is what runs on Chrome < 116 / Firefox < 124.
    (AbortSignal as unknown as { any?: unknown }).any = undefined;
    try {
      const controller = new AbortController();
      const combined = combineSignals([controller.signal]);
      expect(combined.aborted).toBe(false);
      controller.abort();
      expect(combined.aborted).toBe(true);
    } finally {
      (AbortSignal as unknown as { any?: unknown }).any = original;
    }
  });
});

describe('withTimeoutSignal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aborts after the deadline', () => {
    const { signal, dispose } = withTimeoutSignal([], 1000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
    dispose();
  });

  it('dispose cancels the timer', () => {
    const { signal, dispose } = withTimeoutSignal([], 1000);
    dispose();
    vi.advanceTimersByTime(5000);
    expect(signal.aborted).toBe(false);
  });

  it('propagates the caller signal', () => {
    const controller = new AbortController();
    const { signal } = withTimeoutSignal([controller.signal], 60_000);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });
});

describe('delay', () => {
  it('rejects immediately when already aborted', async () => {
    await expect(delay(1000, AbortSignal.abort())).rejects.toThrow(ABORT_ERROR);
  });

  it('rejects on abort', async () => {
    const controller = new AbortController();
    const promise = delay(10_000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow(ABORT_ERROR);
  });

  it('resolves after the delay', async () => {
    vi.useFakeTimers();
    try {
      let done = false;
      const promise = delay(500).then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(500);
      await promise;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('redactSecrets', () => {
  it.each([
    ['sk-proj-abcdefghijklmnop', 'openai'],
    ['sk-ant-api03-abcdefghijklmnop', 'anthropic'],
    ['gsk_abcdefghijklmnopqrst', 'groq'],
    ['AIzaSyAbcdefghijklmnop', 'google'],
    ['ghp_abcdefghijklmnopqrstuvwxyz', 'github'],
  ])('redacts %s (%s)', key => {
    const out = redactSecrets(`Incorrect API key provided: ${key}. See https://x.dev`);
    expect(out).not.toContain(key);
    expect(out).toContain('[REDACTED]');
    // Non-secret context must survive.
    expect(out).toContain('Incorrect API key provided');
  });

  it('redacts bearer tokens', () => {
    expect(redactSecrets('Authorization: Bearer abcdef1234567890')).not.toContain('abcdef1234567890');
  });

  it('leaves ordinary text alone', () => {
    expect(redactSecrets('Rate limit exceeded, retry in 5s')).toBe('Rate limit exceeded, retry in 5s');
  });
});

describe('SseParser', () => {
  it('parses a single \n\n-delimited frame', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"a":1}\n\n')).toEqual([{ event: undefined, data: '{"a":1}' }]);
  });

  it('parses CRLF framing and strips the carriage return', () => {
    // The old `startsWith('data: ')` + exact `[DONE]` comparison never matched
    // a \r-terminated payload.
    const parser = new SseParser();
    expect(parser.push('data: {"a":1}\r\n\r\n')).toEqual([{ event: undefined, data: '{"a":1}' }]);
  });

  it('accepts `data:` without a space', () => {
    const parser = new SseParser();
    expect(parser.push('data:{"a":1}\n\n')).toEqual([{ event: undefined, data: '{"a":1}' }]);
  });

  it('exposes the event name', () => {
    const parser = new SseParser();
    expect(parser.push('event: error\ndata: {"type":"error"}\n\n')).toEqual([
      { event: 'error', data: '{"type":"error"}' },
    ]);
  });

  it('ignores comments', () => {
    const parser = new SseParser();
    expect(parser.push(': keep-alive\n\n')).toEqual([]);
  });

  it('joins multi-line data fields', () => {
    const parser = new SseParser();
    expect(parser.push('data: line1\ndata: line2\n\n')).toEqual([
      { event: undefined, data: 'line1\nline2' },
    ]);
  });

  it('returns nothing until a frame is terminated', () => {
    const parser = new SseParser();
    expect(parser.push('data: {"a":')).toEqual([]);
    expect(parser.push('1}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: undefined, data: '{"a":1}' }]);
  });

  it('flushes a trailing frame with no blank line', () => {
    // The old parser popped `lines.pop()` into lineBuffer and dropped it, so the
    // final event of every response was silently lost.
    const parser = new SseParser();
    expect(parser.push('data: {"a":1}\n')).toEqual([]);
    expect(parser.flush()).toEqual([{ event: undefined, data: '{"a":1}' }]);
    expect(parser.flush()).toEqual([]);
  });

  it('handles multiple frames in one chunk', () => {
    const parser = new SseParser();
    expect(parser.push('data: 1\n\ndata: 2\n\n')).toEqual([
      { event: undefined, data: '1' },
      { event: undefined, data: '2' },
    ]);
  });
});

describe('ABORT_ERROR', () => {
  it('is the shared cancellation message', () => {
    expect(ABORT_ERROR).toBe('Request aborted');
  });
});
