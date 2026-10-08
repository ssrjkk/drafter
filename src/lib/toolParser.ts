/**
 * Parsing of the model's fenced tool-call blocks.
 * @module toolParser
 * @author ssrjkk
 */

export interface ParsedToolCall {
  name: string;
  input: Record<string, unknown>;
}

/** Fenced blocks closed by their own fence line. */
const TERMINATED_BLOCK = /```tool(?:_call)?[ \t]*\r?\n([\s\S]*?)\r?\n```/gi;
/** Trailing block with no closing fence — the model hit its token limit. */
const UNTERMINATED_BLOCK = /```tool(?:_call)?[ \t]*\r?\n([\s\S]*)$/gi;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toToolCall(value: unknown): ParsedToolCall | null {
  if (!isObject(value)) return null;
  if (typeof value.name !== 'string' || value.name.length === 0) return null;
  const input = value.input ?? {};
  if (!isObject(input)) return null;
  return { name: value.name, input };
}

/** Close a JSON object literal that was cut off by a token limit. */
function repairTruncatedJson(source: string): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of source) {
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') depth--;
  }

  if (!inString && depth === 0) return null;
  // Drop a dangling `"key":` or trailing comma before closing the braces.
  let repaired = source.trimEnd().replace(/,\s*$/, '').replace(/,?\s*"[^"]*"\s*:\s*$/, '');
  if (inString) repaired += '"';
  repaired += ']'.repeat(Math.max(0, repaired.split('[').length - repaired.split(']').length));
  repaired += '}'.repeat(Math.max(0, (source.split('{').length - source.split('}').length)));
  return repaired;
}

function collect(matches: Iterable<string>): ParsedToolCall[] {
  const found: ParsedToolCall[] = [];
  for (const body of matches) {
    const trimmed = body.trim();
    if (!trimmed) continue;

    try {
      const parsed = toToolCall(JSON.parse(trimmed));
      if (parsed) found.push(parsed);
      continue;
    } catch {
      // fall through to repair
    }

    const repaired = repairTruncatedJson(trimmed);
    if (!repaired) continue;
    try {
      const parsed = toToolCall(JSON.parse(repaired));
      if (parsed) found.push(parsed);
    } catch {
      // unrecoverable — skip this block
    }
  }
  return found;
}

/**
 * Extract the usable tool call from a model response.
 *
 * The previous regex required an exact ```` ```tool\n ```` header *and* a
 * closing fence, so ```` ```tool\r\n ````, ```` ```tool_call ```` and a block
 * truncated by `max_tokens` all failed — the raw JSON was then handed to the
 * user as the QA deliverable. It was also non-global, so an illustrative
 * example before the real call won.
 *
 * Properly terminated blocks are matched first so a ``` sequence inside a JSON
 * string value cannot truncate the capture; the unterminated form is only
 * considered when no complete block parsed.
 */
export function parseToolCall(response: string): ParsedToolCall | null {
  if (!response || !response.includes('```tool')) return null;

  const terminated = collect(
    [...response.matchAll(TERMINATED_BLOCK)].map(m => m[1] ?? ''),
  );
  if (terminated.length > 0) {
    // The last block is the model's current intent; earlier ones are usually
    // documentation examples.
    return terminated[terminated.length - 1]!;
  }

  const unterminated = collect(
    [...response.matchAll(UNTERMINATED_BLOCK)].map(m => m[1] ?? ''),
  );
  return unterminated.length > 0 ? unterminated[unterminated.length - 1]! : null;
}
