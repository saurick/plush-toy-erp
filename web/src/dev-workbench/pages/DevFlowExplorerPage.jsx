import React, { useMemo } from 'react'
import { Button, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  WorkbenchNotice,
  WorkbenchSection,
} from '../components/WorkbenchPattern.jsx'
import BusinessChainDesigner from '../components/flow-state/BusinessChainDesigner.jsx'
import { DEV_FLOW_STATE_CATALOG } from '../config/devFlowStateCatalog.mjs'
import {
  DEV_FLOW_EXPLORER_ROUTE,
  DEV_PAGE_TITLE_BY_ROUTE,
} from '../config/devRoutes.mjs'
import { resolveDevFlowExplorerEntry } from './devFlowExplorerNavigation.mjs'

export default function DevFlowExplorerPage() {
  const [params, setParams] = useSearchParams()
  const { entry, error, startBlank } = useMemo(
    () => resolveDevFlowExplorerEntry(params, DEV_FLOW_STATE_CATALOG),
    [params]
  )
  const clearEntry = () => setParams({}, { replace: true })
  return (
    <div className="erp-dev-workspace-page erp-dev-flow-explorer-page">
      <DevPageNav />
      <main>
        {error ? (
          <WorkbenchSection>
            <DevPageHeader
              title={<Typography.Title level={1}>{DEV_PAGE_TITLE_BY_ROUTE[DEV_FLOW_EXPLORER_ROUTE]}</Typography.Title>}
            />
            <WorkbenchNotice
              tone="error"
              title={error}
              action={<Button onClick={clearEntry}>继续上次探索</Button>}
            />
          </WorkbenchSection>
        ) : (
          <BusinessChainDesigner
            catalog={DEV_FLOW_STATE_CATALOG}
            initialRange="all"
            startBlank={startBlank}
            entry={entry}
            onEntryApplied={clearEntry}
          />
        )}
      </main>
    </div>
  )
}
