import { useState, useEffect, useRef, useMemo } from 'react';
import { KeyboardShortcuts } from '../../lib/keyboardShortcuts';

interface Command {
  id: string;
  label: string;
  description?: string;
  category: string;
  action: () => void;
  icon?: string;
}

interface CommandPaletteProps {
  commands: Command[];
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ commands, open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      c => c.label.toLowerCase().includes(q) ||
           c.description?.toLowerCase().includes(q) ||
           c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const unsub = KeyboardShortcuts.register({
      key: 'Escape',
      handler: onClose,
      description: 'Close command palette',
      category: 'Navigation',
    });
    return unsub;
  }, [open, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
          onClose();
        }
        break;
      case 'Escape':
        onClose();
        break;
    }
  };

  useEffect(() => {
    const selected = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!open) return null;

  const categories = [...new Set(filtered.map(c => c.category))];
  const listboxId = 'cmd-palette-listbox';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} role="presentation" data-testid="command-palette-backdrop" />
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scaleIn" role="dialog" aria-label="Command palette" aria-modal="true">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-white/10">
          <span className="text-gray-400" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-activedescendant={filtered[selectedIndex] ? `cmd-${filtered[selectedIndex].id}` : undefined}
            className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
          />
          <kbd className="text-xs text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        <div ref={listRef} id={listboxId} role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              No commands found
            </div>
          ) : (
            categories.map(cat => (
              <div key={cat}>
                <div className="px-4 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider" role="presentation">
                  {cat}
                </div>
                {filtered
                  .filter(c => c.category === cat)
                  .map(cmd => {
                    const globalIdx = filtered.indexOf(cmd);
                    return (
                      <button
                        key={cmd.id}
                        id={`cmd-${cmd.id}`}
                        role="option"
                        aria-selected={globalIdx === selectedIndex}
                        onClick={() => { cmd.action(); onClose(); }}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          globalIdx === selectedIndex
                            ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                        }`}
                      >
                        {cmd.icon && <span className="text-lg" aria-hidden="true">{cmd.icon}</span>}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{cmd.label}</div>
                          {cmd.description && (
                            <div className="text-xs text-gray-500 truncate">{cmd.description}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}