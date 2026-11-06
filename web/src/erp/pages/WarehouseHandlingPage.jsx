import React, { useMemo } from 'react'
import Empty from '@/common/components/empty/AppEmpty.jsx'

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
import { resolveWarehouseView } from '../utils/warehouseViews.mjs'
import useBusinessPageContext from '../hooks/useBusinessPageContext.js'
import { BusinessPageLayout, BusinessToolbarWorkspace } from '../components/business-list/BusinessListLayout.jsx'
import { BusinessModuleViewTabs } from '../components/BusinessModuleTabs.jsx'

export default function WarehouseHandlingPage({ direction }) {
  const { adminProfile = {} } = useBusinessPageContext() || {}
  const [params] = useBusinessSearchParams()
  const navigation = resolveWarehouseView(`/erp/warehouse/${direction}`, params.toString(), adminProfile)
  const active = navigation.items.find(({ key }) => key === navigation.activeKey)
  const enabledViews = useMemo(() => active?.view ? [active.view] : [], [active?.view])
  const viewOverrides = useMemo(() => active?.view ? {
    [active.view]: { title: active.label, listParams: active.factType ? { fact_type: active.factType } : {} },
  } : {}, [active])
  return (
    <BusinessPageLayout className="erp-warehouse-handling-page">
      {direction === 'inbound' && !hasActionPermission(adminProfile, PermissionCode.PURCHASE_RECEIPT_READ) && (
        <>
          <SourceActionAccessNotice access={sourceActionAccess(adminProfile, PurchaseSourceActions.receiptReturn)} />
          <SourceActionAccessNotice access={sourceActionAccess(adminProfile, PurchaseSourceActions.receiptAdjustment)} />
        </>
      )}
      {active ? (
        <BusinessToolbarWorkspace contentSwitch={<BusinessModuleViewTabs navigation={navigation} />}>
          <BusinessPageStateScopeProvider key={active.key} value={`warehouse-${active.key}`}>
            {active.key === 'purchase' ? <PurchaseReceiptsPage />
            : active.key === 'shipment' ? <ShipmentsPage />
              : <OperationalFactWorkspace pageTitle={active.label} toolbarModuleKey={direction} initialActiveKey={active.view} enabledViews={enabledViews} viewOverrides={viewOverrides} showTabs={false} />}
          </BusinessPageStateScopeProvider>
        </BusinessToolbarWorkspace>
      ) : <Empty description="当前账号没有可办理的仓库业务" />}
    </BusinessPageLayout>
  )
}
