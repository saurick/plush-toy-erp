// web/src/App.jsx
import React, { useEffect } from 'react'
import { App as AntdApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { authBus } from '@/common/auth/authBus'
import { appAlert } from '@/common/components/modal/alertBridge'
import AntdAppBridge from '@/common/components/AntdAppBridge'
import { getRuntimeAppDefinition } from '@/erp/config/appRegistry.mjs'
import ERPRouter from '@/erp/router'
import MobileRoleRouter from '@/erp/mobile/router'
import { ERPWorkspaceProvider } from '@/erp/context/ERPWorkspaceProvider'

function AppContent() {
  const navigate = useNavigate()
  const appConfig = getRuntimeAppDefinition()
  const isDesktopApp = appConfig.kind === 'desktop'
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
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#2f8f4b',
          borderRadius: 10,
          fontFamily:
            '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <AntdApp>
        <AntdAppBridge />
        <AppContent />
      </AntdApp>
    </ConfigProvider>
  </ERPWorkspaceProvider>
)

export default App
