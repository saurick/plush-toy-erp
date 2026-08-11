import {
  cancelPurchaseOrder,
  closePurchaseOrder,
} from '../../api/masterDataOrderApi.mjs'
import { submitPurchaseOrderApprovalProcess } from '../../api/customerConfigApi.mjs'
import { isDraftSourceDocument } from '../../utils/sourceDocumentEditing.mjs'
import { buildPurchaseInboundDraftPreviewRows } from '../../utils/purchaseOrderInboundPreview.mjs'
import {
  PURCHASE_ORDER_STATUS_LABELS,
  statusText,
} from '../../utils/masterDataOrderView.mjs'

export const PURCHASE_ORDER_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已提交', value: 'submitted' },
  { label: '已审核', value: 'approved' },
  { label: '已关闭', value: 'closed' },
  { label: '已取消', value: 'canceled' },
]

export const PURCHASE_ORDER_SORT_OPTIONS = [
  { label: '最新优先', value: 'updated_at:desc' },
  { label: '最早优先', value: 'updated_at:asc' },
  { label: '下单日期新到旧', value: 'purchase_date:desc' },
  { label: '下单日期旧到新', value: 'purchase_date:asc' },
  { label: '预计到货日期新到旧', value: 'expected_arrival_date:desc' },
  { label: '预计到货日期旧到新', value: 'expected_arrival_date:asc' },
]

export const PURCHASE_ORDER_DATE_FILTER_OPTIONS = [
  { label: '下单日期', value: 'purchase_date' },
  { label: '预计到货日期', value: 'expected_arrival_date' },
]

export const PURCHASE_ORDER_LIFECYCLE_ACTIONS = [
  {
    key: 'submit',
    label: '提交',
    permission: 'purchase.order.submit',
    nextStatus: 'submitted',
    run: submitPurchaseOrderApprovalProcess,
    returnsRecord: false,
    successMessage: '采购订单已提交，已进入统一审批箱',
  },
  {
    key: 'normal_close',
    label: '正常关闭',
    permission: 'purchase.order.close',
    nextStatus: 'closed',
    sourceLifecycle: true,
    sourceType: 'purchase_order',
    commandKey: 'close',
    closeMode: 'normal',
    confirmTitle: '确认正常关闭采购订单',
    confirmContent:
      '只有所有订单行都已足量入库，且没有待处理的入库草稿或审批流程时才能正常关闭。',
    okText: '确认正常关闭',
    run: closePurchaseOrder,
  },
  {
    key: 'short_close',
    label: '提前关闭',
    permission: 'purchase.order.close',
    nextStatus: 'closed',
    sourceLifecycle: true,
    sourceType: 'purchase_order',
    commandKey: 'close',
    closeMode: 'short',
    requiresReason: true,
    confirmTitle: '确认提前关闭采购订单',
    confirmContent:
      '提前关闭会结清尚未收货的订单行；存在待处理的入库草稿或审批流程时仍会被阻止。',
    reasonPlaceholder: '请填写未收完即关闭的业务原因',
    okText: '确认提前关闭',
    run: closePurchaseOrder,
  },
  {
    key: 'cancel',
    label: '取消',
    permission: 'purchase.order.cancel',
    nextStatus: 'canceled',
    sourceLifecycle: true,
    sourceType: 'purchase_order',
    commandKey: 'cancel',
    requiresReason: true,
    danger: true,
    confirmTitle: '确认取消采购订单',
    confirmContent:
      '系统会同步结清可安全终止的审批流程；已有未取消的入库记录时会阻止取消。',
    reasonPlaceholder: '请填写取消采购订单的业务原因',
    okText: '确认取消',
    run: cancelPurchaseOrder,
  },
]

export const PURCHASE_ORDERS_MODULE_KEY = 'accessories-purchase'
export const PURCHASE_ORDER_RELATED_MENU_ITEMS = [
  { key: 'order-items', label: '采购订单明细' },
  { key: 'purchase-receipts', label: '采购入库' },
  { key: 'quality-inspections', label: '来料质检' },
]

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

export function workflowPayloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

export const buildInboundDraftPreviewRows = buildPurchaseInboundDraftPreviewRows

export function getSingleSelectedPurchaseOrder({
  selectedOrder,
  selectedOrders = [],
  selectedRowKeys = [],
}) {
  return selectedRowKeys.length === 1
    ? selectedOrders[0] || selectedOrder
    : null
}

export function buildPurchaseOrderStats({ orders = [], total = 0 }) {
  return [
    { key: 'total', label: '总订单', value: total },
    { key: 'current', label: '本页显示', value: orders.length },
    {
      key: 'approved',
      label: '已审核',
      value: orders.filter((item) => item.lifecycle_status === 'approved')
        .length,
    },
  ]
}

export function selectedPurchaseOrderDisplayText({
  resolveSupplierName,
  selectedOrders = [],
}) {
  if (selectedOrders.length === 1) {
    return `${
      selectedOrders[0]?.purchase_order_no || '采购订单未编号'
    } / ${resolveSupplierName(selectedOrders[0])}`
  }
  return selectedOrders.length > 1
    ? `已选择 ${selectedOrders.length} 张采购订单`
    : '请先选择采购订单'
}

export function buildSelectedPurchaseOrderItems({
  resolveSupplierName,
  selectedOrders = [],
}) {
  return selectedOrders.map((record) => ({
    key: record.id,
    label: record.purchase_order_no || '采购订单未编号',
    title: `${resolveSupplierName(record)} / ${statusText(
      record.lifecycle_status,
      PURCHASE_ORDER_STATUS_LABELS,
      '采购订单状态'
    )}`,
  }))
}

export function canEditPurchaseOrderSelection({ canUpdate = false, order }) {
  return order && canUpdate && isDraftSourceDocument(order)
}

export function canCreateInboundDraftFromPurchaseOrder({
  canCreatePurchaseReceipt = false,
  order,
}) {
  return canCreatePurchaseReceipt && order?.lifecycle_status === 'approved'
}
