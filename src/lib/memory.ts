/**
 * Structured memory management for QA knowledge base
 * @module memory
 * @author ssrjkk
 */

import type { StructuredMemory, MemoryEntry, MemoryCategory } from '../types/memory';
import { PROTOTYPE_POLLUTION_KEYS, ErrorCode } from './constants';
import { ErrorService } from './errorService';

function safeObjectEntries(obj: Record<string, unknown>): [string, unknown][] {
  return Object.entries(obj).filter(([k]) => !PROTOTYPE_POLLUTION_KEYS.has(k));
}

interface CategoryConfig {
  category: MemoryCategory;
  type: 'array' | 'record' | 'keyed_array';
  entryKey: string;
  confidence: number;
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
  { category: 'tech_stack', type: 'keyed_array', entryKey: '', confidence: 0.8 },
  { category: 'test_requirements', type: 'array', entryKey: 'requirement', confidence: 0.7 },
  { category: 'edge_cases', type: 'array', entryKey: 'edge_case', confidence: 0.6 },
  { category: 'bug_patterns', type: 'array', entryKey: 'bug', confidence: 0.8 },
  { category: 'conventions', type: 'record', entryKey: '', confidence: 0.7 },
  { category: 'api_endpoints', type: 'array', entryKey: 'endpoint', confidence: 0.9 },
  { category: 'user_flows', type: 'array', entryKey: 'flow', confidence: 0.7 },
  { category: 'custom', type: 'record', entryKey: '', confidence: 0.6 },
];

/** Known memory categories, exported so import paths can validate before persisting. */
export const MEMORY_CATEGORIES: readonly MemoryCategory[] = CATEGORY_CONFIGS.map(c => c.category);

export function isMemoryCategory(value: unknown): value is MemoryCategory {
  return typeof value === 'string' && CATEGORY_CONFIGS.some(c => c.category === value);
}

/**
 * Returns `null` for an unknown category instead of throwing. Rows reach this
 * function straight from SQLite (and from import/share payloads), and the
 * caller runs inside `useMemo` — a throw there unmounts the whole app via the
 * root error boundary and the bad row stays in IndexedDB, so the app stays
 * bricked until the user clears storage by hand.
 */
function findConfig(category: string): CategoryConfig | null {
  return CATEGORY_CONFIGS.find(c => c.category === category) ?? null;
}

function emptyMemory(): StructuredMemory {
  return {
    tech_stack: {},
    test_requirements: [],
    edge_cases: [],
    bug_patterns: [],
    conventions: {},
    api_endpoints: [],
    user_flows: [],
    custom: {},
  };
}

/**
 * Models routinely emit a bare string where a list is expected
 * (`tech_stack: { react: "18.2" }`). Dropping it lost the value on a
 * round-trip through import/export, so coerce instead.
 */
function coerceArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  return [];
}

function validateStructuredMemory(raw: Record<string, unknown>): StructuredMemory {
  const result = emptyMemory();

  if (raw.tech_stack && typeof raw.tech_stack === 'object' && raw.tech_stack !== null) {
    result.tech_stack = Object.fromEntries(
      safeObjectEntries(raw.tech_stack as Record<string, unknown>).map(([k, v]) => [k, coerceArray(v)]),
    );
  }

  if (raw.conventions && typeof raw.conventions === 'object' && raw.conventions !== null) {
    result.conventions = Object.fromEntries(
      safeObjectEntries(raw.conventions as Record<string, unknown>).map(([k, v]) => [k, String(v)])
    );
  }

  if (raw.custom && typeof raw.custom === 'object' && raw.custom !== null) {
    result.custom = Object.fromEntries(
      safeObjectEntries(raw.custom as Record<string, unknown>).map(([k, v]) => [k, String(v)])
    );
  }

  for (const key of ['test_requirements', 'edge_cases', 'bug_patterns', 'api_endpoints', 'user_flows'] as const) {
    if (Array.isArray(raw[key])) {
      (result[key] as string[]) = (raw[key] as unknown[]).map(String);
    }
  }

  return result;
}

export function parseMemoryExtraction(response: string): Partial<StructuredMemory> {
  try {
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object') return {};
    return validateStructuredMemory(parsed);
  } catch (err) {
    ErrorService.reportAsync(ErrorCode.EXPORT, err instanceof Error ? err : new Error(String(err)), { operation: 'parseMemoryExtraction' });
    return {};
  }
}

export function memoryToEntries(
  projectId: number,
  memory: Partial<StructuredMemory>,
  taskId?: number,
): Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>[] {
  const entries: Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>[] = [];

  for (const cfg of CATEGORY_CONFIGS) {
    const raw = memory[cfg.category];
    if (!raw) continue;

    if (cfg.type === 'array' && Array.isArray(raw)) {
      for (const item of raw) {
        entries.push({
          project_id: projectId,
          category: cfg.category,
          key: cfg.entryKey,
          value: item,
          confidence: cfg.confidence,
          source_task_id: taskId,
        });
      }
    } else if (cfg.type === 'keyed_array' && typeof raw === 'object' && raw !== null) {
      for (const [k, items] of Object.entries(raw)) {
        if (Array.isArray(items)) {
          for (const item of items) {
            entries.push({
              project_id: projectId,
              category: cfg.category,
              key: k,
              value: item,
              confidence: cfg.confidence,
              source_task_id: taskId,
            });
          }
        }
      }
    } else if (cfg.type === 'record' && typeof raw === 'object' && raw !== null) {
      for (const [k, v] of Object.entries(raw)) {
        entries.push({
          project_id: projectId,
          category: cfg.category,
          key: k,
          value: String(v),
          confidence: cfg.confidence,
          source_task_id: taskId,
        });
      }
    }
  }

  return entries;
}

export function entriesToMemory(entries: MemoryEntry[]): StructuredMemory {
  const memory = emptyMemory();

  for (const entry of entries) {
    const cfg = findConfig(entry.category);
    // Unknown categories are skipped, never fatal.
    if (!cfg) continue;
    if (PROTOTYPE_POLLUTION_KEYS.has(entry.key)) continue;
    switch (cfg.type) {
      case 'keyed_array': {
        const bucket = memory[cfg.category] as Record<string, string[]>;
        (bucket[entry.key] ??= []).push(entry.value);
        break;
      }
      case 'record':
        (memory[cfg.category] as Record<string, string>)[entry.key] = entry.value;
        break;
      case 'array':
        (memory[cfg.category] as string[]).push(entry.value);
        break;
    }
  }

  return memory;
}

export function getMemorySummary(memory: StructuredMemory): string {
  const parts: string[] = [];

  const techCount = Object.values(memory.tech_stack).flat().length;
  if (techCount > 0) parts.push(`${techCount} tech items`);
  if (memory.test_requirements.length > 0) parts.push(`${memory.test_requirements.length} requirements`);
  if (memory.edge_cases.length > 0) parts.push(`${memory.edge_cases.length} edge cases`);
  if (memory.bug_patterns.length > 0) parts.push(`${memory.bug_patterns.length} bug patterns`);
  if (memory.api_endpoints.length > 0) parts.push(`${memory.api_endpoints.length} APIs`);

  return parts.join(' • ') || 'No structured memory yet';
}

export function mergeMemories(existing: StructuredMemory, newMemory: Partial<StructuredMemory>): StructuredMemory {
  const merged = emptyMemory();
  Object.assign(merged, {
    tech_stack: { ...existing.tech_stack },
    test_requirements: [...existing.test_requirements],
    edge_cases: [...existing.edge_cases],
    bug_patterns: [...existing.bug_patterns],
    conventions: { ...existing.conventions },
    api_endpoints: [...existing.api_endpoints],
    user_flows: [...existing.user_flows],
    custom: { ...existing.custom },
  });

  for (const cfg of CATEGORY_CONFIGS) {
    const raw = newMemory[cfg.category];
    if (!raw) continue;

    if (cfg.type === 'keyed_array' && typeof raw === 'object' && raw !== null) {
      const bucket = merged[cfg.category] as Record<string, string[]>;
      const incoming = raw as Record<string, unknown>;
      for (const [k, items] of Object.entries(incoming)) {
        if (!Array.isArray(items)) continue;
        // Rename to avoid shadowing the `existing` parameter.
        const current = bucket[k] ?? [];
        const mergedArr = [...current];
        for (const item of items) {
          const s = String(item);
          if (!mergedArr.includes(s)) mergedArr.push(s);
        }
        bucket[k] = mergedArr;
      }
    } else if (cfg.type === 'record' && typeof raw === 'object' && raw !== null) {
      const target = merged[cfg.category] as Record<string, unknown>;
      for (const [k, v] of safeObjectEntries(raw as Record<string, unknown>)) {
        target[k] = v;
      }
    } else if (cfg.type === 'array' && Array.isArray(raw)) {
      const bucket = merged[cfg.category] as string[];
      for (const item of raw) {
        const s = String(item);
        if (!bucket.includes(s)) bucket.push(s);
      }
    }
  }

  return merged;
}

export function filterMemoryByConfidence(entries: MemoryEntry[], minConfidence: number): MemoryEntry[] {
  return entries.filter(entry => entry.confidence >= minConfidence);
}

export function filterMemoryByCategory(entries: MemoryEntry[], categories: string[]): MemoryEntry[] {
  return entries.filter(entry => categories.includes(entry.category));
}

export function searchMemory(entries: MemoryEntry[], searchTerm: string): MemoryEntry[] {
  if (!searchTerm) return [];
  const term = searchTerm.toLowerCase();
  return entries.filter(entry =>
    entry.key.toLowerCase().includes(term) ||
    entry.value.toLowerCase().includes(term) ||
    entry.category.toLowerCase().includes(term),
  );
}

export function exportMemoryToJson(memory: StructuredMemory): string {
  return JSON.stringify(memory, null, 2);
}

export function importMemoryFromJson(json: string): StructuredMemory | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    return validateStructuredMemory(parsed);
  } catch (err) {
    ErrorService.reportAsync(ErrorCode.CLOUD_IMPORT, err instanceof Error ? err : new Error(String(err)), { operation: 'importMemoryFromJson' });
    return null;
  }
}
