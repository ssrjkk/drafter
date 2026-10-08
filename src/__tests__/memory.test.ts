import { describe, it, expect } from 'vitest';
import {
  parseMemoryExtraction,
  memoryToEntries,
  entriesToMemory,
  getMemorySummary,
  mergeMemories,
  filterMemoryByConfidence,
  filterMemoryByCategory,
  searchMemory,
  exportMemoryToJson,
  importMemoryFromJson,
} from '../lib/memory';
import type { StructuredMemory, MemoryEntry, MemoryCategory } from '../types/memory';

const emptyMemory: StructuredMemory = {
  tech_stack: {},
  test_requirements: [],
  edge_cases: [],
  bug_patterns: [],
  conventions: {},
  api_endpoints: [],
  user_flows: [],
  custom: {},
};

function makeEntry(partial: Partial<MemoryEntry> & { category: MemoryCategory }): MemoryEntry {
  return {
    id: 1,
    project_id: 1,
    key: 'k',
    value: 'v',
    confidence: 0.8,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('parseMemoryExtraction()', () => {
  it('parses valid JSON', () => {
    const input = JSON.stringify({ tech_stack: { react: ['hooks'] } });
    const result = parseMemoryExtraction(input);
    expect(result.tech_stack).toEqual({ react: ['hooks'] });
  });

  it('strips markdown code fences', () => {
    const input = '```json\n{"tech_stack": {"vue": ["components"]}}\n```';
    const result = parseMemoryExtraction(input);
    expect(result.tech_stack).toEqual({ vue: ['components'] });
  });

  it('returns empty object for invalid JSON', () => {
    expect(parseMemoryExtraction('not json at all')).toEqual({});
  });

  it('returns empty object for non-object JSON', () => {
    expect(parseMemoryExtraction('"just a string"')).toEqual({});
  });

  it('returns empty object for null JSON', () => {
    expect(parseMemoryExtraction('null')).toEqual({});
  });

  it('filters out __proto__ keys from records', () => {
    const input = JSON.stringify({ conventions: { normal: 'ok', __proto__: 'bad' } });
    const result = parseMemoryExtraction(input);
    expect(result.conventions).toEqual({ normal: 'ok' });
    expect(result.conventions).not.toHaveProperty('__proto__');
  });

  it('filters out constructor keys from records', () => {
    const input = JSON.stringify({ conventions: { constructor: 'bad', style: 'clean' } });
    const result = parseMemoryExtraction(input);
    expect(result.conventions).toEqual({ style: 'clean' });
  });

  it('validates array fields as string arrays', () => {
    const input = JSON.stringify({ edge_cases: [1, true, 'valid', null] });
    const result = parseMemoryExtraction(input);
    expect(result.edge_cases).toEqual(['1', 'true', 'valid', 'null']);
  });

  it('validates tech_stack values as string arrays', () => {
    const input = JSON.stringify({ tech_stack: { ts: ['strict', 42] } });
    const result = parseMemoryExtraction(input);
    expect(result.tech_stack?.ts).toEqual(['strict', '42']);
  });

  it('coerces a scalar tech_stack value into a single-element list', () => {
    // Models routinely emit `"react": "18.2"`; dropping it lost the value on
    // every import/export round-trip.
    const input = JSON.stringify({ tech_stack: { ts: 'not-an-array' } });
    const result = parseMemoryExtraction(input);
    expect(result.tech_stack?.ts).toEqual(['not-an-array']);
  });

  it('drops unusable tech_stack values', () => {
    const input = JSON.stringify({ tech_stack: { bad: { nested: true } } });
    const result = parseMemoryExtraction(input);
    expect(result.tech_stack?.bad).toEqual([]);
  });
});

describe('memoryToEntries()', () => {
  it('converts array categories to entries', () => {
    const mem: Partial<StructuredMemory> = {
      bug_patterns: ['login fails on Safari', 'form submit double-fires'],
    };
    const entries = memoryToEntries(1, mem, 42);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      project_id: 1,
      category: 'bug_patterns',
      key: 'bug',
      confidence: 0.8,
      source_task_id: 42,
    });
  });

  it('converts keyed_array categories to entries', () => {
    const mem: Partial<StructuredMemory> = {
      tech_stack: { react: ['hooks', 'ts'], vue: ['components'] },
    };
    const entries = memoryToEntries(1, mem);
    expect(entries).toHaveLength(3);
    expect(entries.filter(e => e.key === 'react')).toHaveLength(2);
    expect(entries.filter(e => e.key === 'vue')).toHaveLength(1);
  });

  it('converts record categories to entries', () => {
    const mem: Partial<StructuredMemory> = {
      conventions: { style: 'airbnb', lint: 'eslint' },
    };
    const entries = memoryToEntries(1, mem);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      project_id: 1,
      category: 'conventions',
      confidence: 0.7,
    });
  });

  it('omits taskId when not provided', () => {
    const mem: Partial<StructuredMemory> = { edge_cases: ['overflow'] };
    const entries = memoryToEntries(1, mem);
    expect(entries[0]!.source_task_id).toBeUndefined();
  });

  it('returns empty array for empty memory', () => {
    expect(memoryToEntries(1, {})).toEqual([]);
  });
});

describe('entriesToMemory()', () => {
  it('reconstructs structured memory from entries', () => {
    const entries = [
      makeEntry({ id: 1, project_id: 1, category: 'bug_patterns', key: 'bug', value: 'login fails', source_task_id: 1 }),
      makeEntry({ id: 2, project_id: 1, category: 'tech_stack', key: 'react', value: 'hooks', source_task_id: 1 }),
      makeEntry({ id: 3, project_id: 1, category: 'conventions', key: 'style', value: 'airbnb', source_task_id: 1 }),
    ];
    const memory = entriesToMemory(entries);
    expect(memory.bug_patterns).toEqual(['login fails']);
    expect(memory.tech_stack).toEqual({ react: ['hooks'] });
    expect(memory.conventions).toEqual({ style: 'airbnb' });
  });

  it('groups multiple keyed_array entries under the same key', () => {
    const entries = [
      makeEntry({ id: 1, category: 'tech_stack', key: 'ts', value: 'strict' }),
      makeEntry({ id: 2, category: 'tech_stack', key: 'ts', value: '4.9' }),
    ];
    const memory = entriesToMemory(entries);
    expect(memory.tech_stack.ts).toEqual(['strict', '4.9']);
  });

  it('returns empty memory for empty entries', () => {
    const memory = entriesToMemory([]);
    expect(memory).toEqual(emptyMemory);
  });
});

describe('getMemorySummary()', () => {
  it('summarizes non-empty memory', () => {
    const mem: StructuredMemory = {
      ...emptyMemory,
      tech_stack: { react: ['hooks'] },
      edge_cases: ['a', 'b'],
    };
    expect(getMemorySummary(mem)).toBe('1 tech items • 2 edge cases');
  });

  it('returns default text for empty memory', () => {
    expect(getMemorySummary(emptyMemory)).toBe('No structured memory yet');
  });

  it('counts all tech items across keys', () => {
    const mem: StructuredMemory = {
      ...emptyMemory,
      tech_stack: { react: ['a', 'b'], vue: ['c'] },
    };
    expect(getMemorySummary(mem)).toBe('3 tech items');
  });
});

describe('mergeMemories()', () => {
  it('merges array categories without duplicates', () => {
    const existing: StructuredMemory = { ...emptyMemory, edge_cases: ['a', 'b'] };
    const newMem: Partial<StructuredMemory> = { edge_cases: ['b', 'c'] };
    const merged = mergeMemories(existing, newMem);
    expect(merged.edge_cases).toEqual(['a', 'b', 'c']);
  });

  it('merges keyed_array categories with dedup', () => {
    const existing: StructuredMemory = { ...emptyMemory, tech_stack: { react: ['hooks'] } };
    const newMem: Partial<StructuredMemory> = { tech_stack: { react: ['hooks', 'ts'], vue: ['components'] } };
    const merged = mergeMemories(existing, newMem);
    expect(merged.tech_stack.react).toEqual(['hooks', 'ts']);
    expect(merged.tech_stack.vue).toEqual(['components']);
  });

  it('merges record categories (overwrites)', () => {
    const existing: StructuredMemory = { ...emptyMemory, conventions: { style: 'old' } };
    const newMem: Partial<StructuredMemory> = { conventions: { style: 'new', lint: 'strict' } };
    const merged = mergeMemories(existing, newMem);
    expect(merged.conventions).toEqual({ style: 'new', lint: 'strict' });
  });

  it('does not mutate original', () => {
    const existing: StructuredMemory = { ...emptyMemory, edge_cases: ['a'] };
    const newMem: Partial<StructuredMemory> = { edge_cases: ['b'] };
    mergeMemories(existing, newMem);
    expect(existing.edge_cases).toEqual(['a']);
  });
});

describe('filterMemoryByConfidence()', () => {
  const entries = [
    makeEntry({ id: 1, category: 'bug_patterns', confidence: 0.5 }),
    makeEntry({ id: 2, category: 'bug_patterns', confidence: 0.9 }),
    makeEntry({ id: 3, category: 'bug_patterns', confidence: 1.0 }),
  ];

  it('filters by minimum confidence', () => {
    expect(filterMemoryByConfidence(entries, 0.8)).toHaveLength(2);
  });

  it('includes exact match', () => {
    expect(filterMemoryByConfidence(entries, 0.5)).toHaveLength(3);
  });

  it('returns all when min is 0', () => {
    expect(filterMemoryByConfidence(entries, 0)).toHaveLength(3);
  });
});

describe('filterMemoryByCategory()', () => {
  const entries = [
    makeEntry({ id: 1, category: 'bug_patterns' }),
    makeEntry({ id: 2, category: 'feature' as MemoryCategory }),
    makeEntry({ id: 3, category: 'bug_patterns' }),
  ];

  it('filters by category list', () => {
    expect(filterMemoryByCategory(entries, ['bug_patterns'])).toHaveLength(2);
  });

  it('returns empty for non-matching categories', () => {
    expect(filterMemoryByCategory(entries, ['docs'])).toHaveLength(0);
  });
});

describe('searchMemory()', () => {
  const entries = [
    makeEntry({ category: 'bug_patterns', key: 'auth', value: 'Login fails on Safari' }),
    makeEntry({ id: 2, category: 'feature' as MemoryCategory, key: 'export', value: 'PDF export feature' }),
  ];

  it('searches case-insensitively in key, value, and category', () => {
    expect(searchMemory(entries, 'safari')).toHaveLength(1);
    expect(searchMemory(entries, 'AUTH')).toHaveLength(1);
    expect(searchMemory(entries, 'pdf')).toHaveLength(1);
    expect(searchMemory(entries, 'bug')).toHaveLength(1);
  });

  it('returns empty for no match', () => {
    expect(searchMemory(entries, 'nonexistent')).toHaveLength(0);
  });

  it('returns empty for empty search term', () => {
    expect(searchMemory(entries, '')).toHaveLength(0);
  });
});

describe('exportMemoryToJson() / importMemoryFromJson()', () => {
  it('round-trips correctly', () => {
    const mem: StructuredMemory = {
      ...emptyMemory,
      tech_stack: { react: ['hooks'] },
      edge_cases: ['overflow'],
    };
    const json = exportMemoryToJson(mem);
    const imported = importMemoryFromJson(json);
    expect(imported).toEqual(mem);
  });

  it('returns null for invalid JSON', () => {
    expect(importMemoryFromJson('bad')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(importMemoryFromJson('"string"')).toBeNull();
  });
});
