/**
 * Screenshot upload and analysis component
 * @module ScreenshotUploader
 * @author ssrjkk
 */

import { useState, useRef, useEffect } from 'react';
import { GlassCard, RippleButton, AutoResizeTextarea } from '../ui';
import { SECURITY_CONFIG } from '../../config';
import { t } from '../../lib/i18n';

interface ScreenshotUploaderProps {
  context: string;
  onContextChange: (value: string) => void;
  maxContextLength: number;
  onError: (error: string | null) => void;
  error: string | null;
  onScreenshotChange: (base64: string | null) => void;
}

export function ScreenshotUploader({
  context,
  onContextChange,
  maxContextLength,
  onError,
  error,
  onScreenshotChange,
}: ScreenshotUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    return () => { unmountedRef.current = true; };
  }, []);

  const compressImage = (dataUrl: string, maxWidth: number = 1920, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (unmountedRef.current) { resolve(dataUrl); return; }
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      onError(t('screenshot.notImage'));
      return;
    }
    
    const maxSize = SECURITY_CONFIG.maxScreenshotSize;
    if (file.size > maxSize) {
      const size = (file.size / 1024 / 1024).toFixed(1);
      onError(t('screenshot.tooLarge', { size }));
      return;
    }
    
    onError(null);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (unmountedRef.current) return;
      const fileResult = e.target?.result;
      if (typeof fileResult !== 'string') return;
      let processed = fileResult;
      
      if (file.size > 500 * 1024) {
        processed = await compressImage(fileResult);
      }
      
      if (unmountedRef.current) return;
      const b64 = processed.split(',')[1] ?? '';
      setPreview(processed);
      onScreenshotChange(b64);
    };
    reader.onerror = () => {
      if (!unmountedRef.current) {
        onError(t('screenshot.readFailed'));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearScreenshot = () => {
    setPreview(null);
    onError(null);
    onScreenshotChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const borderColor = isDragging ? "#6366f1" : error ? "#ef4444" : "rgba(255,255,255,0.1)";
  const backgroundColor = isDragging ? "rgba(99, 102, 241, 0.1)" : "rgba(255,255,255,0.02)";

  return (
    <GlassCard className="p-6">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{t('screenshot.title')}</h3>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200"
        style={{ borderColor, backgroundColor }}
        role="button"
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
        aria-label={t('screenshot.uploadLabel')}
      >
        {preview ? (
          <div className="relative inline-block">
            <img
              src={preview}
              alt={t('screenshot.previewAlt')}
              className="max-h-64 rounded-xl mx-auto"
            />
            <button
              onClick={clearScreenshot}
              className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-200 hover:scale-110 active:scale-90"
              aria-label={t('screenshot.remove')}
            >
              ×
            </button>
          </div>
        ) : (
          <div className="py-8">
            <div className="text-5xl mb-3">🖼️</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('screenshot.dragDrop')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              className="hidden"
            />
            <RippleButton
              onClick={() => fileInputRef.current?.click()}
              variant="secondary"
              className="!mt-4"
            >
              {t('screenshot.browse')}
            </RippleButton>
          </div>
        )}
      </div>
      
      {error && (
        <p
          className="text-red-400 text-xs mt-2 animate-fadeIn"
          role="alert"
        >
          ⚠️ {error}
        </p>
      )}
      
      <div className="mt-4">
        <AutoResizeTextarea
          value={context}
          onChange={e => onContextChange(e.target.value)}
          placeholder={t('screenshot.contextPlaceholder')}
          maxLength={maxContextLength}
        />
      </div>
    </GlassCard>
  );
}
