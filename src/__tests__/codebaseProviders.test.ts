import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/errorService', () => ({
  ErrorService: { report: vi.fn(), reportAsync: vi.fn() },
}));

import { LocalProvider } from '../data/codebase/LocalProvider';
import { GitHubProvider } from '../data/codebase/GitHubProvider';
import { IGNORED_DIRS, IGNORED_FILES, CODE_EXTENSIONS } from '../data/codebase/constants';

type ZipEntry = { path: string; name: string; content: string; size: number; lastModified: Date };
function zip(path: string, content: string): ZipEntry {
  const parts = path.split('/');
  return { path, name: parts[parts.length - 1]!, content, size: content.length, lastModified: new Date() };
}

describe('codebase constants', () => {
  it('IGNORED_DIRS contains common directories', () => {
    expect(IGNORED_DIRS.has('node_modules')).toBe(true);
    expect(IGNORED_DIRS.has('.git')).toBe(true);
    expect(IGNORED_DIRS.has('dist')).toBe(true);
  });

  it('IGNORED_FILES contains lock files', () => {
    expect(IGNORED_FILES.has('package-lock.json')).toBe(true);
    expect(IGNORED_FILES.has('yarn.lock')).toBe(true);
  });

  it('CODE_EXTENSIONS contains common code extensions', () => {
    expect(CODE_EXTENSIONS.has('.ts')).toBe(true);
    expect(CODE_EXTENSIONS.has('.tsx')).toBe(true);
    expect(CODE_EXTENSIONS.has('.js')).toBe(true);
    expect(CODE_EXTENSIONS.has('.py')).toBe(true);
    expect(CODE_EXTENSIONS.has('.rs')).toBe(true);
  });
});

describe('LocalProvider', () => {
  let provider: LocalProvider;

  beforeEach(() => {
    provider = new LocalProvider('TestProject');
  });

  it('initializes with correct name', () => {
    expect(provider.name).toBe('TestProject');
    expect(provider.isReady).toBe(false);
  });

  it('loadFromFiles loads valid code files', async () => {
    await provider.loadFromFiles([
      zip('src/index.ts', 'const x = 1;'),
      zip('src/utils.ts', 'export function foo() {}'),
    ]);
    expect(provider.isReady).toBe(true);
    expect(provider.getFileCount()).toBe(2);
  });

  it('loadFromFiles only checks filename not path for ignored dirs', async () => {
    await provider.loadFromFiles([
      zip('node_modules/pkg/index.js', 'x'),
      zip('src/main.ts', 'y'),
    ]);
    expect(provider.getFileCount()).toBe(2);
  });

  it('loadFromFiles ignores lock files', async () => {
    await provider.loadFromFiles([
      zip('package-lock.json', '{}'),
      zip('src/app.ts', 'z'),
    ]);
    expect(provider.getFileCount()).toBe(1);
  });

  it('loadFromFiles ignores non-code files', async () => {
    await provider.loadFromFiles([
      zip('image.png', ''),
      zip('src/app.ts', 'z'),
    ]);
    expect(provider.getFileCount()).toBe(1);
  });

  it('loadFromFiles creates directory structure', async () => {
    await provider.loadFromFiles([
      zip('src/components/Button.tsx', '<button/>'),
    ]);
    const tree = await provider.listTree();
    expect(tree.some(f => f.name === 'src' && f.type === 'directory')).toBe(true);
    const srcTree = await provider.listTree('src');
    expect(srcTree.some(f => f.name === 'components' && f.type === 'directory')).toBe(true);
  });

  it('listTree returns one level deep', async () => {
    await provider.loadFromFiles([
      zip('src/a.ts', 'a'),
      zip('src/b.ts', 'b'),
      zip('src/sub/c.ts', 'c'),
    ]);
    const root = await provider.listTree();
    expect(root.some(f => f.name === 'src' && f.type === 'directory')).toBe(true);
    expect(root.some(f => f.name === 'a.ts')).toBe(false);
    expect(root.some(f => f.name === 'c.ts')).toBe(false);
    const srcTree = await provider.listTree('src');
    expect(srcTree.some(f => f.name === 'a.ts' && f.type === 'file')).toBe(true);
    expect(srcTree.some(f => f.name === 'b.ts' && f.type === 'file')).toBe(true);
    expect(srcTree.some(f => f.name === 'sub' && f.type === 'directory')).toBe(true);
  });

  it('listTree returns subdirectory contents', async () => {
    await provider.loadFromFiles([
      zip('src/index.ts', 'i'),
      zip('lib/util.ts', 'u'),
    ]);
    const srcTree = await provider.listTree('src');
    expect(srcTree.some(f => f.name === 'index.ts')).toBe(true);
    expect(srcTree.some(f => f.name === 'lib')).toBe(false);
  });

  it('listTree sorts directories before files', async () => {
    await provider.loadFromFiles([
      zip('a.ts', 'a'),
      zip('z/file.ts', 'f'),
    ]);
    const tree = await provider.listTree();
    const dirIdx = tree.findIndex(f => f.type === 'directory');
    const fileIdx = tree.findIndex(f => f.type === 'file');
    expect(dirIdx).toBeLessThan(fileIdx);
  });

  it('readFile returns content', async () => {
    await provider.loadFromFiles([
      zip('src/main.ts', 'console.log()'),
    ]);
    const content = await provider.readFile('src/main.ts');
    expect(content).toBe('console.log()');
  });

  it('readFile returns not found for missing path', async () => {
    await provider.loadFromFiles([]);
    const content = await provider.readFile('missing.ts');
    expect(content).toContain('not found');
  });

  it('searchCode finds matches', async () => {
    await provider.loadFromFiles([
      zip('src/app.ts', 'function handleClick() {\n  return true;\n}'),
    ]);
    const results = await provider.searchCode('handleClick');
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('src/app.ts');
    expect(results[0]!.line).toBe(1);
  });

  it('searchCode respects fileGlob', async () => {
    await provider.loadFromFiles([
      zip('src/app.ts', 'function test() {}'),
      zip('lib/util.ts', 'function test() {}'),
    ]);
    const results = await provider.searchCode('test', 'src');
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('src/app.ts');
  });

  it('searchCode returns error for invalid regex', async () => {
    await provider.loadFromFiles([
      zip('x.ts', 'test'),
    ]);
    const results = await provider.searchCode('[invalid');
    expect(results[0]!.content).toContain('invalid regex');
  });

  it('searchCode returns error for long pattern', async () => {
    await provider.loadFromFiles([]);
    const results = await provider.searchCode('a'.repeat(201));
    expect(results[0]!.content).toContain('too long');
  });

  it('searchCode limits to 50 results', async () => {
    const content = Array(60).fill('target').join('\n');
    await provider.loadFromFiles([
      zip('big.ts', content),
    ]);
    const results = await provider.searchCode('target');
    expect(results.length).toBeLessThanOrEqual(50);
  });

  it('getStructureSummary returns tree string', async () => {
    await provider.loadFromFiles([
      zip('src/index.ts', 'i'),
      zip('README.md', 'r'),
    ]);
    const summary = await provider.getStructureSummary();
    expect(summary).toContain('TestProject');
    expect(summary).toContain('index.ts');
    expect(summary).toContain('README.md');
  });

  it('getFileCount returns 0 when empty', () => {
    expect(provider.getFileCount()).toBe(0);
  });
});

describe('GitHubProvider', () => {
  let provider: GitHubProvider;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    provider = new GitHubProvider('owner', 'repo', 'main', 'token123');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('initializes with correct name', () => {
    expect(provider.name).toBe('owner/repo');
    expect(provider.isReady).toBe(true);
  });

  it('listTree fetches and filters files', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { name: 'src', path: 'src', type: 'dir' },
        { name: 'index.ts', path: 'index.ts', type: 'file', size: 100 },
        { name: 'node_modules', path: 'node_modules', type: 'dir' },
        { name: 'image.png', path: 'image.png', type: 'file', size: 1000 },
      ]),
    });
    const result = await provider.listTree();
    expect(result.some(f => f.name === 'src')).toBe(true);
    expect(result.some(f => f.name === 'index.ts')).toBe(true);
    expect(result.some(f => f.name === 'node_modules')).toBe(false);
    expect(result.some(f => f.name === 'image.png')).toBe(false);
  });

  it('listTree sorts dirs first', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { name: 'a.ts', path: 'a.ts', type: 'file', size: 10 },
        { name: 'z', path: 'z', type: 'dir' },
      ]),
    });
    const result = await provider.listTree();
    expect(result[0]!.name).toBe('z');
    expect(result[1]!.name).toBe('a.ts');
  });

  it('listTree uses cache', async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ name: 'f.ts', path: 'f.ts', type: 'file', size: 10 }]),
    });
    await provider.listTree();
    await provider.listTree();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('listTree returns empty on error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });
    const result = await provider.listTree();
    expect(result).toEqual([]);
  });

  it('readFile fetches from raw.githubusercontent.com with auth headers', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('file content here'),
    });
    const content = await provider.readFile('src/index.ts');
    expect(content).toBe('file content here');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('raw.githubusercontent.com'),
      // The Authorization header used to be dropped, so private repos always
      // 404'd and the error body was fed to the model as if it were source.
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'token token123' }),
      }),
    );
  });

  it('readFile rejects path traversal', async () => {
    const content = await provider.readFile('../../../etc/passwd');
    expect(content).toContain('path traversal');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('readFile truncates large files', async () => {
    const largeContent = 'x'.repeat(150_000);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(largeContent),
    });
    const content = await provider.readFile('big.ts');
    expect(content.length).toBeLessThan(150_000);
    expect(content).toContain('truncated');
  });

  it('readFile returns error on failure', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });
    const content = await provider.readFile('missing.ts');
    expect(content).toContain('Error reading');
  });

  it('readFile uses cache', async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('cached'),
    });
    await provider.readFile('src/a.ts');
    await provider.readFile('src/a.ts');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('searchCode uses GitHub search API', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        items: [
          { path: 'src/app.ts', text_matches: [{ fragment: 'function test()' }] },
        ],
      }),
    });
    const results = await provider.searchCode('function test');
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('src/app.ts');
    expect(results[0]!.content).toBe('function test()');
  });

  it('searchCode sanitizes pattern to prevent injection', async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    await provider.searchCode('test repo:evil/repo filename:malicious.ts');
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).not.toContain('repo%3Aevil');
    expect(url).toContain('repo%3Aowner%2Frepo');
  });

  it('searchCode returns empty on error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    const results = await provider.searchCode('test');
    expect(results).toEqual([]);
  });

  it('getStructureSummary returns tree string', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { name: 'src', path: 'src', type: 'dir' },
        { name: 'README.md', path: 'README.md', type: 'file', size: 100 },
      ]),
    });
    const summary = await provider.getStructureSummary();
    expect(summary).toContain('owner/repo');
    expect(summary).toContain('README.md');
  });

  it('clearCache resets caches', async () => {
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ name: 'f.ts', path: 'f.ts', type: 'file', size: 10 }]),
    });
    await provider.listTree();
    provider.clearCache();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ name: 'f.ts', path: 'f.ts', type: 'file', size: 10 }]),
    });
    await provider.listTree();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('works without token', async () => {
    const noTokenProvider = new GitHubProvider('owner', 'repo');
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });
    await noTokenProvider.listTree();
    const headers = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });
});
