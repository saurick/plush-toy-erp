import React, { Suspense } from 'react'
import {
  Outlet,
  useLocation,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import useBusinessNavigate from '../../hooks/useBusinessNavigate.js'
import { canonicalBusinessPath } from '../../utils/businessTaskRoute.mjs'
import { Loading } from '@/common/components/loading'
import {
  BusinessPageLayout,
  PageHeaderCard,
} from '../business-list/BusinessListLayout.jsx'
import ProductionRecordsNavigation from './ProductionRecordsNavigation.jsx'
import {
  availableProductionRecordViews,
  PRODUCTION_RECORD_VIEW_KEYS,
  productionRecordViewPath,
  resolveProductionRecordView,
} from '../../utils/productionRecordViews.mjs'
import './productionRecords.css'

export default function ProductionRecordsLayout() {
  const context = useOutletContext()
  const location = useLocation()
  const pathname = canonicalBusinessPath(location.pathname)
  const [searchParams] = useSearchParams()
  const navigate = useBusinessNavigate()
  const availableKeys = availableProductionRecordViews(
    context?.adminProfile || {},
    context?.allowedMenuPaths || []
  )
  const activeKey = resolveProductionRecordView(
    pathname,
    searchParams,
    availableKeys
  )
  const workspaceContext = React.useMemo(
    () => ({
      ...context,
      productionRecordsWorkspace: true,
    }),
    [context]
  )

  return (
    <BusinessPageLayout className="erp-production-record-workspace">
      <PageHeaderCard
        compact
        title="生产记录"
        helpKey={
          activeKey === PRODUCTION_RECORD_VIEW_KEYS.DECISIONS ||
          activeKey === PRODUCTION_RECORD_VIEW_KEYS.TASKS
            ? 'production-exceptions'
            : 'production-progress'
        }
        viewSwitch={
          availableKeys.length > 1 && (
            <ProductionRecordsNavigation
              activeKey={activeKey}
              availableKeys={availableKeys}
              onChange={(nextView) => {
                if (nextView !== activeKey && availableKeys.includes(nextView)) {
                  navigate(
                    productionRecordViewPath(pathname, searchParams, nextView)
                  )
                }
              }}
            />
          )
        }
      />
      <Suspense fallback={<Loading />}>
        <Outlet context={workspaceContext} />
      </Suspense>
    </BusinessPageLayout>
  )
}
