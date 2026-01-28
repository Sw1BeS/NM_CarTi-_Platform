
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SkeletonLoader } from './components/SkeletonLoader';

const Dashboard = React.lazy(() => import('./pages/app/Dashboard').then(m => ({ default: m.Dashboard })));
const RequestList = React.lazy(() => import('./pages/app/Requests').then(m => ({ default: m.RequestList })));
const TelegramHub = React.lazy(() => import('./pages/app/TelegramHub').then(m => ({ default: m.TelegramHub })));
const InboxPage = React.lazy(() => import('./pages/app/Inbox').then(m => ({ default: m.InboxPage })));
const ScenarioBuilder = React.lazy(() => import('./pages/app/ScenarioBuilder').then(m => ({ default: m.ScenarioBuilder })));
const AutomationBuilder = React.lazy(() => import('./pages/app/AutomationBuilder').then(m => ({ default: m.AutomationBuilder })));
const Leads = React.lazy(() => import('./pages/app/Leads').then(m => ({ default: m.Leads })));
const Login = React.lazy(() => import('./pages/public/Login').then(m => ({ default: m.Login })));
const SearchPage = React.lazy(() => import('./pages/app/Search').then(m => ({ default: m.SearchPage })));
const SettingsPage = React.lazy(() => import('./pages/app/Settings').then(m => ({ default: m.SettingsPage })));
const InventoryPage = React.lazy(() => import('./pages/app/Inventory').then(m => ({ default: m.InventoryPage })));
const HealthPage = React.lazy(() => import('./pages/app/Health').then(m => ({ default: m.HealthPage })));
const CompaniesPage = React.lazy(() => import('./pages/app/Companies').then(m => ({ default: m.CompaniesPage })));
const EntitiesPage = React.lazy(() => import('./pages/app/Entities').then(m => ({ default: m.EntitiesPage })));
const PublicRequest = React.lazy(() => import('./pages/public/PublicRequest').then(m => ({ default: m.PublicRequest })));
const DealerPortal = React.lazy(() => import('./pages/public/DealerPortal').then(m => ({ default: m.DealerPortal })));
const ClientProposal = React.lazy(() => import('./pages/public/ClientProposal').then(m => ({ default: m.ClientProposal })));
const MiniApp = React.lazy(() => import('./pages/public/MiniApp').then(m => ({ default: m.MiniApp })));
const ContentPage = React.lazy(() => import('./pages/app/Content').then(m => ({ default: m.ContentPage })));
const ContentCalendarPage = React.lazy(() => import('./pages/app/ContentCalendar').then(m => ({ default: m.ContentCalendarPage })));
const PartnersPage = React.lazy(() => import('./pages/app/Partners').then(m => ({ default: m.PartnersPage })));
const CompanySettingsPage = React.lazy(() => import('./pages/app/CompanySettings').then(m => ({ default: m.CompanySettingsPage })));
const IntegrationsPage = React.lazy(() => import('./pages/app/Integrations').then(m => ({ default: m.IntegrationsPage })));
const IntegrationsLayout = React.lazy(() => import('./pages/app/IntegrationsLayout').then(m => ({ default: m.IntegrationsLayout })));
const IntegrationEditor = React.lazy(() => import('./pages/app/IntegrationEditor').then(m => ({ default: m.IntegrationEditor })));
const QAStageA = React.lazy(() => import('./pages/app/QAStageA').then(m => ({ default: m.QAStageA })));
const SuperadminRoutes = React.lazy(() => import('./pages/superadmin/DashboardRoutes').then(m => ({ default: m.SuperadminRoutes })));
const NotFound = React.lazy(() => import('./components/NotFound').then(m => ({ default: m.NotFound })));
// Layout is already imported above

// ...

// In App component return:
// <Suspense fallback={<div className="flex h-screen items-center justify-center"><SkeletonLoader /></div>}>
// ...

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
                <BrowserRouter>
                  <React.Suspense fallback={<div className="flex h-screen items-center justify-center p-4"><SkeletonLoader /></div>}>
                    <Routes>
                      {/* Public Routes */}
                      <Route path="/login" element={<Login />} />
                      <Route path="/p/request" element={<PublicRequest />} />
                      <Route path="/p/app" element={<Navigate to="/p/app/system" replace />} />
                      <Route path="/p/app/:slug" element={<MiniApp />} />
                      <Route path="/p/dealer" element={<DealerPortal />} />
                      <Route path="/p/proposal/:id" element={<ClientProposal />} />

                      {/* Protected Routes */}
                      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                      <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
                      <Route path="/requests" element={<ProtectedRoute><RequestList /></ProtectedRoute>} />

                      <Route path="/telegram" element={<ProtectedRoute><TelegramHub /></ProtectedRoute>} />
                      <Route path="/scenarios" element={<ProtectedRoute><ScenarioBuilder /></ProtectedRoute>} />
                      {/* <Route path="/automations" element={<ProtectedRoute><AutomationBuilder /></ProtectedRoute>} /> */}
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
                  </React.Suspense>
                </BrowserRouter>
              </WorkerProvider>
            </ToastProvider>
          </CompanyProvider>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
