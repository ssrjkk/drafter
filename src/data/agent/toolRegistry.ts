/**
 * Tool registry for QA agent
 * @module toolRegistry
 * @author ssrjkk
 */

import type { CodebaseProvider } from '../codebase/CodebaseProvider';
import type { ToolCall, ToolResult } from './types';

/**
 * Normalise a model-supplied path and reject anything that escapes the
 * repository.
 *
 * The previous check validated `normalized` but then called
 * `codebase.readFile(path)` with the *raw* argument, so a Windows-style
 * absolute path (`C:\Windows\win.ini`) passed validation. It also used
 * `includes('..')`, which wrongly rejected legitimate names like `a..b.ts`.
 *
 * Returns `null` when the path is unacceptable.
 */
export function normalizeToolPath(rawPath: string): string | null {
  const normalised = rawPath.replace(/\\/g, '/').trim();
  if (!normalised) return '';
  // Absolute POSIX, UNC and Windows-drive paths are all rejected.
  if (normalised.startsWith('/') || /^[a-zA-Z]:/.test(normalised) || normalised.startsWith('//')) return null;
  const parts = normalised.split('/').filter(part => part.length > 0 && part !== '.');
  if (parts.some(part => part === '..')) return null;
  return parts.join('/');
}

const MAX_TOOL_PATTERN_LENGTH = 200;

/**
 * Reject regexes that can catastrophically backtrack. The pattern comes from
 * model output (i.e. influenced by repository content and prompt injection)
 * and is then run over every line of every loaded file, so a single bad
 * pattern freezes the UI thread.
 */
export function isSafeSearchPattern(pattern: string): boolean {
  if (!pattern || pattern.length > MAX_TOOL_PATTERN_LENGTH) return false;
  // Nested quantifiers: (a+)+, (a*)*, (a|a?)+, ...
  if (/\([^)]*[+*][^)]*\)\s*[+*]/.test(pattern)) return false;
  // Quantified alternation with overlapping branches.
  if (/\([^()]*\|[^()]*\)\s*[+*]/.test(pattern)) return false;
  // Repeated unbounded wildcard.
  if (/\.\*\s*\.\*/.test(pattern) || /\.\+\s*\.\+/.test(pattern)) return false;
  return true;
}

export async function executeTool(
  toolCall: ToolCall,
  codebase: CodebaseProvider
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    let content: string;
    let isError = false;

    switch (toolCall.name) {
      case 'list_directory': {
        const path = normalizeToolPath(String(toolCall.input.path || ''));
        if (path === null) {
          content = 'Error: path traversal is not allowed.';
          isError = true;
          break;
        }
        const files = await codebase.listTree(path);
        if (files.length === 0) {
          content = path ? `Directory "${path}" is empty or does not exist.` : 'Root directory is empty.';
        } else {
          const lines = files.slice(0, 500).map(f => {
            const icon = f.type === 'directory' ? '📁' : '📄';
            const size = f.size ? ` (${formatSize(f.size)})` : '';
            return `${icon} ${f.name}${size}`;
          });
          content = `Contents of "${path || '/'}":\n\n${lines.join('\n')}`;
          if (files.length > 500) content += `\n\n… ${files.length - 500} more entries omitted`;
        }
        break;
      }

      case 'read_file': {
        const path = normalizeToolPath(String(toolCall.input.path || ''));
        if (path === null) {
          content = 'Error: path traversal is not allowed.';
          isError = true;
          break;
        }
        if (!path) {
          content = 'Error: file path is required.';
          isError = true;
          break;
        }
        // Read the *validated* path, not the raw one.
        const fileContent = await codebase.readFile(path);
        const lineCount = fileContent.split('\n').length;
        content = `File: ${path} (${lineCount} lines)\n\n\`\`\`\n${fileContent}\n\`\`\``;
        break;
      }

      case 'search_code': {
        const pattern = String(toolCall.input.pattern || '');
        const ext = toolCall.input.file_extension ? String(toolCall.input.file_extension) : undefined;
        if (!pattern) {
          content = 'Error: search pattern is required.';
          isError = true;
          break;
        }
        if (!isSafeSearchPattern(pattern)) {
          content = 'Error: the search pattern is too complex to evaluate safely. Use a simpler regex.';
          isError = true;
          break;
        }
        const results = await codebase.searchCode(pattern, ext);
        if (results.length === 0) {
          content = `No matches found for pattern "${pattern}".`;
        } else {
          const lines = results.slice(0, 100).map(r => `${r.path}:${r.line}: ${r.content}`);
          content = `Found ${results.length} matches for "${pattern}":\n\n${lines.join('\n')}`;
          if (results.length > 100) content += `\n\n… ${results.length - 100} more matches omitted`;
        }
        break;
      }

      default:
        // Must be flagged as an error, otherwise the agent treats a failed
        // dispatch as a valid observation and re-issues the same bad call
        // until it runs out of iterations.
        content = `Unknown tool: ${toolCall.name}. Available tools: list_directory, read_file, search_code.`;
        isError = true;
    }

    const duration = Date.now() - startTime;
    if (duration > 5000) {
      content += `\n\n(tool ${Math.round(duration / 1000)}s)`;
    }

    return { tool_use_id: toolCall.id, content, ...(isError ? { is_error: true } : {}) };
  } catch (err) {
    return {
      tool_use_id: toolCall.id,
      content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
      is_error: true,
    };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
