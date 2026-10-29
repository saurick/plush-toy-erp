import React, { Suspense } from 'react'
import { Outlet, } from 'react-router-dom'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import { Loading } from '@/common/components/loading'
import { BusinessPageLayout } from '../business-list/BusinessListLayout.jsx'
import './productionRecords.css'

export default function ProductionRecordsLayout() {
  const context = useBusinessPageContext()
  const workspaceContext = React.useMemo(
    () => ({
      ...context,
      productionRecordsWorkspace: true,
    }),
    [context]
  )

  return (
    <BusinessPageLayout className="erp-production-record-workspace">
      <Suspense fallback={<Loading />}>
        <Outlet context={workspaceContext} />
      </Suspense>
    </BusinessPageLayout>
  )
}
