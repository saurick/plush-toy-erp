import React, { lazy, Suspense, useMemo, useRef } from 'react'
import { Button, Typography } from 'antd'
import { useLocation, useSearchParams } from 'react-router-dom'
import AppDrawer from '@/common/components/drawer/AppDrawer.jsx'
import AppSelect from '@/common/components/select/AppSelect.jsx'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import { DevReadingReturn } from '../components/DevReadingNavigation.jsx'
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
import {
  DEV_FLOW_EXPLORER_VERIFICATION_KEYS,
  resolveDevFlowExplorerEntry,
} from './devFlowExplorerNavigation.mjs'

const BusinessChainStepVerification = lazy(() => import('../components/flow-state/BusinessChainStepVerification.jsx'))

export default function DevFlowExplorerPage() {
  const [params, setParams] = useSearchParams()
  const { state } = useLocation()
  const { entry, error, startBlank, verification } = useMemo(
    () => resolveDevFlowExplorerEntry(params, DEV_FLOW_STATE_CATALOG),
    [params]
  )
  const opener = useRef(null)
  const options = { replace: true, state }
  const clearEntry = () => setParams({}, options)
  const openVerification = (chainKey, stepKey, trigger) => {
    opener.current = trigger
    setParams({ chain: chainKey, [DEV_FLOW_EXPLORER_VERIFICATION_KEYS.step]: stepKey }, options)
  }
  const selectVerificationAction = (key) => setParams((previous) => {
    const next = new URLSearchParams(previous)
    next.set(DEV_FLOW_EXPLORER_VERIFICATION_KEYS.step, key)
    return next
  }, options)
  const title = DEV_PAGE_TITLE_BY_ROUTE[DEV_FLOW_EXPLORER_ROUTE]
  return (
    <div className="erp-dev-workspace-page erp-dev-flow-explorer-page">
      <DevPageNav />
      <main>
        {error ? (
          <WorkbenchSection>
            <DevPageHeader
              title={<Typography.Title level={1}>{title}</Typography.Title>}
              navigation={<DevReadingReturn />}
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
            initialRange={verification?.chain.key || 'all'}
            startBlank={startBlank}
            entry={entry}
            onEntryApplied={clearEntry}
            onOpenVerification={openVerification}
            returnToSource={<DevReadingReturn />}
            restoredPurpose={state?.flowRestoreFrame?.explorerPurpose}
          />
        )}
        <AppDrawer
          title="规则与验证"
          open={Boolean(verification)}
          width="min(760px, 100vw)"
          destroyOnHidden
          onClose={clearEntry}
          afterOpenChange={(open) => {
            if (!open && opener.current?.isConnected) opener.current.focus({ preventScroll: true })
          }}
        >
          {verification ? (
            <>
              <AppSelect
                label="本链动作"
                aria-label="本链动作"
                allowClear={false /* 不可清空：核验需对应一个登记动作。 */}
                value={verification.action.key}
                options={verification.chain.steps.map(({ key, label }) => ({ value: key, label }))}
                onChange={selectVerificationAction}
              />
              <Suspense fallback={<p role="status">正在读取动作核验…</p>}>
                <BusinessChainStepVerification
                  catalog={DEV_FLOW_STATE_CATALOG}
                  chain={verification.chain}
                  step={verification.action}
                />
              </Suspense>
            </>
          ) : null}
        </AppDrawer>
      </main>
    </div>
  )
}
