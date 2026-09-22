/**
 * Master password unlock modal
 * @module MasterPasswordModal
 * @author ssrjkk
 */

import { useState, useEffect, useCallback } from 'react';
import { keyManager } from '../../lib/keyManagement';
import { AttemptsLimiter } from '../../lib/attemptsLimiter';
import { t } from '../../lib/i18n';

interface MasterPasswordModalProps {
  onSuccess: () => void;
}

export function MasterPasswordModal({ onSuccess }: MasterPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(AttemptsLimiter.isLocked());
  const [lockoutRemaining, setLockoutRemaining] = useState(AttemptsLimiter.getRemainingLockoutMs());
  const [attemptsLeft, setAttemptsLeft] = useState(AttemptsLimiter.getRemainingAttempts());

  useEffect(() => {
    keyManager.hasStoredSalt()
      .then(has => setIsNewUser(!has))
      .catch(() => {
        setIsNewUser(true);
      });
  }, []);

  useEffect(() => {
    if (!locked) return;
    const interval = setInterval(() => {
      const remaining = AttemptsLimiter.getRemainingLockoutMs();
      setLockoutRemaining(remaining);
      if (remaining <= 0) {
        setLocked(false);
        setAttemptsLeft(AttemptsLimiter.getRemainingAttempts());
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [locked]);

  const formatLockout = useCallback((ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;

    setError(null);
    setLoading(true);

    try {
      if (isNewUser && password !== confirmPassword) {
        throw new Error(t('masterPassword.passwordsMismatch'));
      }
      await keyManager.initialize(password);
      AttemptsLimiter.reset();
      onSuccess();
    } catch (err) {
      if (!isNewUser) {
        AttemptsLimiter.recordFailure();
        setAttemptsLeft(AttemptsLimiter.getRemainingAttempts());
        if (AttemptsLimiter.isLocked()) {
          setLocked(true);
          setLockoutRemaining(AttemptsLimiter.getRemainingLockoutMs());
        }
      }
      setError(err instanceof Error ? err.message : t('masterPassword.initFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (isNewUser === null) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="master-password-title">
      <div className="w-full max-w-md mx-4 p-6 bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl animate-scaleIn">
        <div className="text-center mb-6">
          <div className="text-3xl mb-3">🔐</div>
          <h2 id="master-password-title" className="text-xl font-bold text-gray-900 dark:text-white">
            {isNewUser ? t('masterPassword.createTitle') : t('masterPassword.enterTitle')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {isNewUser
              ? t('masterPassword.createDescription')
              : t('masterPassword.enterDescription')}
          </p>
        </div>

        {locked && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
            <p className="text-sm text-red-400 font-medium">{t('masterPassword.tooManyAttempts')}</p>
            <p className="text-xs text-red-400/70 mt-1">
              {t('masterPassword.tryAgainIn', { time: formatLockout(lockoutRemaining) })}
            </p>
          </div>
        )}

        {!isNewUser && !locked && attemptsLeft < AttemptsLimiter.getMaxAttempts() && (
          <div className="mb-4 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-center">
            <p className="text-xs text-amber-400">
              {attemptsLeft !== 1
                ? t('masterPassword.attemptsRemainingPlural', { count: String(attemptsLeft) })
                : t('masterPassword.attemptsRemaining', { count: String(attemptsLeft) })}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="master-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('masterPassword.passwordLabel')}
            </label>
            <input
              id="master-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('masterPassword.passwordPlaceholder')}
              autoFocus
              disabled={locked}
              aria-label={t('masterPassword.passwordAria')}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm text-gray-800 dark:text-gray-200 placeholder-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 focus:border-indigo-500/50 transition-all disabled:opacity-50"
            />
          </div>

          {isNewUser && (
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('masterPassword.confirmLabel')}
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('masterPassword.confirmPlaceholder')}
                aria-label={t('masterPassword.confirmAria')}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm text-gray-800 dark:text-gray-200 placeholder-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 focus:border-indigo-500/50 transition-all"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || password.length < 8 || locked}
            className="w-full px-4 py-2.5 bg-indigo-500/30 text-indigo-600 dark:text-indigo-300 rounded-lg text-sm font-medium hover:bg-indigo-500/50 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {loading ? t('masterPassword.initializing') : locked ? t('masterPassword.locked') : isNewUser ? t('masterPassword.createButton') : t('masterPassword.unlock')}
          </button>
        </form>
      </div>
    </div>
  );
}
