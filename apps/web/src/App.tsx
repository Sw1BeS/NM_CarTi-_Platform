
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/app/Dashboard';
import { RequestList } from './pages/app/Requests';

import { TelegramHub } from './pages/app/TelegramHub';
import { InboxPage } from './pages/app/Inbox';
import { ScenarioBuilder } from './pages/app/ScenarioBuilder';
import { AutomationBuilder } from './pages/app/AutomationBuilder';

import { Leads } from './pages/app/Leads';
import { Login } from './pages/public/Login';
import { SearchPage } from './pages/app/Search';
import { SettingsPage } from './pages/app/Settings';
import { InventoryPage } from './pages/app/Inventory';
import { HealthPage } from './pages/app/Health';
import { CompaniesPage } from './pages/app/Companies';
import { EntitiesPage } from './pages/app/Entities';
import { PublicRequest } from './pages/public/PublicRequest';
import { DealerPortal } from './pages/public/DealerPortal';
import { ClientProposal } from './pages/public/ClientProposal';
import { MiniApp } from './pages/public/MiniApp';
import { ContentPage } from './pages/app/Content';
import { ContentCalendarPage } from './pages/app/ContentCalendar';
import { PartnersPage } from './pages/app/Partners';
import { CompanySettingsPage } from './pages/app/CompanySettings';
import { IntegrationsPage } from './pages/app/Integrations';
import { IntegrationsLayout } from './pages/app/IntegrationsLayout';
import { IntegrationEditor } from './pages/app/IntegrationEditor';
import { QAStageA } from './pages/app/QAStageA';
import { SuperadminRoutes } from './pages/superadmin/DashboardRoutes';
import { NotFound } from './components/NotFound';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CompanyProvider } from './contexts/CompanyContext';
import { LangProvider } from './contexts/LanguageContext';
import { WorkerProvider } from './contexts/WorkerContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './providers/ThemeProvider';
import { Data } from './services/data';

const ProtectedRoute = ({ children }: React.PropsWithChildren) => {
  const { user, logout } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return <Layout user={user} onLogout={logout}>{children}</Layout>;
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
                    <Route path="/scenarios" element={<ProtectedRoute><ScenarioBuilder /></ProtectedRoute>} />
                    <Route path="/automations" element={<ProtectedRoute><AutomationBuilder /></ProtectedRoute>} />
                    <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
                    <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
                    <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
                    <Route path="/companies" element={<ProtectedRoute><CompaniesPage /></ProtectedRoute>} />
                    <Route path="/entities" element={<ProtectedRoute><EntitiesPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="/content" element={<ProtectedRoute><ContentPage /></ProtectedRoute>} />
                    <Route path="/calendar" element={<ProtectedRoute><ContentCalendarPage /></ProtectedRoute>} />
                    <Route path="/partners" element={<ProtectedRoute><PartnersPage /></ProtectedRoute>} />
                    <Route path="/company" element={<ProtectedRoute><CompanySettingsPage /></ProtectedRoute>} />
                    <Route path="/integrations" element={<ProtectedRoute><IntegrationsLayout /></ProtectedRoute>}>
                      <Route index element={<IntegrationsPage />} />
                      <Route path=":type" element={<IntegrationEditor />} />
                    </Route>
                    <Route path="/qa" element={<ProtectedRoute><QAStageA /></ProtectedRoute>} />
                    <Route path="/health" element={<ProtectedRoute><HealthPage /></ProtectedRoute>} />
                    <Route path="/superadmin/*" element={<ProtectedRoute><SuperadminRoutes /></ProtectedRoute>} />

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
