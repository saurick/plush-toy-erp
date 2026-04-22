import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthGuard from '@/common/auth/AuthGuard'
import { AUTH_SCOPE, getCurrentUser } from '@/common/auth/auth'
import AdminUsersPage from '@/pages/AdminUsers'
import AdminLoginPage from '@/pages/AdminLogin'
import LoginPage from '@/pages/Login'
import RegisterPage from '@/pages/Register'
import ERPLayout from './components/ERPLayout.jsx'
import { businessModuleDefinitions } from './config/businessModules.mjs'
import BusinessModulePage from './pages/BusinessModulePage'
import ChangeLogPage from './pages/ChangeLogPage'
import DashboardPage from './pages/DashboardPage'
import DocumentationPage from './pages/DocumentationPage'
import OperationFlowPage from './pages/OperationFlowPage'
import PrintCenterPage from './pages/PrintCenterPage'
import PrintTemplatePreviewPage from './pages/PrintTemplatePreviewPage'
import PrintWorkspacePage from './pages/PrintWorkspacePage.jsx'
import PermissionCenterPage from './pages/PermissionCenterPage'

function DesktopEntryRedirect() {
  return <Navigate to="/erp/dashboard" replace />
}

function RootEntryRedirect() {
  const admin = getCurrentUser(AUTH_SCOPE.ADMIN)
  return <Navigate to={admin ? '/erp/dashboard' : '/admin-login'} replace />
}

export default function ERPRouter() {
  return (
    <Routes>
      <Route path="/" element={<RootEntryRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/admin-login" element={<AdminLoginPage />} />

      <Route
        path="/admin-accounts"
        element={
          <AuthGuard requireAdmin>
            <AdminUsersPage />
          </AuthGuard>
        }
      />
      <Route
        path="/admin-users"
        element={<Navigate to="/admin-accounts" replace />}
      />

      <Route
        path="/admin-menu"
        element={<Navigate to="/erp/dashboard" replace />}
      />
      <Route
        path="/admin-guide"
        element={<Navigate to="/erp/docs/operation-guide" replace />}
      />
      <Route
        path="/dashboard"
        element={<Navigate to="/erp/dashboard" replace />}
      />

      <Route
        path="/erp"
        element={
          <AuthGuard requireAdmin>
            <ERPLayout />
          </AuthGuard>
        }
      >
        <Route index element={<DesktopEntryRedirect />} />
        <Route path="dashboard" element={<DashboardPage />} />
        {businessModuleDefinitions.map((moduleItem) => (
          <Route
            key={moduleItem.key}
            path={moduleItem.route}
            element={<BusinessModulePage moduleItem={moduleItem} />}
          />
        ))}
        <Route
          path="docs/operation-flow-overview"
          element={<OperationFlowPage />}
        />
        <Route
          path="flows/overview"
          element={<Navigate to="/erp/docs/operation-flow-overview" replace />}
        />
        <Route
          path="help-center"
          element={<Navigate to="/erp/docs/operation-flow-overview" replace />}
        />
        <Route path="print-center" element={<PrintCenterPage />} />
        <Route
          path="print-center/:templateKey"
          element={<PrintTemplatePreviewPage />}
        />
        <Route path="system/permissions" element={<PermissionCenterPage />} />
        <Route
          path="mobile-workbenches"
          element={<Navigate to="/erp/docs/operation-guide" replace />}
        />
        <Route
          path="roles/:roleKey"
          element={<Navigate to="/erp/dashboard" replace />}
        />
        <Route
          path="source-readiness"
          element={<Navigate to="/erp/docs/field-linkage-guide" replace />}
        />
        <Route path="docs/:docKey" element={<DocumentationPage />} />
        <Route path="changes/current" element={<ChangeLogPage />} />
      </Route>

      <Route
        path="/erp/print-workspace/:templateKey"
        element={
          <AuthGuard requireAdmin>
            <PrintWorkspacePage />
          </AuthGuard>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
