/**
 * Application constants
 * @module constants
 * @author ssrjkk
 */

export const APP_NAME = 'Drafter';
export const APP_AUTHOR = 'ssrjkk';
export const APP_WEBSITE = 'https://ssrjkk.github.io/drafter/';
export const APP_REPOSITORY = 'https://github.com/ssrjkk/drafter';
export const APP_FOOTER = `${APP_NAME} by ${APP_AUTHOR} | MIT License`;
export const APP_HEADER_SUBTITLE = 'AI-Powered QA Assistant';
export const APP_HEADER_BYLINE = `by ${APP_AUTHOR}`;

export const STORAGE_KEYS = {
  onboarding: 'drafter-onboarding-seen',
  apiKey: 'drafter-api-key',
  salt: 'drafter-salt',
  rateLimit: 'drafter-rate-limit',
  legacyKey: 'drafter-legacy-key',
  theme: 'drafter-theme',
  locale: 'drafter-locale',
  metrics: 'drafter-metrics',
  dbBackup: 'drafter-sync-backup',
  dbUnsaved: 'drafter-unsaved',
  lsPassphrase: 'drafter-ls-key',
  syncStatus: 'drafter-sync-status',
  syncConfig: 'drafter-sync-config',
  syncBackup: 'drafter-sync-backup-data',
  attempts: 'drafter-attempts',
  backupIndex: 'drafter-backup-index',
  backupPrefix: 'drafter-backup-',
  migrated: 'drafter-migrated',
} as const;

/**
 * Pre-rename storage keys. Used once by `migrateLegacyStorage` so existing
 * installs keep their settings, API key and database after the rename.
 */
export const LEGACY_STORAGE_KEYS: Record<keyof typeof STORAGE_KEYS, string | null> = {
  onboarding: 'qa-copilot-onboarding-seen',
  apiKey: 'qa-api-key',
  salt: 'qa-helper-salt',
  rateLimit: 'qa-rate-limit',
  legacyKey: 'qa-helper-legacy-key',
  theme: 'qa-copilot-theme',
  locale: 'qa-copilot-locale',
  metrics: 'qa-metrics',
  dbBackup: 'qa-helper-sync-backup',
  dbUnsaved: 'qa-helper-unsaved',
  lsPassphrase: 'qa-helper-ls-key',
  syncStatus: 'qa-helper-sync-status',
  syncConfig: 'qa-helper-sync-config',
  syncBackup: 'qa-helper-sync-backup-data',
  attempts: 'qa-helper-attempts',
  backupIndex: 'qa-helper-backup-index',
  backupPrefix: 'qa-helper-backup-',
  migrated: null,
};

export const LIMITS = {
  maxSessions: 50,
  maxMemoryEntries: 200,
  debounceSaveMs: 500,
  debounceContextErrorMs: 300,
  pollIntervalMs: 2000,
  autoSaveIntervalMs: 1000,
  maxToolOutputChars: 2000,
  maxAgentContextMessages: 6,
  maxRetries: 3,
  toastDurationMs: 4000,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 30000,
  retryJitterFactor: 0.1,
  maxAgentSteps: 100,
  maxCacheEntries: 100,
  maxFileContentChars: 100_000,
  crashReportRetentionMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const ErrorCode = {
  DB_INIT: 'DB_INIT',
  DB_SAVE: 'DB_SAVE',
  DB_QUERY: 'DB_QUERY',
  DB_INSERT: 'DB_INSERT',
  DB_TRANSACTION: 'DB_TRANSACTION',
  STORAGE_LOAD: 'STORAGE_LOAD',
  STORAGE_SAVE: 'STORAGE_SAVE',
  STORAGE_CLEAR: 'STORAGE_CLEAR',
  ENCRYPT: 'ENCRYPT',
  DECRYPT: 'DECRYPT',
  KEY_MGR_INIT: 'KEY_MGR_INIT',
  KEY_MGR_PASSWORD: 'KEY_MGR_PASSWORD',
  KEY_MGR_CORRUPTED: 'KEY_MGR_CORRUPTED',
  CLOUD_SYNC: 'CLOUD_SYNC',
  CLOUD_CONFIG: 'CLOUD_CONFIG',
  CLOUD_IMPORT: 'CLOUD_IMPORT',
  EXPORT: 'EXPORT',
  API_REQUEST: 'API_REQUEST',
  API_KEY_INVALID: 'API_KEY_INVALID',
  AGENT_EXECUTION: 'AGENT_EXECUTION',
  REACT_CRASH: 'REACT_CRASH',
  METRICS_LOAD: 'METRICS_LOAD',
  METRICS_SAVE: 'METRICS_SAVE',
  RATE_LIMIT: 'RATE_LIMIT',
  AUTH: 'AUTH',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
