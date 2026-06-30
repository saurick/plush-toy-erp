import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

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

export async function activateCustomerConfig(params = {}) {
  const result = await customerConfigRpc.call(
    'activate_customer_config',
    params
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
