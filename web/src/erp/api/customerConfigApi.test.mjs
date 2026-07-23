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
    .replace(
      /import \{ submitPurchaseOrder \} from '[^']+'\n/,
      'const submitPurchaseOrder = async (params) => params\n'
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

test('customerConfigApi: sales order acceptance submit uses explicit start and domain command APIs', () => {
  assert.match(customerConfigApiSource, /rollback_customer_config/)
  assert.match(customerConfigApiSource, /rollbackCustomerConfig/)
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
      'start_sales_order_acceptance_process',
      'execute_sales_order_acceptance_submit',
    ]
  )
  assert.deepEqual(calls[0].params, {
    sales_order_id: 81,
    business_ref_no: 'SIM-SO-036',
    idempotency_key: 'submit-81',
    customer_key: 'yoyoosun',
  })
  assert.deepEqual(calls[1].params, {
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
    return { data: replay }
  })

  const result = await api.submitSalesOrderAcceptanceProcess({
    sales_order_id: 81,
    idempotency_key: 'submit-81',
  })

  assert.deepEqual(
    calls.map((item) => item.method),
    ['start_sales_order_acceptance_process']
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
        return { data: item.data }
      })
      await assert.rejects(
        api.submitSalesOrderAcceptanceProcess({ sales_order_id: 81 }),
        /销售订单提交结果无法确认，请刷新后重试/
      )
      assert.deepEqual(
        calls.map((call) => call.method),
        ['start_sales_order_acceptance_process']
      )
    })
  }
})

test('customerConfigApi: malformed execution result fails closed', async () => {
  const calls = []
  const api = await loadCustomerConfigApiForTest(async (method, params) => {
    calls.push({ method, params })
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
  assert.equal(calls.length, 2)
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
    /successMessage:\s*'销售订单已提交，已进入老板审批'/
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
