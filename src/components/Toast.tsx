'use client';

import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { AlertTriangle, CheckCircle, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
    return useContext(ToastContext);
}

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
                {toasts.map(toast => (
                    <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
    useEffect(() => {
        const timer = setTimeout(() => onRemove(toast.id), 4000);
        return () => clearTimeout(timer);
    }, [toast.id, onRemove]);

    const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'error' ? AlertTriangle : Info;
    const colors = toast.type === 'success'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : toast.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-blue-50 border-blue-200 text-blue-800';
    const iconColor = toast.type === 'success' ? 'text-emerald-500' : toast.type === 'error' ? 'text-red-500' : 'text-blue-500';

    return (
        <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg animate-slide-in', colors)}>
            <Icon size={16} className={iconColor} />
            <span className="text-sm font-medium flex-1">{toast.message}</span>
            <button onClick={() => onRemove(toast.id)} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
            </button>
        </div>
    );
}
