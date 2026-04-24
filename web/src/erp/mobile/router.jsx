import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthGuard from '@/common/auth/AuthGuard'
import AdminLoginPage from '@/pages/AdminLogin'
import MobileAppLayout from './MobileAppLayout'
import MobileRoleTasksPage from './pages/MobileRoleTasksPage'

export default function MobileRoleRouter() {
  return (
    <Routes>
      <Route
        path="/admin-login"
        element={<AdminLoginPage defaultRedirect="/" />}
      />
      <Route
        path="/"
        element={
          <AuthGuard requireAdmin>
            <MobileAppLayout />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/tasks" replace />} />
        <Route path="tasks" element={<MobileRoleTasksPage />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
      </Route>
    </Routes>
  )
}
