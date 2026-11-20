import assert from 'node:assert/strict'
import test from 'node:test'

import {
  approvePurchaseOrderThroughProcess,
  submitPurchaseOrderThroughProcess,
} from './purchase-order-approval-process.mjs'
import { advancePurchaseOrderLifecycleThroughProcess } from './manual-acceptance-source-data.mjs'
import {
  manualAcceptanceFactRPCCall,
  manualAcceptanceFactRPCParams,
} from './manual-acceptance-fact-data.mjs'

function createHarness() {
  const calls = []
  let status = 'DRAFT'
  const instance = {
    id: 101,
    process_key: 'material_supply',
    business_ref_type: 'purchase_order',
    business_ref_id: 501,
    status: 'active',
  }
  const submitNode = {
    id: 102,
    process_instance_id: 101,
    node_key: 'submit_purchase_order',
    node_type: 'domain_command',
    status: 'active',
    version: 1,
  }
  const approvalNode = {
    id: 103,
    process_instance_id: 101,
    node_key: 'purchase_order_approval',
    node_type: 'approval',
    status: 'waiting',
    version: 1,
  }
  const invoke = async (call) => {
    calls.push(call)
    if (call.method === 'start_material_supply_purchase_order_process') {
      return {
        process_instance: instance,
        started_node: submitNode,
        nodes: [submitNode, approvalNode],
      }
    }
    if (call.method === 'execute_material_supply_purchase_order_submit') {
      status = 'SUBMITTED'
      const completedSubmitNode = {
        ...submitNode,
        status: 'completed',
        version: 2,
        outcome: 'purchase_order.submitted',
      }
      const activeApprovalNode = {
        ...approvalNode,
        status: 'active',
        version: 2,
      }
      return {
        completed_node: completedSubmitNode,
        nodes: [completedSubmitNode, activeApprovalNode],
      }
    }
    if (call.method === 'list_tasks') {
      return {
        total: 1,
        tasks: [
          {
            id: 201,
            version: 1,
            owner_role_key: 'boss',
            task_status_key: 'ready',
            source_type: 'purchase_order',
            source_id: 501,
            process_instance_id: 101,
            process_node_instance_id: 103,
          },
        ],
      }
    }
    if (call.method === 'complete_task_action') {
      status = 'APPROVED'
      return {
        task: {
          id: 201,
          version: 2,
          task_status_key: 'done',
        },
      }
    }
    if (call.method === 'get_purchase_order') {
      return {
        purchase_order: {
          id: 501,
          purchase_order_no: 'PO-501',
          lifecycle_status: status,
        },
      }
    }
    throw new Error(`unexpected ${call.domain}.${call.method}`)
  }
  return { calls, invoke }
}

test('purchase order approval helper uses ProcessRuntime and linked task only', async () => {
  const harness = createHarness()
  const result = await approvePurchaseOrderThroughProcess({
    purchaseOrder: { id: 501, purchase_order_no: 'PO-501' },
    idempotencyPrefix: 'test:po-501',
    invoke: harness.invoke,
    approvalActorForRole: (roleKey) => roleKey,
  })

  assert.equal(result.purchaseOrder.lifecycle_status, 'APPROVED')
  assert.deepEqual(
    harness.calls.map((call) => `${call.domain}.${call.method}`),
    [
      'customer_config.start_material_supply_purchase_order_process',
      'customer_config.execute_material_supply_purchase_order_submit',
      'workflow.list_tasks',
      'workflow.complete_task_action',
      'purchase_order.get_purchase_order',
    ]
  )
  assert.equal(harness.calls[3].actor, 'boss')
  assert.equal(
    harness.calls.some((call) =>
      ['submit_purchase_order', 'approve_purchase_order'].includes(call.method)
    ),
    false
  )
})

test('source and fact purchase approval transports send strict document readback params', async () => {
  for (const transport of ['source', 'fact']) {
    const harness = createHarness()
    const requests = []
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body)
      const domain = new URL(url).pathname.split('/').at(-1)
      requests.push({ domain, method: body.method, params: body.params })
      if (body.method === 'get_purchase_order') {
        assert.deepEqual(body.params, { id: 501 })
      } else if (domain === 'customer_config') {
        assert.equal(body.params.customer_key, 'yoyoosun')
      } else {
        assert.equal(Object.hasOwn(body.params, 'customer_key'), false)
      }
      const data = await harness.invoke({
        domain,
        method: body.method,
        params: body.params,
      })
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { code: 0, data } }),
      }
    }
    const backendURL = 'http://127.0.0.1:8310'
    if (transport === 'source') {
      const status = await advancePurchaseOrderLifecycleThroughProcess({
        plan: { backendURL, runId: 'strict-readback' },
        record: { purchase_order_no: 'PO-501', targetStatus: 'APPROVED' },
        item: { id: 501, lifecycle_status: 'DRAFT' },
        token: 'source-token',
        roleTokens: { boss: 'boss-token' },
        fetchImpl,
        report: { steps: [] },
      })
      assert.equal(status, 'APPROVED')
    } else {
      const result = await approvePurchaseOrderThroughProcess({
        purchaseOrder: { id: 501, purchase_order_no: 'PO-501' },
        customerKey: 'yoyoosun',
        idempotencyPrefix: 'strict-readback',
        approvalActorForRole: (roleKey) => roleKey,
        invoke: ({ domain, method, params }) =>
          manualAcceptanceFactRPCCall({
            backendURL,
            domain,
            method,
            params: manualAcceptanceFactRPCParams(domain, method, params),
            token: 'fact-token',
            fetchImpl,
          }),
      })
      assert.equal(result.purchaseOrder.lifecycle_status, 'APPROVED')
    }
    assert.equal(requests.length, 5)
    assert.deepEqual(requests.at(-1), {
      domain: 'purchase_order',
      method: 'get_purchase_order',
      params: { id: 501 },
    })
  }
})

test('purchase order submit helper stops at SUBMITTED approval node', async () => {
  const harness = createHarness()
  const result = await submitPurchaseOrderThroughProcess({
    purchaseOrder: { id: 501, purchase_order_no: 'PO-501' },
    idempotencyPrefix: 'test:po-501-submit',
    invoke: harness.invoke,
  })

  assert.equal(result.purchaseOrder.lifecycle_status, 'SUBMITTED')
  assert.deepEqual(
    harness.calls.map((call) => call.method),
    [
      'start_material_supply_purchase_order_process',
      'execute_material_supply_purchase_order_submit',
      'get_purchase_order',
    ]
  )
})
