import { getEngineeringMaterialRequest, getSalesOrder, getPurchaseOrder, getOutsourcingOrder } from '../api/masterDataOrderApi.mjs'
import { getPurchaseReceipt, getPurchaseRejectionDisposition } from '../api/purchaseApi.mjs'
import { getQualityInspection } from '../api/qualityApi.mjs'
import { getProductionOrder } from '../api/productionOrderApi.mjs'
import { getProductionWip } from '../api/productionWipApi.mjs'
import { getFinancePayment, getShipment, getProductionException, listProductionFacts, listOutsourcingFacts } from '../api/operationalFactApi.mjs'
import { getInventoryOperation } from '../api/inventoryApi.mjs'
import { getEngineeringMaterialTaskContext } from './engineeringMaterialTask.mjs'
import { resolveMobileTaskBusinessEntry } from '../mobile/utils/mobileTaskBusiness.mjs'
import { workflowTaskBusinessSummary } from './workflowTaskBusinessSummary.mjs'
import { canReadReference, loadReferenceIDs } from './remoteReferences.mjs'

const getters = {
  sales_order: getSalesOrder,
  purchase_order: getPurchaseOrder,
  outsourcing_order: getOutsourcingOrder,
  purchase_receipt: getPurchaseReceipt,
  quality_inspection: getQualityInspection,
  shipment: getShipment,
  finance_payment: getFinancePayment,
  inventory_operation: getInventoryOperation,
  production_exception_decision: getProductionException,
  purchase_rejection_disposition: getPurchaseRejectionDisposition,
}

function exactRecord(record, id) {
  if (record?.id !== id) throw new Error('本次来源资料已变化')
  return record
}

async function readCurrentItemNames(record, profile, options) {
  if (!profile || !Array.isArray(record.items)) return record
  const rows = record.items.slice(0, 20)
  const referenceID = (row, type) => Number(type === 'units' ? row.unit_id : type === 'materials' ? row.material_id || (row.subject_type === 'MATERIAL' ? row.subject_id : 0) : row.product_id || (row.subject_type === 'PRODUCT' ? row.subject_id : 0))
  const references = await Promise.all(['materials', 'products', 'units'].map(async (type) => {
    if (!canReadReference(profile, type)) return [type, new Map()]
    const ids = rows.filter((row) => type === 'units' ? !row.unit_name_snapshot && !row.unit_name : !row.material_name_snapshot && !row.material_name && !row.product_name_snapshot && !row.name).map((row) => referenceID(row, type)).filter((id) => Number.isSafeInteger(id) && id > 0)
    const result = ids.length ? await loadReferenceIDs(type, ids, options) : { [type]: [] }
    return [type, new Map(result[type].map((item) => [item.id, item.name]))]
  }))
  const maps = Object.fromEntries(references)
  return { ...record,
items: record.items.map((row, index) => index < 20 ? {
    ...row,
    name: row.name || maps.materials.get(referenceID(row, 'materials')) || maps.products.get(referenceID(row, 'products')),
    unit_name: row.unit_name || maps.units.get(referenceID(row, 'units')),
  } : row) }
}

// Read current source facts through the same APIs as their business editors.
// Historical task outcomes remain in task events; current source data is labelled
// separately so a later source change cannot rewrite the earlier task outcome.
export async function loadWorkflowTaskBusinessReadback(task, { profile, ...options } = {}) {
  const entry = resolveMobileTaskBusinessEntry(task)
  if (!entry) return null
  const id = task.source_id
  const type = task.source_type
  const params = new URL(entry, 'https://erp.invalid').searchParams
  let record
  if (getters[type]) record = exactRecord(await getters[type]({ id }, options), id)
  else if (['production_order', 'production-orders'].includes(type)) {
    const aggregate = await getProductionOrder(id, options)
    record = { ...exactRecord(aggregate.order, id), items: aggregate.items }
  }
  else if (type === 'engineering_material_request') {
    const context = getEngineeringMaterialTaskContext(task)
    if (!context) return null
    record = exactRecord(await getEngineeringMaterialRequest({ sales_order_id: context.orderID, request_id: context.requestID }, options), id)
  } else if (['production_wip_batch', 'production_packaging_confirmation'].includes(type)) {
    const aggregate = await getProductionWip(Number(params.get('production_order_id')), options)
    record = exactRecord((type === 'production_wip_batch' ? aggregate.batches : aggregate.packagingConfirmations).find((item) => item.id === id), id)
  } else if (['production_fact', 'production-progress', 'outsourcing_fact'].includes(type)) {
    // These existing list APIs have no single-record read. Bound the exact-number
    // query and require the task's immutable identity before displaying anything.
    if (!task.source_no) return null
    const outsourcing = type === 'outsourcing_fact'
    const result = await (outsourcing ? listOutsourcingFacts : listProductionFacts)({ keyword: task.source_no,
limit: 100,
offset: 0,
      ...(outsourcing ? { source_type: 'OUTSOURCING_ORDER', source_id: Number(params.get('outsourcing_order_id')) } : {}) }, options)
    const rows = result[outsourcing ? 'outsourcing_facts' : 'production_facts']
    if (!Array.isArray(rows) || !Number.isSafeInteger(result.total) || result.total < rows.length || result.total > 100 || rows.length > 100) throw new Error('本次来源资料尚未核对完整')
    record = exactRecord(rows.find((item) => item.id === id), id)
  } else return null
  const { recordNo, recordType, fields, items, itemCount } = workflowTaskBusinessSummary(await readCurrentItemNames(record, profile, options))
  return { recordNo, recordType, fields, items, itemCount }
}
