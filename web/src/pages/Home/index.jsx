import React from 'react'
import { Navigate } from 'react-router-dom'
import { AUTH_SCOPE, getCurrentUser } from '@/common/auth/auth'

export default function HomePage() {
  const admin = getCurrentUser(AUTH_SCOPE.ADMIN)
  return <Navigate to={admin ? '/erp/dashboard' : '/admin-login'} replace />
}
