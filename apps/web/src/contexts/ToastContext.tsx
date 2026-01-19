import React, { createContext, useContext, useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({} as any);

export const ToastProvider = ({ children }: React.PropsWithChildren) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = (message: string, type: ToastType = 'success') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 3000);
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => (
                    <div 
                        key={t.id} 
                        className={`pointer-events-auto min-w-[300px] max-w-md p-4 rounded-lg shadow-lg border flex items-center gap-3 transform transition-all animate-slide-up ${
                            t.type === 'success' ? 'bg-white border-green-200 text-gray-800' : 
                            t.type === 'error' ? 'bg-white border-red-200 text-gray-800' : 'bg-white border-blue-200 text-gray-800'
                        }`}
                    >
                        <div className={`p-1 rounded-full ${
                            t.type === 'success' ? 'bg-green-100 text-green-600' : 
                            t.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                            {t.type === 'success' && <CheckCircle size={16} />}
                            {t.type === 'error' && <AlertCircle size={16} />}
                            {t.type === 'info' && <Info size={16} />}
                        </div>
                        <p className="flex-1 text-sm font-medium">{t.message}</p>
                        <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-600">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => useContext(ToastContext);