import React, { useMemo, useRef } from 'react'
import { getBusinessModule } from '../../config/businessModules.mjs'
import useBusinessPageContext, {
  BusinessPageContext,
} from '../../hooks/useBusinessPageContext.js'
import useBusinessPageState from '../../hooks/useBusinessPageState.js'
import useBusinessSearchParams from '../../hooks/useBusinessSearchParams.js'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { createSourceBusinessActionAttemptStore } from '../../utils/sourceBusinessAction.mjs'
import {
  getFinanceWorkspaceViews,
  resolveFinanceWorkspaceView,
} from '../../utils/financeWorkspaceViews.mjs'
import {
  BusinessPageLayout,
  BusinessToolbarWorkspace,
  PageHeaderCard,
} from '../business-list/BusinessListLayout.jsx'
import { BusinessViewSwitch } from '../business-visualizations/BusinessVisualizationFrame.jsx'
import FinanceCreditNotesPanel from './FinanceCreditNotesPanel.jsx'
import FinanceSourceAdjustmentsPanel from './FinanceSourceAdjustmentsPanel.jsx'
import FinanceStatementPanel from './FinanceStatementPanel.jsx'

export default function FinanceWorkspace({ moduleKey, children }) {
  const context = useBusinessPageContext()
  const adminProfile = context?.adminProfile || {}
  const [searchParams, setSearchParams] = useBusinessSearchParams()
  const [savedView, setSavedView] = useBusinessPageState(
    'financeWorkspaceView',
    ''
  )
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const views = getFinanceWorkspaceViews(
    moduleKey,
    adminProfile,
    context?.visibleMenuPaths
  )
  const activeView = resolveFinanceWorkspaceView({
    views,
    requestedView: searchParams.get('workspace'),
    savedView,
    hasRecordContext: [
      'fact_id',
      'finance_fact_id',
      'finance_payment_id',
      'source_id',
      'sales_order_id',
    ].some((key) => searchParams.has(key)),
  })
  const pageContext = useMemo(
    () => ({
      ...context,
      financeWorkspace: {
        contentView: activeView === 'due' ? 'due' : 'list',
        attemptsRef,
      },
    }),
    [context, activeView]
  )
  const can = (permission) => hasActionPermission(adminProfile, permission)
  const customerKey = adminProfile?.effective_session?.customer?.key || ''
  const changeView = (view) => {
    setSavedView(view)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('workspace', view)
      return next
    })
  }
  if (context?.taskBusiness) return children

  return (
    <BusinessPageContext.Provider value={pageContext}>
      <BusinessPageLayout className="erp-finance-workspace" inWorkspace>
        <PageHeaderCard
          compact
          title={getBusinessModule(moduleKey)?.title}
          helpKey={moduleKey}
        />
        <BusinessToolbarWorkspace
          contentSwitch={
            views.length > 1 ? (
              <BusinessViewSwitch
                value={activeView}
                options={views}
                onChange={changeView}
              />
            ) : null
          }
        >
          {activeView === 'credits' ? (
            <FinanceCreditNotesPanel attemptsRef={attemptsRef} />
          ) : activeView === 'statement' ? (
            <FinanceStatementPanel
              inWorkspace
              canReadReceivables={can(PermissionCode.FINANCE_RECEIVABLE_READ)}
              canReadPayables={can(PermissionCode.FINANCE_PAYABLE_READ)}
            />
          ) : activeView === 'source-adjustments' ? (
            <FinanceSourceAdjustmentsPanel
              inWorkspace
              customerKey={customerKey}
              canCreate={can(PermissionCode.FINANCE_CREDIT_NOTE_CREATE)}
              attemptsRef={attemptsRef}
            />
          ) : (
            children
          )}
        </BusinessToolbarWorkspace>
      </BusinessPageLayout>
    </BusinessPageContext.Provider>
  )
}
