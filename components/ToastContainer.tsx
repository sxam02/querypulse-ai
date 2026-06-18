// components/ToastContainer.tsx
'use client';

import React from 'react';
import { useAppContext } from '@/lib/stateContext';
import { CheckCircle2, AlertTriangle, Info, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ToastContainer() {
  const { toasts, removeToast } = useAppContext();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-md w-full px-4 sm:px-0">
      {toasts.map(toast => {
        const Icon = {
          success: CheckCircle2,
          error: AlertCircle,
          warning: AlertTriangle,
          info: Info,
        }[toast.type];

        const colors = {
          success: 'bg-emerald-950/80 border-emerald-500/30 text-emerald-200',
          error: 'bg-red-950/80 border-red-500/30 text-red-200',
          warning: 'bg-amber-950/80 border-amber-500/30 text-amber-200',
          info: 'bg-blue-950/80 border-blue-500/30 text-blue-200',
        }[toast.type];

        return (
          <div
            key={toast.id}
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-300',
              colors
            )}
          >
            <div className="mt-0.5 shrink-0">
              <Icon className="size-5" />
            </div>
            <div className="flex-1 text-sm font-medium leading-5">
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-0.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-current/60 hover:text-current"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
