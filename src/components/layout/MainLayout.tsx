/**
 * Main layout with sidebar
 * @module MainLayout
 * @author ssrjkk
 */

import type { ReactNode } from 'react';

interface MainLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
}

export function MainLayout({ sidebar, main }: MainLayoutProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <aside className="lg:col-span-3 space-y-4 animate-fadeIn" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
        {sidebar}
      </aside>

      <main id="main-content" tabIndex={-1} className="lg:col-span-9 space-y-6 animate-fadeIn" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
        {main}
      </main>
    </div>
  );
}
