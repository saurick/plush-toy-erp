import React, { Suspense } from 'react'
import {
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { Loading } from '@/common/components/loading'
import {
  BusinessPageLayout,
  PageHeaderCard,
} from '../business-list/BusinessListLayout.jsx'
import ProductionRecordsNavigation from './ProductionRecordsNavigation.jsx'
import {
  availableProductionRecordViews,
  productionRecordViewPath,
  resolveProductionRecordView,
} from '../../utils/productionRecordViews.mjs'
import './productionRecords.css'

function sameHeaderStats(current = [], next = []) {
  return (
    current === next ||
    (current.length === next.length &&
      current.every(
        (item, index) =>
          item?.key === next[index]?.key &&
          item?.label === next[index]?.label &&
          item?.value === next[index]?.value
      ))
  )
}

export default function ProductionRecordsLayout() {
  const context = useOutletContext()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const availableKeys = availableProductionRecordViews(
    context?.adminProfile || {},
    context?.allowedMenuPaths || []
  )
  const activeKey = resolveProductionRecordView(
    pathname,
    searchParams,
    availableKeys
  )
  const [headerStatsByView, setHeaderStatsByView] = React.useState({})
  const setHeaderStats = React.useCallback((viewKey, stats) => {
    if (!viewKey) return
    const nextStats = Array.isArray(stats) ? stats : []
    setHeaderStatsByView((current) => {
      if (sameHeaderStats(current[viewKey], nextStats)) return current
      return { ...current, [viewKey]: nextStats }
    })
  }, [])
  const workspaceContext = React.useMemo(
    () => ({
      ...context,
      productionRecordsWorkspace: { setHeaderStats },
    }),
    [context, setHeaderStats]
  )

  return (
    <BusinessPageLayout className="erp-production-record-workspace">
      <PageHeaderCard
        compact
        title="生产记录"
        stats={headerStatsByView[activeKey] || []}
        viewSwitch={
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
        }
      />
      <Suspense fallback={<Loading />}>
        <Outlet context={workspaceContext} />
      </Suspense>
    </BusinessPageLayout>
  )
}
