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
export function purchaseFollowupParams(view, state = {}, query = {}) {
  return {
    view,
    kind: state.filter || 'all',
    confirmation: view === 'arrival' ? state.confirmation || 'all' : 'all',
    start_date: state.startDate || '',
    selected_date: state.selectedDate || '',
    keyword: query.keyword || '',
    supplier_id: Number(query.supplierID || 0),
    order_id: Number(query.orderID || 0),
    limit: 25,
    offset: (Math.max(1, Number(state.page) || 1) - 1) * 25,
  }
}
export function purchaseFollowupPageChange(state, patch) {
  return { ...state, page: 1, ...patch }
}
