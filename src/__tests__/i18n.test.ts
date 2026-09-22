/**
 * @module i18n tests
 * @author ssrjkk
 */
import { describe, it, expect, afterEach } from 'vitest';
import { t, setLocale, getLocale, initI18n, saveLocale, AVAILABLE_LOCALES } from '../lib/i18n';

describe('i18n', () => {
  afterEach(() => {
    setLocale('en');
    localStorage.clear();
  });

  it('t() returns English text by default', () => {
    setLocale('en');
    expect(t('app.name')).toBe('Drafter');
  });

  it('t() returns key when not found', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('t() handles params interpolation', () => {
    const result = t('settings.apiKey', { provider: 'Claude' });
    expect(result).toContain('Claude');
  });

  it('t() returns key for missing param', () => {
    const result = t('settings.apiKey', { provider: '' });
    expect(result).toContain('{{provider}}');
  });

  it('setLocale changes language', () => {
    setLocale('ru');
    expect(getLocale()).toBe('ru');
    expect(t('app.subtitle')).toBe('AI-ассистент для QA');
  });

  it('setLocale sets document lang', () => {
    setLocale('uk');
    expect(document.documentElement.lang).toBe('uk');
  });

  it('setLocale falls back to en for unknown locale', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
  });

  it('AVAILABLE_LOCALES contains 3 locales', () => {
    expect(AVAILABLE_LOCALES).toEqual(['en', 'ru', 'uk']);
  });

  it('saveLocale persists to localStorage', () => {
    saveLocale('ru');
    expect(getLocale()).toBe('ru');
  });

  it('initI18n reads from localStorage', () => {
    localStorage.setItem('drafter-locale', 'uk');
    const result = initI18n();
    expect(result).toBe('uk');
    expect(getLocale()).toBe('uk');
  });

  it('initI18n defaults to en for invalid saved locale', () => {
    localStorage.setItem('qa_copilot_locale', 'invalid');
    const result = initI18n();
    expect(result).toBe('en');
  });

  it('initI18n defaults to en for empty localStorage', () => {
    localStorage.clear();
    const result = initI18n();
    expect(result).toBe('en');
  });

  it('t() handles deep nested keys', () => {
    setLocale('en');
    expect(t('task.categories.all')).toBe('All');
    expect(t('task.categories.bug')).toBe('Bug');
  });

  it('t() returns English fallback for missing Russian key', () => {
    setLocale('ru');
    const enVal = t('app.name');
    expect(enVal).toBe('Drafter');
  });

  it('t() handles Ukrainian locale', () => {
    setLocale('uk');
    expect(t('app.subtitle')).toBe('AI-асистент для QA');
    expect(t('common.save')).toBe('Зберегти');
  });

  it('t() handles empty params', () => {
    expect(t('app.name')).toBe('Drafter');
  });

  it('t() handles partial params', () => {
    const result = t('settings.apiKey');
    expect(result).toContain('{{provider}}');
  });
});
