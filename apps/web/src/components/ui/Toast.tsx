import React, { useCallback, useMemo, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

const toneClass: Record<ToastTone, string> = {
  info: 'border-white/15 bg-white/10 text-white',
  success: 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100',
  error: 'border-red-400/40 bg-red-500/20 text-red-100'
};

const makeToastId = () => `toast_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

export const useToasts = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const pushToast = useCallback((message: string, tone: ToastTone = 'info', ttlMs = 3200) => {
    const text = String(message || '').trim();
    if (!text) return;
    const id = makeToastId();
    setItems(prev => [...prev, { id, message: text, tone }]);
    window.setTimeout(() => {
      setItems(prev => prev.filter(item => item.id !== id));
    }, Math.max(1200, ttlMs));
  }, []);

  return useMemo(() => ({
    toasts: items,
    pushToast,
    dismissToast
  }), [dismissToast, items, pushToast]);
};

export const ToastStack = ({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) => {
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex justify-center px-3">
      <div className="flex w-full max-w-md flex-col gap-2">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onDismiss(item.id)}
            className={`pointer-events-auto w-full rounded-xl border px-4 py-3 text-left text-sm shadow-xl backdrop-blur ${toneClass[item.tone]}`}
          >
            {item.message}
          </button>
        ))}
      </div>
    </div>
  );
};
