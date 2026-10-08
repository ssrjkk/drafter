/**
 * Shared request plumbing for every AI provider: abort plumbing, deadlines,
 * SSE frame parsing and secret redaction.
 * @module requestUtils
 * @author ssrjkk
 */

/** Message used for every cancellation path, so callers can match on it. */
export const ABORT_ERROR = 'Request aborted';

/**
 * Combine signals without relying on `AbortSignal.any` (absent before
 * Chrome 116 / Firefox 124 / Safari 17.4, and not polyfilled here).
 * An already-aborted signal short-circuits.
 */
export function combineSignals(signals: (AbortSignal | undefined)[]): AbortSignal {
  const present = signals.filter((s): s is AbortSignal => Boolean(s));
  if (present.length === 0) return new AbortController().signal;
  if (present.some(s => s.aborted)) return AbortSignal.abort();

  if (typeof AbortSignal.any === 'function') return AbortSignal.any(present);

  const controller = new AbortController();
  for (const signal of present) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/**
 * A signal that aborts after `ms`, combined with the caller's signal so a
 * provider that accepts the connection and then stalls cannot wedge the UI
 * forever (the Execute button stays disabled until reload).
 */
export function withTimeoutSignal(signals: (AbortSignal | undefined)[], ms: number): { signal: AbortSignal; dispose: () => void } {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), ms);
  return {
    signal: combineSignals([...signals, timeoutController.signal]),
    dispose: () => clearTimeout(timer),
  };
}

/** Awaits `ms`, rejecting immediately when `signal` aborts. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException(ABORT_ERROR, 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException(ABORT_ERROR, 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
  });
}

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bsk-ant-[A-Za-z0-9_-]{8,}/g,
  /\bgsk_[A-Za-z0-9]{8,}/g,
  /\bAIza[A-Za-z0-9_-]{10,}/g,
  /\bghp_[A-Za-z0-9]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
];

/**
 * Strip credentials from provider error bodies before they reach the UI, the
 * error log or telemetry. Providers routinely echo the rejected key back
 * ("Incorrect API key provided: sk-proj-…").
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

export interface SseFrame {
  /** `event:` name, when the producer sent one. */
  event?: string;
  /** Concatenated `data:` payload of the frame. */
  data: string;
}

/**
 * Incremental SSE parser.
 *
 * Handles `\n` and `\r\n` framing, `data:` with or without a space, comments
 * (`:keep-alive`), multi-line data and — crucially — flushes whatever is left
 * in the buffer at EOF. Dropping the tail silently truncated the last token of
 * every response, and dropping a final frame without a trailing newline lost a
 * whole SSE event.
 */
export class SseParser {
  private buffer = '';

  /** Feed a decoded chunk and return the frames it completed. */
  push(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];

    // Records are separated by a blank line (\r\n\r\n or \n\n).
    let match: RegExpExecArray | null;
    const separator = /\r\n\r\n|\n\n|\r\r/;
    while ((match = separator.exec(this.buffer)) !== null) {
      const raw = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const frame = SseParser.parseRecord(raw);
      if (frame) frames.push(frame);
    }

    return frames;
  }

  /** Flush the trailing record that was not terminated by a blank line. */
  flush(): SseFrame[] {
    const raw = this.buffer;
    this.buffer = '';
    const frame = SseParser.parseRecord(raw);
    return frame ? [frame] : [];
  }

  private static parseRecord(raw: string): SseFrame | null {
    let event: string | undefined;
    const dataLines: string[] = [];

    for (const line of raw.split(/\r\n|\n|\r/)) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      // A single leading space after the colon is part of the framing.
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'data') dataLines.push(value);
      else if (field === 'event') event = value;
    }

    if (dataLines.length === 0 && event === undefined) return null;
    return { event, data: dataLines.join('\n') };
  }
}

export const SSE_DONE = '[DONE]';