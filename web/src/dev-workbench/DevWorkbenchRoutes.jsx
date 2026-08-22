import React, { Suspense, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loading } from '@/common/components/loading'
import {
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_CUSTOMER_CONFIG_ROUTE,
  DEV_DATABASE_MIGRATION_ROUTE,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_DELIVERY_ROUTE,
  DEV_DOCS_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_GOVERNANCE_ROUTE,
  DEV_HUB_ROUTE,
  DEV_PERMISSION_RELATIONSHIPS_ROUTE,
  DEV_PRODUCT_CORE_ROUTE,
  DEV_PRODUCT_ENGINEERING_ROUTE,
  DEV_PROTOTYPES_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_QUALITY_ROUTE,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_TESTING_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
  DEV_WORKBENCH_AREA_KEYS,
  resolveDevPageFavicon,
  resolveDevPageTitle,
} from './config/devRoutes.mjs'
import { createDevLazyRoute } from './config/devRouteModules.mjs'
import './styles/index.css'

function applyDevWorkbenchFavicon(documentRef, href) {
  const iconLinks = Array.from(
    documentRef.querySelectorAll('link[rel~="icon"]')
  )
  iconLinks.slice(1).forEach((link) => link.remove())
  const link = iconLinks[0] || documentRef.createElement('link')
  link.setAttribute('rel', 'icon')
  link.setAttribute('type', 'image/svg+xml')
  link.setAttribute('href', href)
  if (!link.parentNode) documentRef.head.appendChild(link)
}

const importDevWorkbenchAreaPage = () =>
  import('./pages/DevWorkbenchAreaPage.jsx')

const DevHubPage = createDevLazyRoute(
  DEV_HUB_ROUTE,
  () => import('./pages/DevHubPage.jsx')
)
const DevProductEngineeringPage = createDevLazyRoute(
  DEV_PRODUCT_ENGINEERING_ROUTE,
  importDevWorkbenchAreaPage
)
const DevQualityPage = createDevLazyRoute(
  DEV_QUALITY_ROUTE,
  importDevWorkbenchAreaPage
)
const DevDeliveryPage = createDevLazyRoute(
  DEV_DELIVERY_ROUTE,
  importDevWorkbenchAreaPage
)
const DevProductCorePage = createDevLazyRoute(
  DEV_PRODUCT_CORE_ROUTE,
  () => import('./pages/DevProductCorePage.jsx')
)
const DevPermissionRelationshipsPage = createDevLazyRoute(
  DEV_PERMISSION_RELATIONSHIPS_ROUTE,
  () => import('./pages/DevPermissionRelationshipsPage.jsx')
)
const DevDocsPage = createDevLazyRoute(
  DEV_DOCS_ROUTE,
  () => import('./pages/DevDocsPage.jsx')
)
const DevGovernancePage = createDevLazyRoute(
  DEV_GOVERNANCE_ROUTE,
  () => import('./pages/DevGovernancePage.jsx')
)
const DevFlowStateObservatoryPage = createDevLazyRoute(
  DEV_STATUS_FLOWS_ROUTE,
  () => import('./pages/DevFlowStateObservatoryPage.jsx')
)
const DevBusinessUsabilityPage = createDevLazyRoute(
  DEV_BUSINESS_USABILITY_ROUTE,
  () => import('./pages/DevBusinessUsabilityPage.jsx')
)
const DevPrototypesPage = createDevLazyRoute(
  DEV_PROTOTYPES_ROUTE,
  () => import('./pages/DevPrototypesPage.jsx')
)
const DevCustomerConfigPage = createDevLazyRoute(
  DEV_CUSTOMER_CONFIG_ROUTE,
  () => import('./pages/DevCustomerConfigPage.jsx')
)
const DevTestingPage = createDevLazyRoute(
  DEV_TESTING_ROUTE,
  () => import('./pages/DevTestingPage.jsx')
)
const DevQualityGatesPage = createDevLazyRoute(
  DEV_QUALITY_GATES_ROUTE,
  () => import('./pages/DevQualityGatesPage.jsx')
)
const DevDataPreparationPage = createDevLazyRoute(
  DEV_DATA_PREPARATION_ROUTE,
  () => import('./pages/DevDataPreparationPage.jsx')
)
const DevDatabaseMigrationPage = createDevLazyRoute(
  DEV_DATABASE_MIGRATION_ROUTE,
  () => import('./pages/DevDatabaseMigrationPage.jsx')
)
const DevVersionCenterPage = createDevLazyRoute(
  DEV_VERSION_CENTER_ROUTE,
  () => import('./pages/DevVersionCenterPage.jsx')
)
const DevDrillRecoveryPage = createDevLazyRoute(
  DEV_DRILL_RECOVERY_ROUTE,
  () => import('./pages/DevDrillRecoveryPage.jsx')
)

function DevRouteLoadingFallback() {
  return (
    <Loading
      title="正在加载研发效能工作台"
      description={null}
      fullscreen
      className="loading-page--erp"
    />
  )
}

export default function DevWorkbenchRoutes() {
  const location = useLocation()
  const appTitle = import.meta.env.VITE_APP_TITLE || '毛绒玩具管理系统'
  const documentTitle = resolveDevPageTitle(location.pathname, appTitle)
  const faviconHref = resolveDevPageFavicon(location.pathname)

  useEffect(() => {
    applyDevWorkbenchFavicon(document, faviconHref)
  }, [faviconHref])

  return (
    <>
      <Helmet>
        <title>{documentTitle}</title>
      </Helmet>
      <Suspense fallback={<DevRouteLoadingFallback />}>
        <Routes>
          <Route index element={<DevHubPage />} />
          <Route
            path="product-engineering"
            element={
              <DevProductEngineeringPage
                areaKey={DEV_WORKBENCH_AREA_KEYS.productEngineering}
              />
            }
          />
          <Route
            path="quality"
            element={
              <DevQualityPage areaKey={DEV_WORKBENCH_AREA_KEYS.quality} />
            }
          />
          <Route
            path="delivery"
            element={
              <DevDeliveryPage areaKey={DEV_WORKBENCH_AREA_KEYS.delivery} />
            }
          />
          <Route path="product-core" element={<DevProductCorePage />} />
          <Route
            path="permission-relationships"
            element={<DevPermissionRelationshipsPage />}
          />
          <Route path="governance" element={<DevGovernancePage />} />
          <Route
            path="status-flows"
            element={<DevFlowStateObservatoryPage />}
          />
          <Route
            path="business-usability"
            element={<DevBusinessUsabilityPage />}
          />
          <Route path="docs" element={<DevDocsPage />} />
          <Route path="testing" element={<DevTestingPage />} />
          <Route path="quality-gates" element={<DevQualityGatesPage />} />
          <Route path="data-preparation" element={<DevDataPreparationPage />} />
          <Route path="prototypes" element={<DevPrototypesPage />} />
          <Route path="customer-config" element={<DevCustomerConfigPage />} />
          <Route
            path="database-migration"
            element={<DevDatabaseMigrationPage />}
          />
          <Route path="version-center" element={<DevVersionCenterPage />} />
          <Route path="drill-recovery" element={<DevDrillRecoveryPage />} />
          <Route path="*" element={<Navigate to="/__dev" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
