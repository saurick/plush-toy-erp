import { formatUnixDateTime } from './masterDataOrderView.mjs'

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
SUBMITTED: '待审批',
APPROVED: '已批准',
ACTIVE: '已生效',
  POSTED: '已过账',
CANCELLED: '已取消',
CANCELED: '已取消',
CLOSED: '已关闭',
  REJECTED: '已退回',
CONFIRMED: '已确认',
PASSED: '合格',
FAILED: '不合格',
  QUALIFIED: '合格',
UNQUALIFIED: '不合格',
SHIPPED: '已出货',
RELEASED: '已放行',
  COMPLETED: '已完成',
IN_PROGRESS: '进行中',
PREPARING: '准备中',
  BOSS_APPROVED: '待财务审核',
})

const recordNumbers = [
  ['fact_no', '业务记录'], ['inspection_no', '质检单'], ['batch_no', '工序批次'],
  ['receipt_no', '到货单'], ['return_no', '退货单'], ['adjustment_no', '调整单'],
  ['payment_no', '收付款单'], ['shipment_no', '出货单'], ['operation_no', '库存作业'],
  ['order_no', '销售订单'], ['purchase_order_no', '采购订单'], ['outsourcing_order_no', '加工合同'],
  ['decision_no', '异常处置'],
  ['disposition_no', '来料处置单'],
]

const text = (value) => typeof value === 'string' ? value.trim().slice(0, 300) : ''
const quantity = (value) => /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(String(value ?? '').trim()) ? String(value).trim() : ''
const resultTime = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/u.test(value)) {
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? formatUnixDateTime(timestamp / 1000, { emptyText: '' }) : ''
  }
  return formatUnixDateTime(value, { emptyText: '' })
}

// Copy only business-readable scalars from the confirmed domain response.
// This snapshot never derives posting or task completion from a button label.
export function workflowTaskBusinessSummary(record = {}, metadata = {}) {
  const number = recordNumbers.find(([key]) => text(record[key]))
  const bomVersion = !number && typeof record.version === 'string' && Number.isSafeInteger(record.product_id) ? text(record.version) : ''
  const statusValue = text(record.status || record.lifecycle_status).toUpperCase()
  const fields = []
  const add = (label, value) => { if (value) fields.push({ label, value }) }
  add('业务状态', record.disposition_no && statusValue === 'POSTED' ? '已确认' : STATUS_LABELS[statusValue])
  add('BOM 版本', bomVersion)
  add('包装版本', text(record.packaging_version_snapshot || record.packaging_version))
  add('检验结论', ({ PASS: '合格', FAIL: '不合格', CONCESSION: '让步接收' })[text(record.result).toUpperCase()])
  const unit = text(record.unit_name_snapshot || record.unit_name)
  add(unit ? `本次数量（${unit}）` : '本次数量', quantity(record.quantity))
  add('本次金额', quantity(record.amount) ? `${text(record.currency)} ${quantity(record.amount)}`.trim() : '')
  add('检验数量', quantity(record.inspected_quantity))
  add('合格数量', quantity(record.qualified_quantity))
  add('不合格数量', quantity(record.rejected_quantity))
  const rows = Array.isArray(record.items) ? record.items : []
  const items = rows.slice(0, 20).map((row, index) => ({
    label: text(row.material_name_snapshot || row.material_name || row.product_name_snapshot || row.sku_name_snapshot || row.name) || `第 ${row.line_no || index + 1} 行（名称未记录）`,
    quantity: quantity(row.quantity ?? row.received_quantity ?? row.shipped_quantity ?? row.required_quantity ?? row.planned_quantity ?? row.usage),
    unit: text(row.unit_name_snapshot || row.unit_name) || '单位未记录',
  })).filter((row) => row.quantity)
  return {
    recordNo: number ? text(record[number[0]]) : bomVersion,
    recordType: number?.[1] || (bomVersion ? 'BOM' : ''),
    actorLabel: text(record.updated_by_name || metadata.actorLabel),
    timeLabel: resultTime(record.updated_at || record.posted_at || record.finance_reviewed_at || record.boss_reviewed_at || record.submitted_at),
    fields,
    items,
    itemCount: rows.length,
  }
}
