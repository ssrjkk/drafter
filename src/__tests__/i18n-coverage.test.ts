/* eslint-disable security/detect-non-literal-fs-filename -- this test
   deliberately walks the source tree to collect every t() key in use. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, setLocale, AVAILABLE_LOCALES } from '../lib/i18n';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('i18n key coverage', () => {
  it('every t() key used in the app resolves in every locale', () => {
    const used = new Set<string>();
    for (const file of walk('src')) {
      if (file.includes('__tests__')) continue;
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        const key = m[1];
        if (key) used.add(key);
      }
    }

    expect(used.size).toBeGreaterThan(100);

    const failures: string[] = [];
    for (const locale of AVAILABLE_LOCALES) {
      setLocale(locale);
      for (const key of used) {
        if (t(key) === key) failures.push(`${locale}: ${key}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
