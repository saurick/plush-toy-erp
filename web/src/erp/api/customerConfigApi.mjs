import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { buildCustomerConfigMutationPayload } from './customerConfigTransition.mjs'

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

export async function executeMaterialSupplyPurchaseOrderSubmit(params = {}) {
  const result = await customerConfigRpc.call(
    'execute_material_supply_purchase_order_submit',
    params
  )
  return dataOf(result)
}

const PURCHASE_PROCESS_RESULT_INVALID_MESSAGE =
  '采购订单提交结果无法确认，请刷新后重试'

function requireMaterialSupplyPurchaseStart(data, purchaseOrderID) {
  const instance = data?.process_instance
  const node = data?.started_node
  const nodes = data?.nodes
  const validInstance =
    Number.isSafeInteger(instance?.id) &&
    instance.id > 0 &&
    instance.process_key === 'material_supply' &&
    instance.business_ref_type === 'purchase_order' &&
    instance.business_ref_id === purchaseOrderID &&
    instance.status === 'active'
  const validNode =
    Number.isSafeInteger(node?.id) &&
    node.id > 0 &&
    Number.isSafeInteger(node?.version) &&
    node.version > 0 &&
    node.process_instance_id === instance?.id &&
    node.node_key === 'submit_purchase_order' &&
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
    throw new Error(PURCHASE_PROCESS_RESULT_INVALID_MESSAGE)
  }
  if (
    node.status === 'completed' &&
    node.outcome !== 'purchase_order.submitted'
  ) {
    throw new Error(PURCHASE_PROCESS_RESULT_INVALID_MESSAGE)
  }
  return { instance, node }
}

function requireMaterialSupplyPurchaseExecution(data, expected) {
  const node = data?.completed_node
  const nodes = data?.nodes
  const matchingNode = Array.isArray(nodes)
    ? nodes.find(
        (item) =>
          item?.id === node?.id &&
          item.process_instance_id === expected.instanceID &&
          item.node_key === 'submit_purchase_order' &&
          item.node_type === 'domain_command' &&
          item.status === 'completed' &&
          item.version === node?.version
      )
    : null
  if (
    !node ||
    node.id !== expected.nodeID ||
    node.process_instance_id !== expected.instanceID ||
    node.node_key !== 'submit_purchase_order' ||
    node.node_type !== 'domain_command' ||
    node.status !== 'completed' ||
    node.outcome !== 'purchase_order.submitted' ||
    node.version !== expected.version + 1 ||
    !matchingNode
  ) {
    throw new Error(PURCHASE_PROCESS_RESULT_INVALID_MESSAGE)
  }
  return node
}

export async function submitPurchaseOrderApprovalProcess(params = {}) {
  const purchaseOrderID = Number(params.purchase_order_id || params.id || 0)
  if (!Number.isSafeInteger(purchaseOrderID) || purchaseOrderID <= 0) {
    throw new Error('缺少采购订单，无法提交审批')
  }
  const baseIdempotencyKey =
    String(params.idempotency_key || '').trim() ||
    `purchase-order-approval/${purchaseOrderID}`
  const startData = await startPurchaseOrderApprovalProcess({
    customer_key: params.customer_key,
    purchase_order_id: purchaseOrderID,
    business_ref_no:
      String(params.business_ref_no || params.purchase_order_no || '').trim() ||
      undefined,
    idempotency_key: baseIdempotencyKey,
  })
  const { instance: processInstance, node: startedNode } =
    requireMaterialSupplyPurchaseStart(startData, purchaseOrderID)
  if (startedNode.status === 'completed') {
    return startData
  }
  const executeData = await executeMaterialSupplyPurchaseOrderSubmit({
    customer_key: params.customer_key,
    process_instance_id: processInstance.id,
    process_node_instance_id: startedNode.id,
    expected_version: startedNode.version,
    purchase_order_id: purchaseOrderID,
    idempotency_key: `${baseIdempotencyKey}/submit`,
  })
  requireMaterialSupplyPurchaseExecution(executeData, {
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

const EXCEPTION_PROCESS_CONTRACTS = Object.freeze({
  sales_return_acceptance: Object.freeze({
    businessRefType: 'sales_return',
    idParam: 'sales_return_id',
    startMethod: 'start_sales_return_acceptance_process',
    getMethod: 'get_sales_return_acceptance_process',
    startNodeKey: 'sales_return_approval',
    executeMethods: Object.freeze({
      execute_sales_return_receive: 'receive_sales_return',
    }),
  }),
  finance_payment_approval: Object.freeze({
    businessRefType: 'finance_payment',
    idParam: 'finance_payment_id',
    startMethod: 'start_finance_payment_approval_process',
    getMethod: 'get_finance_payment_approval_process',
    startNodeKey: 'finance_payment_approval',
    executeMethods: Object.freeze({
      execute_finance_payment_post: 'post_finance_payment',
    }),
  }),
  inventory_adjustment_approval: Object.freeze({
    businessRefType: 'inventory_operation',
    idParam: 'inventory_operation_id',
    startMethod: 'start_inventory_adjustment_approval_process',
    getMethod: 'get_inventory_adjustment_approval_process',
    startNodeKey: 'submit_inventory_adjustment',
    executeMethods: Object.freeze({
      execute_inventory_adjustment_submit: 'submit_inventory_adjustment',
      execute_inventory_adjustment_post: 'post_inventory_adjustment',
    }),
  }),
  production_exception_approval: Object.freeze({
    businessRefType: 'production_exception_decision',
    idParam: 'production_exception_id',
    startMethod: 'start_production_exception_approval_process',
    getMethod: 'get_production_exception_approval_process',
    startNodeKey: 'production_exception_decision_approval',
    executeMethods: Object.freeze({
      execute_production_exception_process: 'execute_production_exception',
    }),
  }),
})

const EXCEPTION_PROCESS_RESULT_INVALID_MESSAGE =
  '异常业务流程结果无法确认，请刷新后重试'
const PROCESS_DOMAIN_COMMAND_RECOVERY_DECISION =
  'terminate_and_withdraw_downstream'
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u

function exceptionProcessResultInvalid() {
  return Object.assign(new Error(EXCEPTION_PROCESS_RESULT_INVALID_MESSAGE), {
    isInvalidResponse: true,
  })
}

function requireExceptionProcessSourceID(contract, params = {}) {
  const id = Number(params[contract.idParam] || 0)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw exceptionProcessResultInvalid()
  }
  return id
}

function requireExceptionProcessNode(node, instanceID) {
  const effectState = node?.domain_command_effect_state
  const resultHash = node?.domain_command_result_hash
  const compensationHash = node?.domain_command_compensation_hash
  const recoveryDecision = node?.domain_command_recovery_decision
  const hasValidDomainResult =
    (effectState == null && resultHash == null) ||
    (node?.node_type === 'domain_command' &&
      ['unknown', 'none', 'applied', 'compensated'].includes(effectState) &&
      typeof resultHash === 'string' &&
      SHA256_HEX_PATTERN.test(resultHash))
  const hasValidCompensation =
    effectState === 'compensated'
      ? typeof compensationHash === 'string' &&
        SHA256_HEX_PATTERN.test(compensationHash) &&
        Number(node?.domain_command_compensated_at) > 0 &&
        Number(node?.domain_command_compensated_by) > 0
      : compensationHash == null &&
        node?.domain_command_compensated_at == null &&
        node?.domain_command_compensated_by == null
  const hasValidRecovery =
    recoveryDecision == null
      ? node?.domain_command_recovered_at == null &&
        node?.domain_command_recovered_by == null
      : recoveryDecision === PROCESS_DOMAIN_COMMAND_RECOVERY_DECISION &&
        effectState === 'compensated' &&
        Number(node?.domain_command_recovered_at) > 0 &&
        Number(node?.domain_command_recovered_by) > 0
  if (
    !node ||
    !Number.isSafeInteger(node.id) ||
    node.id <= 0 ||
    node.process_instance_id !== instanceID ||
    typeof node.node_key !== 'string' ||
    !node.node_key.trim() ||
    !['human_task', 'approval', 'domain_command', 'end'].includes(
      node.node_type
    ) ||
    !['waiting', 'active', 'blocked', 'completed'].includes(node.status) ||
    !Number.isSafeInteger(node.version) ||
    node.version <= 0 ||
    !hasValidDomainResult ||
    !hasValidCompensation ||
    !hasValidRecovery
  ) {
    throw exceptionProcessResultInvalid()
  }
  return node
}

function requireExceptionProcessContext(
  contract,
  sourceID,
  value,
  { allowMissing = false } = {}
) {
  if (value == null && allowMissing) return null
  const instance = value?.process_instance
  const nodes = value?.nodes
  const activeNodes = value?.active_nodes
  const settledNodes = value?.settled_nodes
  if (
    !instance ||
    !Number.isSafeInteger(instance.id) ||
    instance.id <= 0 ||
    instance.process_key !==
      Object.keys(EXCEPTION_PROCESS_CONTRACTS).find(
        (key) => EXCEPTION_PROCESS_CONTRACTS[key] === contract
      ) ||
    instance.business_ref_type !== contract.businessRefType ||
    instance.business_ref_id !== sourceID ||
    !['active', 'blocked', 'completed'].includes(instance.status) ||
    !Array.isArray(nodes) ||
    !Array.isArray(activeNodes) ||
    !Array.isArray(settledNodes)
  ) {
    throw exceptionProcessResultInvalid()
  }
  nodes.forEach((node) => requireExceptionProcessNode(node, instance.id))
  activeNodes.forEach((node) => requireExceptionProcessNode(node, instance.id))
  settledNodes.forEach((node) => requireExceptionProcessNode(node, instance.id))
  const nodeIDs = new Set(nodes.map((node) => node.id))
  if (
    nodeIDs.size !== nodes.length ||
    !activeNodes.every(
      (node) => nodeIDs.has(node.id) && node.status === 'active'
    ) ||
    !settledNodes.every(
      (node) =>
        nodeIDs.has(node.id) &&
        (node.status === 'completed' || node.status === 'blocked')
    )
  ) {
    throw exceptionProcessResultInvalid()
  }
  return value
}

function requireExceptionProcessReadback(contract, sourceID, data) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Number(data?.source_readback?.id || 0) !== sourceID
  ) {
    throw exceptionProcessResultInvalid()
  }
  return data.source_readback
}

async function startExceptionProcess(processKey, params = {}) {
  const contract = EXCEPTION_PROCESS_CONTRACTS[processKey]
  const sourceID = requireExceptionProcessSourceID(contract, params)
  const result = await customerConfigRpc.call(contract.startMethod, params)
  const data = dataOf(result)
  const context = requireExceptionProcessContext(
    contract,
    sourceID,
    data?.process_context
  )
  requireExceptionProcessReadback(contract, sourceID, data)
  const startedNode = requireExceptionProcessNode(
    data?.started_node,
    context.process_instance.id
  )
  if (
    startedNode.node_key !== contract.startNodeKey ||
    !context.nodes.some(
      (node) =>
        node.id === startedNode.id &&
        node.version === startedNode.version &&
        node.status === startedNode.status
    )
  ) {
    throw exceptionProcessResultInvalid()
  }
  return data
}

async function getExceptionProcess(processKey, params = {}) {
  const contract = EXCEPTION_PROCESS_CONTRACTS[processKey]
  const sourceID = requireExceptionProcessSourceID(contract, params)
  const result = await customerConfigRpc.call(contract.getMethod, params)
  const data = dataOf(result)
  requireExceptionProcessReadback(contract, sourceID, data)
  requireExceptionProcessContext(contract, sourceID, data?.process_context, {
    allowMissing: true,
  })
  return data
}

async function executeExceptionProcess(processKey, method, params = {}) {
  const contract = EXCEPTION_PROCESS_CONTRACTS[processKey]
  const expectedNodeKey = contract.executeMethods[method]
  const sourceID = requireExceptionProcessSourceID(contract, params)
  if (!expectedNodeKey) throw exceptionProcessResultInvalid()
  const result = await customerConfigRpc.call(method, params)
  const data = dataOf(result)
  const context = requireExceptionProcessContext(
    contract,
    sourceID,
    data?.process_context
  )
  requireExceptionProcessReadback(contract, sourceID, data)
  const completedNode = requireExceptionProcessNode(
    data?.completed_node,
    context.process_instance.id
  )
  if (
    completedNode.node_key !== expectedNodeKey ||
    completedNode.node_type !== 'domain_command' ||
    completedNode.status !== 'completed' ||
    !context.nodes.some(
      (node) =>
        node.id === completedNode.id &&
        node.version === completedNode.version &&
        node.status === completedNode.status
    )
  ) {
    throw exceptionProcessResultInvalid()
  }
  return data
}

export function findExceptionProcessActiveNode(data, nodeKey) {
  const nodes = data?.process_context?.active_nodes
  const matches = Array.isArray(nodes)
    ? nodes.filter((node) => node?.node_key === nodeKey)
    : []
  if (matches.length !== 1) throw exceptionProcessResultInvalid()
  return matches[0]
}

export async function getProcessRecoveryContext(params = {}) {
  const processInstanceID = Number(params.process_instance_id || 0)
  if (
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params) ||
    Object.keys(params).some((key) => key !== 'process_instance_id') ||
    !Number.isSafeInteger(processInstanceID) ||
    processInstanceID <= 0
  ) {
    throw exceptionProcessResultInvalid()
  }
  const result = await customerConfigRpc.call('get_process_recovery_context', {
    process_instance_id: processInstanceID,
  })
  const data = dataOf(result)
  const context = data?.process_context
  const processKey = String(context?.process_instance?.process_key || '')
  const contract = EXCEPTION_PROCESS_CONTRACTS[processKey]
  const sourceID = Number(context?.process_instance?.business_ref_id || 0)
  if (
    !contract ||
    context?.process_instance?.id !== processInstanceID ||
    !Number.isSafeInteger(sourceID) ||
    sourceID <= 0
  ) {
    throw exceptionProcessResultInvalid()
  }
  requireExceptionProcessContext(contract, sourceID, context)
  return { process_context: context }
}

export function findExceptionProcessRecoveryCandidate(data) {
  const context = data?.process_context
  if (!context) return null
  const instance = context.process_instance
  const { nodes } = context
  if (
    !['active', 'blocked'].includes(instance?.status) ||
    !Array.isArray(nodes)
  ) {
    return null
  }
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    const recoverable =
      node?.node_type === 'domain_command' &&
      node.status === 'completed' &&
      node.domain_command_effect_state === 'compensated' &&
      SHA256_HEX_PATTERN.test(node.domain_command_result_hash || '') &&
      SHA256_HEX_PATTERN.test(node.domain_command_compensation_hash || '') &&
      node.domain_command_recovery_decision == null
    if (!recoverable) continue
    const downstreamIsUnsettled = nodes
      .slice(index + 1)
      .every(
        (downstream) =>
          downstream?.status !== 'completed' &&
          downstream?.domain_command_result_hash == null &&
          downstream?.domain_command_effect_state == null &&
          downstream?.domain_command_compensation_hash == null
      )
    if (downstreamIsUnsettled) return node
  }
  return null
}

export function exceptionProcessRecoveryReadbackMatches(data, expected = {}) {
  const nodes = data?.process_context?.nodes
  if (!Array.isArray(nodes)) return false
  const node = nodes.find(
    (item) =>
      item?.id === expected.process_node_instance_id &&
      item.process_instance_id === expected.process_instance_id
  )
  return Boolean(
    node &&
      node.version === expected.expected_version + 1 &&
      node.domain_command_effect_state === 'compensated' &&
      node.domain_command_result_hash === expected.expected_result_hash &&
      node.domain_command_compensation_hash ===
        expected.expected_compensation_hash &&
      node.domain_command_recovery_decision ===
        PROCESS_DOMAIN_COMMAND_RECOVERY_DECISION &&
      Number(node.domain_command_recovered_at) > 0 &&
      Number(node.domain_command_recovered_by) > 0
  )
}

export async function recoverCompensatedProcessDomainCommand(params = {}) {
  const processInstanceID = Number(params.process_instance_id || 0)
  const processNodeInstanceID = Number(params.process_node_instance_id || 0)
  const expectedVersion = Number(params.expected_version || 0)
  const expectedResultHash = String(params.expected_result_hash || '').trim()
  const expectedCompensationHash = String(
    params.expected_compensation_hash || ''
  ).trim()
  if (
    !Number.isSafeInteger(processInstanceID) ||
    processInstanceID <= 0 ||
    !Number.isSafeInteger(processNodeInstanceID) ||
    processNodeInstanceID <= 0 ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion <= 0 ||
    !SHA256_HEX_PATTERN.test(expectedResultHash) ||
    !SHA256_HEX_PATTERN.test(expectedCompensationHash)
  ) {
    throw exceptionProcessResultInvalid()
  }
  const payload = {
    process_instance_id: processInstanceID,
    process_node_instance_id: processNodeInstanceID,
    expected_version: expectedVersion,
    decision: PROCESS_DOMAIN_COMMAND_RECOVERY_DECISION,
    expected_result_hash: expectedResultHash,
    expected_compensation_hash: expectedCompensationHash,
  }
  const result = await customerConfigRpc.call(
    'recover_compensated_process_domain_command',
    payload
  )
  const recoveredNode = requireExceptionProcessNode(
    dataOf(result)?.recovered_node,
    processInstanceID
  )
  if (
    recoveredNode.id !== processNodeInstanceID ||
    recoveredNode.version !== expectedVersion + 1 ||
    recoveredNode.domain_command_effect_state !== 'compensated' ||
    recoveredNode.domain_command_result_hash !== expectedResultHash ||
    recoveredNode.domain_command_compensation_hash !==
      expectedCompensationHash ||
    recoveredNode.domain_command_recovery_decision !==
      PROCESS_DOMAIN_COMMAND_RECOVERY_DECISION
  ) {
    throw exceptionProcessResultInvalid()
  }
  return recoveredNode
}

export const startSalesReturnAcceptanceProcess = (params = {}) =>
  startExceptionProcess('sales_return_acceptance', params)
export const getSalesReturnAcceptanceProcess = (params = {}) =>
  getExceptionProcess('sales_return_acceptance', params)
export const executeSalesReturnReceive = (params = {}) =>
  executeExceptionProcess(
    'sales_return_acceptance',
    'execute_sales_return_receive',
    params
  )

export const startFinancePaymentApprovalProcess = (params = {}) =>
  startExceptionProcess('finance_payment_approval', params)
export const getFinancePaymentApprovalProcess = (params = {}) =>
  getExceptionProcess('finance_payment_approval', params)
export const executeFinancePaymentPost = (params = {}) =>
  executeExceptionProcess(
    'finance_payment_approval',
    'execute_finance_payment_post',
    params
  )

export const startInventoryAdjustmentApprovalProcess = (params = {}) =>
  startExceptionProcess('inventory_adjustment_approval', params)
export const getInventoryAdjustmentApprovalProcess = (params = {}) =>
  getExceptionProcess('inventory_adjustment_approval', params)
export const executeInventoryAdjustmentSubmit = (params = {}) =>
  executeExceptionProcess(
    'inventory_adjustment_approval',
    'execute_inventory_adjustment_submit',
    params
  )
export const executeInventoryAdjustmentPost = (params = {}) =>
  executeExceptionProcess(
    'inventory_adjustment_approval',
    'execute_inventory_adjustment_post',
    params
  )

export const startProductionExceptionApprovalProcess = (params = {}) =>
  startExceptionProcess('production_exception_approval', params)
export const getProductionExceptionApprovalProcess = (params = {}) =>
  getExceptionProcess('production_exception_approval', params)
export const executeProductionExceptionProcess = (params = {}) =>
  executeExceptionProcess(
    'production_exception_approval',
    'execute_production_exception_process',
    params
  )
