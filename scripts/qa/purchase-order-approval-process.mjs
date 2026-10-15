function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function requireProcessStart(data, purchaseOrderID) {
  const instance = data?.process_instance
  const node = data?.started_node
  const matchingNode = Array.isArray(data?.nodes)
    ? data.nodes.find(
        (candidate) =>
          positiveInteger(candidate?.id) === positiveInteger(node?.id) &&
          positiveInteger(candidate?.process_instance_id) ===
            positiveInteger(instance?.id) &&
          candidate?.node_key === 'submit_purchase_order' &&
          candidate?.node_type === 'domain_command' &&
          candidate?.status === node?.status &&
          positiveInteger(candidate?.version) === positiveInteger(node?.version)
      )
    : null
  if (
    !positiveInteger(instance?.id) ||
    instance?.process_key !== 'material_supply' ||
    instance?.business_ref_type !== 'purchase_order' ||
    positiveInteger(instance?.business_ref_id) !== purchaseOrderID ||
    !positiveInteger(node?.id) ||
    !positiveInteger(node?.version) ||
    node?.node_key !== 'submit_purchase_order' ||
    node?.node_type !== 'domain_command' ||
    !['active', 'completed'].includes(node?.status) ||
    !matchingNode ||
    (node?.status === 'completed' &&
      node?.outcome !== 'purchase_order.submitted')
  ) {
    throw new Error('采购订单审批流程启动结果不完整')
  }
  return { instance, node, nodes: data.nodes }
}

function requireSubmitExecution(data, expected) {
  const node = data?.completed_node
  const matchingNode = Array.isArray(data?.nodes)
    ? data.nodes.find(
        (candidate) =>
          positiveInteger(candidate?.id) === positiveInteger(node?.id) &&
          positiveInteger(candidate?.process_instance_id) ===
            expected.instanceID &&
          candidate?.node_key === 'submit_purchase_order' &&
          candidate?.node_type === 'domain_command' &&
          candidate?.status === 'completed' &&
          positiveInteger(candidate?.version) === positiveInteger(node?.version)
      )
    : null
  if (
    positiveInteger(node?.id) !== expected.nodeID ||
    positiveInteger(node?.process_instance_id) !== expected.instanceID ||
    node?.node_key !== 'submit_purchase_order' ||
    node?.node_type !== 'domain_command' ||
    node?.status !== 'completed' ||
    node?.outcome !== 'purchase_order.submitted' ||
    positiveInteger(node?.version) !== expected.version + 1 ||
    !matchingNode
  ) {
    throw new Error('采购订单提交结果不完整')
  }
  return data.nodes
}

function requireApprovalTask(data, expected) {
  if (
    !Array.isArray(data?.tasks) ||
    !Number.isSafeInteger(Number(data?.total)) ||
    Number(data.total) < data.tasks.length
  ) {
    throw new Error('采购订单审批任务列表不完整')
  }
  const task = data.tasks.find(
    (candidate) =>
      positiveInteger(candidate?.process_instance_id) ===
        expected.instanceID &&
      positiveInteger(candidate?.process_node_instance_id) ===
        expected.nodeID &&
      candidate?.source_type === 'purchase_order' &&
      positiveInteger(candidate?.source_id) === expected.purchaseOrderID
  )
  if (
    !positiveInteger(task?.id) ||
    !positiveInteger(task?.version) ||
    !String(task?.owner_role_key || '').trim() ||
    !String(task?.task_status_key || '').trim()
  ) {
    throw new Error('采购订单审批任务未生成或责任岗位不可确认')
  }
  return task
}

/**
 * Advances a PurchaseOrder through its immutable ProcessRuntime approval path.
 * `invoke` must return the JSON-RPC data payload and choose credentials from
 * the supplied actor key. The helper never calls the retired direct submit or
 * approve methods.
 */
export async function approvePurchaseOrderThroughProcess({
  purchaseOrder,
  customerKey = '',
  idempotencyPrefix,
  invoke,
  sourceActor = 'purchase',
  listActor = 'admin',
  approvalActorForRole = (roleKey) => roleKey,
  completeApproval = true,
}) {
  const purchaseOrderID = positiveInteger(purchaseOrder?.id)
  const purchaseOrderNo = String(
    purchaseOrder?.purchase_order_no || ''
  ).trim()
  const baseKey = String(idempotencyPrefix || '').trim()
  if (
    !purchaseOrderID ||
    !purchaseOrderNo ||
    !baseKey ||
    typeof invoke !== 'function'
  ) {
    throw new TypeError('采购订单审批流程参数无效')
  }

  const startData = await invoke({
    actor: sourceActor,
    domain: 'customer_config',
    method: 'start_material_supply_purchase_order_process',
    params: {
      customer_key: customerKey || undefined,
      purchase_order_id: purchaseOrderID,
      business_ref_no: purchaseOrderNo,
      idempotency_key: `${baseKey}:start`,
    },
  })
  const started = requireProcessStart(startData, purchaseOrderID)
  let nodes = started.nodes
  if (started.node.status === 'active') {
    const executionData = await invoke({
      actor: sourceActor,
      domain: 'customer_config',
      method: 'execute_material_supply_purchase_order_submit',
      params: {
        customer_key: customerKey || undefined,
        process_instance_id: positiveInteger(started.instance.id),
        process_node_instance_id: positiveInteger(started.node.id),
        expected_version: positiveInteger(started.node.version),
        purchase_order_id: purchaseOrderID,
        idempotency_key: `${baseKey}:submit`,
      },
    })
    nodes = requireSubmitExecution(executionData, {
      instanceID: positiveInteger(started.instance.id),
      nodeID: positiveInteger(started.node.id),
      version: positiveInteger(started.node.version),
    })
  }

  const approvalNode = nodes.find(
    (candidate) =>
      candidate?.node_key === 'purchase_order_approval' &&
      candidate?.node_type === 'approval'
  )
  if (
    !positiveInteger(approvalNode?.id) ||
    !['active', 'completed'].includes(approvalNode?.status)
  ) {
    throw new Error('采购订单审批节点未激活')
  }

  let task = null
  if (approvalNode.status === 'active' && completeApproval) {
    const taskData = await invoke({
      actor: listActor,
      domain: 'workflow',
      method: 'list_tasks',
      params: {
        source_type: 'purchase_order',
        source_id: purchaseOrderID,
        limit: 50,
        offset: 0,
      },
    })
    task = requireApprovalTask(taskData, {
      instanceID: positiveInteger(started.instance.id),
      nodeID: positiveInteger(approvalNode.id),
      purchaseOrderID,
    })
    const approvalActor = approvalActorForRole(task.owner_role_key, task)
    if (!approvalActor) {
      throw new Error(`没有可办理 ${task.owner_role_key} 审批任务的账号`)
    }
    const completed = await invoke({
      actor: approvalActor,
      domain: 'workflow',
      method: 'complete_task_action',
      params: {
        task_id: positiveInteger(task.id),
        expected_version: positiveInteger(task.version),
        idempotency_key: `${baseKey}:task:${positiveInteger(task.id)}:complete`,
        action_key: 'complete',
        reason: '本地验证：采购订单审批资料已核对。',
        payload: { feedback: '本地验证：采购订单审批资料已核对。' },
      },
    })
    if (
      positiveInteger(completed?.task?.id) !== positiveInteger(task.id) ||
      completed?.task?.task_status_key !== 'done' ||
      positiveInteger(completed?.task?.version) <= positiveInteger(task.version)
    ) {
      throw new Error('采购订单审批任务完成结果不完整')
    }
  }

  const readback = await invoke({
    actor: sourceActor,
    domain: 'purchase_order',
    method: 'get_purchase_order',
    params: { id: purchaseOrderID },
  })
  const approved = readback?.purchase_order
  const expectedStatus = completeApproval ? 'APPROVED' : 'SUBMITTED'
  if (
    positiveInteger(approved?.id) !== purchaseOrderID ||
    String(approved?.lifecycle_status || '').toUpperCase() !== expectedStatus
  ) {
    throw new Error(
      `采购订单流程推进后未读回 ${expectedStatus} 真源状态`
    )
  }
  return {
    purchaseOrder: approved,
    processInstance: started.instance,
    approvalNode,
    task,
  }
}

export async function submitPurchaseOrderThroughProcess(options) {
  return approvePurchaseOrderThroughProcess({
    ...options,
    completeApproval: false,
  })
}
