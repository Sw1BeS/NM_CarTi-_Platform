
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { RequestList } from './pages/Requests';
import { TelegramHub } from './pages/TelegramHub';
import { InboxPage } from './pages/Inbox';
import { Leads } from './pages/Leads';
import { Login } from './pages/Login';
import { SearchPage } from './pages/Search';
import { SettingsPage } from './pages/Settings';
import { InventoryPage } from './pages/Inventory';
// import { HealthPage } from './pages/Health';  // Disabled: needs refactoring for Stage C
import { CompaniesPage } from './pages/Companies';
import { EntitiesPage } from './pages/Entities';
import { PublicRequest } from './pages/PublicRequest';
import { DealerPortal } from './pages/DealerPortal';
import { ClientProposal } from './pages/ClientProposal';
import { MiniApp } from './pages/MiniApp';
import { ContentPage } from './pages/Content';
import { ContentCalendarPage } from './pages/ContentCalendar';
import { CompanySettingsPage } from './pages/CompanySettings';
import { MarketplacePage } from './pages/Marketplace';
import { IntegrationsPage } from './pages/Integrations';
import { NotFound } from './components/NotFound';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CompanyProvider } from './contexts/CompanyContext';
import { LangProvider } from './contexts/LanguageContext';
import { WorkerProvider } from './contexts/WorkerContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';

const ProtectedRoute = ({ children }: React.PropsWithChildren) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return <Layout user={user} onLogout={() => window.location.reload()}>{children}</Layout>;
};

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AuthProvider>
          <CompanyProvider>
            <ToastProvider>
              <WorkerProvider>
                <HashRouter>
                  <Routes>
                    {/* Public Routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/p/request" element={<PublicRequest />} />
                    <Route path="/p/app" element={<MiniApp />} />
                    <Route path="/p/dealer" element={<DealerPortal />} />
                    <Route path="/p/proposal/:id" element={<ClientProposal />} />

                    {/* Protected Routes */}
                    <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                    <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
                    <Route path="/requests" element={<ProtectedRoute><RequestList /></ProtectedRoute>} />
                    <Route path="/telegram" element={<ProtectedRoute><TelegramHub /></ProtectedRoute>} />
                    <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
                    <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
                    <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
                    <Route path="/companies" element={<ProtectedRoute><CompaniesPage /></ProtectedRoute>} />
                    <Route path="/entities" element={<ProtectedRoute><EntitiesPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="/content" element={<ProtectedRoute><ContentPage /></ProtectedRoute>} />
                    <Route path="/calendar" element={<ProtectedRoute><ContentCalendarPage /></ProtectedRoute>} />
                    <Route path="/company" element={<ProtectedRoute><CompanySettingsPage /></ProtectedRoute>} />
                    <Route path="/marketplace" element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>} />
                    <Route path="/integrations" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
                    {/* <Route path="/health" element={<ProtectedRoute><HealthPage /></ProtectedRoute>} /> */}

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </HashRouter>
              </WorkerProvider>
            </ToastProvider>
          </CompanyProvider>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
