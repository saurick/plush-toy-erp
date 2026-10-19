import { getSalesOrder, listAllSalesOrderItems } from '../../api/masterDataOrderApi.mjs'
import { getPurchaseReceipt } from '../../api/purchaseApi.mjs'
import { listAllProductionFacts } from '../../api/operationalFactApi.mjs'

export async function loadMobileTaskRelatedSource(task, kind, options = {}) {
  if (task.source_type === 'sales_order' && ['production_plan', 'shipment'].includes(kind)) {
    const record = await getSalesOrder({ id: task.source_id }, options)
    if (record?.id !== task.source_id || record.lifecycle_status !== 'active') throw new Error('当前销售订单尚未生效')
    const result = await listAllSalesOrderItems({ sales_order_id: record.id, expected_version: record.version }, options)
    const items = result.sales_order_items
    if (!items?.length || items.some((item) => item.sales_order_id !== record.id)) throw new Error('销售订单来源明细不完整')
    return { record, items }
  }
  if (task.source_type === 'purchase_receipt' && kind === 'inventory') {
    const record = await getPurchaseReceipt({ id: task.source_id }, options)
    if (record?.id !== task.source_id || record.status !== 'POSTED' || !record.items?.length) throw new Error('请先完成来源材料入库')
    const items = record.items.filter((item) => item.posted && item.lot_id && item.warehouse_id)
    if (!items.length) throw new Error('当前收货还没有可核对的已入库批次')
    return { record, items }
  }
  if (task.source_type === 'production_fact' && kind === 'inventory') {
    const result = await listAllProductionFacts({ keyword: task.source_no }, options)
    const records = result.production_facts.filter((row) => row.id === task.source_id)
    if (records.length !== 1 || records[0].status !== 'POSTED' || !records[0].lot_id || !records[0].warehouse_id) throw new Error('请先完成来源成品入库')
    return { record: records[0], items: [records[0]] }
  }
  throw new Error('当前任务不支持这项关联办理')
}
