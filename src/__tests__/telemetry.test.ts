/**
 * @module telemetry tests
 * @author ssrjkk
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { telemetry } from '../lib/telemetry';

describe('TelemetryBuffer', () => {
  beforeEach(() => {
    telemetry.clear();
    // Telemetry is opt-in now, so every behaviour test must opt in first.
    telemetry.setEnabled(true);
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    telemetry.stop();
    telemetry.clear();
    telemetry.setEnabled(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('records nothing while disabled', () => {
    telemetry.setEnabled(false);
    telemetry.record('ignored_event');
    expect(telemetry.getBufferSize()).toBe(0);
  });

  it('persists and restores the consent choice', () => {
    telemetry.setEnabled(true);
    telemetry.restorePreference();
    expect(telemetry.isEnabled()).toBe(true);

    telemetry.setEnabled(false);
    telemetry.restorePreference();
    expect(telemetry.isEnabled()).toBe(false);
  });

  it('drops buffered events when consent is withdrawn', () => {
    telemetry.record('queued');
    expect(telemetry.getBufferSize()).toBe(1);
    telemetry.setEnabled(false);
    expect(telemetry.getBufferSize()).toBe(0);
  });

  it('does not start an interval without consent', () => {
    telemetry.setEnabled(false);
    telemetry.stop(); // clears any interval from a previous test
    telemetry.record('nope');
    vi.advanceTimersByTime(60_000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('records events', () => {
    telemetry.record('test_event', { key: 'value' });
    expect(telemetry.getBufferSize()).toBe(1);
  });

  it('flushes at max buffer size', () => {
    for (let i = 0; i < 50; i++) {
      telemetry.record('event_' + i);
    }
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(telemetry.getBufferSize()).toBe(0);
  });

  it('flushes on stop', () => {
    telemetry.record('event1');
    telemetry.record('event2');
    telemetry.stop();
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(telemetry.getBufferSize()).toBe(0);
  });

  it('clear empties buffer', () => {
    telemetry.record('a');
    telemetry.record('b');
    telemetry.clear();
    expect(telemetry.getBufferSize()).toBe(0);
  });

  it('flush is no-op on empty buffer', async () => {
    telemetry.clear();
    await telemetry['flush']();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('recordPerformance categorizes slow events', () => {
    telemetry.recordPerformance('slow_op', 2000);
    expect(telemetry.getBufferSize()).toBe(1);
  });

  it('recordPerformance categorizes fast events', () => {
    telemetry.recordPerformance('fast_op', 50);
    expect(telemetry.getBufferSize()).toBe(1);
  });

  it('recordError uses error severity', () => {
    telemetry.recordError('ERR_001', 'Something broke');
    expect(telemetry.getBufferSize()).toBe(1);
  });

  it('recordUserAction records action with target', () => {
    telemetry.recordUserAction('click', 'button#submit');
    expect(telemetry.getBufferSize()).toBe(1);
  });

  it('recordUserAction records action without target', () => {
    telemetry.recordUserAction('scroll');
    expect(telemetry.getBufferSize()).toBe(1);
  });

  it('flush handles fetch failure gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    telemetry.record('fail_event');
    await telemetry['flush']();
    expect(telemetry.getBufferSize()).toBe(0);
  });

  it('start is idempotent', () => {
    telemetry.start();
    telemetry.start();
    // No double interval
    telemetry.record('test');
    vi.advanceTimersByTime(30_000);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('flush interval fires periodically', () => {
    telemetry.start();
    telemetry.record('periodic');
    vi.advanceTimersByTime(30_000);
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});
