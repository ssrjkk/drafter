/* eslint-disable security/detect-non-literal-fs-filename -- this test
   deliberately walks the source tree to collect every t() key in use. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, setLocale, hasTranslation, messages, AVAILABLE_LOCALES, type Locale } from '../lib/i18n';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function collectUsedKeys(): Set<string> {
  const used = new Set<string>();
  for (const file of walk('src')) {
    if (file.includes('__tests__')) continue;
    const src = readFileSync(file, 'utf8');
    // Single, double and template-quoted keys.
    for (const m of src.matchAll(/\bt\(\s*['"`]([a-zA-Z0-9_.]+)['"`]/g)) {
      used.add(m[1]!);
    }
    // `t(\`section.key\`)` with a static template.
    for (const m of src.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]+)`/g)) {
      used.add(m[1]!);
    }
  }
  return used;
}

function flatten(value: unknown, prefix = '', out: string[] = []): string[] {
  if (typeof value !== 'object' || value === null) return out;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'object' && child !== null) flatten(child, path, out);
    else out.push(path);
  }
  return out;
}

describe('i18n key coverage', () => {
  it('every t() key used in the app resolves in every locale', () => {
    const used = collectUsedKeys();
    expect(used.size).toBeGreaterThan(100);

    const failures: string[] = [];
    for (const locale of AVAILABLE_LOCALES) {
      for (const key of used) {
        // `hasTranslation` rather than `t(key) !== key`: `t()` falls back to
        // English, so a missing ru/uk key silently rendered in English *and
        // passed the old assertion*.
        if (!hasTranslation(key, locale)) failures.push(`${locale}: ${key}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('English is the fallback and resolves every used key', () => {
    setLocale('ru');
    const used = collectUsedKeys();
    const failures = [...used].filter(key => t(key) === key);
    expect(failures).toEqual([]);
  });

  it('every locale defines the same keys', () => {
    const reference = flatten(messages.en).sort();
    const mismatches: string[] = [];

    for (const locale of AVAILABLE_LOCALES) {
      if (locale === 'en') continue;
      const defined = new Set(flatten(messages[locale as Locale]));
      for (const key of reference) {
        if (!defined.has(key)) mismatches.push(`missing in ${locale}: ${key}`);
      }
      for (const key of defined) {
        if (!reference.includes(key)) mismatches.push(`extra in ${locale}: ${key}`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
