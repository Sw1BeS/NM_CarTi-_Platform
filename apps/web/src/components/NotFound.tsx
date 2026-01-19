
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Home } from 'lucide-react';

export const NotFound = () => {
    const navigate = useNavigate();
    return (
        <div className="h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500">
            <AlertTriangle size={64} className="text-gray-300 mb-4" />
            <h1 className="text-4xl font-bold text-gray-900">404</h1>
            <p className="mb-8">Page not found</p>
            <button onClick={() => navigate('/')} className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700">
                <Home size={18} /> Go Dashboard
            </button>
        </div>
    );
};
