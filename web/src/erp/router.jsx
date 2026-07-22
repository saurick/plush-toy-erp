import React, { Suspense } from 'react'
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
import {
  isDynamicImportLoadError,
  lazyWithDynamicImportRetry,
} from '@/common/utils/lazyImportRetry.mjs'
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
  hasDesktopEntryAccess,
  isDesktopEntryEnabled,
  resolveAllowedMobileEntryPath,
  resolveDefaultEntryTarget,
} from './config/entryConfig.mjs'
import { getAllowedMobileRoleKeys } from './utils/mobileRolePermissions.mjs'
import { canOpenPrintWorkspaceFromWindowState } from './utils/printWorkspace.js'

const lazyRoute = lazyWithDynamicImportRetry

const AdminLoginPage = lazyRoute(() => import('@/pages/AdminLogin'))
const EntrySelectionPage = lazyRoute(() => import('./pages/EntrySelectionPage'))
const BusinessDashboardPage = lazyRoute(
  () => import('./pages/BusinessDashboardPage')
)
const DashboardPage = lazyRoute(() => import('./pages/DashboardPage'))
const PrintCenterPage = lazyRoute(() => import('./pages/PrintCenterPage'))
const PrintTemplatePreviewPage = lazyRoute(
  () => import('./pages/PrintTemplatePreviewPage')
)
const PrintWorkspacePage = lazyRoute(
  () => import('./pages/PrintWorkspacePage.jsx')
)
const PermissionCenterPage = lazyRoute(
  () => import('./pages/PermissionCenterPage')
)
const AuditLogsPage = lazyRoute(() => import('./pages/AuditLogsPage.jsx'))
const HelpCenterPage = lazyRoute(() => import('./pages/HelpCenterPage.jsx'))
const V1MasterDataPage = lazyRoute(() => import('./pages/V1MasterDataPage'))
const V1SalesOrdersPage = lazyRoute(() => import('./pages/V1SalesOrdersPage'))
const V1PurchaseOrdersPage = lazyRoute(
  () => import('./pages/V1PurchaseOrdersPage.jsx')
)
const V1OutsourcingOrdersPage = lazyRoute(
  () => import('./pages/V1OutsourcingOrdersPage.jsx')
)
const V1PurchaseReceiptsPage = lazyRoute(
  () => import('./pages/V1PurchaseReceiptsPage.jsx')
)
const V1QualityInspectionsPage = lazyRoute(
  () => import('./pages/V1QualityInspectionsPage.jsx')
)
const V1InventoryLedgerPage = lazyRoute(
  () => import('./pages/V1InventoryLedgerPage.jsx')
)
const V1OperationalFactPage = lazyRoute(
  () => import('./pages/V1OperationalFactPage.jsx')
)
const V1ProductionOrdersPage = lazyRoute(
  () => import('./pages/V1ProductionOrdersPage.jsx')
)
const WorkflowBusinessModulePage = lazyRoute(
  () => import('./pages/WorkflowBusinessModulePage.jsx')
)
const BOMVersionsPage = lazyRoute(() => import('./pages/BOMVersionsPage.jsx'))
const ShipmentsPage = lazyRoute(() => import('./pages/ShipmentsPage.jsx'))
const SalesReturnsPage = lazyRoute(() => import('./pages/SalesReturnsPage.jsx'))
const FinancePaymentsPage = lazyRoute(
  () => import('./pages/FinancePaymentsPage.jsx')
)
const MobileAppLayout = lazyRoute(() => import('./mobile/MobileAppLayout'))
const MobileRoleTasksPage = lazyRoute(
  () => import('./mobile/pages/MobileRoleTasksPage')
)
const DevHubPage = import.meta.env.DEV
  ? lazyRoute(() => import('./pages/DevHubPage.jsx'))
  : null
const DevDocsPage = import.meta.env.DEV
  ? lazyRoute(() => import('./pages/DevDocsPage.jsx'))
  : null
const DevGovernancePage = import.meta.env.DEV
  ? lazyRoute(() => import('./pages/DevGovernancePage.jsx'))
  : null
const DevPrototypesPage = import.meta.env.DEV
  ? lazyRoute(() => import('./pages/DevPrototypesPage.jsx'))
  : null
const DevCapabilityLedgerPage = import.meta.env.DEV
  ? lazyRoute(() => import('./pages/DevCapabilityLedgerPage.jsx'))
  : null
const DevCustomerConfigPage = import.meta.env.DEV
  ? lazyRoute(() => import('./pages/DevCustomerConfigPage.jsx'))
  : null
const DevTestingPage = import.meta.env.DEV
  ? lazyRoute(() => import('./pages/DevTestingPage.jsx'))
  : null
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
      <Navigate
        to={resolveAllowedMobileEntryPath(allowedMobileRoles)}
        replace
      />
    )
  }

  if (target === ENTRY_TARGET.MOBILE_TASKS) {
    return <Navigate to="/entry?reason=mobile-role-unassigned" replace />
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

function RouteRuntimeErrorFallback({ error }) {
  const isModuleLoadError = isDynamicImportLoadError(error)
  const title = isModuleLoadError ? '页面加载失败' : '页面暂时无法显示'
  const description = isModuleLoadError
    ? '页面内容加载失败，请重新加载当前页面；如仍无法打开，请稍后重试。'
    : '页面暂时无法显示，请重新加载当前页面；如问题持续出现，请联系管理员。'

  return (
    <Loading
      title={title}
      description={description}
      fullscreen
      className="loading-page--erp"
      actions={
        <>
          <button
            type="button"
            className="loading-page__action-button loading-page__action-button--primary"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
          <button
            type="button"
            className="loading-page__action-button"
            onClick={() => window.location.assign('/erp/dashboard')}
          >
            返回工作台
          </button>
        </>
      }
    />
  )
}

class RouteRuntimeErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    const { resetKey } = this.props
    const { error } = this.state

    if (prevProps.resetKey !== resetKey && error) {
      this.setState({ error: null })
    }
  }

  render() {
    const { children } = this.props
    const { error } = this.state

    if (error) {
      return <RouteRuntimeErrorFallback error={error} />
    }

    return children
  }
}

function RouteRuntimeBoundary({ children }) {
  const location = useLocation()

  return (
    <RouteRuntimeErrorBoundary resetKey={buildLocationPath(location)}>
      {children}
    </RouteRuntimeErrorBoundary>
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

function resolveMobileEntryPath(adminProfile, entryConfig) {
  const enabledRoleKeys = getEnabledMobileRoleKeys(entryConfig)
  const allowedRoleKeys = getAllowedMobileRoleKeys(
    adminProfile,
    enabledRoleKeys
  )
  return resolveAllowedMobileEntryPath(allowedRoleKeys)
}

function DesktopShellRoute() {
  const adminProfile = getStoredAdminProfile()
  const entryConfig = getEntryConfig()

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
  return (
    <AuthGuard requireAdmin>
      <MobileAppLayout />
    </AuthGuard>
  )
}

export default function ERPRouter() {
  return (
    <RouteRuntimeBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {DevHubPage ? (
            <Route path={DEV_HUB_ROUTE} element={<DevHubPage />} />
          ) : null}
          {DevDocsPage ? (
            <Route path={DEV_DOCS_ROUTE} element={<DevDocsPage />} />
          ) : null}
          {DevGovernancePage ? (
            <Route
              path={DEV_GOVERNANCE_ROUTE}
              element={<DevGovernancePage />}
            />
          ) : null}
          {DevPrototypesPage ? (
            <Route
              path={DEV_PROTOTYPES_ROUTE}
              element={<DevPrototypesPage />}
            />
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
              path="sales/customer-returns"
              element={<SalesReturnsPage />}
            />
            <Route
              path="purchase/processing-contracts"
              element={<V1OutsourcingOrdersPage />}
            />
            <Route
              path="production/orders"
              element={<V1ProductionOrdersPage />}
            />
            <Route
              path="production/progress"
              element={
                <V1OperationalFactPage moduleKey="production-progress" />
              }
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
            <Route path="finance/payments" element={<FinancePaymentsPage />} />
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
            <Route
              path="system/permissions"
              element={<PermissionCenterPage />}
            />
            <Route path="system/audit-logs" element={<AuditLogsPage />} />
            <Route path="help-center" element={<HelpCenterPage />} />
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
    </RouteRuntimeBoundary>
  )
}
