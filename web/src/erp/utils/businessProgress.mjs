import { TASK_BOARD_PAGE_SIZE_OPTIONS } from './workflowTaskBoard.mjs'

const integer = (value) => Number.isSafeInteger(value) && value >= 0
const decimal = (value) =>
  value === null || (typeof value === 'string' && /^\d+(\.\d+)?$/u.test(value))
const counters = [
  'product_count',
  'engineering_total',
  'engineering_ready',
  'production_orders',
  'production_closed',
  'material_total',
  'material_pending',
  'in_progress_batches',
  'outsourced_batches',
  'waiting_batches',
  'rejected_batches',
  'planned_batches',
  'open_tasks',
  'blocked_tasks',
  'unassigned_tasks',
  'attention_task_id',
  'operation_count',
]

function invalid() {
  return Object.assign(new Error('进度数据暂不可用，请重试'), {
    isInvalidResponse: true,
  })
}
function validEnvelope(value) {
  return (
    value &&
    typeof value.snapshot_at === 'string' &&
    Number.isFinite(Date.parse(value.snapshot_at)) &&
    ['sales', 'production', 'tasks', 'wip'].every(
      (key) => typeof value.access?.[key] === 'boolean'
    )
  )
}
function validRow(row) {
  return (
    row &&
    integer(row.id) &&
    row.id > 0 &&
    ['orders', 'production'].includes(row.view) &&
    [
      'order_no',
      'status',
      'customer',
      'product',
      'sales_owner',
      'unit',
      'attention_task',
      'attention_reason',
      'attention_owner',
      'attention_role',
      'due_date',
      'updated_at',
      'current_operation',
    ].every((key) => typeof row[key] === 'string') &&
    integer(row.product_id) &&
    counters.every((key) => integer(row[key])) &&
    [
      'active',
      'overdue',
      'due_soon',
      'blocked',
      'unlinked',
      'delivery_known',
    ].every((key) => typeof row[key] === 'boolean') &&
    decimal(row.ordered_quantity) &&
    decimal(row.shipped_quantity) &&
    decimal(row.completed_quantity) &&
    (row.delivery_known || row.shipped_quantity === null)
  )
}
export function requireProgressBoard(value) {
  if (
    !validEnvelope(value) ||
    !Array.isArray(value.rows) ||
    !integer(value.total) ||
    !['total', 'overdue', 'due_soon', 'blocked', 'undated'].every((key) =>
      integer(value.counts?.[key])
    ) ||
    value.total > value.counts.total ||
    value.rows.length > value.total ||
    !value.rows.every(validRow) ||
    new Set(value.rows.map((row) => row.id)).size !== value.rows.length
  ) {
    throw invalid()
  }
  return value
}
export function requireProgressDetail(value) {
  if (
    !validEnvelope(value) ||
    !validRow(value.row) ||
    !value.sections ||
    !value.has_more
  ) {
    throw invalid()
  }
  for (const [key, rows] of Object.entries(value.sections)) {
    if (
      !['lines', 'production', 'materials', 'batches', 'tasks'].includes(key) ||
      !Array.isArray(rows) ||
      rows.length > 100 ||
      !rows.every(
        (row) =>
          row &&
          integer(row.id) &&
          row.id > 0 &&
          integer(row.parent_id) &&
          [
            'kind',
            'number',
            'label',
            'status',
            'quantity',
            'unit',
            'date',
            'owner',
            'role',
            'note',
          ].every((field) => typeof row[field] === 'string')
      )
    ) {
      throw invalid()
    }
  }
  return value
}

export function progressQueryFromURL(params) {
  const allowed = (key, values, fallback) =>
    values.includes(params.get(key)) ? params.get(key) : fallback
  const date = (key) =>
    /^\d{4}-\d{2}-\d{2}$/u.test(params.get(key) || '') ? params.get(key) : ''
  const page = Math.max(
    1,
    Math.min(50000, Number.parseInt(params.get('page'), 10) || 1)
  )
  const requestedLimit = Number(params.get('page_size'))
  const limit = TASK_BOARD_PAGE_SIZE_OPTIONS.includes(requestedLimit)
    ? requestedLimit
    : 20
  return {
    view: allowed('view', ['orders', 'production'], ''),
    keyword: (params.get('q') || '').slice(0, 100),
    scope: allowed('scope', ['active', 'all', 'ended'], 'active'),
    risk: allowed(
      'risk',
      ['all', 'overdue', 'due_soon', 'blocked', 'undated', 'unlinked'],
      'all'
    ),
    owner: (params.get('owner') || '').slice(0, 100),
    date_from: date('from'),
    date_to: date('to'),
    limit,
    offset: (page - 1) * limit,
  }
}

const statusLabels = {
  draft: '待提交',
  submitted: '待生效',
  active: '已生效',
  closed: '已关闭',
  canceled: '已取消',
  DRAFT: '待下达',
  RELEASED: '已下达',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
  PREPARING: '资料准备',
  SAMPLING: '打样中',
  CONFIRMED: '已确认',
  PLANNED: '待开工',
  IN_PROGRESS: '生产中',
  OUTSOURCED: '委外中',
  WAITING_QUALITY: '待检',
  ACCEPTED: '已验收',
  REJECTED: '不合格',
  PENDING: '尚未领齐',
  ISSUED: '按计划领齐',
  ready: '待处理',
  blocked: '阻塞',
  done: '已完成',
  rejected: '已退回',
  withdrawn: '已撤回',
}
export const progressStatusLabel = (status) => statusLabels[status] || '待核对'
export const progressQuantity = (value) =>
  value === null || value === undefined || value === '' ? '—' : String(value)

export function progressStages(row, access = {}) {
  const stages = []
  if (row.view === 'orders') {
    stages.push({
      key: 'engineering',
      label: '资料',
      text: row.engineering_total
        ? `${row.engineering_ready}/${row.engineering_total} 确认`
        : '待完善',
      percent:
        row.engineering_total > 0
          ? Math.min(100, (row.engineering_ready / row.engineering_total) * 100)
          : undefined,
      section: 'lines',
      tone:
        row.engineering_total && row.engineering_ready === row.engineering_total
          ? 'is-complete'
          : '',
    })
  }
  stages.push(
    {
      key: 'materials',
      label: '领料',
      text: !access.production
        ? '无权限'
        : !row.material_total
          ? '待核对'
          : row.material_pending
            ? `${row.material_pending} 项待领`
            : '已领齐',
      section: 'materials',
      disabled: !access.production,
      percent:
        access.production && row.material_total > 0
          ? Math.max(
              0,
              ((row.material_total - row.material_pending) /
                row.material_total) *
                100
            )
          : undefined,
      tone: access.production && row.material_pending ? 'is-attention' : '',
    },
    {
      key: 'production',
      label: '生产',
      text: !access.wip
        ? '无权限'
        : row.current_operation
          ? row.current_operation + (row.operation_count > 1 ? '等' : '')
          : row.in_progress_batches
            ? `${row.in_progress_batches} 批在制`
            : row.outsourced_batches
              ? `${row.outsourced_batches} 批委外`
              : row.planned_batches
                ? `${row.planned_batches} 批待开`
                : row.production_orders
                  ? `${row.production_orders} 张单`
                  : '未关联',
      section:
        row.in_progress_batches || row.outsourced_batches || row.planned_batches
          ? 'batches'
          : 'production',
      disabled: !access.wip,
      percent:
        access.wip && row.view === 'production'
          ? progressDelivery(row).percent
          : undefined,
    },
    {
      key: 'quality',
      label: '质检',
      text: !access.wip
        ? '无权限'
        : [
            row.waiting_batches && `${row.waiting_batches} 批待检`,
            row.rejected_batches && `${row.rejected_batches} 批不合格`,
          ]
            .filter(Boolean)
            .join(' · ') || '查看批次',
      section: 'batches',
      disabled: !access.wip,
      tone:
        access.wip && (row.waiting_batches || row.rejected_batches)
          ? 'is-attention'
          : '',
    }
  )
  if (row.view === 'orders') {
    const delivery = progressDelivery(row)
    stages.push({
      key: 'shipment',
      label: '出货',
      text: delivery.text,
      percent: delivery.percent,
      section: 'lines',
    })
  }
  return stages
}

export function progressDelivery(row) {
  if (row.view !== 'orders') {
    if (row.completed_quantity === null || row.ordered_quantity === null) {
      return {
        label: '计划数量',
        text:
          row.ordered_quantity === null
            ? '按明细查看'
            : `${row.ordered_quantity} ${row.unit}`,
      }
    }
    const planned = Number(row.ordered_quantity)
    const completed = Number(row.completed_quantity)
    return {
      label: '有效完工 / 计划',
      text: `${row.completed_quantity} / ${row.ordered_quantity} ${row.unit}`,
      percent:
        planned > 0 ? Math.min(100, (completed / planned) * 100) : undefined,
    }
  }
  if (!row.delivery_known) return { label: '出货进度', text: '关联待核对' }
  if (row.ordered_quantity === null || row.shipped_quantity === null) {
    return { label: '出货进度', text: '多单位 · 查看明细' }
  }
  const ordered = Number(row.ordered_quantity)
  const shipped = Number(row.shipped_quantity)
  if (
    !(ordered > 0) ||
    !Number.isFinite(ordered) ||
    !Number.isFinite(shipped)
  ) {
    return { label: '出货进度', text: '待核对' }
  }
  return {
    label: '已出货 / 订购',
    text: `${progressQuantity(row.shipped_quantity)} / ${progressQuantity(
      row.ordered_quantity
    )} ${row.unit}`,
    percent: Math.min(100, (shipped / ordered) * 100),
    complete: shipped >= ordered,
  }
}

export function progressSourcePath(record, view = 'orders') {
  if (record.kind === 'task') {
    return `/erp/task-board?q=${encodeURIComponent(record.number)}&status=all`
  }
  if (record.kind === 'sales_line') {
    return `/erp/sales/project-orders/sales-orders?sales_order_id=${record.parent_id}`
  }
  if (record.kind === 'batch') {
    return `/erp/production/orders?production_order_id=${
      record.parent_id
    }&wip_batch_id=${record.id}`
  }
  if (record.kind === 'production_line') {
    return `/erp/production/orders?production_order_id=${
      record.parent_id
    }&production_order_item_id=${record.id}`
  }
  if (record.kind === 'material') {
    return `/erp/production/orders?production_order_id=${record.parent_id}`
  }
  if (record.kind === 'production' || view === 'production') {
    return `/erp/production/orders?production_order_id=${record.id}`
  }
  return `/erp/sales/project-orders/sales-orders?sales_order_id=${record.id}`
}
