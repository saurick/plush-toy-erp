import { parseDateInputValue } from './dateRange.mjs'
import { normalizeWorkflowTaskPageSize, getWorkflowTaskOwnerRoleLabel } from './workflowTaskBoard.mjs'
import { getWorkflowTaskDisplayName } from './processRuntimePresentation.mjs'
import { formatBusinessDate } from './businessDate.mjs'

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
    (row.product_type_count === undefined || integer(row.product_type_count)) &&
    (row.product_match_count === undefined ||
      (integer(row.product_match_count) && row.product_match_count <= row.product_type_count)) &&
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
    !['total', 'overdue', 'due_soon', 'blocked', 'undated', 'unlinked'].every(
      (key) => integer(value.counts?.[key])
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

export function progressProductLabel(row) {
  if (row.product_match_count > 0) {
    return `${row.product}（命中 ${row.product_match_count} 款，共 ${row.product_type_count} 款）`
  }
  return `${row.product}${row.product_count > 1 ? ` 等 ${row.product_count} 项` : ''}`
}

export function progressIdentityPresentation(row) {
  const hasProduct = row.product_count > 0 || row.product_id > 0
  return {
    hasProduct,
    product: hasProduct
      ? progressProductLabel({ ...row, product: row.product?.trim() || '产品名称未填写' })
      : '未关联产品／物料',
    reference: row.order_no?.trim() || '单据编号未提供',
    customer: row.customer?.trim() || (row.unlinked ? '含未关联销售明细' : '客户未填写'),
  }
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

export const PROGRESS_SCOPE_OPTIONS = [
  { value: 'active', label: '未结束' },
  { value: 'all', label: '全部记录' },
  { value: 'ended', label: '已结束' },
]

export const PROGRESS_DUE_OPTIONS = [
  { value: 'all', label: '不限交期' },
  { value: 'overdue', label: '已逾期' },
  { value: 'due_soon', label: '7天内到期' },
  { value: 'undated', label: '未定交期' },
]

export function progressDueOptions(scope) {
  return PROGRESS_DUE_OPTIONS.filter(({ value }) =>
    scope !== 'ended' || !['overdue', 'due_soon'].includes(value)
  )
}

export function progressExtraFilters(query) {
  return [
    query.scope !== 'active' && {
      key: 'scope',
      label: PROGRESS_SCOPE_OPTIONS.find(({ value }) => value === query.scope)?.label,
      clear: { scope: 'active' },
    },
    query.due_status === 'undated' && {
      key: 'due_status', label: '未定交期', clear: { due_status: 'all' },
    },
    query.unlinked_only && {
      key: 'unlinked_only', label: '仅看未关联销售', clear: { unlinked_only: false },
    },
    query.owner && {
      key: 'owner', label: `负责人：${query.owner}`, clear: { owner: '' },
    },
    (query.date_from || query.date_to) && {
      key: 'date',
      label: `交期：${query.date_from || '不限'} 至 ${query.date_to || '不限'}`,
      clear: { from: '', to: '' },
    },
  ].filter(Boolean)
}

export function progressFilterCount(query) {
  return progressExtraFilters(query).length
}

export function progressFilterReset(query) {
  return {
    scope: 'active',
    due_status: query.due_status === 'undated' ? 'all' : query.due_status,
    unlinked_only: false,
    owner: '',
    from: '',
    to: '',
  }
}

export function progressQueryFromURL(params) {
  const allowed = (key, values, fallback) =>
    values.includes(params.get(key)) ? params.get(key) : fallback
  const date = (key) =>
    /^\d{4}-\d{2}-\d{2}$/u.test(params.get(key) || '') &&
    parseDateInputValue(params.get(key))
      ? params.get(key)
      : ''
  const reversed = date('from') && date('to') && date('from') > date('to')
  const requestedLimit = Number(params.get('page_size'))
  const limit = normalizeWorkflowTaskPageSize(requestedLimit)
  const page = Math.max(
    1,
    Math.min(
      Math.floor(1000000 / limit) + 1,
      Number.parseInt(params.get('page'), 10) || 1
    )
  )
  const view = allowed('view', ['orders', 'production'], '')
  const scope = allowed('scope', ['active', 'all', 'ended'], 'active')
  const requestedDue = allowed(
    'due_status',
    PROGRESS_DUE_OPTIONS.map(({ value }) => value),
    'all'
  )
  const dueStatus = progressDueOptions(scope).some(({ value }) => value === requestedDue)
    ? requestedDue
    : 'all'
  return {
    view,
    keyword: (params.get('q') || '').slice(0, 100),
    scope,
    due_status: dueStatus,
    blocked_only: scope !== 'ended' && params.get('blocked_only') === 'true',
    unlinked_only: view === 'production' && params.get('unlinked_only') === 'true',
    owner: (params.get('owner') || '').slice(0, 100),
    date_from: dueStatus === 'undated' || reversed ? '' : date('from'),
    date_to: dueStatus === 'undated' || reversed ? '' : date('to'),
    limit,
    offset: (page - 1) * limit,
  }
}

function normalizeProgressFilterParams(params) {
  const next = new URLSearchParams(params)
  const query = progressQueryFromURL(next)
  next.set('scope', query.scope)
  next.set('due_status', query.due_status)
  next.delete('risk')
  for (const key of ['blocked_only', 'unlinked_only']) {
    if (query[key]) next.set(key, 'true')
    else next.delete(key)
  }
  for (const [key, value] of [
    ['from', query.date_from],
    ['to', query.date_to],
  ]) {
    if (value) next.set(key, value)
    else next.delete(key)
  }
  return next
}

export function withProgressFilters(params, changes) {
  const next = normalizeProgressFilterParams(params)
  for (const [key, value] of Object.entries(changes)) {
    if (value === '' || value === null || value === undefined) next.delete(key)
    else next.set(key, String(value))
  }
  // The last date choice wins; normalization also clears incompatible restored filters.
  if (
    (changes.from || changes.to) &&
    changes.due_status !== 'undated' &&
    next.get('due_status') === 'undated'
  ) {
    next.set('due_status', 'all')
  }
  return normalizeProgressFilterParams(next)
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

export function progressDue(row, snapshotAt) {
  const date = row.due_date || ''
  const snapshotDate = snapshotAt ? formatBusinessDate(snapshotAt) : ''
  const days = date && snapshotDate
    ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${snapshotDate}T00:00:00Z`)) / 86400000)
    : NaN
  if (!row.active) return { label: progressStatusLabel(row.status), date, tone: '' }
  if (!date) return { label: '未定交期', date: '', tone: '' }
  if (row.overdue) return { label: Number.isFinite(days) && days < 0 ? `逾期 ${-days} 天` : '已逾期', date, tone: 'danger' }
  if (row.due_soon) return { label: days === 0 ? '今天到期' : Number.isFinite(days) && days > 0 ? `还有 ${days} 天` : '7天内到期', date, tone: 'warning' }
  return { label: '按交期跟进', date, tone: '' }
}

export function progressAttention(row, access, roleLabel = (key) => getWorkflowTaskOwnerRoleLabel({ owner_role_key: key })) {
  const empty = { taskID: null, taskCount: 0, blocked: false, reason: '' }
  if (!access?.tasks) return { ...empty, title: '任务无查看权限', detail: '' }
  if (!row.open_tasks) return { ...empty, title: '暂无可见待办', detail: row.sales_owner ? `业务负责人：${row.sales_owner}` : '业务负责人未提供' }
  const role = row.attention_role ? roleLabel(row.attention_role) : ''
  const detail = row.attention_owner
    ? [role, row.attention_owner].filter(Boolean).join(' · ')
    : role ? `${role} · ${row.unassigned_tasks === row.open_tasks ? '未指定办理人' : '办理人未提供'}` : '负责岗位未提供'
  return {
    title: getWorkflowTaskDisplayName({ task_name: row.attention_task }),
    detail,
    taskID: row.open_tasks === 1 && Number.isSafeInteger(row.attention_task_id) && row.attention_task_id > 0 ? row.attention_task_id : null,
    taskCount: row.open_tasks,
    blocked: Boolean(row.blocked),
    reason: row.blocked ? row.attention_reason : '',
  }
}

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

export function progressDeliveryDetails(row) {
  const delivery = progressDelivery(row)
  const actual = row.view === 'orders' ? row.shipped_quantity : row.completed_quantity
  return {
    label: delivery.label,
    value: delivery.text,
    percent: delivery.percent === undefined
      ? undefined
      : (Number(actual) / Number(row.ordered_quantity)) * 100,
    note: row.view === 'orders'
      ? '按实际出货数量核对订购数量，任务完成不代表已经出货。不同单位分别查看明细。'
      : '按有效完工数量核对计划数量，任务完成不代表已经完工。不同单位分别查看明细。',
  }
}

export function progressMetricDetails(row, key, access = {}) {
  const stage = progressStages(row, access).find((item) => item.key === key)
  if (!stage || stage.disabled) return null
  if (key === 'engineering') {
    return {
      label: '资料确认',
      value: stage.text,
      percent: stage.percent,
      note: '已确认的产品资料项数 / 需确认的资料项数。',
    }
  }
  if (key === 'materials') {
    return {
      label: '领料',
      percent: stage.percent,
      value: row.material_total > 0
        ? `${Math.max(0, row.material_total - row.material_pending)} / ${row.material_total} 项已领齐`
        : '暂无可核对的领料项',
      note: '按已登记领料与计划用量核对；尚未领齐不代表库存缺料。',
    }
  }
  if (key === 'shipment' || (key === 'production' && row.view === 'production')) {
    return progressDeliveryDetails(row)
  }
  return { label: stage.label, value: stage.text, note: '按已登记的工序批次核对，任务完成不代表生产或质检事实完成。' }
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
