import type { ZipParseResult } from '../../workers/zipParser.worker';

interface PendingRequest {
  resolve: (result: ZipParseResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Main-thread deadline, a little above the worker's own, as a backstop. */
const MAIN_THREAD_TIMEOUT_MS = 35_000;

export class ZipParserWorker {
  private worker: Worker | null = null;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private requestId = 0;

  private initWorker(): void {
    this.worker = new Worker(
      new URL('../../workers/zipParser.worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = (event: MessageEvent<{
      requestId: number;
      success: boolean;
      result?: ZipParseResult;
      error?: string;
    }>) => {
      const { requestId, success, result, error } = event.data;
      const pending = this.pendingRequests.get(requestId);

      if (pending) {
        this.pendingRequests.delete(requestId);
        clearTimeout(pending.timer);
        if (success && result) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'Worker failed'));
        }
      }
    };

    // A structured-clone failure must also settle the pending promises,
    // otherwise every request hangs for the rest of the session.
    this.worker.onmessageerror = () => this.terminate();

    this.worker.onerror = () => this.terminate();
  }

  async parse(data: ArrayBuffer, filename: string): Promise<ZipParseResult> {
    if (!this.worker) {
      this.initWorker();
    }

    const requestId = ++this.requestId;
    const worker = this.worker;

    return new Promise<ZipParseResult>((resolve, reject) => {
      // Without this a worker killed by the browser (e.g. OOM) leaves the
      // promise pending forever and the panel stuck on "loading".
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.terminate();
        reject(new Error('Zip parse timed out'));
      }, MAIN_THREAD_TIMEOUT_MS);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      if (!worker) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timer);
        reject(new Error('Worker unavailable'));
        return;
      }

      try {
        worker.postMessage({ requestId, data, filename }, [data]);
      } catch (err) {
        // postMessage throws when the buffer is already detached (e.g. the same
        // ArrayBuffer parsed twice) — the request is already registered, so it
        // has to be cleaned up explicitly.
        this.pendingRequests.delete(requestId);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error('Failed to start zip parse'));
      }
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Worker terminated'));
    }
    this.pendingRequests.clear();
  }
}

export const zipParser = new ZipParserWorker();
