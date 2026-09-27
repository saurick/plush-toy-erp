import React, { Suspense } from 'react'
import {
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { Loading } from '@/common/components/loading'
import ProductionRecordsNavigation from './ProductionRecordsNavigation.jsx'
import {
  availableProductionRecordViews,
  productionRecordViewPath,
  resolveProductionRecordView,
} from '../../utils/productionRecordViews.mjs'
import './productionRecords.css'

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

  return (
    <div className="erp-production-record-workspace">
      <ProductionRecordsNavigation
        activeKey={activeKey}
        availableKeys={availableKeys}
        onChange={(nextView) => {
          if (nextView !== activeKey && availableKeys.includes(nextView)) {
            navigate(productionRecordViewPath(pathname, searchParams, nextView))
          }
        }}
      />
      <Suspense fallback={<Loading />}>
        <Outlet context={context} />
      </Suspense>
    </div>
  )
}
