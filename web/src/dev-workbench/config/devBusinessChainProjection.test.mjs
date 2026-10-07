import assert from 'node:assert/strict'
import test from 'node:test'

import { yoyoosunRoleFlowMatrix } from '../../../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import {
  buildDevBusinessChainProjection,
  projectDevBusinessChainRoles,
  describeDevBusinessChainNode,
  describeDevBusinessChainResponsibility,
} from './devBusinessChainProjection.mjs'
import { DEV_FLOW_STATE_CATALOG } from './devFlowStateCatalog.mjs'

test('responsibility labels preserve formal roles and explain unresolved pools without a generic role name', () => {
  const text = describeDevBusinessChainResponsibility({
    modes: ['human', 'system'],
    ownerPoolKeys: ['boss', 'finance', 'unregistered-pool'],
    capabilityKeys: [],
  })
  assert.equal(text, '老板、财务、具有对应业务权限的岗位、系统自动处理')
  assert.equal(
    describeDevBusinessChainResponsibility({
      mode: 'derived',
      ownerPoolKeys: [],
      capabilityKeys: [],
    }),
    '系统按已生效结果计算'
  )
})

test('node completion describes actions separately and does not turn incoming ready state into completion', () => {
  const chain = DEV_FLOW_STATE_CATALOG.businessChains.find(
    (item) => item.key === 'sales_to_production'
  )
  const node = chain.nodes.find((item) => item.key === 'sales_tasks')
  const actions = describeDevBusinessChainNode(
    DEV_FLOW_STATE_CATALOG,
    chain,
    node
  )
  assert.equal(actions.length, 2)
  const rejection = actions.find((action) => action.condition.includes('拒绝'))
  assert(rejection.results.some((value) => value.includes('已退回')))
  assert(!rejection.results.some((value) => value.includes('已生效')))
  assert(!actions.some((action) => action.label === '按业务分支创建岗位任务'))
})

test('business chain projection classifies responsibility, runtime, Fact, and state views from shared steps', () => {
  for (const chain of DEV_FLOW_STATE_CATALOG.businessChains) {
    const projection = buildDevBusinessChainProjection({
      catalog: DEV_FLOW_STATE_CATALOG,
      chainKey: chain.key,
    })
    assert.equal(projection.chain, chain)
    assert.equal(projection.steps.length, chain.steps.length)
    assert.equal(
      projection.scenarios.length,
      chain.acceptanceScenarios.length,
      chain.key
    )
    assert.equal(projection.readOnly, true)
    assert.equal(projection.allowsActionExecution, false)
    assert.deepEqual(
      new Set(projection.flows.map((flow) => flow.key)),
      new Set(projection.machineKeys),
      `${chain.key} state projection`
    )
    assert.deepEqual(
      new Set(
        projection.processDefinitions.map((definition) => definition.key)
      ),
      new Set(projection.processDefinitionKeys),
      `${chain.key} process projection`
    )
    assert.deepEqual(
      new Set(
        projection.factDefinitions.map((definition) => definition.factKey)
      ),
      new Set(projection.factKeys),
      `${chain.key} Fact projection`
    )
    const roles = projectDevBusinessChainRoles(
      projection,
      yoyoosunRoleFlowMatrix.roles
    )
    if (projection.responsibility.modes.includes('human')) {
      assert(roles.length > 0, `${chain.key} role projection`)
    }
  }
})

test('business chain node projection keeps only adjacent registered steps and scenarios', () => {
  const projection = buildDevBusinessChainProjection({
    catalog: DEV_FLOW_STATE_CATALOG,
    chainKey: 'delivery_to_settlement',
    nodeKey: 'shipment_release',
  })
  assert.deepEqual(
    projection.steps.map((step) => step.key),
    [
      'shipment_release_task:calls_domain_command:shipment_release',
      'shipment_release:posts_fact:shipped',
      'shipment_release_task:returns:shipment_release',
    ]
  )
  assert(
    projection.scenarios.some((scenario) => scenario.kind === 'happy_path')
  )
  assert(
    projection.scenarios.some((scenario) => scenario.kind === 'wrong_state')
  )
  assert.deepEqual(projection.factKeys, [
    'fact.shipment_finance_release',
    'fact.shipment',
  ])
})

test('business chain projection fails closed for unknown chain or node', () => {
  assert.throws(
    () =>
      buildDevBusinessChainProjection({
        catalog: DEV_FLOW_STATE_CATALOG,
        chainKey: 'missing',
      }),
    /unknown business chain projection/u
  )
  assert.throws(
    () =>
      buildDevBusinessChainProjection({
        catalog: DEV_FLOW_STATE_CATALOG,
        chainKey: 'sales_to_production',
        nodeKey: 'missing',
      }),
    /unknown business chain node projection/u
  )
})
