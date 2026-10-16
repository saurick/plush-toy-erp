import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { App as AntdApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import 'antd/dist/reset.css'
import '../tailwind.css'
import '../erp/styles/app.css'
import { AppAlertProvider } from '@/common/components/modal/AppAlertProvider'
import AntdAppBridge from '@/common/components/AntdAppBridge'
import { ERPThemeProvider, useERPTheme } from '@/common/theme/erpTheme'
import { getERPSurfaceTokens } from '@/common/theme/erpThemePalette.mjs'
import { MESSAGE_CONFIG, NOTIFICATION_CONFIG } from '@/common/utils/feedbackConfig.mjs'
import DevWorkbenchRoutes from './DevWorkbenchRoutes.jsx'

function StandaloneWorkbenchTheme() {
  const { isDark, accent } = useERPTheme()
  return (
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          ...getERPSurfaceTokens(isDark),
          colorPrimary: isDark ? accent.dark : accent.primary,
          fontSize: 14,
          fontSizeSM: 14,
          controlHeight: 34,
          controlHeightSM: 28,
          borderRadius: 8,
        },
      }}
    >
      <AntdApp message={MESSAGE_CONFIG} notification={NOTIFICATION_CONFIG}>
        <AntdAppBridge />
        <DevWorkbenchRoutes />
      </AntdApp>
    </ConfigProvider>
  )
}

function StandaloneWorkbench() {
  return (
    <ERPThemeProvider>
      <StandaloneWorkbenchTheme />
    </ERPThemeProvider>
  )
}

// API expiry follows the same server session as navigation and static assets.
const originalFetch = window.fetch.bind(window)
window.fetch = async (...args) => {
  const response = await originalFetch(...args)
  if (response.status === 401 && response.headers.get('x-plush-workbench-auth') === 'required') {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
    window.location.assign(`/__dev/login?returnTo=${encodeURIComponent(returnTo)}`)
  }
  return response
}

const router = createBrowserRouter([
  { path: '/__dev/*', element: <StandaloneWorkbench /> },
  { path: '*', element: <Navigate to="/__dev" replace /> },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <HelmetProvider>
    <AppAlertProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AppAlertProvider>
  </HelmetProvider>
)
