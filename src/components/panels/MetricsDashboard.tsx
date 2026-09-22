/**
 * API metrics dashboard with polling
 * @module MetricsDashboard
 * @author ssrjkk
 */

import { memo, useState, useEffect, useMemo } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { metricsCollector } from '../../lib/metrics';
import { LIMITS } from '../../lib/constants';
import { t, getLocale } from '../../lib/i18n';

interface MetricsDashboardProps {
  onClose?: () => void;
}

export const MetricsDashboard = memo(function MetricsDashboard({ onClose }: MetricsDashboardProps) {
  const [metricsData, setMetricsData] = useState(() => ({
    metrics: metricsCollector.getMetrics(),
    successRate: metricsCollector.getSuccessRate(),
    topTasks: metricsCollector.getTopTaskTypes(5),
    last7Days: metricsCollector.getLast7DaysRequests(),
  }));

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      setMetricsData({
        metrics: metricsCollector.getMetrics(),
        successRate: metricsCollector.getSuccessRate(),
        topTasks: metricsCollector.getTopTaskTypes(5),
        last7Days: metricsCollector.getLast7DaysRequests(),
      });
    };
    const interval = setInterval(tick, LIMITS.pollIntervalMs);
    tick();
    return () => { active = false; clearInterval(interval); };
  }, []);

  const { metrics, successRate, topTasks, last7Days } = metricsData;
  const maxDayCount = useMemo(() => Math.max(...last7Days.map(d => d.count), 1), [last7Days]);

  return (
    <div
      className="space-y-6 animate-fadeIn"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">{t('metrics.title')}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => metricsCollector.reset()}
            className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg transition-colors text-gray-700 dark:text-gray-300"
          >
            {t('metrics.resetStats')}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg transition-colors text-gray-700 dark:text-gray-300"
            >
              {t('common.close')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="text-2xl font-bold text-gray-800 dark:text-white">{metrics.totalRequests}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('metrics.totalRequests')}</div>
        </GlassCard>
        
        <GlassCard className="p-4">
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{metrics.successfulRequests}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('metrics.successful')}</div>
        </GlassCard>
        
        <GlassCard className="p-4">
          <div className="text-2xl font-bold text-red-600 dark:text-rose-400">{metrics.failedRequests}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('metrics.failed')}</div>
        </GlassCard>
        
        <GlassCard className="p-4">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{successRate}%</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('metrics.successRate')}</div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <GlassCard className="p-4">
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{metrics.totalTokens.toLocaleString()}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('metrics.totalTokens')}</div>
        </GlassCard>
        
        <GlassCard className="p-4">
          <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{metrics.averageResponseTime}ms</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('metrics.avgResponseTime')}</div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('metrics.requestsLast7Days')}</h3>
        <div className="flex items-end gap-1 h-24">
          {last7Days.map((day, i) => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                <div
                  className="bg-gradient-to-t from-purple-500 to-indigo-500 rounded-t-sm min-h-[2px] animate-fadeIn"
                  style={{ height: `${(day.count / maxDayCount) * 100}%`, transition: `height 0.3s ease ${i * 0.05}s` }}
                />
              </div>
              <span className="text-[10px] text-gray-500">
                {new Date(day.date).toLocaleDateString(getLocale(), { weekday: 'short' })}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">{day.count}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {topTasks.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('metrics.topTaskTypes')}</h3>
          <div className="space-y-2">
            {topTasks.map((task, i) => (
              <div key={task.type} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-4">{i + 1}</span>
                <div className="flex-1 bg-gray-200 dark:bg-white/5 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 animate-fadeIn"
                    style={{ width: `${topTasks[0] ? (task.count / topTasks[0].count) * 100 : 0}%`, transition: `width 0.3s ease ${i * 0.1}s` }}
                  />
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-300 w-32 truncate">{task.type}</span>
                <span className="text-xs text-gray-500 w-8 text-right">{task.count}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
});
