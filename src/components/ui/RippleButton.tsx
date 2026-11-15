/**
 * Button with ripple animation effect
 * @module RippleButton
 * @author ssrjkk
 */

import { useState, useRef, useEffect } from 'react';
import type { ReactNode, MouseEvent } from 'react';

interface RippleButtonProps {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  'aria-expanded'?: boolean;
  'aria-label'?: string;
}

export function RippleButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  className = "",
  type = "button",
  "aria-expanded": ariaExpanded,
  "aria-label": ariaLabel,
}: RippleButtonProps) {
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const handleClick = (e: React.MouseEvent<Element>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now() + Math.random();
    setRipples((prev) => [...prev, { x, y, id }]);
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 600);
    timersRef.current.set(id, timer);
    onClick?.(e as React.MouseEvent<HTMLButtonElement>);
  };

  const variants = {
    primary: "bg-teal-600 hover:bg-teal-500 text-white shadow-glass hover:shadow-glow",
    secondary: "bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-white/20 shadow-glass",
    danger: "bg-red-100 dark:bg-red-500/20 border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/30",
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled}
      aria-expanded={ariaExpanded}
      aria-label={ariaLabel}
      className={`relative overflow-hidden rounded-xl px-6 py-3 font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${variants[variant]} ${className}`}
    >
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="absolute bg-white/25 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 300,
            height: 300,
            animation: 'ripple 600ms ease-out forwards',
          }}
        />
      ))}
      {children}
    </button>
  );
}
