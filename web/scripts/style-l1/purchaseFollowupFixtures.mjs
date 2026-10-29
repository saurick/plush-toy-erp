import { currentBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { moveBusinessDate } from '../../src/erp/utils/businessVisualizationModels.mjs'

// Browser fixtures return a paginated server projection; business truth is
// covered by the repository tests, including PostgreSQL and receipt transitions.
export function purchaseFollowupFixture(
  rows,
  params = {},
  today = currentBusinessDate()
) {
  const start = params.start_date || today
  const end = moveBusinessDate(start, 13)
  const scoped = rows.filter(
    (row) =>
      (!params.order_id || row.order_id === params.order_id) &&
      (!params.supplier_id || row.supplier_id === params.supplier_id) &&
      (!params.confirmation ||
        params.confirmation === 'all' ||
        (params.confirmation === 'confirmed'
          ? row.date_source === 'confirmed'
          : row.date_source !== 'confirmed')) &&
      (!params.keyword || JSON.stringify(row).includes(params.keyword))
  )
  const counts = {}
  const days = {}
  for (const row of scoped) {
    counts[row.kind] = (counts[row.kind] || 0) + 1
    if (row.due_date >= start && row.due_date <= end) {
      days[row.due_date] = (days[row.due_date] || 0) + 1
    }
  }
  const selected = scoped.filter(
    (row) =>
      !params.kind ||
      params.kind === 'all' ||
      (params.kind === 'date'
        ? row.due_date === params.selected_date
        : params.kind === 'period'
          ? row.due_date >= start && row.due_date <= end
          : row.kind === params.kind)
  )
  const limit = params.limit || 25
  const offset = params.offset || 0
  return {
    rows: selected.slice(offset, offset + limit),
    total: selected.length,
    counts,
    days,
    as_of_date: today,
    access: { quality: true, commercial: true, finance: true },
    limit,
    offset,
  }
}
