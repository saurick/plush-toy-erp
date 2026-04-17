// web/src/App.jsx
import React, { Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { Loading } from '@/common/components/loading'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import AuthGuard from '@/common/auth/AuthGuard'
import HomePage from '@/pages/Home'
import { authBus } from '@/common/auth/authBus'
import { appAlert } from '@/common/components/modal/alertBridge'
import AdminUsersPage from '@/pages/AdminUsers'
import AdminLoginPage from '@/pages/AdminLogin'
import AdminMenuPage from '@/pages/AdminMenu'
import AdminGuidePage from '@/pages/AdminGuide/index.jsx'

import 'normalize.css/normalize.css'

// const Index = lazy(() => import('@/pages'))

const App = () => {
  const navigate = useNavigate()
  const appTitle = import.meta.env.VITE_APP_TITLE || 'Plush Toy ERP'

  useEffect(() => {
    return authBus.onUnauthorized(({ from, message, loginPath }) => {
      // 如果 payload 没带，就 fallback 为当前 location
      const safeFrom = from || {
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      }
      const targetLoginPath = loginPath || '/login'

      appAlert({
        title: '登录状态已失效',
        message: message || '登录已过期，请重新登录',
        confirmText: '重新登录',
        onConfirm: () => {
          navigate(targetLoginPath, {
            replace: true,
            state: { from: safeFrom },
          })
        },
      })
    })
  }, [navigate])

  return (
    <>
      <Helmet>
        <title>{appTitle}</title>
      </Helmet>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* <Route path="*" element={<Index />} />  // 匹配所有路径，显示Index组件 */}
          {/* <Route path="/about" element={<About />} />  // 匹配/about路径，显示About组件 */}
          <Route path="/login" element={<Login />} />
          <Route path="/admin-login" element={<AdminLoginPage />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/admin-menu"
            element={
              <AuthGuard requireAdmin>
                <AdminMenuPage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin-accounts"
            element={
              <AuthGuard requireAdmin>
                <AdminUsersPage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin-guide"
            element={
              <AuthGuard requireAdmin>
                <AdminGuidePage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin-users"
            element={<Navigate to="/admin-accounts" replace />}
          />
          <Route
            path="/admin-hierarchy"
            element={<Navigate to="/admin-guide" replace />}
          />
          <Route path="/" element={<HomePage />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App
