import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDevFlowRuntimeResponsibility } from './devFlowRuntimeResponsibility.mjs'

const definitions = [
  {
    key: 'sales_order_acceptance/approval_pmc',
    processKey: 'sales_order_acceptance',
    processVersion: 'v1',
    variantKey: 'approval_pmc',
    label: '销售订单受理（审批 + PMC）',
    nodes: [
      {
        key: 'order_approval',
        label: '订单审批',
        ownerPool: 'boss',
      },
    ],
  },
  {
    key: 'sales_order_acceptance/approval_engineering_pmc',
    processKey: 'sales_order_acceptance',
    processVersion: 'v1',
    variantKey: 'approval_engineering_pmc',
    label: '销售订单受理（审批 + 工程 + PMC）',
    nodes: [
      {
        key: 'order_approval',
        label: '订单审批',
        ownerPool: 'boss',
      },
      {
        key: 'engineering_data',
        label: '工程资料',
        ownerPool: 'engineering_data',
      },
    ],
  },
]

function runtimeContext(ownerRoleKey = 'boss') {
  const node = {
    id: 81,
    node_key: 'order_approval',
    node_type: 'approval',
    status: 'active',
  }
  return {
    process_instance: {
      process_key: 'sales_order_acceptance',
      process_version: 'v1',
    },
    linked_node: node,
    nodes: [node],
    current_nodes: [node],
    current_responsibilities: [
      { node_instance_id: node.id, owner_role_key: ownerRoleKey },
    ],
  }
}

test('keeps versioned definition pools, runtime responsibility and task role separate', () => {
  const model = buildDevFlowRuntimeResponsibility({
    definitions,
    context: runtimeContext(),
    task: { owner_role_key: 'boss' },
  })

  assert.equal(model.processKey, 'sales_order_acceptance')
  assert.equal(model.processVersion, 'v1')
  assert.deepEqual(
    model.matchedDefinitions.map((item) => item.variantKey),
    ['approval_pmc', 'approval_engineering_pmc']
  )
  assert.deepEqual(model.currentItems, [
    {
      nodeInstanceID: 81,
      nodeKey: 'order_approval',
      nodeLabel: '订单审批',
      staticOwnerPoolKeys: ['boss'],
      runtimeRoleKey: 'boss',
      definitionAlignment: 'aligned',
    },
  ])
  assert.equal(model.definitionAlignment, 'aligned')
  assert.equal(model.taskAlignment, 'aligned')
})

test('reports drift without replacing runtime or task truth', () => {
  const model = buildDevFlowRuntimeResponsibility({
    definitions,
    context: runtimeContext('finance'),
    task: { owner_role_key: 'finance' },
  })

  assert.deepEqual(model.currentItems[0].staticOwnerPoolKeys, ['boss'])
  assert.equal(model.currentItems[0].runtimeRoleKey, 'finance')
  assert.equal(model.definitionAlignment, 'different')
  assert.equal(model.taskAlignment, 'aligned')
})

test('does not invent responsibility when runtime evidence is missing', () => {
  const model = buildDevFlowRuntimeResponsibility({
    definitions,
    context: null,
    task: { owner_role_key: 'boss' },
  })

  assert.deepEqual(model.matchedDefinitions, [])
  assert.deepEqual(model.currentItems, [])
  assert.equal(model.linkedRuntimeRoleKey, '')
  assert.equal(model.definitionAlignment, 'unverified')
  assert.equal(model.taskAlignment, 'unverified')
})
