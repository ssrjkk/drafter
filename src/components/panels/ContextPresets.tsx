/**
 * Context preset templates
 * @module ContextPresets
 * @author ssrjkk
 */

import { useState, useRef, useEffect, useMemo, memo } from 'react';
import type { KeyboardEvent } from 'react';
import { CONTEXT_PRESETS, searchPresets, type ContextPreset } from '../../config';
import { Input } from '../ui';
import { t } from '../../lib/i18n';

interface ContextPresetsProps {
  onSelect: (template: string) => void;
  currentContext: string;
}

export function ContextPresets({ onSelect, currentContext }: ContextPresetsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  const filteredPresets = useMemo(() => search ? searchPresets(search) : CONTEXT_PRESETS, [search]);

  const handleSelect = (preset: ContextPreset) => {
    const newContext = currentContext
      ? `${currentContext}\n\n---\n\n${preset.template}`
      : preset.template;
    onSelect(newContext);
    setIsOpen(false);
    setSearch('');
  };

  const categories = useMemo(() => [
    { id: 'e2e', label: t('presets.categoryE2e'), presets: filteredPresets.filter(p => p.tags.includes('e2e')) },
    { id: 'unit', label: t('presets.categoryUnit'), presets: filteredPresets.filter(p => p.tags.includes('unit')) },
    { id: 'api', label: t('presets.categoryApi'), presets: filteredPresets.filter(p => p.tags.includes('api')) },
    { id: 'mobile', label: t('presets.categoryMobile'), presets: filteredPresets.filter(p => p.tags.includes('mobile')) },
    { id: 'other', label: t('presets.categoryOther'), presets: filteredPresets.filter(p =>
      !p.tags.includes('e2e') && !p.tags.includes('unit') && !p.tags.includes('api') && !p.tags.includes('mobile')
    ) },
  ], [filteredPresets]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen); } }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 transition-all duration-200"
      >
        <span>⚡</span>
        <span>{t('presets.button')}</span>
        <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div
          onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); }}
          role="menu"
          className="absolute left-0 top-full mt-2 z-50 w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden animate-fadeIn"
        >
          <div className="p-3 border-b border-gray-200 dark:border-white/10">
            <Input
              placeholder={t('presets.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('presets.searchLabel')}
              autoFocus
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {filteredPresets.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">
                {t('presets.noResults')}
              </div>
            ) : (
              <div className="space-y-3">
                {categories.map(category => {
                  if (category.presets.length === 0) return null;
                  return (
                    <div key={category.id}>
                      <p className="text-xs text-gray-500 px-2 py-1">{category.label}</p>
                      {category.presets.map(preset => (
                        <PresetItem
                          key={preset.id}
                          preset={preset}
                          onSelect={() => handleSelect(preset)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PresetItem = memo(function PresetItem({ preset, onSelect }: { preset: ContextPreset; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      role="menuitem"
      aria-label={`${preset.name}: ${preset.description}`}
      className="w-full flex items-start gap-3 p-3 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
    >
      <span className="text-xl">{preset.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-800 dark:text-gray-200">{preset.name}</span>
          <div className="flex gap-1">
            {preset.tags.slice(0, 2).map(tag => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-white/5 rounded text-gray-500"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{preset.description}</p>
      </div>
    </button>
  );
}, (prev, next) => prev.preset.id === next.preset.id);
