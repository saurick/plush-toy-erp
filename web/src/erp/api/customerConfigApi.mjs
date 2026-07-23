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
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('缺少销售订单，无法启动接单流程')
  }
  return id
}

const PROCESS_RESULT_INVALID_MESSAGE = '销售订单提交结果无法确认，请刷新后重试'

function requireSalesOrderAcceptanceStart(data, salesOrderID) {
  const instance = data?.process_instance
  const node = data?.started_node
  const nodes = data?.nodes
  const validInstance =
    Number.isSafeInteger(instance?.id) &&
    instance.id > 0 &&
    instance.process_key === 'sales_order_acceptance' &&
    instance.business_ref_type === 'sales_order' &&
    instance.business_ref_id === salesOrderID &&
    instance.status === 'active'
  const validNode =
    Number.isSafeInteger(node?.id) &&
    node.id > 0 &&
    Number.isSafeInteger(node?.version) &&
    node.version > 0 &&
    node.process_instance_id === instance?.id &&
    node.node_key === 'submit_sales_order' &&
    node.node_type === 'domain_command' &&
    (node.status === 'active' || node.status === 'completed')
  const matchingNode = Array.isArray(nodes)
    ? nodes.find(
        (item) =>
          item?.id === node?.id &&
          item.process_instance_id === instance?.id &&
          item.node_key === node?.node_key &&
          item.node_type === node?.node_type &&
          item.status === node?.status &&
          item.version === node?.version
      )
    : null
  if (
    !validInstance ||
    !validNode ||
    !matchingNode ||
    node.outcome === 'domain_command.compensated'
  ) {
    throw new Error(PROCESS_RESULT_INVALID_MESSAGE)
  }
  if (
    node.status === 'completed' &&
    node.outcome !== 'sales_order.submitted'
  ) {
    throw new Error(PROCESS_RESULT_INVALID_MESSAGE)
  }
  return { instance, node }
}

function requireSalesOrderAcceptanceExecution(data, expected) {
  const node = data?.completed_node
  const nodes = data?.nodes
  const matchingNode = Array.isArray(nodes)
    ? nodes.find(
        (item) =>
          item?.id === node?.id &&
          item.process_instance_id === expected.instanceID &&
          item.node_key === 'submit_sales_order' &&
          item.node_type === 'domain_command' &&
          item.status === 'completed' &&
          item.version === node?.version
      )
    : null
  if (
    !node ||
    node.id !== expected.nodeID ||
    node.process_instance_id !== expected.instanceID ||
    node.node_key !== 'submit_sales_order' ||
    node.node_type !== 'domain_command' ||
    node.status !== 'completed' ||
    node.outcome !== 'sales_order.submitted' ||
    node.version !== expected.version + 1 ||
    !matchingNode
  ) {
    throw new Error(PROCESS_RESULT_INVALID_MESSAGE)
  }
  return node
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
  const { instance: processInstance, node: startedNode } =
    requireSalesOrderAcceptanceStart(startData, salesOrderID)
  if (startedNode.status === 'completed') {
    return startData
  }
  const executeData = await executeSalesOrderAcceptanceSubmit({
    customer_key: startPayload.customer_key,
    process_instance_id: processInstance.id,
    process_node_instance_id: startedNode.id,
    expected_version: startedNode.version,
    sales_order_id: salesOrderID,
    idempotency_key: `${baseIdempotencyKey}/submit`,
  })
  requireSalesOrderAcceptanceExecution(executeData, {
    instanceID: processInstance.id,
    nodeID: startedNode.id,
    version: startedNode.version,
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
