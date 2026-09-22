/**
 * Error boundary with crash reporting
 * @module ErrorBoundary
 * @author ssrjkk
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { ErrorCode } from '../../lib/constants';
import { ErrorService } from '../../lib/errorService';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

interface CrashReport {
  id: string;
  message: string;
  stack?: string;
  componentStack: string;
  timestamp: number;
  url: string;
  userAgent: string;
}

const CRASH_DB_NAME = 'drafter-crashes';
const CRASH_STORE_NAME = 'crash-reports';
const DB_VERSION = 1;

function generateCrashId(): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
  return `crash_${id}`;
}

async function pruneOldCrashReports(db: IDBDatabase): Promise<void> {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const tx = db.transaction(CRASH_STORE_NAME, 'readwrite');
  const store = tx.objectStore(CRASH_STORE_NAME);
  const index = store.index('timestamp');
  const range = IDBKeyRange.upperBound(thirtyDaysAgo);
  const request = index.openCursor(range);
  request.onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
}

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

async function persistCrashReport(report: CrashReport): Promise<void> {
  if (!hasIndexedDB()) return;
  try {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CRASH_DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(CRASH_STORE_NAME)) {
          const store = db.createObjectStore(CRASH_STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const tx = db.transaction(CRASH_STORE_NAME, 'readwrite');
        tx.objectStore(CRASH_STORE_NAME).put(report);
        tx.oncomplete = () => {
          pruneOldCrashReports(db).catch((e) => {
            ErrorService.reportAsync(ErrorCode.STORAGE_SAVE, e);
          }).finally(() => { db.close(); resolve(); });
        };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };

      request.onerror = () => reject(request.error);
    });
  } catch {
    // IndexedDB unavailable (e.g. Firefox private mode)
  }
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, errorId: generateCrashId() };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    const report: CrashReport = {
      id: this.state.errorId || generateCrashId(),
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack || '',
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    persistCrashReport(report).catch(() => {
      // IndexedDB unavailable — crash report lost, but app continues
    });

    ErrorService.report('REACT_CRASH', error.message, {
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
    }, false);

    this.props.onError?.(error, errorInfo);
  }

  resetError(): void {
    this.setState({ hasError: false, error: null, errorId: null });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Something went wrong</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2 max-w-md text-center">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          {this.state.errorId && (
            <p className="text-gray-400 dark:text-gray-500 text-xs mb-4 font-mono">
              Error ID: {this.state.errorId}
            </p>
          )}
          <button
            onClick={() => this.resetError()}
            className="px-4 py-2 bg-red-100 dark:bg-red-500/20 border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors"
            aria-label="Try again"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
