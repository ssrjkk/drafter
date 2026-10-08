/**
 * ZIP file parser web worker
 * @module zipParser.worker
 * @author ssrjkk
 */

import JSZip from 'jszip';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', '__pycache__', '.venv', 'vendor',
]);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs',
  '.rb', '.php', '.cs', '.swift', '.kt', '.scala', '.vue', '.svelte',
  '.html', '.css', '.scss', '.less', '.json', '.yaml', '.yml',
  '.toml', '.sql', '.sh', '.bash', '.md', '.txt',
]);

export interface ZipFileEntry {
  path: string;
  name: string;
  content: string;
  size: number;
  lastModified: Date;
}

export interface ZipParseResult {
  files: ZipFileEntry[];
  totalSize: number;
  fileCount: number;
  parseTimeMs: number;
  /** Entries dropped by the size/count budgets or that failed to decompress. */
  skippedCount?: number;
}

interface WorkerRequest {
  requestId: number;
  data: ArrayBuffer;
  filename: string;
}

interface WorkerResponse {
  requestId: number;
  success: boolean;
  result?: ZipParseResult;
  error?: string;
}

const TIMEOUT_MS = 30_000;

/**
 * Decompression-bomb budgets. Without them a ~10 KB archive that expands to
 * gigabytes was fully materialised as JS strings inside the worker, and the
 * 30 s timeout only *reported* the problem — it never stopped the allocation.
 */
export const ZIP_LIMITS = {
  MAX_ENTRIES: 2000,
  MAX_ENTRY_BYTES: 2 * 1024 * 1024,
  MAX_TOTAL_BYTES: 32 * 1024 * 1024,
} as const;

/** How many archive members are inflated at once. */
const ZIP_CONCURRENCY = 16;

/**
 * Uncompressed size declared in the central directory. JSZip keeps it on the
 * private `_data` field, which the published types do not expose.
 */
function declaredUncompressedSize(entry: JSZip.JSZipObject): number {
  const data = (entry as unknown as { _data?: { uncompressedSize?: unknown } })._data;
  return typeof data?.uncompressedSize === 'number' ? data.uncompressedSize : 0;
}

/**
 * Normalise an archive path and reject traversal. Nothing is written to disk
 * here, but an entry called `../../etc/passwd.ts` would become a first-class
 * "file" in the codebase tree and be fed to the LLM as source code.
 */
export function safeArchivePath(rawPath: string): string | null {
  if (!rawPath) return null;
  const normalised = rawPath.replace(/\\/g, '/');
  if (normalised.startsWith('/') || /^[a-zA-Z]:/.test(normalised)) return null;
  const parts = normalised.split('/').filter(part => part.length > 0 && part !== '.');
  if (parts.length === 0) return null;
  if (parts.some(part => part === '..')) return null;
  return parts.join('/');
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const startTime = performance.now();
  const { requestId, data } = event.data;

  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    self.postMessage({ requestId, success: false, error: 'Parse timed out' } satisfies WorkerResponse);
    // Stop allocating: posting the error alone left the worker inflating.
    self.close();
  }, TIMEOUT_MS);

  try {
    const zip = await JSZip.loadAsync(data);

    // Pre-screen the central directory *before* inflating anything, so a bomb
    // is rejected instead of being decompressed and only then measured.
    const candidates: { path: string; entry: JSZip.JSZipObject }[] = [];
    let declaredTotal = 0;
    let rejected = 0;

    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir || relativePath.startsWith('__MACOSX')) return;

      const name = relativePath.split('/').pop();
      if (!name) return;
      if (relativePath.split('/').some(part => IGNORED_DIRS.has(part))) return;

      const lowerName = name.toLowerCase();
      if (name === '.DS_Store' || name === 'Thumbs.db') return;
      const ext = `.${lowerName.split('.').pop() ?? ''}`;
      if (!CODE_EXTENSIONS.has(ext)) return;

      const safePath = safeArchivePath(relativePath);
      if (!safePath) {
        rejected++;
        return;
      }

      const declaredSize = declaredUncompressedSize(zipEntry);
      if (declaredSize > ZIP_LIMITS.MAX_ENTRY_BYTES) {
        rejected++;
        return;
      }
      declaredTotal += declaredSize;
      if (declaredTotal > ZIP_LIMITS.MAX_TOTAL_BYTES) {
        rejected++;
        return;
      }
      if (candidates.length >= ZIP_LIMITS.MAX_ENTRIES) {
        rejected++;
        return;
      }

      candidates.push({ path: safePath, entry: zipEntry });
    });

    // Decompress in bounded concurrency so a huge archive cannot spawn one
    // promise per member.
    const files: ZipFileEntry[] = [];
    const failures: string[] = [];

    for (let i = 0; i < candidates.length; i += ZIP_CONCURRENCY) {
      const slice = candidates.slice(i, i + ZIP_CONCURRENCY);
      const settled = await Promise.all(
        slice.map(async ({ path, entry }) => {
          try {
            const content = await entry.async('string');
            files.push({
              path,
              name: path.split('/').pop() ?? path,
              content,
              size: content.length,
              lastModified: entry.date,
            });
          } catch {
            // Report rather than silently drop: a corrupt entry used to vanish
            // while the parse was still declared successful.
            failures.push(path);
          }
        }),
      );
      void settled;
      if (timedOut) return;
    }

    clearTimeout(timeoutId);
    if (timedOut) return;

    const parseTimeMs = performance.now() - startTime;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    const result: ZipParseResult = {
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      totalSize,
      fileCount: files.length,
      parseTimeMs,
      skippedCount: rejected + failures.length,
    };

    const response: WorkerResponse = { requestId, success: true, result };
    self.postMessage(response);
  } catch (error) {
    clearTimeout(timeoutId);
    if (timedOut) return;
    const response: WorkerResponse = {
      requestId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    self.postMessage(response);
  }
};
