import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Companies } from './Companies';
import { Users } from './Users';

export const SuperadminRoutes: React.FC = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="companies" />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/users" element={<Users />} />
            {/* Future: <Route path="/logs" element={<SystemLogs />} /> */}
        </Routes>
    );
};
