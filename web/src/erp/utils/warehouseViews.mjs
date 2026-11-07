import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { WarehouseProductionKind } from '../../common/consts/statuses.generated.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'

export const INVENTORY_VIEWS = [
  { key: 'balances', label: '库存余额' },
  { key: 'lots', label: '库存批次' },
  { key: 'txns', label: '库存变动记录' },
]

export const WAREHOUSE_HANDLING_VIEWS = {
  inbound: [
    { key: 'purchase', label: '采购收货', permission: PermissionCode.PURCHASE_RECEIPT_READ },
    { key: 'completion', label: '成品入库', permission: PermissionCode.PRODUCTION_FACT_READ, workKind: WarehouseProductionKind.RECEIPT },
    { key: 'outsourcing-return', label: '委外回货', permission: PermissionCode.OUTSOURCING_FACT_READ, view: 'outsourcing', factType: 'RETURN_RECEIPT' },
    { key: 'process-return', label: '工序回货', permission: PermissionCode.PRODUCTION_WIP_READ, workKind: WarehouseProductionKind.RETURN },
  ],
  outbound: [
    { key: 'shipment', label: '销售出货', permission: PermissionCode.SHIPMENT_READ },
    { key: 'material-issue', label: '生产领料', permission: PermissionCode.PRODUCTION_FACT_READ, view: 'production', factType: 'MATERIAL_ISSUE' },
    { key: 'outsourcing-issue', label: '委外发料', permission: PermissionCode.OUTSOURCING_FACT_READ, view: 'outsourcing', factType: 'MATERIAL_ISSUE' },
    { key: 'reservations', label: '库存预留', permission: PermissionCode.WAREHOUSE_OUTBOUND_READ, view: 'reservations' },
  ],
}

// 页头与内容使用同一份分类及权限投影，URL 决定当前子视图。
export function resolveWarehouseView(pathname, search, adminProfile) {
  const params = new URLSearchParams(search)
  if (pathname === '/erp/warehouse/inventory') {
    if (params.get('workspace') === 'operations') return null
    return {
      label: '库存查询分类',
      items: INVENTORY_VIEWS,
      activeKey: INVENTORY_VIEWS.find(({ key }) => key === params.get('view'))?.key || 'balances',
      parameter: 'view',
      pathname,
      search,
    }
  }
  const direction = pathname === '/erp/warehouse/inbound' ? 'inbound'
    : pathname === '/erp/warehouse/outbound' ? 'outbound' : ''
  if (!direction) return null
  const items = WAREHOUSE_HANDLING_VIEWS[direction]
    .filter(({ permission }) => hasActionPermission(adminProfile, permission))
  const requested = params.get('warehouse_view') || (params.has('receipt_id') ? 'purchase' : '')
  return {
    label: direction === 'inbound' ? '入库办理分类' : '出库办理分类',
    items,
    activeKey: (items.find(({ key }) => key === requested) || items[0])?.key,
    parameter: 'warehouse_view',
    pathname,
    search,
  }
}

export function warehouseViewPath(navigation, key) {
  if (key === navigation.activeKey || !navigation.items.some((item) => item.key === key)) return null
  const params = new URLSearchParams(navigation.parameter === 'view' ? navigation.search : '')
  params.set(navigation.parameter, key)
  return `${navigation.pathname}?${params}`
}
