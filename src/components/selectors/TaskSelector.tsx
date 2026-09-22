/**
 * Task type selector with search and categories
 * @module TaskSelector
 * @author ssrjkk
 */

import { useState, useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import { GlassCard } from '../ui';
import { TASK_TYPES, TASK_CATEGORIES, type TaskCategory, type TaskType } from '../../config';
import { t } from '../../lib/i18n';

interface TaskSelectorProps {
  selectedTask: string | null;
  onSelect: (taskId: string) => void;
}

const CATEGORY_ICONS: Record<TaskCategory, string> = {
  all: '🎯',
  generate: '⚡',
  analyze: '📊',
  review: '🔍',
  setup: '🔧',
};

export function TaskSelector({ selectedTask, onSelect }: TaskSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<TaskCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const categoryLabels: Record<TaskCategory, string> = {
    all: t('task.categories.all'),
    generate: t('task.categories.generate'),
    analyze: t('task.categories.analyze'),
    review: t('task.categories.review'),
    setup: t('task.categories.setup'),
  };

  const filteredTasks = useMemo(() => {
    return TASK_TYPES.filter((task) => {
      const matchesCategory = activeCategory === 'all' || task.category === activeCategory;
      const matchesSearch = searchQuery === '' || 
        task.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  return (
    <GlassCard className="p-4">
      <div className="space-y-3">
        <div className="relative">
          <input
            type="text"
            placeholder={t('task.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('task.searchLabel')}
            className="w-full px-4 py-2 pl-10 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm text-gray-800 dark:text-gray-200 placeholder-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 focus:border-indigo-500/50 focus:bg-gray-100 dark:focus:bg-white/10 transition-all"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              aria-label={t('task.clearSearch')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/5 rounded-lg overflow-x-auto">
          {TASK_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                activeCategory === category
                  ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/5'
              }`}
            >
              <span>{CATEGORY_ICONS[category]}</span>
              <span>{categoryLabels[category]}</span>
            </button>
          ))}
        </div>

        {filteredTasks.length === 0 ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400 text-sm">
          {t('task.noModules', { query: searchQuery })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isSelected={selectedTask === task.id}
                onClick={() => onSelect(task.id)}
              />
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

interface TaskCardProps {
  task: TaskType;
  isSelected: boolean;
  onClick: () => void;
}

function TaskCard({ task, isSelected, onClick }: TaskCardProps) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={t('task.selectTask', { label: task.label })}
      className={`relative p-3 rounded-lg cursor-pointer transition-all duration-200 ${
        isSelected 
          ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/50' 
          : 'bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10'
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center text-sm"
          style={{ backgroundColor: `${task.color}20` }}
        >
          {task.icon}
        </div>
        <span className="font-medium text-xs truncate">{task.label}</span>
      </div>
    </div>
  );
}
