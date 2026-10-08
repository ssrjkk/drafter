/**
 * GitHub codebase provider
 * @module GitHubProvider
 * @author ssrjkk
 */

import type { CodebaseFile, CodebaseProvider, CodebaseSearchResult } from './CodebaseProvider';
import { IGNORED_DIRS, IGNORED_FILES, CODE_EXTENSIONS } from './constants';
import { ErrorService } from '../../lib/errorService';
import { ErrorCode, LIMITS } from '../../lib/constants';

interface GitHubContentItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

const MAX_CACHE_SIZE = 100;
/** Ceiling on API calls per provider instance, so a large repo cannot burn the quota. */
const MAX_API_REQUESTS = 400;
/** Ceiling on the tree summary handed to the model as prompt context. */
const MAX_STRUCTURE_LINES = 400;

export class GitHubProvider implements CodebaseProvider {
  readonly name: string;
  private owner: string;
  private repo: string;
  private branch: string;
  private token?: string;
  private treeCache: Map<string, CodebaseFile[]> = new Map();
  private fileCache: Map<string, string> = new Map();
  private requestsMade = 0;

  private evictOldestEntry<K, V>(map: Map<K, V>): void {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }

  constructor(owner: string, repo: string, branch = 'main', token?: string) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.token = token;
    this.name = `${owner}/${repo}`;
  }

  get isReady(): boolean {
    return true;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }
    return headers;
  }

  /**
   * Reject `..`/absolute segments. `encodeURIComponent` does not encode dots,
   * so a model-supplied path used to survive into the URL and be normalised
   * server-side.
   */
  private safePath(path: string): string | null {
    const normalised = path.replace(/\\/g, '/').replace(/^\/+/, '').trim();
    // An empty path means the repository root.
    if (!normalised) return '';
    const parts = normalised.split('/').filter(p => p.length > 0 && p !== '.');
    if (parts.length === 0) return '';
    if (parts.some(p => p === '..')) return null;
    return parts.join('/');
  }

  private async request(url: string, init?: RequestInit): Promise<Response> {
    if (this.requestsMade >= MAX_API_REQUESTS) {
      throw new Error('GitHub API request budget exhausted for this session');
    }
    this.requestsMade++;
    return fetch(url, {
      ...init,
      headers: { ...this.getHeaders(), ...(init?.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(15_000),
    });
  }

  async listTree(path = ''): Promise<CodebaseFile[]> {
    const cacheKey = path;
    if (this.treeCache.has(cacheKey)) {
      return this.treeCache.get(cacheKey)!;
    }

    const safe = this.safePath(path);
    if (safe === null) return [];

    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${safe.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(this.branch)}`;
      const response = await this.request(url);

      if (!response.ok) {
        ErrorService.reportAsync(
          ErrorCode.API_REQUEST,
          new Error(`GitHub listTree ${response.status}`),
          { provider: 'github', operation: 'listTree', path, status: response.status },
        );
        return [];
      }

      const data: GitHubContentItem[] = await response.json();

      const files: CodebaseFile[] = data
        .filter(item => {
          if (item.type === 'dir') return !IGNORED_DIRS.has(item.name);
          if (item.type === 'file') {
            if (IGNORED_FILES.has(item.name)) return false;
            const ext = `.${item.name.split('.').pop()?.toLowerCase()}`;
            return CODE_EXTENSIONS.has(ext);
          }
          return false;
        })
        .map(item => ({
          path: item.path,
          name: item.name,
          type: item.type === 'dir' ? 'directory' as const : 'file' as const,
          size: item.size,
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      if (this.treeCache.size >= MAX_CACHE_SIZE) this.evictOldestEntry(this.treeCache);
      this.treeCache.set(cacheKey, files);
      return files;
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.API_REQUEST, err, { provider: 'github', operation: 'listTree', path });
      return [];
    }
  }

  async readFile(path: string): Promise<string> {
    if (this.fileCache.has(path)) {
      return this.fileCache.get(path)!;
    }

    const safe = this.safePath(path);
    if (safe === null) return `// Error reading file: path traversal is not allowed (${path})`;

    try {
      const encodedPath = safe.split('/').map(encodeURIComponent).join('/');
      const response = await this.request(
        `https://raw.githubusercontent.com/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/${encodeURIComponent(this.branch)}/${encodedPath}`,
        // raw.githubusercontent.com ignores the GitHub API Accept header.
        { headers: { Accept: 'text/plain' } },
      );

      if (!response.ok) {
        // Throwing keeps an error message from being presented as source code
        // to the model (prompt poisoning via a 404 body).
        throw new Error(`Failed to read ${safe}: HTTP ${response.status}`);
      }

      const text = await response.text();

      // Truncate *before* caching, otherwise the size cap provides no
      // protection and the cache holds the full body.
      const clipped = text.length > LIMITS.maxFileContentChars
        ? `${text.slice(0, LIMITS.maxFileContentChars)}\n// ... truncated (file too large)`
        : text;

      if (this.fileCache.size >= MAX_CACHE_SIZE) this.evictOldestEntry(this.fileCache);
      this.fileCache.set(path, clipped);
      return clipped;
    } catch (err) {
      return `// Error reading file: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async searchCode(pattern: string, fileGlob?: string): Promise<CodebaseSearchResult[]> {
    try {
      // Allow-list the qualifiers instead of stripping a deny-list: `org:`,
      // `user:`, `org:`/`path:`/`language:` all broadened the query scope.
      const stripQualifiers = (value: string): string =>
        value.replace(/\b(repo|repo:|filename|org|user|language|path|in|size):/gi, ' ');

      let query = `${stripQualifiers(pattern)} repo:${this.owner}/${this.repo}`;
      if (fileGlob) query += ` filename:${stripQualifiers(fileGlob)}`;

      const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=20`;
      const response = await this.request(url, {
        // Without this media type GitHub never returns `text_matches`, so
        // every search result had empty content.
        headers: { Accept: 'application/vnd.github.text-match+json' },
      });

      if (!response.ok) return [];

      const data = await response.json();
      return (data.items || []).map((item: { path: string; text_matches?: Array<{ fragment: string }> }) => ({
        path: item.path,
        line: 0,
        content: item.text_matches?.[0]?.fragment || '',
      }));
    } catch (err) {
      ErrorService.reportAsync(ErrorCode.API_REQUEST, err, { provider: 'github', operation: 'searchCode' });
      return [];
    }
  }

  async getStructureSummary(): Promise<string> {
    const lines: string[] = [`${this.name} (${this.branch})`, ''];

    const renderTree = async (path: string, prefix: string, depth: number): Promise<void> => {
      if (depth > 3 || lines.length >= MAX_STRUCTURE_LINES) return;
      const items = await this.listTree(path);
      for (const item of items) {
        if (lines.length >= MAX_STRUCTURE_LINES) return;
        if (item.type === 'directory') {
          lines.push(`${prefix}${item.name}/`);
          await renderTree(item.path, prefix + '  ', depth + 1);
        } else {
          lines.push(`${prefix}${item.name}`);
        }
      }
    };

    await renderTree('', '', 0);
    if (lines.length >= MAX_STRUCTURE_LINES) {
      lines.push(`… truncated at ${MAX_STRUCTURE_LINES} entries`);
    }
    return lines.join('\n');
  }

  clearCache(): void {
    this.treeCache.clear();
    this.fileCache.clear();
  }
}
