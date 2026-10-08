/**
 * General utility functions
 * @module utils
 * @author ssrjkk
 */

import { type AiProvider, PROVIDER_KEY_PATTERNS } from '../config/security';
import { PROTOTYPE_POLLUTION_KEYS } from './constants';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateApiKey(key: string, provider?: AiProvider): ValidationResult {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'API key required' };
  }
  const trimmed = key.trim();

  if (provider) {
    const pattern = PROVIDER_KEY_PATTERNS[provider];
    if (pattern.prefix && pattern.prefix.length > 0) {
      const matchesPrefix = pattern.prefix.some(p => trimmed.startsWith(p));
      if (!matchesPrefix) {
        return { valid: false, error: `Key must start with ${pattern.prefix[0]}` };
      }
    }
    if (trimmed.length < pattern.minLength) {
      return { valid: false, error: `Key too short (min ${pattern.minLength} chars)` };
    }
  } else {
    if (trimmed.length < 20) {
      return { valid: false, error: 'Too short' };
    }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'Invalid characters in API key' };
  }
  return { valid: true };
}

export function sanitizeInput(str: string | null | undefined, maxLength?: number): string {
  if (str === null || str === undefined) return "";
  const sanitized = String(str)
    .replace(/[<>'"&]/g, (char) => {
      const entities: Record<string, string> = {
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
        "&": "&amp;"
      };
      return entities[char] || char;
    })
    .trim();
  return maxLength ? sanitized.slice(0, maxLength) : sanitized;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 Bytes';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleDateString();
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts: number; delay: number; backoff?: boolean } = { maxAttempts: 3, delay: 1000 }
): Promise<T> {
  return new Promise((resolve, reject) => {
    const attempt = async (n: number): Promise<void> => {
      try {
        resolve(await fn());
      } catch (err) {
        if (n < options.maxAttempts) {
          const waitMs = options.backoff ? options.delay * n : options.delay;
          await new Promise(r => setTimeout(r, waitMs));
          return attempt(n + 1);
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    attempt(1);
  });
}

export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) return [array];
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  // Null-prototype object: a caller-supplied key of `toString`/`constructor`
  // otherwise shadows Object.prototype and breaks `Object.values(...)`.
  const result: Record<string, T[]> = Object.create(null) as Record<string, T[]>;
  for (const item of array) {
    const key = keyFn(item);
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) continue;
    (result[key] ??= []).push(item);
  }
  return result;
}

export function unique<T>(array: T[], keyFn?: (item: T) => unknown): T[] {
  if (!keyFn) return [...new Set(array)];
  const seen = new Set<unknown>();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  return structuredClone(obj);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateId(prefix?: string): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
  return prefix ? `${prefix}_${id}` : id;
}

export function parseQueryParams(url: string): Record<string, string> {
  try {
    // Null prototype so a `__proto__`/`constructor` query key cannot reach
    // Object.prototype.
    const params = Object.create(null) as Record<string, string>;
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((value, key) => {
      if (PROTOTYPE_POLLUTION_KEYS.has(key)) return;
      params[key] = value;
    });
    return params;
  } catch {
    return {};
  }
}

export function buildQueryParams(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.append(key, String(value));
    }
  });
  return searchParams.toString();
}

/**
 * Absolute HTTP(S) URL check. `new URL()` alone accepts `javascript:`,
 * `data:` and `file:`, which made this "validation" prove nothing — and the
 * cloud-sync credential was then sent to whatever host was entered.
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const SENSITIVE_PATTERNS = [
  /api[_-]?key[:\s=]+\S+/gi,
  /bearer\s+\S+/gi,
  /password[:\s=]+\S+/gi,
  /secret[:\s=]+\S+/gi,
  /token[:\s=]+\S+/gi,
];

export function sanitizeErrorForDisplay(message: string): string {
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      const eqIndex = match.search(/[:\s=]/);
      if (eqIndex === -1) return match.slice(0, 6) + '***';
      return match.slice(0, eqIndex + 1) + ' ***';
    });
  }
  if (sanitized.length > 200) {
    sanitized = sanitized.slice(0, 200) + '...';
  }
  return sanitized;
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseJSON<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    if (fallback === null) return parsed as T;
    if (parsed !== null && typeof parsed === typeof fallback) return parsed as T;
    return fallback;
  } catch {
    return fallback;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function randomInt(min: number, max: number): number {
  if (min > max) return min;
  const range = max - min + 1;
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return min + ((array[0] ?? 0) % range);
}

export function secureJitter(baseDelay: number, factor: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const normalized = (array[0] ?? 0) / 0xFFFFFFFF;
  return Math.round(baseDelay + baseDelay * factor * (2 * normalized - 1));
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result as Omit<T, K>;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
