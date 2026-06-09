// web/src/App.jsx
import React, { useEffect } from 'react'
import { App as AntdApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useLocation, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { authBus } from '@/common/auth/authBus'
import { appAlert } from '@/common/components/modal/alertBridge'
import AntdAppBridge from '@/common/components/AntdAppBridge'
import { applyERPFavicon } from '@/common/consts/favicon.mjs'
import ERPRouter from '@/erp/router'
import MobileRoleRouter from '@/erp/mobile/router'
import {
  ERPWorkspaceProvider,
  useERPWorkspace,
} from '@/erp/context/ERPWorkspaceProvider'
import { ERPThemeProvider, useERPTheme } from '@/common/theme/erpTheme'

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const { appConfig, isDesktopApp, isMobileExperience } = useERPWorkspace()
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

      if (isMobileExperience) {
        navigate(targetLoginPath, {
          replace: true,
          state: { from: safeFrom },
        })
        return
      }

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
  }, [isMobileExperience, navigate])

  useEffect(() => {
    applyERPFavicon(document, location.pathname, {
      fromPathname: location.state?.from?.pathname,
      isMobileExperience,
    })
  }, [isMobileExperience, location.pathname, location.state])

  return (
    <>
      <Helmet>
        <title>{appTitle}</title>
      </Helmet>
      {isDesktopApp ? <ERPRouter /> : <MobileRoleRouter />}
    </>
  )
}

function ThemedApp() {
  const { isDark } = useERPTheme()

  return (
    <ConfigProvider
      locale={zhCN}
      modal={{
        centered: true,
      }}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#60a5fa' : '#2b8a3e',
          colorInfo: isDark ? '#60a5fa' : '#2f8f4b',
          borderRadius: 10,
          fontFamily:
            '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
          colorBgLayout: isDark ? '#0f172a' : '#f4f8f3',
          colorBgContainer: isDark ? '#111827' : '#ffffff',
          colorBgElevated: isDark ? '#1b2538' : '#ffffff',
          colorBorder: isDark ? '#334155' : '#d9d9d9',
          colorText: isDark ? '#e5edf4' : 'rgba(0, 0, 0, 0.88)',
          colorTextSecondary: isDark ? '#94a3b8' : 'rgba(0, 0, 0, 0.65)',
        },
      }}
    >
      <AntdApp>
        <AntdAppBridge />
        <AppContent />
      </AntdApp>
    </ConfigProvider>
  )
}

const App = () => (
  <ERPWorkspaceProvider>
    <ERPThemeProvider>
      <ThemedApp />
    </ERPThemeProvider>
  </ERPWorkspaceProvider>
)

export default App
