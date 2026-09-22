/**
 * Structured memory viewer and editor
 * @module StructuredMemory
 * @author ssrjkk
 */

import { useState, useEffect, memo, useMemo } from 'react';
import { MEMORY_CATEGORIES, type MemoryCategory, type MemoryEntry } from '../../types/memory';
import { entriesToMemory, getMemorySummary } from '../../lib/memory';
import { GlassCard, Accordion, Input, Select } from '../ui';
import { t } from '../../lib/i18n';

interface StructuredMemoryProps {
  projectId: number;
  entries: MemoryEntry[];
  onAddEntry: (entry: Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>) => void;
  onDeleteEntry: (id: number) => void;
  onUpdateEntry: (id: number, updates: Partial<MemoryEntry>) => void;
  isLoading?: boolean;
}

export function StructuredMemory({ projectId, entries, onAddEntry, onDeleteEntry, onUpdateEntry }: StructuredMemoryProps) {
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const memory = useMemo(() => entriesToMemory(entries), [entries]);
  const summary = useMemo(() => getMemorySummary(memory), [memory]);

  const handleAddEntry = () => {
    if (!selectedCategory || !newValue.trim()) return;

    onAddEntry({
      project_id: projectId,
      category: selectedCategory,
      key: newKey.trim() || 'entry',
      value: newValue.trim(),
      confidence: 0.8,
    });

    setNewKey('');
    setNewValue('');
  };

  const filteredEntries = selectedCategory
    ? entries.filter(e => e.category === selectedCategory)
    : entries;

  const groupedEntries = useMemo(() => Object.fromEntries(
    MEMORY_CATEGORIES.map(cat => [cat.id, entries.filter(e => e.category === cat.id)])
  ) as Record<MemoryCategory, MemoryEntry[]>, [entries]);

  return (
    <Accordion
      icon="🧠"
      title={t('memory.title')}
      subtitle={summary}
      badge={entries.length > 0 ? entries.length : undefined}
    >
      <GlassCard className="p-4 space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('memory.filterLabel')}>
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
              !selectedCategory
                ? 'bg-indigo-500/30 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {t('memory.all')} ({entries.length})
          </button>
          {MEMORY_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                selectedCategory === cat.id
                  ? 'bg-indigo-500/30 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <span aria-hidden="true">{cat.icon}</span> {cat.label} ({groupedEntries[cat.id].length})
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {filteredEntries.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-4">
              {t('memory.empty')}
            </p>
          ) : (
            filteredEntries.map(entry => (
              <MemoryEntryItem
                key={entry.id}
                entry={entry}
                onDelete={() => onDeleteEntry(entry.id)}
                onUpdate={(updates) => onUpdateEntry(entry.id, updates)}
              />
            ))
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-white/10 pt-4">
          <p className="text-xs text-gray-500 mb-2">{t('memory.addEntry')}</p>
          <div className="flex flex-wrap gap-2">
            <Select
              value={selectedCategory || ''}
              onChange={e => {
                const val = e.target.value;
                if (MEMORY_CATEGORIES.some(c => c.id === val)) setSelectedCategory(val as MemoryCategory);
              }}
              aria-label={t('memory.category')}
            >
              <option value="">{t('memory.categoryPlaceholder')}</option>
              {MEMORY_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.label}
                </option>
              ))}
            </Select>
            <Input
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              placeholder={t('memory.key')}
              aria-label={t('memory.keyLabel')}
              className="flex-1 min-w-24"
            />
            <Input
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              placeholder={t('memory.value')}
              aria-label={t('memory.valueLabel')}
              className="flex-[2] min-w-32"
            />
            <button
              onClick={handleAddEntry}
              disabled={!selectedCategory || !newValue.trim()}
              className="px-4 py-2 bg-indigo-500/30 text-indigo-600 dark:text-indigo-300 rounded-lg text-sm hover:bg-indigo-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              {t('memory.add')}
            </button>
          </div>
        </div>
      </GlassCard>
    </Accordion>
  );
}

function MemoryEntryItemInner({
  entry,
  onDelete,
  onUpdate,
}: {
  entry: MemoryEntry;
  onDelete: () => void;
  onUpdate: (updates: Partial<MemoryEntry>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(entry.value);
  const category = MEMORY_CATEGORIES.find(c => c.id === entry.category);

  useEffect(() => {
    if (!isEditing) setEditValue(entry.value);
  }, [entry.value, isEditing]);

  const handleSave = () => {
    if (editValue.trim()) {
      onUpdate({ value: editValue.trim() });
    }
    setIsEditing(false);
  };

  return (
    <div
      className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-white/5 rounded-lg group"
    >
      <span className="text-sm mt-0.5" aria-hidden="true">{category?.icon}</span>
      <div className="flex-1 min-w-0">
        {entry.key !== 'entry' && entry.key !== category?.id && (
          <p className="text-xs text-indigo-600 dark:text-indigo-400">{entry.key}</p>
        )}
        {isEditing ? (
          <Input
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            aria-label={t('memory.editValue', { key: entry.key })}
            className="!px-2 !py-1 !bg-transparent !border-indigo-500/30"
            autoFocus
          />
        ) : (
          <p
            className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-white"
            onClick={() => setIsEditing(true)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setIsEditing(true)}
          >
            {entry.value}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-gray-400 dark:text-gray-600">
          {Math.round(entry.confidence * 100)}%
        </span>
        <button
          onClick={onDelete}
          className="p-1 text-gray-500 hover:text-red-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          aria-label={t('memory.deleteEntry')}
        >
          ×
        </button>
      </div>
    </div>
  );
}

const MemoryEntryItem = memo(MemoryEntryItemInner, (prev, next) =>
  prev.entry.id === next.entry.id &&
  prev.entry.value === next.entry.value &&
  prev.entry.confidence === next.entry.confidence &&
  prev.entry.category === next.entry.category,
);
