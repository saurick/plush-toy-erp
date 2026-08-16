// web/src/index.jsx
import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import 'antd/dist/reset.css'
import './tailwind.css'
import './erp/styles/app.css'
import App from './App'
import { AppAlertProvider } from '@/common/components/modal/AppAlertProvider'
import { redirectToCanonicalLocalDevHost } from '@/common/theme/localDevThemeOrigin.mjs'

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}

// 只在开发环境 & 打开开关时启用 mock
const rpcMockEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_RPC_MOCK === 'true'

if (rpcMockEnabled) {
  const startMockServer = async () => {
    const { setupJsonRpcMockServer } = await import('./mocks/jsonRpcMockServer')
    setupJsonRpcMockServer()
  }
  startMockServer()
}

const redirectedLocalDevHost =
  import.meta.env.DEV && redirectToCanonicalLocalDevHost(window)

if (!redirectedLocalDevHost) {
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Root element #root not found')
  }

  const root = ReactDOM.createRoot(rootElement)

  const application = (
    <HelmetProvider>
      <Router basename={import.meta.env.BASE_URL} future={routerFutureFlags}>
        <AppAlertProvider>
          <App />
        </AppAlertProvider>
      </Router>
    </HelmetProvider>
  )

  // Mock/Style L1 保留 StrictMode 双挂载探针；真实后端不应承受演练性 RPC 双发。
  root.render(
    rpcMockEnabled ? <StrictMode>{application}</StrictMode> : application
  )
}
