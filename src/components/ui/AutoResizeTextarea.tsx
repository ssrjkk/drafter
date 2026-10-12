/**
 * Auto-resizing textarea component
 * @module AutoResizeTextarea
 * @author ssrjkk
 */

import { useRef, useEffect, useId } from 'react';

interface AutoResizeTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
  'aria-label'?: string;
}

export function AutoResizeTextarea({ 
  value, 
  onChange, 
  placeholder, 
  className = "", 
  maxLength,
  'aria-label': ariaLabel
}: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const generatedId = useId();
  const textareaId = ariaLabel ? undefined : generatedId;
  
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [value]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={textareaId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={ariaLabel}
        aria-describedby={maxLength ? `${generatedId}-count` : undefined}
        className={`w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 resize-none transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 focus:border-indigo-500/50 focus:bg-gray-100 dark:focus:bg-white/10 ${className}`}
        rows={3}
      />
      {maxLength && (
        <div id={`${generatedId}-count`} className="absolute bottom-2 right-2 text-xs text-gray-500" aria-live="polite">
          {value.length}/{maxLength}
        </div>
      )}
    </div>
  );
}
