/**
 * Keyboard shortcuts help modal
 * @module KeyboardShortcutsModal
 * @author ssrjkk
 */

import { Modal } from '../ui';
import { t } from '../../lib/i18n';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  const shortcuts = [
    { keys: 'Ctrl+K', description: t('shortcuts.commandPalette') },
    { keys: 'Ctrl+/', description: t('shortcuts.showShortcuts') },
    { keys: 'Ctrl+Enter', description: t('shortcuts.executeTask') },
    { keys: 'Ctrl+E', description: t('shortcuts.executeTask') },
    { keys: 'Ctrl+Shift+R', description: t('shortcuts.resetTask') },
    { keys: 'Ctrl+Shift+C', description: t('shortcuts.copyOutput') },
    { keys: 'Ctrl+T', description: t('shortcuts.toggleTheme') },
    { keys: 'Ctrl+Shift+Z', description: t('shortcuts.redo') },
    { keys: 'Ctrl+Z', description: t('shortcuts.undo') },
    { keys: 'Esc', description: t('shortcuts.closeModal') },
  ];

  return (
    <Modal isOpen={true} onClose={onClose} title={t('shortcuts.title')}>
      <div className="space-y-3">
        {shortcuts.map(({ keys, description }) => (
          <div key={keys} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-white/10 last:border-0">
            <span className="text-sm text-gray-700 dark:text-gray-300">{description}</span>
            <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded text-gray-800 dark:text-gray-200">
              {keys}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
