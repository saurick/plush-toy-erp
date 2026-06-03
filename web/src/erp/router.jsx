import React, { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthGuard from '@/common/auth/AuthGuard'
import { getStoredAdminProfile } from '@/common/auth/auth'
import { Loading } from '@/common/components/loading'
import ERPLayout from './components/ERPLayout.jsx'
import { businessModuleDefinitions } from './config/businessModules.mjs'
import { DEV_DOCS_ROUTE } from './config/devDocs.mjs'
import {
  ENTRY_TARGET,
  getEnabledMobileRoleKeys,
  getEntryConfig,
  hasDesktopEntryAccess,
  resolveDefaultEntryTarget,
  resolveMobileTasksPath,
} from './config/entryConfig.mjs'
import { getAllowedMobileRoleKeys } from './utils/mobileRolePermissions.mjs'

const AdminUsersPage = lazy(() => import('@/pages/AdminUsers'))
const AdminLoginPage = lazy(() => import('@/pages/AdminLogin'))
const LoginPage = lazy(() => import('@/pages/Login'))
const RegisterPage = lazy(() => import('@/pages/Register'))
const EntrySelectionPage = lazy(() => import('./pages/EntrySelectionPage'))
const BusinessModulePage = lazy(() => import('./pages/BusinessModulePage'))
const BusinessDashboardPage = lazy(
  () => import('./pages/BusinessDashboardPage')
)
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const PrintCenterPage = lazy(() => import('./pages/PrintCenterPage'))
const PrintTemplatePreviewPage = lazy(
  () => import('./pages/PrintTemplatePreviewPage')
)
const PrintWorkspacePage = lazy(() => import('./pages/PrintWorkspacePage.jsx'))
const PermissionCenterPage = lazy(() => import('./pages/PermissionCenterPage'))
const V1MasterDataPage = lazy(() => import('./pages/V1MasterDataPage'))
const V1SalesOrdersPage = lazy(() => import('./pages/V1SalesOrdersPage'))
const MobileAppLayout = lazy(() => import('./mobile/MobileAppLayout'))
const MobileRoleTasksPage = lazy(
  () => import('./mobile/pages/MobileRoleTasksPage')
)
const DevDocsPage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevDocsPage.jsx'))
  : null

function DesktopEntryRedirect() {
  return <Navigate to="/erp/dashboard" replace />
}

function RootEntryRedirect() {
  const admin = getStoredAdminProfile()
  if (!admin) {
    return <Navigate to="/admin-login" replace />
  }

  const entryConfig = getEntryConfig()
  const target = resolveDefaultEntryTarget({ config: entryConfig })
  if (target === ENTRY_TARGET.DESKTOP && hasDesktopEntryAccess(admin)) {
    return <Navigate to="/erp/dashboard" replace />
  }

  const allowedMobileRoles = getAllowedMobileRoleKeys(
    admin,
    getEnabledMobileRoleKeys(entryConfig)
  )
  if (target === ENTRY_TARGET.MOBILE_TASKS && allowedMobileRoles.length > 0) {
    return (
      <Navigate to={resolveMobileTasksPath(allowedMobileRoles[0])} replace />
    )
  }

  return <Navigate to="/entry" replace />
}

function RouteLoadingFallback() {
  return (
    <Loading
      title="页面加载中"
      description="正在准备当前模块和界面资源，请稍候..."
      fullscreen
      className="loading-page--erp"
    />
  )
}

export default function ERPRouter() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {DevDocsPage ? (
          <Route path={DEV_DOCS_ROUTE} element={<DevDocsPage />} />
        ) : null}
        <Route path="/" element={<RootEntryRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route
          path="/entry"
          element={
            <AuthGuard requireAdmin>
              <EntrySelectionPage />
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
          path="/admin-users"
          element={<Navigate to="/admin-accounts" replace />}
        />

        <Route
          path="/admin-menu"
          element={<Navigate to="/erp/dashboard" replace />}
        />
        <Route
          path="/admin-guide"
          element={<Navigate to="/erp/dashboard" replace />}
        />
        <Route
          path="/dashboard"
          element={<Navigate to="/erp/dashboard" replace />}
        />

        <Route
          path="/erp"
          element={
            <AuthGuard requireAdmin>
              <ERPLayout />
            </AuthGuard>
          }
        >
          <Route index element={<DesktopEntryRedirect />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route
            path="business-dashboard"
            element={<BusinessDashboardPage />}
          />
          {businessModuleDefinitions.map((moduleItem) => (
            <Route
              key={moduleItem.key}
              path={moduleItem.route}
              element={<BusinessModulePage moduleItem={moduleItem} />}
            />
          ))}
          <Route
            path="master/partners/customers"
            element={<V1MasterDataPage type="customers" />}
          />
          <Route
            path="master/partners/suppliers"
            element={<V1MasterDataPage type="suppliers" />}
          />
          <Route
            path="sales/project-orders/sales-orders"
            element={<V1SalesOrdersPage />}
          />
          <Route
            path="flows/overview"
            element={<Navigate to="/erp/dashboard" replace />}
          />
          <Route
            path="help-center"
            element={<Navigate to="/erp/dashboard" replace />}
          />
          <Route path="print-center" element={<PrintCenterPage />} />
          <Route
            path="print-center/:templateKey"
            element={<PrintTemplatePreviewPage />}
          />
          <Route path="system/permissions" element={<PermissionCenterPage />} />
          <Route
            path="mobile-workbenches"
            element={<Navigate to="/erp/dashboard" replace />}
          />
          <Route
            path="roles/:roleKey"
            element={<Navigate to="/erp/dashboard" replace />}
          />
          <Route
            path="source-readiness"
            element={<Navigate to="/erp/dashboard" replace />}
          />
          <Route
            path="docs/*"
            element={<Navigate to="/erp/dashboard" replace />}
          />
          <Route
            path="qa/*"
            element={<Navigate to="/erp/dashboard" replace />}
          />
          <Route
            path="changes/current"
            element={<Navigate to="/erp/dashboard" replace />}
          />
        </Route>

        <Route
          path="/erp/print-workspace/:templateKey"
          element={
            <AuthGuard requireAdmin>
              <PrintWorkspacePage />
            </AuthGuard>
          }
        />

        <Route
          path="/m/:roleKey"
          element={
            <AuthGuard requireAdmin>
              <MobileAppLayout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="tasks" replace />} />
          <Route path="tasks" element={<MobileRoleTasksPage />} />
          <Route path="*" element={<Navigate to="tasks" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
