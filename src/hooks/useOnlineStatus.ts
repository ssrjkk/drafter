/**
 * Online/offline status hook
 * @module useOnlineStatus
 * @author ssrjkk
 */

import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  // Default to online when the property is absent (embedded webviews), so the
  // UI never shows a permanent "offline" banner on a working connection.
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' || navigator.onLine !== false,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
