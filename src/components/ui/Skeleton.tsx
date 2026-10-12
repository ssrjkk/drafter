/**
 * Skeleton loading components
 * @module Skeleton
 * @author ssrjkk
 */

interface SkeletonProps {
  className?: string;
  count?: number;
}

export function Skeleton({ className = '', count = 1 }: SkeletonProps) {
  if (count > 1) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={`animate-pulse bg-gray-200 dark:bg-white/5 rounded-sm ${className}`} />
        ))}
      </div>
    );
  }
  return <div role="status" aria-label="Loading" className={`animate-pulse bg-gray-200 dark:bg-white/5 rounded-sm ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 space-y-3" role="status" aria-label="Loading card">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
