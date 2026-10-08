/**
 * @module toolParser tests
 * @author ssrjkk
 */
import { describe, it, expect } from 'vitest';
import { parseToolCall } from '../lib/toolParser';

describe('parseToolCall', () => {
  it('parses valid tool call', () => {
    const response = 'Here is my result:\n```tool\n{"name":"read_file","input":{"path":"src/index.ts"}}\n```\nDone.';
    const result = parseToolCall(response);
    expect(result).toEqual({
      name: 'read_file',
      input: { path: 'src/index.ts' },
    });
  });

  it('returns null for no tool block', () => {
    expect(parseToolCall('Just a regular response')).toBeNull();
  });

  it('returns null for invalid JSON inside tool block', () => {
    const response = '```tool\n{invalid json}\n```';
    expect(parseToolCall(response)).toBeNull();
  });

  it('returns null for missing name field', () => {
    const response = '```tool\n{"input":{"path":"src"}}\n```';
    expect(parseToolCall(response)).toBeNull();
  });

  it('defaults a missing input field to an empty object', () => {
    // `list_directory` legitimately takes no arguments, so an absent `input`
    // must not be treated as an invalid call.
    const response = '```tool\n{"name":"list_directory"}\n```';
    expect(parseToolCall(response)).toEqual({ name: 'list_directory', input: {} });
  });

  it('rejects a non-object input field', () => {
    const response = '```tool\n{"name":"read_file","input":"src/a.ts"}\n```';
    expect(parseToolCall(response)).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    const response = '```tool\n"just a string"\n```';
    expect(parseToolCall(response)).toBeNull();
  });

  it('returns null for array JSON', () => {
    const response = '```tool\n[1, 2, 3]\n```';
    expect(parseToolCall(response)).toBeNull();
  });

  it('handles nested input objects', () => {
    const response = '```tool\n{"name":"search","input":{"query":{"text":"hello","filters":{"lang":"en"}}}}\n```';
    const result = parseToolCall(response);
    expect(result).not.toBeNull();
    expect(result!.input.query).toEqual({ text: 'hello', filters: { lang: 'en' } });
  });

  it('handles empty input object', () => {
    const response = '```tool\n{"name":"noop","input":{}}\n```';
    const result = parseToolCall(response);
    expect(result).toEqual({ name: 'noop', input: {} });
  });

  it('handles tool block with extra whitespace', () => {
    const response = '```tool  \n  {"name":"test","input":{"a":1}}  \n```';
    const result = parseToolCall(response);
    expect(result).toEqual({ name: 'test', input: { a: 1 } });
  });

  it('returns null for empty tool block', () => {
    const response = '```tool\n\n```';
    expect(parseToolCall(response)).toBeNull();
  });

  it('uses the last tool call when multiple blocks exist', () => {
    // A model often documents the format with an example before issuing the
    // real call, so the final block is the current intent.
    const response = '```tool\n{"name":"first","input":{"x":1}}\n```\n\n```tool\n{"name":"second","input":{"y":2}}\n```';
    const result = parseToolCall(response);
    expect(result!.name).toBe('second');
  });

  it('parses a CRLF tool header', () => {
    const response = '```tool\r\n{"name":"read_file","input":{"path":"src/index.ts"}}\r\n```';
    expect(parseToolCall(response)).toEqual({ name: 'read_file', input: { path: 'src/index.ts' } });
  });

  it('parses the tool_call fence alias', () => {
    const response = '```tool_call\n{"name":"read_file","input":{"path":"src/index.ts"}}\n```';
    expect(parseToolCall(response)).toEqual({ name: 'read_file', input: { path: 'src/index.ts' } });
  });

  it('recovers a tool call truncated by the token limit', () => {
    // Without this the raw JSON was shown to the user as the QA deliverable.
    const response = '```tool\n{"name":"read_file","input":{"path":"src/very/long/path/to/a/file.ts"';
    expect(parseToolCall(response)).toEqual({
      name: 'read_file',
      input: { path: 'src/very/long/path/to/a/file.ts' },
    });
  });

  it('name must be a string (not number)', () => {
    const response = '```tool\n{"name":123,"input":{}}\n```';
    expect(parseToolCall(response)).toBeNull();
  });

  it('returns null for an empty input array', () => {
    expect(parseToolCall('[]')).toBeNull();
  });
});
