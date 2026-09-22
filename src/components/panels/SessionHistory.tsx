/**
 * Session history with virtualized list
 * @module SessionHistory
 * @author ssrjkk
 */

import { useState, useRef, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GlassCard } from '../ui';
import { TASK_TYPES } from '../../config';
import type { TaskType } from '../../config';
import type { Session } from '../../domain/entities/Session';
import { Collapse } from '../ui/Transitions';
import { t } from '../../lib/i18n';

interface SessionHistoryProps {
  sessions: Session[];
  onLoadSession: (session: Session) => void;
  onClearHistory?: () => void;
}

export const SessionHistory = memo(function SessionHistory({ sessions, onLoadSession, onClearHistory }: SessionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  const getTaskInfo = (taskTypeId: string): TaskType | undefined => {
    return TASK_TYPES.find(t => t.id === taskTypeId);
  };

  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t('history.justNow');
    if (diffMins < 60) return t('history.minutesAgo', { count: String(diffMins) });
    if (diffHours < 24) return t('history.hoursAgo', { count: String(diffHours) });
    if (diffDays < 7) return t('history.daysAgo', { count: String(diffDays) });
    return date.toLocaleDateString();
  };

  const truncate = (text: string, length: number): string => {
    if (text.length <= length) return text;
    return `${text.slice(0, length)}...`;
  };

  const filteredSessions = useMemo(() => sessions.filter(session => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      session.context.toLowerCase().includes(query) ||
      session.output.toLowerCase().includes(query) ||
      session.task_type.toLowerCase().includes(query)
    );
  }), [sessions, searchQuery]);

  const virtualizer = useVirtualizer({
    count: filteredSessions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const session = filteredSessions[index];
      if (!session) return 100;
      const lineCount = Math.max(
        Math.ceil(session.context.length / 80),
        Math.ceil(session.output.length / 80),
        2
      );
      return Math.min(lineCount * 20 + 80, 300);
    },
    overscan: 5,
  });

  if (sessions.length === 0) {
    return (
      <GlassCard className="p-6">
        <div className="text-center py-8">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">{t('history.emptyTitle')}</h3>
          <p className="text-sm text-gray-500">{t('history.emptyDescription')}</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <span>📜</span>
            <span>{t('history.title')}</span>
            <span className="text-xs text-gray-500">({filteredSessions.length})</span>
          </h3>
          <div className="flex items-center gap-2">
            {onClearHistory && (
              <button
                onClick={onClearHistory}
                aria-label={t('history.clearAllLabel')}
                className="px-2 py-1 text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                {t('history.clearAll')}
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder={t('history.searchPlaceholder')}
            aria-label={t('history.searchLabel')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm text-gray-800 dark:text-gray-200 placeholder-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 focus:border-indigo-500/50 transition-all"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        </div>

        <div 
          ref={parentRef}
          className="space-y-2 max-h-96 overflow-y-auto"
          style={{ contain: 'strict' }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const session = filteredSessions[virtualRow.index]!;
              const taskInfo = getTaskInfo(session.task_type);
              const sessionKey = `${virtualRow.index}-${session.created_at}`;
              const isExpanded = expandedId === sessionKey;

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden hover:border-gray-300 dark:hover:border-white/20 transition-colors">
                    <div
                      className="p-3 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedId(isExpanded ? null : sessionKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : sessionKey);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {taskInfo && (
                            <span
                              className="w-7 h-7 rounded-md flex items-center justify-center text-sm"
                              style={{ backgroundColor: `${taskInfo.color}20` }}
                            >
                              {taskInfo.icon}
                            </span>
                          )}
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {taskInfo?.label || session.task_type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {formatRelativeTime(session.created_at)}
                          </span>
                          <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {truncate(session.context, 100)}
                      </p>
                    </div>

                    <Collapse show={isExpanded}>
                      <div className="border-t border-gray-200 dark:border-white/5">
                        <div className="p-3 space-y-3">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">{t('history.context')}</p>
                            <p className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-white/5 rounded p-2 max-h-24 overflow-y-auto">
                              {session.context}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500 mb-1">{t('history.output')}</p>
                            <p className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-white/5 rounded p-2 max-h-32 overflow-y-auto">
                              {truncate(session.output, 500)}
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                onLoadSession(session);
                              }}
                              className="flex-1 px-3 py-2 bg-indigo-500/20 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 text-xs rounded-lg hover:bg-indigo-500/30 transition-colors"
                            >
                              {t('history.loadSession')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </Collapse>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredSessions.length === 0 && searchQuery && (
            <div className="text-center py-6 text-gray-500 text-sm">
              {t('history.noResults', { query: searchQuery })}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
});
