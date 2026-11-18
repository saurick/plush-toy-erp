import React, { useEffect, useState } from 'react'
import { Card } from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { PageHeaderCard } from '../components/business-list/BusinessListLayout.jsx'
import WorkbenchSummaries from '../components/workbench/WorkbenchSummaries.jsx'
import { ProductCoreDashboard } from '../components/workflow/WorkflowDashboardViews.jsx'
import { getWorkbenchSummaryOptions } from '../utils/workbenchSummary.mjs'

export default function WorkbenchPage() {
  const { adminProfile, registerPageRefresh } = useOutletContext()
  const navigate = useNavigate()
  const [refreshRevision, setRefreshRevision] = useState(0)
  const preview = adminProfile?.is_super_admin === true && !adminProfile.effective_session?.customer?.key
  const options = getWorkbenchSummaryOptions(adminProfile)
  const hasSummaries = !preview && options.length > 0
  useEffect(() => registerPageRefresh?.(hasSummaries ? () => {
    setRefreshRevision((current) => current + 1)
    return true
  } : null), [registerPageRefresh, hasSummaries])

  return (
    <section aria-label="工作台" className="erp-dashboard-page erp-business-page-layout">
      <PageHeaderCard compact title="工作台" />
      {preview ? <ProductCoreDashboard onNavigate={navigate} /> : hasSummaries ? (
        <WorkbenchSummaries options={options} refreshRevision={refreshRevision} />
      ) : (
        <Card><Empty description="当前岗位没有可查看的业务汇总" /></Card>
      )}
    </section>
  )
}
