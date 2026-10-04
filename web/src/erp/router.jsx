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
import LegalNoticeGate from '@/common/legal/LegalNoticeGate'
import { reportBrowserError } from '@/common/runtime/browserErrors.js'
import {
  isDynamicImportLoadError,
  lazyWithDynamicImportRetry,
} from '@/common/utils/lazyImportRetry.mjs'
import ERPLayout from './components/ERPLayout.jsx'
import ProductionRecordsLayout from './components/production-records/ProductionRecordsLayout.jsx'
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

const lazyRoute = lazyWithDynamicImportRetry

const AdminLoginPage = lazyRoute(() => import('@/pages/AdminLogin'))
const LegalDocumentPage = lazyRoute(
  () => import('@/common/legal/LegalDocumentPage')
)
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
const HistoryRecordsPage = lazyRoute(
  () => import('./pages/HistoryRecordsPage.jsx')
)
const HelpCenterPage = lazyRoute(() => import('./pages/HelpCenterPage.jsx'))
const MasterDataPage = lazyRoute(() => import('./pages/MasterDataPage'))
const SalesOrdersPage = lazyRoute(() => import('./pages/SalesOrdersPage'))
const PurchaseOrdersPage = lazyRoute(
  () => import('./pages/PurchaseOrdersPage.jsx')
)
const OutsourcingOrdersPage = lazyRoute(
  () => import('./pages/OutsourcingOrdersPage.jsx')
)
const PurchaseReceiptsPage = lazyRoute(
  () => import('./pages/PurchaseReceiptsPage.jsx')
)
const QualityInspectionsPage = lazyRoute(
  () => import('./pages/QualityInspectionsPage.jsx')
)
const InventoryLedgerPage = lazyRoute(
  () => import('./pages/InventoryLedgerPage.jsx')
)
const OperationalFactPage = lazyRoute(
  () => import('./pages/OperationalFactPage.jsx')
)
const ProductionOrdersPage = lazyRoute(
  () => import('./pages/ProductionOrdersPage.jsx')
)
const WorkflowBusinessModulePage = lazyRoute(
  () => import('./pages/WorkflowBusinessModulePage.jsx')
)
const BOMVersionsPage = lazyRoute(() => import('./pages/BOMVersionsPage.jsx'))
const ShipmentsPage = lazyRoute(() => import('./pages/ShipmentsPage.jsx'))
const FinancePaymentsPage = lazyRoute(
  () => import('./pages/FinancePaymentsPage.jsx')
)
const MobileAppLayout = lazyRoute(() => import('./mobile/MobileAppLayout'))
const MobileRoleTasksPage = lazyRoute(
  () => import('./mobile/pages/MobileRoleTasksPage')
)
const DevWorkbenchBridge = import.meta.env.DEV
  ? lazyRoute(() => import('@/dev-workbench/DevWorkbenchBridge.jsx'))
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

  componentDidCatch(error) {
    reportBrowserError(error, 'react_render')
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
      {DevWorkbenchBridge ? (
        <DevWorkbenchBridge>{children}</DevWorkbenchBridge>
      ) : (
        children
      )}
    </RouteRuntimeErrorBoundary>
  )
}

function PrintWorkspaceRoute() {
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
      <LegalNoticeGate>
        {(notice) => <ERPLayout legalNotice={notice} />}
      </LegalNoticeGate>
    </AuthGuard>
  )
}

function MobileShellRoute() {
  return (
    <AuthGuard requireAdmin>
      <LegalNoticeGate>
        {(notice) => <MobileAppLayout legalNotice={notice} />}
      </LegalNoticeGate>
    </AuthGuard>
  )
}

export default function ERPRouter() {
  return (
    <RouteRuntimeBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {DevWorkbenchBridge ? (
            <Route path="/__dev/*" element={<DevWorkbenchBridge />} />
          ) : null}
          <Route path="/" element={<RootEntryRedirect />} />
          <Route path="/admin-login" element={<AdminLoginPage />} />
          <Route
            path="/legal/privacy"
            element={<LegalDocumentPage documentKey="privacy" />}
          />
          <Route
            path="/legal/system-rules"
            element={<LegalDocumentPage documentKey="system-rules" />}
          />
          <Route
            path="/entry"
            element={
              <AuthGuard requireAdmin>
                <LegalNoticeGate>
                  {(notice) => <EntrySelectionPage legalNotice={notice} />}
                </LegalNoticeGate>
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
              element={<MasterDataPage key="customers" type="customers" />}
            />
            <Route
              path="master/partners/suppliers"
              element={<MasterDataPage key="suppliers" type="suppliers" />}
            />
            <Route
              path="master/materials"
              element={<MasterDataPage key="materials" type="materials" />}
            />
            <Route
              path="master/products"
              element={
                <MasterDataPage key="product_skus" type="product_skus" />
              }
            />
            <Route
              path="sales/project-orders/sales-orders"
              element={<SalesOrdersPage />}
            />
            <Route
              path="purchase/accessories"
              element={<PurchaseOrdersPage />}
            />
            <Route
              path="warehouse/inbound"
              element={<PurchaseReceiptsPage />}
            />
            <Route
              path="production/quality-inspections"
              element={<QualityInspectionsPage />}
            />
            <Route
              path="warehouse/inventory"
              element={<InventoryLedgerPage />}
            />
            <Route path="purchase/material-bom" element={<BOMVersionsPage />} />
            <Route
              path="engineering/processes"
              element={<MasterDataPage key="processes" type="processes" />}
            />
            <Route path="warehouse/shipments" element={<ShipmentsPage />} />
            <Route
              path="purchase/processing-contracts"
              element={<OutsourcingOrdersPage />}
            />
            <Route
              path="production/orders"
              element={<ProductionOrdersPage />}
            />
            <Route element={<ProductionRecordsLayout />}>
              <Route
                path="production/progress"
                element={
                  <OperationalFactPage moduleKey="production-progress" />
                }
              />
              <Route
                path="production/exceptions"
                element={
                  <WorkflowBusinessModulePage moduleKey="production-exceptions" />
                }
              />
            </Route>
            <Route
              path="production/scheduling"
              element={
                <WorkflowBusinessModulePage moduleKey="production-scheduling" />
              }
            />
            <Route
              path="warehouse/shipping-release"
              element={
                <WorkflowBusinessModulePage
                  key="shipping-release"
                  moduleKey="shipping-release"
                />
              }
            />
            <Route
              path="warehouse/outbound"
              element={<OperationalFactPage moduleKey="outbound" />}
            />
            <Route
              path="finance/reconciliation"
              element={<OperationalFactPage moduleKey="reconciliation" />}
            />
            <Route path="finance/payments" element={<FinancePaymentsPage />} />
            <Route
              path="finance/payables"
              element={<OperationalFactPage moduleKey="payables" />}
            />
            <Route
              path="finance/receivables"
              element={<OperationalFactPage moduleKey="receivables" />}
            />
            <Route
              path="finance/invoices"
              element={<OperationalFactPage moduleKey="invoices" />}
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
            <Route path="history" element={<HistoryRecordsPage />} />
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
