import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthGuard from '@/common/auth/AuthGuard'
import AdminUsersPage from '@/pages/AdminUsers'
import AdminLoginPage from '@/pages/AdminLogin'
import HomePage from '@/pages/Home'
import LoginPage from '@/pages/Login'
import RegisterPage from '@/pages/Register'
import ERPLayout from './components/ERPLayout'
import ChangeLogPage from './pages/ChangeLogPage'
import DashboardPage from './pages/DashboardPage'
import DocumentationPage from './pages/DocumentationPage'
import HelpCenterPage from './pages/HelpCenterPage'
import MobileWorkbenchesPage from './pages/MobileWorkbenchesPage'
import OperationFlowPage from './pages/OperationFlowPage'
import RoleWorkbenchPage from './pages/RoleWorkbenchPage'
import SourceReadinessPage from './pages/SourceReadinessPage'

export default function ERPRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
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
        element={<Navigate to="/erp/help-center" replace />}
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
        <Route index element={<Navigate to="/erp/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="flows/overview" element={<OperationFlowPage />} />
        <Route path="help-center" element={<HelpCenterPage />} />
        <Route path="mobile-workbenches" element={<MobileWorkbenchesPage />} />
        <Route path="roles/:roleKey" element={<RoleWorkbenchPage />} />
        <Route path="source-readiness" element={<SourceReadinessPage />} />
        <Route path="docs/:docKey" element={<DocumentationPage />} />
        <Route path="changes/current" element={<ChangeLogPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
