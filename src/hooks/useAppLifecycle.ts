/**
 * App lifecycle hook — initializes global services
 * @module useAppLifecycle
 * @author ssrjkk
 */

import { useEffect } from 'react';
import { KeyboardShortcuts } from '../lib/keyboardShortcuts';
import { telemetry } from '../lib/telemetry';
import { tabLock } from '../lib/tabLock';

export function useAppLifecycle() {
  useEffect(() => {
    // Initialize global services
    KeyboardShortcuts.init();
    telemetry.start();
    tabLock.init();

    // Record app launch
    telemetry.record('app_launch', {
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });

    return () => {
      KeyboardShortcuts.destroy();
      telemetry.stop();
      tabLock.destroy();
    };
  }, []);

  // Register default keyboard shortcuts
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // Ctrl+K: Command palette (handled by parent)
    unsubs.push(
      KeyboardShortcuts.register({
        key: 'k',
        ctrl: true,
        handler: () => {
          // Dispatch custom event for CommandPalette
          window.dispatchEvent(new CustomEvent('toggle-command-palette'));
        },
        description: 'Open command palette',
        category: 'Navigation',
      }),
    );

    // Ctrl+/: Show keyboard shortcuts
    unsubs.push(
      KeyboardShortcuts.register({
        key: '/',
        ctrl: true,
        handler: () => {
          window.dispatchEvent(new CustomEvent('toggle-shortcuts-help'));
        },
        description: 'Show keyboard shortcuts',
        category: 'Help',
      }),
    );

    // Escape: Close modals
    unsubs.push(
      KeyboardShortcuts.register({
        key: 'Escape',
        handler: () => {
          window.dispatchEvent(new CustomEvent('close-all-modals'));
        },
        description: 'Close all modals',
        category: 'Navigation',
      }),
    );

    // Ctrl+Shift+R: Reset task
    unsubs.push(
      KeyboardShortcuts.register({
        key: 'r',
        ctrl: true,
        shift: true,
        handler: () => {
          window.dispatchEvent(new CustomEvent('reset-task'));
        },
        description: 'Reset current task',
        category: 'Task',
      }),
    );

    // Ctrl+E: Execute
    unsubs.push(
      KeyboardShortcuts.register({
        key: 'e',
        ctrl: true,
        handler: () => {
          window.dispatchEvent(new CustomEvent('execute-task'));
        },
        description: 'Execute current task',
        category: 'Task',
      }),
    );

    // Ctrl+Shift+C: Copy output. Deliberately not plain Ctrl+C so the native
    // copy of a text selection is never hijacked.
    unsubs.push(
      KeyboardShortcuts.register({
        key: 'c',
        ctrl: true,
        shift: true,
        handler: () => {
          window.dispatchEvent(new CustomEvent('copy-output'));
        },
        description: 'Copy output to clipboard',
        category: 'Task',
      }),
    );

    // Ctrl+Z: Undo (handled by textarea natively)
    // Ctrl+Shift+Z: Redo (handled by textarea natively)

    return () => unsubs.forEach(u => u());
  }, []);
}
