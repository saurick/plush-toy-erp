import React, { Suspense, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loading } from '@/common/components/loading'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import {
  DEV_WORKBENCH_AREA_KEYS,
  resolveDevPageFavicon,
  resolveDevPageTitle,
} from './config/devRoutes.mjs'
import './styles/index.css'

const lazyRoute = lazyWithDynamicImportRetry

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

const DevHubPage = lazyRoute(() => import('./pages/DevHubPage.jsx'))
const DevWorkbenchAreaPage = lazyRoute(
  () => import('./pages/DevWorkbenchAreaPage.jsx')
)
const DevProductCorePage = lazyRoute(
  () => import('./pages/DevProductCorePage.jsx')
)
const DevPermissionRelationshipsPage = lazyRoute(
  () => import('./pages/DevPermissionRelationshipsPage.jsx')
)
const DevDocsPage = lazyRoute(() => import('./pages/DevDocsPage.jsx'))
const DevGovernancePage = lazyRoute(
  () => import('./pages/DevGovernancePage.jsx')
)
const DevFlowStateObservatoryPage = lazyRoute(
  () => import('./pages/DevFlowStateObservatoryPage.jsx')
)
const DevPrototypesPage = lazyRoute(
  () => import('./pages/DevPrototypesPage.jsx')
)
const DevCustomerConfigPage = lazyRoute(
  () => import('./pages/DevCustomerConfigPage.jsx')
)
const DevTestingPage = lazyRoute(() => import('./pages/DevTestingPage.jsx'))
const DevQualityGatesPage = lazyRoute(
  () => import('./pages/DevQualityGatesPage.jsx')
)
const DevDataPreparationPage = lazyRoute(
  () => import('./pages/DevDataPreparationPage.jsx')
)
const DevDatabaseMigrationPage = lazyRoute(
  () => import('./pages/DevDatabaseMigrationPage.jsx')
)
const DevVersionCenterPage = lazyRoute(
  () => import('./pages/DevVersionCenterPage.jsx')
)
const DevDrillRecoveryPage = lazyRoute(
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
              <DevWorkbenchAreaPage
                areaKey={DEV_WORKBENCH_AREA_KEYS.productEngineering}
              />
            }
          />
          <Route
            path="quality"
            element={
              <DevWorkbenchAreaPage areaKey={DEV_WORKBENCH_AREA_KEYS.quality} />
            }
          />
          <Route
            path="delivery"
            element={
              <DevWorkbenchAreaPage
                areaKey={DEV_WORKBENCH_AREA_KEYS.delivery}
              />
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
