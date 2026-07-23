import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { buildCustomerConfigMutationPayload } from './customerConfigTransition.mjs'
import { submitPurchaseOrder } from './masterDataOrderApi.mjs'

const customerConfigRpc = new JsonRpc({
  url: 'customer_config',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function getEffectiveSession(params = {}) {
  const result = await customerConfigRpc.call('get_effective_session', params)
  return dataOf(result)?.session || null
}

export async function validateCustomerConfig(manifest) {
  const result = await customerConfigRpc.call(
    'validate_customer_config',
    manifest
  )
  return dataOf(result)?.validation || null
}

export async function publishCustomerConfig(manifest) {
  const result = await customerConfigRpc.call(
    'publish_customer_config',
    manifest
  )
  return dataOf(result)?.revision || null
}

export async function checkCustomerConfigTransition(params = {}) {
  const result = await customerConfigRpc.call(
    'check_customer_config_transition',
    params
  )
  return dataOf(result)?.transition || null
}

export async function activateCustomerConfig(params = {}) {
  const result = await customerConfigRpc.call(
    'activate_customer_config',
    buildCustomerConfigMutationPayload('activate', params)
  )
  return dataOf(result)?.revision || null
}

export async function rollbackCustomerConfig(params = {}) {
  const result = await customerConfigRpc.call(
    'rollback_customer_config',
    buildCustomerConfigMutationPayload('rollback', params)
  )
  return dataOf(result)?.revision || null
}

export async function startSalesOrderAcceptanceProcess(params = {}) {
  const result = await customerConfigRpc.call(
    'start_sales_order_acceptance_process',
    params
  )
  return dataOf(result)
}

export async function executeSalesOrderAcceptanceSubmit(params = {}) {
  const result = await customerConfigRpc.call(
    'execute_sales_order_acceptance_submit',
    params
  )
  return dataOf(result)
}

function requirePositiveSalesOrderID(params = {}) {
  const id = Number(params.sales_order_id || params.id || 0)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('缺少销售订单，无法启动接单流程')
  }
  return id
}

export async function submitSalesOrderAcceptanceProcess(params = {}) {
  const salesOrderID = requirePositiveSalesOrderID(params)
  const businessRefNo = String(
    params.business_ref_no || params.order_no || ''
  ).trim()
  const baseIdempotencyKey =
    String(params.idempotency_key || '').trim() ||
    `sales-order-acceptance/${salesOrderID}`
  const startPayload = {
    sales_order_id: salesOrderID,
    business_ref_no: businessRefNo || undefined,
    idempotency_key: baseIdempotencyKey,
  }
  if (params.customer_key) {
    startPayload.customer_key = params.customer_key
  }
  const startData = await startSalesOrderAcceptanceProcess(startPayload)
  const processInstance = startData?.process_instance || null
  const startedNode = startData?.started_node || null
  if (!processInstance?.id || !startedNode?.id || !startedNode?.version) {
    throw new Error('接单流程启动结果缺少流程节点')
  }
  const executeData = await executeSalesOrderAcceptanceSubmit({
    customer_key: startPayload.customer_key,
    process_instance_id: processInstance.id,
    process_node_instance_id: startedNode.id,
    expected_version: startedNode.version,
    sales_order_id: salesOrderID,
    idempotency_key: `${baseIdempotencyKey}/submit`,
  })
  return {
    ...executeData,
    process_instance: processInstance,
    started_node: startedNode,
  }
}

export async function startPurchaseOrderApprovalProcess(params = {}) {
  const result = await customerConfigRpc.call(
    'start_material_supply_purchase_order_process',
    params
  )
  return dataOf(result)
}

export async function submitPurchaseOrderApprovalProcess(params = {}) {
  const purchaseOrderID = Number(params.purchase_order_id || params.id || 0)
  if (!Number.isSafeInteger(purchaseOrderID) || purchaseOrderID <= 0) {
    throw new Error('缺少采购订单，无法提交审批')
  }
  const submitted = await submitPurchaseOrder({
    ...params,
    id: purchaseOrderID,
  })
  const processData = await startPurchaseOrderApprovalProcess({
    customer_key: params.customer_key,
    purchase_order_id: purchaseOrderID,
    business_ref_no:
      String(params.business_ref_no || params.purchase_order_no || '').trim() ||
      undefined,
    idempotency_key:
      String(params.idempotency_key || '').trim() ||
      `purchase-order-approval/${purchaseOrderID}`,
  })
  if (!processData?.process_instance?.id || !processData?.started_node?.id) {
    throw new Error('采购审批流程启动结果缺少流程节点')
  }
  return {
    purchase_order: submitted,
    ...processData,
  }
}

export async function startFinishedGoodsDeliveryProcess(params = {}) {
  const result = await customerConfigRpc.call(
    'start_finished_goods_delivery_process',
    params
  )
  return dataOf(result)
}

export async function submitShipmentFinanceApprovalProcess(params = {}) {
  const shipmentID = Number(params.shipment_id || params.id || 0)
  if (!Number.isSafeInteger(shipmentID) || shipmentID <= 0) {
    throw new Error('缺少出货单，无法提交财务审批')
  }
  const processData = await startFinishedGoodsDeliveryProcess({
    customer_key: params.customer_key,
    shipment_id: shipmentID,
    business_ref_no:
      String(params.business_ref_no || params.shipment_no || '').trim() ||
      undefined,
    idempotency_key:
      String(params.idempotency_key || '').trim() ||
      `shipment-finance-approval/${shipmentID}`,
  })
  if (!processData?.process_instance?.id || !processData?.started_node?.id) {
    throw new Error('出货财务审批流程启动结果缺少流程节点')
  }
  return processData
}
