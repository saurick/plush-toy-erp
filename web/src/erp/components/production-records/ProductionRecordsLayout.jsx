import React, { Suspense } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { Loading } from '@/common/components/loading'
import { BusinessPageLayout } from '../business-list/BusinessListLayout.jsx'
import './productionRecords.css'

export default function ProductionRecordsLayout() {
  const context = useOutletContext()
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
