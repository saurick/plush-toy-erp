import {
  cancelOutsourcingOrder,
  closeOutsourcingOrder,
  confirmOutsourcingOrder,
  submitOutsourcingOrder,
} from '../../api/masterDataOrderApi.mjs'
import { isDraftSourceDocument } from '../../utils/sourceDocumentEditing.mjs'

export const OUTSOURCING_ORDER_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '已提交', value: 'submitted' },
  { label: '已确认', value: 'confirmed' },
  { label: '已关闭', value: 'closed' },
  { label: '已取消', value: 'canceled' },
]

export const OUTSOURCING_ORDER_SORT_OPTIONS = [
  { label: '最新优先', value: 'updated_at:desc' },
  { label: '最早优先', value: 'updated_at:asc' },
  { label: '下单日期新到旧', value: 'order_date:desc' },
  { label: '下单日期旧到新', value: 'order_date:asc' },
  { label: '预计回货日期新到旧', value: 'expected_return_date:desc' },
  { label: '预计回货日期旧到新', value: 'expected_return_date:asc' },
]

export const OUTSOURCING_ORDER_DATE_FILTER_OPTIONS = [
  { label: '下单日期', value: 'order_date' },
  { label: '预计回货日期', value: 'expected_return_date' },
]

export const OUTSOURCING_ORDER_LIFECYCLE_ACTIONS = [
  {
    key: 'submit',
    label: '提交',
    permission: 'outsourcing.order.update',
    nextStatus: 'submitted',
    run: submitOutsourcingOrder,
  },
  {
    key: 'confirm',
    label: '确认下单',
    permission: 'outsourcing.order.confirm',
    nextStatus: 'confirmed',
    run: confirmOutsourcingOrder,
  },
  {
    key: 'close',
    label: '关闭',
    permission: 'outsourcing.order.update',
    nextStatus: 'closed',
    confirmTitle: '确认关闭加工合同',
    confirmContent:
      '关闭只停止加工合同后续推进，不会自动写发料、回货、库存或财务事实。',
    okText: '确认关闭',
    run: closeOutsourcingOrder,
  },
  {
    key: 'cancel',
    label: '取消',
    permission: 'outsourcing.order.update',
    nextStatus: 'canceled',
    danger: true,
    confirmTitle: '确认取消加工合同',
    confirmContent:
      '取消只终止合同源单，不会自动冲正已经登记的发料、回货或财务事实。',
    okText: '确认取消',
    run: cancelOutsourcingOrder,
  },
]

export const DEFAULT_OUTSOURCING_ORDER_PAGINATION = {
  current: 1,
  pageSize: 20,
}

export const OUTSOURCING_ORDERS_MODULE_KEY = 'processing-contracts'
export const OUTSOURCING_ORDER_UNNUMBERED_LABEL = '加工合同未编号'

export function parseOutsourcingOrderSortValue(value = 'updated_at:desc') {
  const [sortBy = 'updated_at', sortDirection = 'desc'] =
    String(value).split(':')
  return { sortBy, sortDirection }
}

export function workflowPayloadOf(task = {}) {
  return task.payload && typeof task.payload === 'object' ? task.payload : {}
}

export function canEditOutsourcingOrder(record) {
  return Boolean(isDraftSourceDocument(record))
}

export function getOutsourcingOrderDisplayNo(record = {}) {
  return record?.outsourcing_order_no || OUTSOURCING_ORDER_UNNUMBERED_LABEL
}

export function buildOutsourcingOrderStats({ rows = [], total = 0 }) {
  const activeRows = rows.length
  const draftCount = rows.filter(
    (item) => item.lifecycle_status === 'draft'
  ).length
  const confirmedCount = rows.filter(
    (item) => item.lifecycle_status === 'confirmed'
  ).length

  return [
    { key: 'total', label: '总记录', value: total },
    { key: 'current', label: '当前结果', value: activeRows },
    { key: 'draft', label: '草稿', value: draftCount },
    { key: 'confirmed', label: '已确认', value: confirmedCount },
  ]
}
