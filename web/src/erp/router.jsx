import React, { Suspense, lazy, useLayoutEffect } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
import AuthGuard from '@/common/auth/AuthGuard'
import { getStoredAdminProfile } from '@/common/auth/auth'
import { Loading } from '@/common/components/loading'
import ERPLayout from './components/ERPLayout.jsx'
import {
  DEV_CAPABILITY_LEDGER_ROUTE,
  DEV_CUSTOMER_CONFIG_ROUTE,
  DEV_DOCS_ROUTE,
  DEV_GOVERNANCE_ROUTE,
  DEV_HUB_ROUTE,
  DEV_PROTOTYPES_ROUTE,
  DEV_TESTING_ROUTE,
} from './config/devRoutes.mjs'
import {
  ENTRY_TARGET,
  getEnabledMobileRoleKeys,
  getEntryConfig,
  getLastEntryTarget,
  hasDesktopEntryAccess,
  isDesktopEntryEnabled,
  parseMobileRoleFromPath,
  resolveDefaultEntryTarget,
  resolveMobileTasksPath,
  shouldUseRememberedDesktopEntry,
} from './config/entryConfig.mjs'
import { getAllowedMobileRoleKeys } from './utils/mobileRolePermissions.mjs'
import { canOpenPrintWorkspaceFromWindowState } from './utils/printWorkspace.js'

const AdminLoginPage = lazy(() => import('@/pages/AdminLogin'))
const EntrySelectionPage = lazy(() => import('./pages/EntrySelectionPage'))
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
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage.jsx'))
const V1MasterDataPage = lazy(() => import('./pages/V1MasterDataPage'))
const V1SalesOrdersPage = lazy(() => import('./pages/V1SalesOrdersPage'))
const V1PurchaseOrdersPage = lazy(
  () => import('./pages/V1PurchaseOrdersPage.jsx')
)
const V1OutsourcingOrdersPage = lazy(
  () => import('./pages/V1OutsourcingOrdersPage.jsx')
)
const V1PurchaseReceiptsPage = lazy(
  () => import('./pages/V1PurchaseReceiptsPage.jsx')
)
const V1QualityInspectionsPage = lazy(
  () => import('./pages/V1QualityInspectionsPage.jsx')
)
const V1InventoryLedgerPage = lazy(
  () => import('./pages/V1InventoryLedgerPage.jsx')
)
const V1OperationalFactPage = lazy(
  () => import('./pages/V1OperationalFactPage.jsx')
)
const WorkflowBusinessModulePage = lazy(
  () => import('./pages/WorkflowBusinessModulePage.jsx')
)
const BOMVersionsPage = lazy(() => import('./pages/BOMVersionsPage.jsx'))
const ShipmentsPage = lazy(() => import('./pages/ShipmentsPage.jsx'))
const MobileAppLayout = lazy(() => import('./mobile/MobileAppLayout'))
const MobileRoleTasksPage = lazy(
  () => import('./mobile/pages/MobileRoleTasksPage')
)
const DevHubPage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevHubPage.jsx'))
  : null
const DevDocsPage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevDocsPage.jsx'))
  : null
const DevGovernancePage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevGovernancePage.jsx'))
  : null
const DevPrototypesPage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevPrototypesPage.jsx'))
  : null
const DevCapabilityLedgerPage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevCapabilityLedgerPage.jsx'))
  : null
const DevCustomerConfigPage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevCustomerConfigPage.jsx'))
  : null
const DevTestingPage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevTestingPage.jsx'))
  : null
const LAST_MOBILE_ENTRY_PATH_KEY = 'erp:last_mobile_entry_path'
function DesktopEntryRedirect() {
  return <Navigate to="/erp/dashboard" replace />
}

function MobileRoleTasksRedirect() {
  const { roleKey } = useParams()
  return <Navigate to={`/m/${roleKey || 'boss'}/tasks`} replace />
}

function RootEntryRedirect() {
  const admin = getStoredAdminProfile()
  if (!admin) {
    return <Navigate to="/admin-login" replace />
  }

  const entryConfig = getEntryConfig()
  const target = resolveDefaultEntryTarget({ config: entryConfig })
  if (
    target === ENTRY_TARGET.DESKTOP &&
    hasDesktopEntryAccess(admin, entryConfig)
  ) {
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
      title="正在加载中"
      description={null}
      fullscreen
      className="loading-page--erp"
    />
  )
}

function PrintWorkspaceRoute() {
  const { templateKey } = useParams()
  const location = useLocation()
  const canRestoreFromWindowState = canOpenPrintWorkspaceFromWindowState(
    templateKey,
    location.search
  )

  if (canRestoreFromWindowState) {
    return <PrintWorkspacePage />
  }

  return (
    <AuthGuard requireAdmin>
      <PrintWorkspacePage />
    </AuthGuard>
  )
}

function buildLocationPath(location) {
  return `${location.pathname || ''}${location.search || ''}${
    location.hash || ''
  }`
}

function resolveMobileEntryPath(adminProfile, entryConfig, preferredPath = '') {
  const preferredRoleKey = parseMobileRoleFromPath(preferredPath)
  const enabledRoleKeys = getEnabledMobileRoleKeys(entryConfig)
  const allowedRoleKeys = getAllowedMobileRoleKeys(
    adminProfile,
    enabledRoleKeys
  )
  if (preferredRoleKey && allowedRoleKeys.includes(preferredRoleKey)) {
    return resolveMobileTasksPath(preferredRoleKey)
  }
  return allowedRoleKeys[0] ? resolveMobileTasksPath(allowedRoleKeys[0]) : ''
}

function readLastMobileEntryPath() {
  try {
    return window.sessionStorage?.getItem(LAST_MOBILE_ENTRY_PATH_KEY) || ''
  } catch {
    return ''
  }
}

function rememberLastMobileEntryPath(path) {
  try {
    window.sessionStorage?.setItem(LAST_MOBILE_ENTRY_PATH_KEY, path)
  } catch {
    // sessionStorage is best-effort; the in-memory ref still covers SPA back.
  }
}

function isBrowserHistoryRestore() {
  const [navigationEntry] = performance.getEntriesByType('navigation')
  return navigationEntry?.type === 'back_forward'
}

function DesktopShellRoute() {
  const location = useLocation()
  const adminProfile = getStoredAdminProfile()
  const lastEntryTarget = getLastEntryTarget()
  const entryConfig = getEntryConfig()

  if (adminProfile && lastEntryTarget === ENTRY_TARGET.MOBILE_TASKS) {
    const lastMobilePath =
      readLastMobileEntryPath() ||
      (isBrowserHistoryRestore() ? buildLocationPath(location) : '')
    const mobileEntryPath = resolveMobileEntryPath(
      adminProfile,
      entryConfig,
      lastMobilePath
    )
    return <Navigate to={mobileEntryPath || '/entry'} replace />
  }

  if (adminProfile && !isDesktopEntryEnabled(entryConfig)) {
    const mobileEntryPath = resolveMobileEntryPath(adminProfile, entryConfig)
    return <Navigate to={mobileEntryPath || '/entry'} replace />
  }

  return (
    <AuthGuard requireAdmin>
      <ERPLayout />
    </AuthGuard>
  )
}

function MobileShellRoute() {
  const location = useLocation()
  const adminProfile = getStoredAdminProfile()
  const lastEntryTarget = getLastEntryTarget()
  const entryConfig = getEntryConfig()
  const currentPath = buildLocationPath(location)

  useLayoutEffect(() => {
    if (adminProfile && parseMobileRoleFromPath(location.pathname)) {
      rememberLastMobileEntryPath(currentPath)
    }
  }, [adminProfile, currentPath, location.pathname])

  if (
    shouldUseRememberedDesktopEntry(adminProfile, lastEntryTarget, entryConfig)
  ) {
    return <Navigate to="/erp/dashboard" replace />
  }

  return (
    <AuthGuard requireAdmin>
      <MobileAppLayout />
    </AuthGuard>
  )
}

export default function ERPRouter() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {DevHubPage ? (
          <Route path={DEV_HUB_ROUTE} element={<DevHubPage />} />
        ) : null}
        {DevDocsPage ? (
          <Route path={DEV_DOCS_ROUTE} element={<DevDocsPage />} />
        ) : null}
        {DevGovernancePage ? (
          <Route path={DEV_GOVERNANCE_ROUTE} element={<DevGovernancePage />} />
        ) : null}
        {DevPrototypesPage ? (
          <Route path={DEV_PROTOTYPES_ROUTE} element={<DevPrototypesPage />} />
        ) : null}
        {DevCapabilityLedgerPage ? (
          <Route
            path={DEV_CAPABILITY_LEDGER_ROUTE}
            element={<DevCapabilityLedgerPage />}
          />
        ) : null}
        {DevCustomerConfigPage ? (
          <Route
            path={DEV_CUSTOMER_CONFIG_ROUTE}
            element={<DevCustomerConfigPage />}
          />
        ) : null}
        {DevTestingPage ? (
          <Route path={DEV_TESTING_ROUTE} element={<DevTestingPage />} />
        ) : null}
        <Route path="/" element={<RootEntryRedirect />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route
          path="/entry"
          element={
            <AuthGuard requireAdmin>
              <EntrySelectionPage />
            </AuthGuard>
          }
        />
        <Route path="/erp" element={<DesktopShellRoute />}>
          <Route index element={<DesktopEntryRedirect />} />
          <Route
            path="dashboard"
            element={<DashboardPage initialView="workbench" />}
          />
          <Route
            path="task-board"
            element={<DashboardPage initialView="task-board" />}
          />
          <Route
            path="operations/exceptions"
            element={<DashboardPage initialView="exception-flow" />}
          />
          <Route
            path="business-dashboard"
            element={<BusinessDashboardPage />}
          />
          <Route
            path="master/partners/customers"
            element={<V1MasterDataPage type="customers" />}
          />
          <Route
            path="master/partners/suppliers"
            element={<V1MasterDataPage type="suppliers" />}
          />
          <Route
            path="master/materials"
            element={<V1MasterDataPage type="materials" />}
          />
          <Route
            path="master/products"
            element={<V1MasterDataPage type="product_skus" />}
          />
          <Route
            path="sales/project-orders/sales-orders"
            element={<V1SalesOrdersPage />}
          />
          <Route
            path="purchase/accessories"
            element={<V1PurchaseOrdersPage />}
          />
          <Route
            path="warehouse/inbound"
            element={<V1PurchaseReceiptsPage />}
          />
          <Route
            path="production/quality-inspections"
            element={<V1QualityInspectionsPage />}
          />
          <Route
            path="warehouse/inventory"
            element={<V1InventoryLedgerPage />}
          />
          <Route path="purchase/material-bom" element={<BOMVersionsPage />} />
          <Route
            path="engineering/processes"
            element={<V1MasterDataPage type="processes" />}
          />
          <Route path="warehouse/shipments" element={<ShipmentsPage />} />
          <Route
            path="purchase/processing-contracts"
            element={<V1OutsourcingOrdersPage />}
          />
          <Route
            path="production/progress"
            element={<V1OperationalFactPage moduleKey="production-progress" />}
          />
          <Route
            path="production/scheduling"
            element={
              <WorkflowBusinessModulePage moduleKey="production-scheduling" />
            }
          />
          <Route
            path="production/exceptions"
            element={
              <WorkflowBusinessModulePage moduleKey="production-exceptions" />
            }
          />
          <Route
            path="warehouse/shipping-release"
            element={
              <WorkflowBusinessModulePage moduleKey="shipping-release" />
            }
          />
          <Route
            path="warehouse/outbound"
            element={<V1OperationalFactPage moduleKey="outbound" />}
          />
          <Route
            path="finance/reconciliation"
            element={<V1OperationalFactPage moduleKey="reconciliation" />}
          />
          <Route
            path="finance/payables"
            element={<V1OperationalFactPage moduleKey="payables" />}
          />
          <Route
            path="finance/receivables"
            element={<V1OperationalFactPage moduleKey="receivables" />}
          />
          <Route
            path="finance/invoices"
            element={<V1OperationalFactPage moduleKey="invoices" />}
          />
          <Route path="print-center" element={<PrintCenterPage />} />
          <Route
            path="print-center/:templateKey"
            element={<PrintTemplatePreviewPage />}
          />
          <Route path="system/permissions" element={<PermissionCenterPage />} />
          <Route path="system/audit-logs" element={<AuditLogsPage />} />
        </Route>

        <Route
          path="/erp/print-workspace/:templateKey"
          element={<PrintWorkspaceRoute />}
        />

        <Route path="/m/:roleKey" element={<MobileShellRoute />}>
          <Route index element={<Navigate to="tasks" replace />} />
          <Route path="tasks" element={<MobileRoleTasksPage />} />
          <Route path="*" element={<MobileRoleTasksRedirect />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
