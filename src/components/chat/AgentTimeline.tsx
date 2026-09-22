/**
 * Agent execution timeline visualization
 * @module AgentTimeline
 * @author ssrjkk
 */

import { useState, useMemo, memo } from 'react';
import { Collapse } from '../ui/Transitions';
import { t } from '../../lib/i18n';
import type { AgentStep } from '../../data/agent/types';

interface AgentTimelineProps {
  steps: AgentStep[];
  isRunning: boolean;
}

const ToolIcon = memo(function ToolIcon({ name }: { name?: string }) {
  const icons: Record<string, string> = {
    list_directory: '📁',
    read_file: '📄',
    search_code: '🔍',
  };
  return <span>{icons[name || ''] || '🔧'}</span>;
});

function StepDetail({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = useState(false);

  if (step.type === 'thinking') {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <div className="w-3 h-3 border border-gray-400 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
        <span>{step.content}</span>
      </div>
    );
  }

  if (step.type === 'error') {
    return (
      <div className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-1 rounded">
        {step.content}
      </div>
    );
  }

  if (step.type === 'tool_call') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-300">
          <ToolIcon name={step.toolName} />
          <span className="font-medium">{step.toolName}</span>
          {step.toolInput && (
            <button
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-label={t('agent.toggleToolInput')}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              {expanded ? '▾' : '▸'}
            </button>
          )}
        </div>
        <Collapse show={expanded && !!step.toolInput}>
          <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded px-2 py-1 overflow-hidden font-mono">
            {JSON.stringify(step.toolInput, null, 2)}
          </pre>
        </Collapse>
      </div>
    );
  }

  if (step.type === 'tool_result') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-300">
          <span>✓</span>
          <span className="font-medium">{step.toolName}</span>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={t('agent.toggleToolOutput')}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {expanded ? '▾' : '▸'} {t('agent.output')}
          </button>
        </div>
        <Collapse show={expanded && !!step.toolOutput}>
          <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded px-2 py-1 overflow-x-auto max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">
            {step.toolOutput}
          </pre>
        </Collapse>
      </div>
    );
  }

  return null;
}

export const AgentTimeline = memo(function AgentTimeline({ steps, isRunning }: AgentTimelineProps) {
  const toolCalls = useMemo(() => steps.filter(s => s.type === 'tool_call'), [steps]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">{t('agent.steps')}</span>
          <span className="text-gray-400 dark:text-gray-600">•</span>
          <span>{t('agent.toolsUsed', { count: String(toolCalls.length) })}</span>
        </div>
        {isRunning && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            <span className="text-xs text-amber-400">{t('agent.running')}</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {steps.map((step) => (
          <div
            key={step.id}
            className="pl-3 border-l border-gray-200 dark:border-white/10 animate-fadeIn"
            style={{ animationDuration: '200ms' }}
          >
            <StepDetail step={step} />
          </div>
        ))}
      </div>

      {!isRunning && toolCalls.length > 0 && (
        <div className="text-xs text-gray-500 pt-1 border-t border-gray-200 dark:border-white/5">
          {(() => {
            const last = steps[steps.length - 1];
            const first = steps[0];
            const duration = last && first ? Math.round((last.timestamp - first.timestamp) / 1000) : 0;
            return t('agent.completed', { count: String(toolCalls.length), duration: String(duration) });
          })()}
        </div>
      )}
    </div>
  );
});
