import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const customerConfigApiSource = readFileSync(
  fileURLToPath(new URL('./customerConfigApi.mjs', import.meta.url)),
  'utf8'
)
const salesOrderPageConfigSource = readFileSync(
  fileURLToPath(
    new URL(
      '../components/sales-orders/salesOrderPageConfig.mjs',
      import.meta.url
    )
  ),
  'utf8'
)
const salesOrderPageSource = readFileSync(
  fileURLToPath(new URL('../pages/V1SalesOrdersPage.jsx', import.meta.url)),
  'utf8'
)

async function loadCustomerConfigApiForTest(call) {
  globalThis.__customerConfigApiCall = call
  const source = customerConfigApiSource
    .replace(
      /import \{ AUTH_SCOPE \} from '[^']+'\n/,
      "const AUTH_SCOPE = { ADMIN: 'admin' }\n"
    )
    .replace(
      /import \{ ADMIN_BASE_PATH \} from '[^']+'\n/,
      "const ADMIN_BASE_PATH = '/admin'\n"
    )
    .replace(
      /import \{ JsonRpc \} from '[^']+'\n/,
      'class JsonRpc { call(method, params) { return globalThis.__customerConfigApiCall(method, params) } }\n'
    )
    .replace(
      /import \{ buildCustomerConfigMutationPayload \} from '[^']+'\n/,
      'const buildCustomerConfigMutationPayload = (_action, params) => params\n'
    )
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Date.now()}-${Math.random()}`
  )
}

function processStartData({
  salesOrderID = 81,
  status = 'active',
  outcome = null,
} = {}) {
  const startedNode = {
    id: 6,
    process_instance_id: 2,
    node_key: 'submit_sales_order',
    node_type: 'domain_command',
    status,
    outcome,
    version: status === 'completed' ? 2 : 1,
  }
  return {
    process_instance: {
      id: 2,
      process_key: 'sales_order_acceptance',
      business_ref_type: 'sales_order',
      business_ref_id: salesOrderID,
      status: 'active',
    },
    started_node: startedNode,
    nodes: [
      startedNode,
      ...(status === 'completed'
        ? [
            {
              id: 7,
              process_instance_id: 2,
              node_key: 'order_approval',
              node_type: 'approval',
              status: 'active',
              version: 2,
            },
          ]
        : []),
    ],
  }
}

function processExecutionData() {
  const completedNode = {
    id: 6,
    process_instance_id: 2,
    node_key: 'submit_sales_order',
    node_type: 'domain_command',
    status: 'completed',
    outcome: 'sales_order.submitted',
    version: 2,
  }
  return {
    completed_node: completedNode,
    nodes: [
      completedNode,
      {
        id: 7,
        process_instance_id: 2,
        node_key: 'order_approval',
        node_type: 'approval',
        status: 'active',
        version: 2,
      },
    ],
  }
}

function processReadData(startData = processStartData()) {
  return {
    process_context: {
      process_instance: startData.process_instance,
      nodes: startData.nodes,
      active_nodes: startData.nodes.filter((node) => node.status === 'active'),
      settled_nodes: startData.nodes.filter((node) => node.status !== 'active'),
    },
    source_readback: {
      type: 'sales_order',
      id: startData.process_instance.business_ref_id,
      no: 'SIM-SO-036',
    },
  }
}

function purchaseProcessStartData({
  purchaseOrderID = 5001,
  status = 'active',
  outcome = null,
} = {}) {
  const startedNode = {
    id: 16,
    process_instance_id: 12,
    node_key: 'submit_purchase_order',
    node_type: 'domain_command',
    status,
    outcome,
    version: status === 'completed' ? 2 : 1,
  }
  return {
    process_instance: {
      id: 12,
      process_key: 'material_supply',
      business_ref_type: 'purchase_order',
      business_ref_id: purchaseOrderID,
      status: 'active',
    },
    started_node: startedNode,
    nodes: [
      startedNode,
      ...(status === 'completed'
        ? [
            {
              id: 17,
              process_instance_id: 12,
              node_key: 'purchase_order_approval',
              node_type: 'approval',
              status: 'active',
              version: 2,
            },
          ]
        : []),
    ],
  }
}

function purchaseProcessExecutionData() {
  const completedNode = {
    id: 16,
    process_instance_id: 12,
    node_key: 'submit_purchase_order',
    node_type: 'domain_command',
    status: 'completed',
    outcome: 'purchase_order.submitted',
    version: 2,
  }
  return {
    completed_node: completedNode,
    nodes: [
      completedNode,
      {
        id: 17,
        process_instance_id: 12,
        node_key: 'purchase_order_approval',
        node_type: 'approval',
        status: 'active',
        version: 2,
      },
    ],
  }
}

const EXCEPTION_PROCESS_TEST_CONTRACTS = Object.freeze([
  {
    processKey: 'finance_payment_approval',
    businessRefType: 'finance_payment',
    idParam: 'finance_payment_id',
    sourceID: 92,
    startMethod: 'start_finance_payment_approval_process',
    getMethod: 'get_finance_payment_approval_process',
    executeMethod: 'execute_finance_payment_post',
    startExport: 'startFinancePaymentApprovalProcess',
    getExport: 'getFinancePaymentApprovalProcess',
    executeExport: 'executeFinancePaymentPost',
    startNodeKey: 'finance_payment_approval',
    startNodeType: 'approval',
    executeNodeKey: 'post_finance_payment',
  },
  {
    processKey: 'inventory_adjustment_approval',
    businessRefType: 'inventory_operation',
    idParam: 'inventory_operation_id',
    sourceID: 93,
    startMethod: 'start_inventory_adjustment_approval_process',
    getMethod: 'get_inventory_adjustment_approval_process',
    executeMethod: 'execute_inventory_adjustment_submit',
    secondExecuteMethod: 'execute_inventory_adjustment_post',
    startExport: 'startInventoryAdjustmentApprovalProcess',
    getExport: 'getInventoryAdjustmentApprovalProcess',
    executeExport: 'executeInventoryAdjustmentSubmit',
    secondExecuteExport: 'executeInventoryAdjustmentPost',
    startNodeKey: 'submit_inventory_adjustment',
    startNodeType: 'domain_command',
    executeNodeKey: 'submit_inventory_adjustment',
    secondExecuteNodeKey: 'post_inventory_adjustment',
  },
  {
    processKey: 'production_exception_approval',
    businessRefType: 'production_exception_decision',
    idParam: 'production_exception_id',
    sourceID: 94,
    startMethod: 'start_production_exception_approval_process',
    getMethod: 'get_production_exception_approval_process',
    executeMethod: 'execute_production_exception_process',
    startExport: 'startProductionExceptionApprovalProcess',
    getExport: 'getProductionExceptionApprovalProcess',
    executeExport: 'executeProductionExceptionProcess',
    startNodeKey: 'production_exception_decision_approval',
    startNodeType: 'approval',
    executeNodeKey: 'execute_production_exception',
  },
])

function exceptionProcessContext(
  contract,
  node,
  { sourceID = contract.sourceID, processStatus = 'active' } = {}
) {
  return {
    process_instance: {
      id: 700 + sourceID,
      process_key: contract.processKey,
      business_ref_type: contract.businessRefType,
      business_ref_id: sourceID,
      status: processStatus,
    },
    nodes: [node],
    active_nodes: node.status === 'active' ? [node] : [],
    settled_nodes: ['completed', 'blocked'].includes(node.status) ? [node] : [],
  }
}

function exceptionStartResult(contract) {
  const instanceID = 700 + contract.sourceID
  const startedNode = {
    id: 800 + contract.sourceID,
    process_instance_id: instanceID,
    node_key: contract.startNodeKey,
    node_type: contract.startNodeType,
    status: 'active',
    version: 1,
  }
  return {
    process_context: exceptionProcessContext(contract, startedNode),
    started_node: startedNode,
    source_readback: { id: contract.sourceID, status: 'DRAFT' },
  }
}

function exceptionExecutionResult(contract, nodeKey = contract.executeNodeKey) {
  const instanceID = 700 + contract.sourceID
  const completedNode = {
    id: 900 + contract.sourceID,
    process_instance_id: instanceID,
    node_key: nodeKey,
    node_type: 'domain_command',
    status: 'completed',
    version: 2,
  }
  return {
    process_context: exceptionProcessContext(contract, completedNode),
    completed_node: completedNode,
    source_readback: { id: contract.sourceID, status: 'UPDATED' },
  }
}

test('customerConfigApi: sales order acceptance submit uses explicit start and domain command APIs', () => {
  assert.match(customerConfigApiSource, /rollback_customer_config/)
  assert.match(customerConfigApiSource, /rollbackCustomerConfig/)
  assert.match(
    customerConfigApiSource,
    /call\(\s*'get_sales_order_acceptance_process'/
  )
  assert.match(
    customerConfigApiSource,
    /call\(\s*'start_sales_order_acceptance_process'/
  )
  assert.match(
    customerConfigApiSource,
    /call\(\s*'execute_sales_order_acceptance_submit'/
  )
  assert.match(customerConfigApiSource, /submitSalesOrderAcceptanceProcess/)
  assert.match(customerConfigApiSource, /process_instance_id/)
  assert.match(customerConfigApiSource, /process_node_instance_id/)
  assert.match(customerConfigApiSource, /expected_version/)
  assert.match(
    customerConfigApiSource,
    /sales-order-acceptance\/\$\{salesOrderID\}/
  )
  assert.match(
    customerConfigApiSource,
    /startPayload\.customer_key = params\.customer_key/
  )
  assert.match(
    customerConfigApiSource,
    /executeSalesOrderAcceptanceSubmit\(\{\s*customer_key: startPayload\.customer_key,/u
  )
})

test('customerConfigApi: fresh sales order acceptance submit calls start then execute', async () => {
  const calls = []
  const api = await loadCustomerConfigApiForTest(async (method, params) => {
    calls.push({ method, params })
    if (method === 'get_sales_order_acceptance_process') {
      return { data: { process_context: null } }
    }
    if (method === 'start_sales_order_acceptance_process') {
      return { data: processStartData() }
    }
    if (method === 'execute_sales_order_acceptance_submit') {
      return { data: processExecutionData() }
    }
    throw new Error(`unexpected method ${method}`)
  })

  const result = await api.submitSalesOrderAcceptanceProcess({
    sales_order_id: 81,
    order_no: 'SIM-SO-036',
    customer_key: 'yoyoosun',
    idempotency_key: 'submit-81',
  })

  assert.deepEqual(
    calls.map((item) => item.method),
    [
      'get_sales_order_acceptance_process',
      'start_sales_order_acceptance_process',
      'execute_sales_order_acceptance_submit',
    ]
  )
  assert.deepEqual(calls[0].params, {
    sales_order_id: 81,
    customer_key: 'yoyoosun',
  })
  assert.deepEqual(calls[1].params, {
    sales_order_id: 81,
    business_ref_no: 'SIM-SO-036',
    idempotency_key: 'submit-81',
    customer_key: 'yoyoosun',
  })
  assert.deepEqual(calls[2].params, {
    customer_key: 'yoyoosun',
    process_instance_id: 2,
    process_node_instance_id: 6,
    expected_version: 1,
    sales_order_id: 81,
    idempotency_key: 'submit-81/submit',
  })
  assert.equal(result.completed_node.outcome, 'sales_order.submitted')
  assert.equal(result.process_instance.id, 2)
})

test('customerConfigApi: completed start replay succeeds without repeating domain command', async () => {
  const calls = []
  const replay = processStartData({
    status: 'completed',
    outcome: 'sales_order.submitted',
  })
  const api = await loadCustomerConfigApiForTest(async (method, params) => {
    calls.push({ method, params })
    assert.equal(method, 'get_sales_order_acceptance_process')
    return { data: processReadData(replay) }
  })

  const result = await api.submitSalesOrderAcceptanceProcess({
    sales_order_id: 81,
    idempotency_key: 'submit-81',
  })

  assert.deepEqual(
    calls.map((item) => item.method),
    ['get_sales_order_acceptance_process']
  )
  assert.equal(result.started_node.status, 'completed')
  assert.equal(result.nodes[1].node_key, 'order_approval')
})

test('customerConfigApi: malformed, blocked, and compensated start results fail closed', async (t) => {
  const cases = [
    {
      name: 'missing nodes',
      data: { ...processStartData(), nodes: undefined },
    },
    {
      name: 'wrong business reference',
      data: processStartData({ salesOrderID: 82 }),
    },
    {
      name: 'blocked first node',
      data: processStartData({ status: 'blocked' }),
    },
    {
      name: 'compensated first node',
      data: processStartData({
        status: 'completed',
        outcome: 'domain_command.compensated',
      }),
    },
  ]
  for (const item of cases) {
    await t.test(item.name, async () => {
      const calls = []
      const api = await loadCustomerConfigApiForTest(async (method, params) => {
        calls.push({ method, params })
        if (method === 'get_sales_order_acceptance_process') {
          return { data: { process_context: null } }
        }
        return { data: item.data }
      })
      await assert.rejects(
        api.submitSalesOrderAcceptanceProcess({ sales_order_id: 81 }),
        /销售订单提交结果无法确认，请刷新后重试/
      )
      assert.deepEqual(
        calls.map((call) => call.method),
        [
          'get_sales_order_acceptance_process',
          'start_sales_order_acceptance_process',
        ]
      )
    })
  }
})

test('customerConfigApi: malformed execution result fails closed', async () => {
  const calls = []
  const api = await loadCustomerConfigApiForTest(async (method, params) => {
    calls.push({ method, params })
    if (method === 'get_sales_order_acceptance_process') {
      return { data: { process_context: null } }
    }
    if (method === 'start_sales_order_acceptance_process') {
      return { data: processStartData() }
    }
    return {
      data: {
        ...processExecutionData(),
        completed_node: {
          ...processExecutionData().completed_node,
          status: 'blocked',
          outcome: 'domain_command.compensated',
        },
      },
    }
  })
  await assert.rejects(
    api.submitSalesOrderAcceptanceProcess({ sales_order_id: 81 }),
    /销售订单提交结果无法确认，请刷新后重试/
  )
  assert.equal(calls.length, 3)
})

test('customerConfigApi: purchase submit uses process start then durable domain command', async () => {
  const calls = []
  const api = await loadCustomerConfigApiForTest(async (method, params) => {
    calls.push({ method, params })
    if (method === 'start_material_supply_purchase_order_process') {
      return { data: purchaseProcessStartData() }
    }
    if (method === 'execute_material_supply_purchase_order_submit') {
      return { data: purchaseProcessExecutionData() }
    }
    throw new Error(`unexpected method ${method}`)
  })

  const result = await api.submitPurchaseOrderApprovalProcess({
    purchase_order_id: 5001,
    purchase_order_no: 'PO-5001',
    customer_key: 'yoyoosun',
    idempotency_key: 'purchase-submit-5001',
  })

  assert.deepEqual(
    calls.map((item) => item.method),
    [
      'start_material_supply_purchase_order_process',
      'execute_material_supply_purchase_order_submit',
    ]
  )
  assert.deepEqual(calls[0].params, {
    customer_key: 'yoyoosun',
    purchase_order_id: 5001,
    business_ref_no: 'PO-5001',
    idempotency_key: 'purchase-submit-5001',
  })
  assert.deepEqual(calls[1].params, {
    customer_key: 'yoyoosun',
    process_instance_id: 12,
    process_node_instance_id: 16,
    expected_version: 1,
    purchase_order_id: 5001,
    idempotency_key: 'purchase-submit-5001/submit',
  })
  assert.equal(result.completed_node.outcome, 'purchase_order.submitted')
  assert.equal(result.process_instance.id, 12)
})

test('customerConfigApi: completed purchase submit replay does not execute twice', async () => {
  const calls = []
  const replay = purchaseProcessStartData({
    status: 'completed',
    outcome: 'purchase_order.submitted',
  })
  const api = await loadCustomerConfigApiForTest(async (method, params) => {
    calls.push({ method, params })
    return { data: replay }
  })

  const result = await api.submitPurchaseOrderApprovalProcess({
    purchase_order_id: 5001,
    idempotency_key: 'purchase-submit-5001',
  })

  assert.deepEqual(
    calls.map((item) => item.method),
    ['start_material_supply_purchase_order_process']
  )
  assert.equal(result.nodes[1].node_key, 'purchase_order_approval')
})

test('customerConfigApi: malformed purchase process result fails closed', async (t) => {
  const cases = [
    {
      name: 'wrong source',
      data: purchaseProcessStartData({ purchaseOrderID: 5002 }),
    },
    {
      name: 'blocked submit',
      data: purchaseProcessStartData({ status: 'blocked' }),
    },
    {
      name: 'compensated submit',
      data: purchaseProcessStartData({
        status: 'completed',
        outcome: 'domain_command.compensated',
      }),
    },
  ]
  for (const item of cases) {
    await t.test(item.name, async () => {
      const api = await loadCustomerConfigApiForTest(async () => ({
        data: item.data,
      }))
      await assert.rejects(
        api.submitPurchaseOrderApprovalProcess({ purchase_order_id: 5001 }),
        /采购订单提交结果无法确认，请刷新后重试/
      )
    })
  }
})

test('customerConfigApi: exception processes use all 13 exact start, get, and execute RPC contracts', async (t) => {
  for (const contract of EXCEPTION_PROCESS_TEST_CONTRACTS) {
    await t.test(`${contract.processKey} start`, async () => {
      const calls = []
      const api = await loadCustomerConfigApiForTest(async (method, params) => {
        calls.push({ method, params })
        return { data: exceptionStartResult(contract) }
      })
      const result = await api[contract.startExport]({
        [contract.idParam]: contract.sourceID,
      })
      assert.equal(result.source_readback.id, contract.sourceID)
      assert.deepEqual(calls, [
        {
          method: contract.startMethod,
          params: { [contract.idParam]: contract.sourceID },
        },
      ])
    })

    await t.test(`${contract.processKey} get`, async () => {
      const calls = []
      const api = await loadCustomerConfigApiForTest(async (method, params) => {
        calls.push({ method, params })
        const data = exceptionStartResult(contract)
        delete data.started_node
        return { data }
      })
      const result = await api[contract.getExport]({
        [contract.idParam]: contract.sourceID,
      })
      assert.equal(
        result.process_context.process_instance.business_ref_id,
        contract.sourceID
      )
      assert.equal(calls[0].method, contract.getMethod)
    })

    const executions = [
      {
        method: contract.executeMethod,
        exportName: contract.executeExport,
        nodeKey: contract.executeNodeKey,
      },
      ...(contract.secondExecuteMethod
        ? [
            {
              method: contract.secondExecuteMethod,
              exportName: contract.secondExecuteExport,
              nodeKey: contract.secondExecuteNodeKey,
            },
          ]
        : []),
    ]
    for (const execution of executions) {
      await t.test(`${contract.processKey} ${execution.nodeKey}`, async () => {
        const calls = []
        const api = await loadCustomerConfigApiForTest(
          async (method, params) => {
            calls.push({ method, params })
            return {
              data: exceptionExecutionResult(contract, execution.nodeKey),
            }
          }
        )
        const params = {
          [contract.idParam]: contract.sourceID,
          process_instance_id: 700 + contract.sourceID,
          process_node_instance_id: 900 + contract.sourceID,
          expected_version: 1,
        }
        const result = await api[execution.exportName](params)
        assert.equal(result.completed_node.node_key, execution.nodeKey)
        assert.deepEqual(calls, [{ method: execution.method, params }])
      })
    }
  }
})

test('customerConfigApi: exception process readback and node mismatches fail closed', async () => {
  const contract = EXCEPTION_PROCESS_TEST_CONTRACTS[0]
  const api = await loadCustomerConfigApiForTest(async () => {
    const data = structuredClone(exceptionStartResult(contract))
    data.source_readback.id += 1
    return { data }
  })
  await assert.rejects(
    api[contract.startExport]({
      [contract.idParam]: contract.sourceID,
    }),
    /异常业务流程结果无法确认，请刷新后重试/
  )

  const missingProcessApi = await loadCustomerConfigApiForTest(async () => ({
    data: {
      process_context: null,
      source_readback: { id: contract.sourceID, status: 'DRAFT' },
    },
  }))
  const missing = await missingProcessApi[contract.getExport]({
    [contract.idParam]: contract.sourceID,
  })
  assert.equal(missing.process_context, null)
})

test('customerConfigApi: compensated process recovery uses exact evidence and readback', async () => {
  const resultHash = 'a'.repeat(64)
  const compensationHash = 'b'.repeat(64)
  const candidate = {
    id: 991,
    process_instance_id: 791,
    node_key: 'finance_payment_approval_command',
    node_type: 'domain_command',
    status: 'completed',
    version: 7,
    domain_command_effect_state: 'compensated',
    domain_command_result_hash: resultHash,
    domain_command_compensation_hash: compensationHash,
    domain_command_compensated_at: 1_700_000_000,
    domain_command_compensated_by: 31,
    domain_command_recovery_decision: null,
    domain_command_recovered_at: null,
    domain_command_recovered_by: null,
  }
  const downstream = {
    id: 992,
    process_instance_id: 791,
    node_key: 'post_finance_payment',
    node_type: 'domain_command',
    status: 'active',
    version: 2,
  }
  const processData = {
    process_context: {
      process_instance: { id: 791, status: 'blocked' },
      nodes: [candidate, downstream],
    },
  }
  const calls = []
  const recoveredNode = {
    ...candidate,
    version: 8,
    domain_command_recovery_decision: 'terminate_and_withdraw_downstream',
    domain_command_recovered_at: 1_700_000_100,
    domain_command_recovered_by: 1,
  }
  const api = await loadCustomerConfigApiForTest(async (method, params) => {
    calls.push({ method, params })
    return { data: { recovered_node: recoveredNode } }
  })

  assert.equal(
    api.findExceptionProcessRecoveryCandidate(processData),
    candidate
  )
  const recovered = await api.recoverCompensatedProcessDomainCommand({
    process_instance_id: 791,
    process_node_instance_id: 991,
    expected_version: 7,
    expected_result_hash: resultHash,
    expected_compensation_hash: compensationHash,
    ignored_field: 'must-not-cross-contract',
  })
  assert.equal(recovered.version, 8)
  assert.deepEqual(calls[0], {
    method: 'recover_compensated_process_domain_command',
    params: {
      process_instance_id: 791,
      process_node_instance_id: 991,
      expected_version: 7,
      decision: 'terminate_and_withdraw_downstream',
      expected_result_hash: resultHash,
      expected_compensation_hash: compensationHash,
    },
  })
  assert.equal(
    api.exceptionProcessRecoveryReadbackMatches(
      {
        process_context: {
          nodes: [recoveredNode, { ...downstream, status: 'blocked' }],
        },
      },
      calls[0].params
    ),
    true
  )
})

test('customerConfigApi: customer config transitions use strict shared payload builders', () => {
  assert.match(customerConfigApiSource, /check_customer_config_transition/)
  assert.match(customerConfigApiSource, /checkCustomerConfigTransition/)
  assert.match(
    customerConfigApiSource,
    /buildCustomerConfigMutationPayload\('activate', params\)/
  )
  assert.match(
    customerConfigApiSource,
    /buildCustomerConfigMutationPayload\('rollback', params\)/
  )
})

test('V1SalesOrdersPage: sales order submit action enters acceptance workflow', () => {
  assert.match(salesOrderPageConfigSource, /submitSalesOrderAcceptanceProcess/)
  assert.match(
    salesOrderPageConfigSource,
    /successMessage:\s*'销售订单已提交，已进入审批流程'/
  )
  assert.match(salesOrderPageConfigSource, /returnsRecord:\s*false/)
  assert.doesNotMatch(salesOrderPageConfigSource, /submitSalesOrder,/)
  assert.match(salesOrderPageSource, /activeCustomerKey/)
  assert.match(salesOrderPageSource, /customer_key:\s*activeCustomerKey/)
  assert.match(salesOrderPageSource, /business_ref_no:\s*order\.order_no/)
})

test('V1SalesOrdersPage: process submit payload does not replace selected sales order', () => {
  assert.match(
    salesOrderPageSource,
    /action\.returnsRecord === false \? order : updated \|\| order/
  )
  assert.match(salesOrderPageSource, /setSelectedOrder\(nextSelectedOrder\)/)
})
