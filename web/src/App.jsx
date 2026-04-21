// web/src/App.jsx
import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { authBus } from '@/common/auth/authBus'
import { appAlert } from '@/common/components/modal/alertBridge'
import ERPRouter from '@/erp/router'
import MobileRoleRouter from '@/erp/mobile/router'
import {
  ERPWorkspaceProvider,
  useERPWorkspace,
} from '@/erp/context/ERPWorkspaceProvider'

import 'normalize.css/normalize.css'

function AppContent() {
  const navigate = useNavigate()
  const { appConfig, isDesktopApp } = useERPWorkspace()
  const appTitle =
    appConfig.title || import.meta.env.VITE_APP_TITLE || 'Plush Toy ERP'

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
      {isDesktopApp ? <ERPRouter /> : <MobileRoleRouter />}
    </>
  )
}

const App = () => (
  <ERPWorkspaceProvider>
    <AppContent />
  </ERPWorkspaceProvider>
)

export default App
