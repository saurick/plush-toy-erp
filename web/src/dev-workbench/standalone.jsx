import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import 'antd/dist/reset.css'
import '../tailwind.css'
import '../erp/styles/app.css'
import { AppAlertProvider } from '@/common/components/modal/AppAlertProvider'
import AntdAppBridge from '@/common/components/AntdAppBridge'
import ScrollEdges from '@/common/components/scroll/ScrollEdges'
import { ERPThemeProvider, useERPTheme } from '@/common/theme/erpTheme'
import { WORKBENCH_APPEARANCE_STORAGE_KEY } from '@/common/theme/erpAppearance.mjs'
import { createERPAntdTheme } from '@/common/theme/erpAntdTheme.mjs'
import { MESSAGE_CONFIG, NOTIFICATION_CONFIG } from '@/common/utils/feedbackConfig.mjs'
import DevWorkbenchRoutes from './DevWorkbenchRoutes.jsx'
import { WorkbenchIdentity } from './components/WorkbenchIdentity.jsx'

function StandaloneWorkbenchTheme() {
  const { isDark, accent, appearance } = useERPTheme()
  return (
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={createERPAntdTheme({ isDark, accent, density: appearance.density, workbench: true })}
    >
      <AntdApp message={MESSAGE_CONFIG} notification={NOTIFICATION_CONFIG}>
        <AntdAppBridge />
        <ScrollEdges />
        <WorkbenchIdentity><DevWorkbenchRoutes /></WorkbenchIdentity>
      </AntdApp>
    </ConfigProvider>
  )
}

function StandaloneWorkbench() {
  return (
    <ERPThemeProvider browserStorageKey={WORKBENCH_APPEARANCE_STORAGE_KEY}>
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
