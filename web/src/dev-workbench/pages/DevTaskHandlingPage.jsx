import React from 'react'
import { Button, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  WorkbenchNotice,
  WorkbenchSection,
} from '../components/WorkbenchPattern.jsx'
import TaskHandlingMatrix from '../components/flow-state/TaskHandlingMatrix.jsx'
import { DEV_FLOW_STATE_CATALOG } from '../config/devFlowStateCatalog.mjs'
import {
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_TASK_HANDLING_ROUTE,
} from '../config/devRoutes.mjs'
import { validateTaskHandlingSearch } from '../config/devTaskHandling.mjs'
import '../components/flow-state/taskHandlingMatrix.css'

export default function DevTaskHandlingPage() {
  const [params, setParams] = useSearchParams()
  const error = validateTaskHandlingSearch(params, DEV_FLOW_STATE_CATALOG)
  return (
    <div className="erp-dev-workspace-page erp-dev-task-handling-page">
      <DevPageNav />
      <header className="erp-dev-task-handling__header">
        <Typography.Title level={1}>
          {DEV_PAGE_TITLE_BY_ROUTE[DEV_TASK_HANDLING_ROUTE]}
        </Typography.Title>
      </header>
      <main>
        {error ? (
          <WorkbenchNotice
            tone="error"
            title={error}
            action={<Button onClick={() => setParams({})}>重新选择</Button>}
          />
        ) : (
          <WorkbenchSection>
            <TaskHandlingMatrix businessCatalog={DEV_FLOW_STATE_CATALOG} />
          </WorkbenchSection>
        )}
      </main>
    </div>
  )
}
