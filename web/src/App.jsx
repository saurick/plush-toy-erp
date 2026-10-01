// web/src/App.jsx
import React, { Suspense, useEffect } from 'react'
import { App as AntdApp, ConfigProvider, Empty, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { useLocation, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { authBus } from '@/common/auth/authBus'
import { appAlert } from '@/common/components/modal/alertBridge'
import AntdAppBridge from '@/common/components/AntdAppBridge'
import { getActiveERPBrand } from '@/common/consts/brand'
import { applyERPFavicon } from '@/common/consts/favicon.mjs'
import { getUserFacingErrorMessage } from '@/common/utils/errorMessage'
import {
  ERPWorkspaceProvider,
  useERPWorkspace,
} from '@/erp/context/ERPWorkspaceProvider'
import { ERPThemeProvider, useERPTheme } from '@/common/theme/erpTheme'
import { ERP_DARK_PALETTE } from '@/common/theme/erpThemePalette.mjs'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import '@/common/components/empty/empty-state.css'

dayjs.locale('zh-cn')

const ERPRouter = lazyWithDynamicImportRetry(() => import('@/erp/router'))
const DevRuntimeRecoveryBoundary = import.meta.env.DEV
  ? lazyWithDynamicImportRetry(
      () => import('@/dev-workbench/components/DevRuntimeRecoveryBoundary.jsx')
    )
  : null

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isMobileExperience } = useERPWorkspace()
  const activeBrand = getActiveERPBrand()
  const isDevWorkbenchRoute =
    import.meta.env.DEV && /^\/__dev(?:\/|$)/u.test(location.pathname)
  const routes = <ERPRouter />

  useEffect(() => {
    return authBus.onUnauthorized(({ from, message, loginPath }) => {
      // 如果 payload 没带，就 fallback 为当前 location
      const safeFrom = from || {
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      }
      const targetLoginPath = loginPath || '/admin-login'
      const userMessage = getUserFacingErrorMessage(
        message,
        '登录已过期，请重新登录'
      )

      if (isMobileExperience) {
        navigate(targetLoginPath, {
          replace: true,
          state: { from: safeFrom },
        })
        return
      }

      appAlert({
        title: '登录状态已失效',
        message: userMessage,
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
    if (isDevWorkbenchRoute) return
    // 登录页按当前选择的工作方式更新图标。
    if (/^\/admin-login\/?$/.test(location.pathname)) return
    applyERPFavicon(document, location.pathname, {
      customerFaviconHref: activeBrand.faviconHref,
      customerMobileFaviconHref: activeBrand.mobileFaviconHref,
      fromPathname: location.state?.from?.pathname,
      isMobileExperience,
    })
  }, [
    activeBrand.faviconHref,
    activeBrand.mobileFaviconHref,
    isDevWorkbenchRoute,
    isMobileExperience,
    location.pathname,
    location.state,
  ])

  return (
    <>
      {!isDevWorkbenchRoute ? (
        <Helmet>
          <title>{activeBrand.companyName}</title>
        </Helmet>
      ) : null}
      <Suspense fallback={null}>
        {DevRuntimeRecoveryBoundary ? (
          <DevRuntimeRecoveryBoundary>{routes}</DevRuntimeRecoveryBoundary>
        ) : (
          routes
        )}
      </Suspense>
    </>
  )
}

function ThemedApp() {
  const { isDark, accent, appearance } = useERPTheme()
  const tableCellPaddingBlock = appearance.density === 'compact' ? 4 : 9

  return (
    <ConfigProvider
      locale={zhCN}
      empty={{ className: 'erp-empty', image: Empty.PRESENTED_IMAGE_SIMPLE }}
      button={{ autoInsertSpace: false }}
      modal={{
        centered: true,
      }}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        components: {
          Button: {
            paddingInline: 12,
            paddingInlineSM: 12,
            paddingInlineLG: 16,
            primaryColor: isDark ? ERP_DARK_PALETTE.onAccent : accent.onPrimary,
          },
          Table: {
            cellPaddingBlock: tableCellPaddingBlock,
            cellPaddingBlockMD: tableCellPaddingBlock,
            cellPaddingBlockSM: tableCellPaddingBlock,
            cellPaddingInlineSM: 11,
            headerBg: isDark ? ERP_DARK_PALETTE.surfaceSoft : '#f7f9f8',
            headerColor: isDark ? ERP_DARK_PALETTE.textMuted : '#4d5d53',
            rowSelectedBg: 'var(--erp-primary-softer)',
            rowSelectedHoverBg: 'var(--erp-primary-soft)',
            rowHoverBg: 'var(--erp-surface-bg-soft)',
          },
        },
        token: {
          colorPrimary: isDark ? accent.dark : accent.primary,
          colorInfo: isDark ? '#75b9ff' : '#3275c7',
          colorLink: isDark ? accent.dark : accent.strong,
          borderRadius: 8,
          controlHeight: 34,
          controlHeightSM: 28,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          colorBgBase: isDark ? ERP_DARK_PALETTE.page : '#ffffff',
          colorBgLayout: isDark ? ERP_DARK_PALETTE.page : '#f2f5f3',
          colorBgContainer: isDark ? ERP_DARK_PALETTE.surface : '#ffffff',
          colorBgElevated: isDark ? ERP_DARK_PALETTE.surfaceRaised : '#ffffff',
          colorBorder: isDark ? ERP_DARK_PALETTE.border : '#dce4df',
          colorBorderSecondary: isDark ? ERP_DARK_PALETTE.border : '#dce4df',
          colorText: isDark ? ERP_DARK_PALETTE.text : '#1f2a24',
          colorTextSecondary: isDark ? ERP_DARK_PALETTE.textMuted : '#4d5d53',
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
