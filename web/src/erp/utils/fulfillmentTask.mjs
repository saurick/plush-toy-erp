const SOURCE_TYPES = Object.freeze({
  purchase_arrival: 'purchase_order',
  receipt_quality: 'quality_inspection',
  receipt_inbound: 'purchase_receipt',
  receipt_exception: 'purchase_receipt',
  outsourcing_contract: 'outsourcing_order',
  outsourcing_issue: 'outsourcing_order',
  outsourcing_return: 'outsourcing_order',
  outsourcing_quality: 'quality_inspection',
  outsourcing_inbound: 'outsourcing_fact',
  production_execute: 'production_wip_batch',
  production_return: 'production_wip_batch',
  production_quality: 'quality_inspection',
  production_transfer: 'production_wip_batch',
  production_exception: 'production_wip_batch',
  production_packaging: 'production_packaging_confirmation',
  production_completion: 'production_wip_batch',
  production_inbound: 'production_fact',
})

export function isFulfillmentTask(task) {
  return String(task?.task_group || '').startsWith('handoff_')
}

export function fulfillmentTaskEntryPath(task) {
  if (!isFulfillmentTask(task)) return ''
  const kind = task.task_group.slice('handoff_'.length)
  const id = Number(task.source_id)
  const payload = task.payload || {}
  if (
    !SOURCE_TYPES[kind] ||
    task.source_type !== SOURCE_TYPES[kind] ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    Number(payload.source_record_id) !== id ||
    task.task_code !== `source-${task.task_group.replaceAll('_', '-')}-${id}` ||
    payload.source_task_producer !== 'fulfillment.source' ||
    payload.source_task_contract !== 'workflow.source-task/v1' ||
    !/^[a-f0-9]{64}$/u.test(payload.source_task_intent_hash || '')
  ) {
    return ''
  }
  const path = String(payload.entry_path || '')
  if (kind === 'receipt_exception') {
    return path ===
      `/erp/production/quality-inspections?purchase_receipt_id=${id}`
      ? path
      : ''
  }
  const source = SOURCE_TYPES[kind]
  const expected = {
    purchase_order: `/erp/purchase/accessories?purchase_order_id=${id}`,
    purchase_receipt: `/erp/warehouse/inbound?receipt_id=${id}`,
    quality_inspection: `/erp/production/quality-inspections?quality_inspection_id=${id}`,
    outsourcing_order: `/erp/purchase/processing-contracts?outsourcing_order_id=${id}`,
    production_fact: `/erp/production/progress?fact_id=${id}`,
  }[source]
  if (expected) return path === expected ? path : ''
  if (source === 'production_wip_batch') {
    return new RegExp(
      `^/erp/production/orders\\?production_order_id=[1-9][0-9]*&wip_batch_id=${id}$`,
      'u'
    ).test(path)
      ? path
      : ''
  }
  if (source === 'production_packaging_confirmation') {
    return /^\/erp\/production\/orders\?production_order_id=[1-9][0-9]*&production_order_item_id=[1-9][0-9]*$/u.test(
      path
    )
      ? path
      : ''
  }
  if (source === 'outsourcing_fact') {
    return new RegExp(
      `^/erp/purchase/processing-contracts\\?outsourcing_order_id=[1-9][0-9]*&outsourcing_fact_id=${id}$`,
      'u'
    ).test(path)
      ? path
      : ''
  }
  return ''
}
