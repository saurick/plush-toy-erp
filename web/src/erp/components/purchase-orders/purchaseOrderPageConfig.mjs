import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  submitPurchaseOrder,
} from '../../api/masterDataOrderApi.mjs'
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
    permission: 'purchase.order.update',
    nextStatus: 'submitted',
    run: submitPurchaseOrder,
  },
  {
    key: 'approve',
    label: '审核',
    permission: 'purchase.order.approve',
    nextStatus: 'approved',
    run: approvePurchaseOrder,
  },
  {
    key: 'close',
    label: '关闭',
    permission: 'purchase.order.update',
    nextStatus: 'closed',
    confirmTitle: '确认关闭采购订单',
    confirmContent:
      '关闭只会停止这张采购订单继续执行；已登记的入库、质检、库存或财务记录不会自动改变。',
    okText: '确认关闭',
    run: closePurchaseOrder,
  },
  {
    key: 'cancel',
    label: '取消',
    permission: 'purchase.order.update',
    nextStatus: 'canceled',
    danger: true,
    confirmTitle: '确认取消采购订单',
    confirmContent:
      '取消只会终止这张采购订单本身；已登记的入库、质检、库存或财务记录不会自动撤销。',
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
