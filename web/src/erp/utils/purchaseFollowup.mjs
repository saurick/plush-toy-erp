import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { BUSINESS_ROUTE_PATHS, hasActionPermission } from './masterDataOrderView.mjs'

export function canReadPurchaseFollowups(profile) {
  return hasActionPermission(profile, PermissionCode.PURCHASE_ORDER_READ) && (
    hasActionPermission(profile, PermissionCode.PURCHASE_RECEIPT_READ) || hasActionPermission(profile, PermissionCode.WAREHOUSE_INBOUND_READ)
  )
}

export function salesPurchaseFollowupPath(id) {
  return `${BUSINESS_ROUTE_PATHS.purchaseOrders}?view=followup&sales_order_id=${id}`
}

export const PURCHASE_FOLLOWUP_LABELS = {
  overdue: '已逾期',
  due_soon: '7 天内到货',
  unscheduled: '未排交期',
  scheduled: '后续到货',
  pending_inspection: '待质检',
  rejected: '拒收待处理',
  ready_inbound: '待入库',
  missing_price: '缺少单价',
  unsettled: '待核对应付',
}
export const PURCHASE_FOLLOWUP_NEXT_ACTIONS = {
  overdue: '采购 · 催货或维护交期',
  due_soon: '采购 · 确认送货安排',
  unscheduled: '采购 · 维护交期',
  scheduled: '采购 · 跟进供货',
  pending_inspection: '质检 · 办理来料检验',
  rejected: '采购 · 核对拒收处置',
  ready_inbound: '仓库 · 办理入库',
  missing_price: '采购 · 补齐价格',
  unsettled: '财务 · 核对价格、付款条件及可结算金额',
}
export function purchaseFollowupParams(state = {}, query = {}) {
  return {
    kind: state.filter || 'all',
    confirmation: state.calendarOpen ? state.confirmation || 'all' : 'all',
    start_date: state.startDate || '',
    selected_date: state.selectedDate || '',
    keyword: query.keyword || '',
    supplier_id: Number(query.supplierID || 0),
    order_id: Number(query.orderID || 0),
    ...(query.salesOrderID ? { sales_order_id: query.salesOrderID } : {}),
    limit: 25,
    offset: (Math.max(1, Number(state.page) || 1) - 1) * 25,
  }
}
export function purchaseFollowupPageChange(state, patch) {
  const next = { ...state, page: 1, ...patch }
  if (patch.filter && !['date', 'period'].includes(patch.filter)) {
    next.selectedDate = ''
  }
  if (
    patch.filter &&
    [
      'pending_inspection',
      'rejected',
      'ready_inbound',
      'missing_price',
      'unsettled',
    ].includes(patch.filter)
  ) {
    next.confirmation = 'all'
  }
  if (patch.calendarOpen === false) {
    next.confirmation = 'all'
    next.selectedDate = ''
    if (['date', 'period'].includes(next.filter)) next.filter = 'all'
  }
  return next
}
