/**
 * First-run onboarding wizard
 * @module Onboarding
 * @author ssrjkk
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { RippleButton } from '../ui';
import { STORAGE_KEYS } from '../../lib/constants';
import { t } from '../../lib/i18n';

const ONBOARDING_KEY = STORAGE_KEYS.onboarding;

interface OnboardingStep {
  icon: string;
  title: string;
  description: string;
}

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return false;
  }
}

function markOnboardingSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {
    // Storage unavailable — skip silently
  }
}

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const steps: OnboardingStep[] = [
    { icon: '🔑', title: t('onboarding.apiKeyTitle'), description: t('onboarding.apiKeyDescription') },
    { icon: '📋', title: t('onboarding.taskTitle'), description: t('onboarding.taskDescription') },
    { icon: '✏️', title: t('onboarding.contextTitle'), description: t('onboarding.contextDescription') },
    { icon: '🚀', title: t('onboarding.executeTitle'), description: t('onboarding.executeDescription') },
  ];

  const stepCount = steps.length;

  const handleSkip = useCallback(() => {
    markOnboardingSeen();
    onCompleteRef.current();
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStep(s => {
      if (s < stepCount - 1) {
        return s + 1;
      }
      markOnboardingSeen();
      onCompleteRef.current();
      return s;
    });
  }, [stepCount]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleSkip(); return; }
      if (e.key === 'Enter' || e.key === ' ') {
        const el = document.activeElement as HTMLElement | null;
        if (el?.tagName === 'BUTTON') return;
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleNext, handleSkip]);

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1);
    }
  };

  const isLast = currentStep === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      role="dialog" aria-modal="true" aria-label={t('onboarding.title')}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleSkip} role="presentation" />

      <div
        className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scaleIn"
      >
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={handleSkip}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            aria-label={t('onboarding.skipLabel')}
          >
            {t('onboarding.skip')} ✕
          </button>
        </div>

        <div className="p-8 pb-4">
          <div className="text-center mb-2">
            <h2 className="text-xl font-bold bg-gradient-to-r from-purple-800 via-purple-500 to-purple-600 dark:from-white dark:via-purple-200 dark:to-purple-400 bg-clip-text text-transparent">
              {t('onboarding.title')}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{t('onboarding.subtitle')}</p>
          </div>
        </div>

        <div className="px-8 pb-6 min-h-[200px]">
          <div
            key={currentStep}
            className="flex flex-col items-center text-center animate-fadeIn"
          >
            {(() => {
              const step = steps[currentStep];
              if (!step) return null;
              return (
                <>
                  <div className="text-5xl mb-4">{step.icon}</div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-w-xs">
                    {step.description}
                  </p>
                </>
              );
            })()}
          </div>
        </div>

        <div className="px-8 pb-6">
          <div className="flex items-center gap-2 mb-5 justify-center">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => { setCurrentStep(i); }}
                className={`w-2 h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                  i === currentStep
                    ? 'bg-purple-400 w-6'
                    : i < currentStep
                      ? 'bg-purple-400/40'
                      : 'bg-gray-300 dark:bg-white/10'
                }`}
                aria-label={t('onboarding.stepLabel', { step: String(i + 1) })}
              />
            ))}
          </div>

          <div className="flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-xl text-sm hover:bg-gray-100 dark:hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                {t('onboarding.back')}
              </button>
            )}
            <RippleButton
              onClick={handleNext}
              className={`flex-1 !py-2.5 !text-sm ${currentStep === 0 ? 'w-full' : ''}`}
            >
              {isLast ? t('onboarding.letsGo') : t('onboarding.next')}
            </RippleButton>
          </div>
        </div>
      </div>
    </div>
  );
}
