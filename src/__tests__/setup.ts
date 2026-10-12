import '@testing-library/jest-dom/vitest';

const storage = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => { storage.clear(); },
    key: (index: number) => Array.from(storage.keys())[index] || null,
    get length() { return storage.size; },
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'navigator', {
  value: {
    clipboard: {
      writeText: () => Promise.resolve(),
    },
    userAgent: 'test-agent',
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'matchMedia', {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
  writable: true,
  configurable: true,
});

Element.prototype.scrollIntoView ??= () => {};

beforeEach(() => {
  storage.clear();
});
