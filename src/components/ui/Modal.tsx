/**
 * Accessible modal dialog with focus trap
 * @module Modal
 * @author ssrjkk
 */

import { useEffect, useRef, useId, useCallback } from 'react';
import { Transition } from './Transitions';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => {
    if (el.getAttribute('disabled') !== null) return false;
    if (el.offsetParent === null && !el.hasAttribute('tabindex')) return false;
    return true;
  });
}

export function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement;
      const raf = requestAnimationFrame(() => {
        contentRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key === 'Tab' && contentRef.current) {
      const focusable = getFocusableElements(contentRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    if (!isOpen) {
      previousFocus.current?.focus();
    }
  }, [isOpen]);

  return (
    <Transition
      show={isOpen}
      enter="transition-all duration-200 ease-out"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-all duration-150 ease-in"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <div
        data-testid="modal-backdrop"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          ref={contentRef}
          tabIndex={-1}
          className={`bg-white dark:bg-slate-800/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-6 shadow-glass-lg ${maxWidth} w-full outline-none animate-scaleIn`}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <h3 id={titleId} className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
            {title}
          </h3>
          {children}
        </div>
      </div>
    </Transition>
  );
}
