import React, { useMemo } from 'react'
import { Empty } from 'antd'
import { useOutletContext } from 'react-router-dom'
import SlidingTabs from '@/common/components/navigation/SlidingTabs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import useBusinessSearchParams from '../hooks/useBusinessSearchParams.js'
import { BusinessPageStateScopeProvider } from '../hooks/useBusinessPageState.js'
import PurchaseReceiptsPage from './PurchaseReceiptsPage.jsx'
import ShipmentsPage from './ShipmentsPage.jsx'
import { OperationalFactWorkspace } from './OperationalFactsPage.jsx'
import { PurchaseSourceActions } from '../../common/consts/purchaseSourceActions.mjs'
import { sourceActionAccess } from '../utils/sourceActionAccess.mjs'
import SourceActionAccessNotice from '../components/SourceActionAccessNotice.jsx'

const HANDLING_VIEWS = {
  inbound: [
    { key: 'purchase', label: '采购收货', permission: PermissionCode.PURCHASE_RECEIPT_READ },
    { key: 'completion', label: '成品入库', permission: PermissionCode.PRODUCTION_FACT_READ, view: 'production', factType: 'FINISHED_GOODS_RECEIPT' },
    { key: 'outsourcing-return', label: '委外回货', permission: PermissionCode.OUTSOURCING_FACT_READ, view: 'outsourcing', factType: 'RETURN_RECEIPT' },
  ],
  outbound: [
    { key: 'shipment', label: '销售出货', permission: PermissionCode.SHIPMENT_READ },
    { key: 'material-issue', label: '生产领料', permission: PermissionCode.PRODUCTION_FACT_READ, view: 'production', factType: 'MATERIAL_ISSUE' },
    { key: 'outsourcing-issue', label: '委外发料', permission: PermissionCode.OUTSOURCING_FACT_READ, view: 'outsourcing', factType: 'MATERIAL_ISSUE' },
    { key: 'reservations', label: '库存预留', permission: PermissionCode.WAREHOUSE_OUTBOUND_READ, view: 'reservations' },
  ],
}

export default function WarehouseHandlingPage({ direction }) {
  const { adminProfile = {} } = useOutletContext() || {}
  const [params, setParams] = useBusinessSearchParams()
  const views = HANDLING_VIEWS[direction].filter((view) => hasActionPermission(adminProfile, view.permission))
  const requested = params.get('warehouse_view') || (params.has('receipt_id') ? 'purchase' : '')
  const active = views.find((view) => view.key === requested) || views[0]
  const enabledViews = useMemo(() => active?.view ? [active.view] : [], [active?.view])
  const viewOverrides = useMemo(() => active?.view ? {
    [active.view]: { title: active.label, listParams: active.factType ? { fact_type: active.factType } : {} },
  } : {}, [active])
  return (
    <>
      {direction === 'inbound' && !hasActionPermission(adminProfile, PermissionCode.PURCHASE_RECEIPT_READ) && (
        <>
          <SourceActionAccessNotice access={sourceActionAccess(adminProfile, PurchaseSourceActions.receiptReturn)} />
          <SourceActionAccessNotice access={sourceActionAccess(adminProfile, PurchaseSourceActions.receiptAdjustment)} />
        </>
      )}
      <SlidingTabs
        activeKey={active?.key}
        items={views.map(({ key, label }) => ({ key, label }))}
        onChange={(key) => {
        if (key === active?.key) return
        setParams(new URLSearchParams({ warehouse_view: key }))
      }}
      />
      {active ? (
        <BusinessPageStateScopeProvider key={active.key} value={`warehouse-${active.key}`}>
          {active.key === 'purchase' ? <PurchaseReceiptsPage />
          : active.key === 'shipment' ? <ShipmentsPage />
            : <OperationalFactWorkspace pageTitle={active.label} toolbarModuleKey={direction} initialActiveKey={active.view} enabledViews={enabledViews} viewOverrides={viewOverrides} showTabs={false} />}
        </BusinessPageStateScopeProvider>
      ) : <Empty description="当前账号没有可办理的仓库业务" />}
    </>
  )
}
