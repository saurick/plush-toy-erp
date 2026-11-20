import { getSalesOrder, listAllSalesOrderItems, saveSalesOrderEngineering } from '../api/masterDataOrderApi.mjs'
import { SalesOrderItemStatus } from '../../common/consts/statuses.generated.mjs'
import { getBOMVersion } from '../api/bomApi.mjs'
import { getWorkflowTask, completeWorkflowTaskAction } from '../api/workflowApi.mjs'

export async function readTaskBOMOrder(orderID, options) {
  const order = await getSalesOrder({ id: orderID }, options)
  const detail = await listAllSalesOrderItems({ sales_order_id: orderID, expected_version: order.version }, options)
  return { order, items: detail.sales_order_items.filter((item) => item.line_status === SalesOrderItemStatus.OPEN) }
}

const sourceIdentity = (item) => JSON.stringify([
  item.product_id || null, item.product_sku_id || null, item.bom_id || null,
])

// Read before retrying: a lost response must not repeat a successful association
// or overwrite a product/BOM selection made by another operator.
export async function saveTaskBOMOrderLink({ orderID, source, bom }) {
  const current = await readTaskBOMOrder(orderID)
  const line = current.items.find((item) => item.id === source.id)
  if (!line) throw new Error('本单产品已取消或移除，请重新打开任务核对。')
  if (line.bom_id === bom.id && line.product_id === bom.product_id) {
    return current
  }
  if (sourceIdentity(line) !== sourceIdentity(source)) {
    throw new Error('本单产品的工程资料已被修改，请重新打开任务核对；已保存的 BOM 会保留。')
  }
  await saveSalesOrderEngineering({
    id: orderID,
    expected_version: current.order.version,
    items: [{
      id: line.id,
      product_id: bom.product_id,
      product_sku_id: line.product_id === bom.product_id ? line.product_sku_id || null : null,
      bom_id: bom.id,
      expected_bom_version: bom.edit_version,

    }],
  })
  const saved = await readTaskBOMOrder(orderID)
  const savedLine = saved.items.find((item) => item.id === source.id)
  if (savedLine?.bom_id !== bom.id || savedLine.product_id !== bom.product_id) {
    throw new Error('BOM 已保存，订单关联结果暂未确认，请重试保存。')
  }
  return saved
}

export const engineeringMaterialLocked = (order) => ['SUBMITTED', 'BOSS_APPROVED', 'APPROVED'].includes(order?.engineering_material_status)

// Completion uses the current order version and every open product. A saved BOM
// survives workflow failures; retry reads the authoritative outcome first.
export async function completeTaskEngineering({ orderID, sources, taskID, attempts }) {
  let current = await readTaskBOMOrder(orderID)
  if (current.items.length !== sources.length || current.items.some((line) => sourceIdentity(line) !== sourceIdentity(sources.find((item) => item.id === line.id) || {}))) {
    throw new Error('本单产品的工程资料已被修改，请重新打开任务核对。')
  }
  if (!engineeringMaterialLocked(current.order)) {
    const items = await Promise.all(current.items.map(async (line) => {
      if (!line.product_id || !line.bom_id) throw new Error(`请先完善第 ${line.line_no} 行的产品和 BOM，再完成工程资料。`)
      const bom = await getBOMVersion({ id: line.bom_id })
      return { id: line.id, product_id: line.product_id, product_sku_id: line.product_sku_id || null, bom_id: line.bom_id, expected_bom_version: bom.edit_version }
    }))
    await saveSalesOrderEngineering({ id: orderID, expected_version: current.order.version, complete: true, items })
    current = await readTaskBOMOrder(orderID)
  }
  if (taskID) {
    const task = await getWorkflowTask(taskID)
    if (task.task_status_key !== 'done') {
      if (task.task_status_key !== 'ready') throw new Error('工程资料已保存，当前任务不能完成，请核对任务状态。')
      await attempts.run({ scope: `engineering:${taskID}`, operation: 'complete', mutate: completeWorkflowTaskAction, params: { task_id: taskID, expected_version: task.version, action_key: 'complete', payload: {} } })
    }
  }
  return current
}
