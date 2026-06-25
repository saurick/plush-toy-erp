import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  submitPurchaseOrder,
} from '../../api/masterDataOrderApi.mjs'
import { decimalNumber } from '../../utils/businessLineItems.mjs'
import { PURCHASE_ORDER_STATUS_LABELS } from '../../utils/masterDataOrderView.mjs'
import { ROLE_DISPLAY_NAMES } from '../../utils/roleKeys.mjs'

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
  { label: '采购日期新到旧', value: 'purchase_date:desc' },
  { label: '采购日期旧到新', value: 'purchase_date:asc' },
  { label: '预计到货新到旧', value: 'expected_arrival_date:desc' },
  { label: '预计到货旧到新', value: 'expected_arrival_date:asc' },
]

export const PURCHASE_ORDER_DATE_FILTER_OPTIONS = [
  { label: '采购日期', value: 'purchase_date' },
  { label: '预计到货', value: 'expected_arrival_date' },
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
    confirmContent: '关闭后该采购订单不再继续推进，是否继续？',
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
    confirmContent: '取消后该采购订单不再继续推进，是否继续？',
    okText: '确认取消',
    run: cancelPurchaseOrder,
  },
]

export const PURCHASE_ORDERS_MODULE_KEY = 'accessories-purchase'
export const PURCHASE_ORDER_WORKFLOW_ROLE_LABELS = new Map(
  Object.entries(ROLE_DISPLAY_NAMES)
)
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

function referenceName(options, id, fallbackLabel = '记录') {
  const option = (Array.isArray(options) ? options : []).find(
    (item) => String(item.value) === String(id)
  )
  return option?.label || (id ? `${fallbackLabel}已关联` : '-')
}

export function buildInboundDraftPreviewRows({
  orderItems = [],
  receipts = [],
  materialOptions = [],
  unitOptions = [],
}) {
  const receivedByOrderItemID = new Map()
  receipts
    .filter((receipt) => String(receipt?.status || '') !== 'CANCELLED')
    .forEach((receipt) => {
      const receiptItems = receipt?.items || []
      receiptItems.forEach((item) => {
        const sourceItemID = Number(item?.purchase_order_item_id || 0)
        if (!sourceItemID) return
        const current = receivedByOrderItemID.get(sourceItemID) || 0
        receivedByOrderItemID.set(
          sourceItemID,
          current + decimalNumber(item?.quantity)
        )
      })
    })

  return orderItems
    .filter((item) => String(item?.line_status || 'open') === 'open')
    .map((item) => {
      const purchasedQuantity = decimalNumber(item?.purchased_quantity)
      const receivedQuantity = receivedByOrderItemID.get(Number(item?.id)) || 0
      const remainingQuantity = Math.max(
        0,
        purchasedQuantity - receivedQuantity
      )
      const disabledReason = remainingQuantity <= 0 ? '已全部生成入库' : ''
      return {
        key: item.id || item.line_no,
        lineNo: item.line_no,
        material: referenceName(materialOptions, item.material_id, '材料'),
        unit: referenceName(unitOptions, item.unit_id, '单位'),
        purchasedQuantity,
        receivedQuantity,
        remainingQuantity,
        disabledReason,
      }
    })
}

export function getSingleSelectedPurchaseOrder({
  selectedOrder,
  selectedOrders = [],
  selectedRowKeys = [],
}) {
  return selectedRowKeys.length === 1
    ? selectedOrders[0] || selectedOrder
    : null
}

export function buildPurchaseOrderStats({
  orders = [],
  selectedCount = 0,
  total = 0,
}) {
  return [
    { key: 'total', label: '总订单', value: total },
    { key: 'current', label: '当前结果', value: orders.length },
    {
      key: 'approved',
      label: '已审核',
      value: orders.filter((item) => item.lifecycle_status === 'approved')
        .length,
    },
    { key: 'selected', label: '已选订单', value: selectedCount },
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
    title: `${resolveSupplierName(record)} / ${
      PURCHASE_ORDER_STATUS_LABELS[record.lifecycle_status] ||
      record.lifecycle_status ||
      '-'
    }`,
  }))
}

export function canEditPurchaseOrderSelection({ canUpdate = false, order }) {
  return (
    order &&
    canUpdate &&
    !['closed', 'canceled'].includes(order.lifecycle_status)
  )
}

export function canCreateInboundDraftFromPurchaseOrder({
  canCreatePurchaseReceipt = false,
  order,
}) {
  return canCreatePurchaseReceipt && order?.lifecycle_status === 'approved'
}
