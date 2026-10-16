export function progressFixtureRow(index = 0, view = 'orders') {
  return {
    id: index + 1,
    view,
    order_no:
      (view === 'orders' ? 'SO-' : 'MO-') + String(index + 1).padStart(4, '0'),
    status: view === 'orders' ? 'active' : 'RELEASED',
    customer: index === 24 ? '查找目标客户' : `模拟客户 ${index + 1}`,
    product:
      index === 3
        ? '长名称产品：森林系列刺绣抱枕与可拆卸背包配件套装'
        : '云朵小熊',
    product_count: index === 2 ? 3 : 1,
    product_id: index + 7,
    sales_owner: '模拟业务员',
    due_date:
      index === 4
        ? ''
        : index === 0
          ? '2026-09-22'
          : `2026-09-${24 + (index % 6)}`,
    updated_at: '2026-09-24T03:00:00Z',
    active: index !== 8,
    overdue: index === 0,
    due_soon: index === 1,
    blocked: index === 0,
    unlinked: view === 'production' && index === 2,
    unit: '只',
    ordered_quantity:
      index === 2 ? null : index === 6 ? '123456789.1234' : '800',
    shipped_quantity:
      view === 'orders' && index !== 2
        ? index === 6
          ? '98765432.1256'
          : '400'
        : null,
    completed_quantity: view === 'production' && index !== 2 ? '560' : null,
    delivery_known: view === 'orders',
    engineering_total: 1,
    engineering_ready: 1,
    production_orders: 2,
    production_closed: 0,
    material_total: 4,
    material_pending: index === 0 ? 1 : 0,
    current_operation: index % 2 ? '手工缝制' : '车缝',
    operation_count: 1,
    in_progress_batches: 2,
    outsourced_batches: 1,
    waiting_batches: index === 1 ? 1 : 0,
    rejected_batches: 0,
    planned_batches: 0,
    open_tasks: index === 0 ? 2 : 0,
    blocked_tasks: index === 0 ? 1 : 0,
    unassigned_tasks: index === 0 ? 1 : 0,
    attention_task_id: index === 0 ? 100 : 0,
    attention_task: index === 0 ? '确认面料交期' : '',
    attention_reason: index === 0 ? '面料交期尚未确认' : '',
    attention_owner: '',
    attention_role: index === 0 ? 'purchase' : '',
  }
}

export function progressFixtureData(
  params = {},
  { restricted = false, detail = false } = {}
) {
  const view = params.view || 'orders'
  const access = {
    sales: true,
    production: !restricted,
    wip: !restricted,
    tasks: !restricted,
  }
  const snapshot_at = '2026-09-24T04:00:00Z'
  if (detail) {
    const row = progressFixtureRow(Number(params.id) - 1, view)
    const record = {
      id: 1,
      kind: view === 'orders' ? 'sales_line' : 'production_line',
      number: '1',
      label: '云朵小熊',
      status: 'CONFIRMED',
      quantity: '800',
      unit: '只',
      date: '2026-09-26',
      owner: '',
      role: '',
      note: view === 'orders' ? '已出货 400' : '未关联销售订单',
      parent_id: row.id,
    }
    const sections = { lines: [record] }
    if (!restricted) {
      Object.assign(sections, {
        production: [
          {
            ...record,
            id: 10,
            kind: 'production',
            number: 'MO-0010',
            label: '',
            status: 'RELEASED',
            note: '',
          },
        ],
        materials: [
          {
            ...record,
            kind: 'material',
            number: 'MAT-01',
            label: '短毛绒面料',
            status: 'PENDING',
            quantity: '120',
            unit: '米',
            note: '已领 80',
            parent_id: 10,
          },
        ],
        batches: [
          {
            ...record,
            kind: 'batch',
            number: 'BATCH-01',
            label: '手工缝制',
            status: 'WAITING_QUALITY',
            quantity: '200',
            note: '',
            parent_id: 10,
          },
        ],
        tasks: [
          {
            ...record,
            id: 100,
            kind: 'task',
            number: 'TASK-0100',
            label: '确认面料交期',
            status: 'blocked',
            quantity: '',
            unit: '',
            role: 'purchase',
            note: '面料交期尚未确认',
          },
        ],
      })
    }
    return { row, sections, has_more: {}, snapshot_at, access }
  }
  const base = Array.from({ length: 25 }, (_, i) =>
    progressFixtureRow(i, view)
  ).filter(
    (row) =>
      (params.scope === 'all' ||
        (params.scope === 'ended' ? !row.active : row.active)) &&
      (!params.keyword ||
        [
          row.order_no,
          row.customer,
          row.product,
          row.sales_owner,
          row.attention_owner,
          row.attention_role,
        ].some((s) => s.includes(params.keyword))) &&
      (!params.owner || row.sales_owner.includes(params.owner)) &&
      (!params.date_from || row.due_date >= params.date_from) &&
      (!params.date_to || (row.due_date && row.due_date <= params.date_to))
  )
  const counts = {
    total: base.length,
    overdue: base.filter((r) => r.overdue).length,
    due_soon: base.filter((r) => r.due_soon).length,
    blocked: restricted ? 0 : base.filter((r) => r.blocked).length,
    undated: base.filter((r) => !r.due_date).length,
  }
  const matches = base.filter(
    (r) =>
      !params.risk ||
      params.risk === 'all' ||
      (params.risk === 'undated' ? !r.due_date : r[params.risk])
  )
  const rows = matches
    .slice(params.offset || 0, (params.offset || 0) + (params.limit || 20))
    .map((r) =>
      restricted
        ? {
            ...r,
            production_orders: 0,
            material_total: 0,
            material_pending: 0,
            in_progress_batches: 0,
            outsourced_batches: 0,
            waiting_batches: 0,
            current_operation: '',
            operation_count: 0,
            open_tasks: 0,
            blocked_tasks: 0,
            unassigned_tasks: 0,
            attention_task_id: 0,
            attention_task: '',
            attention_reason: '',
            attention_role: '',
          }
        : r
    )
  return { rows, total: matches.length, counts, snapshot_at, access }
}
