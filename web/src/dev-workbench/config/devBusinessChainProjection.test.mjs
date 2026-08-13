import assert from 'node:assert/strict'
import test from 'node:test'

import { yoyoosunRoleFlowMatrix } from '../../../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import {
  buildDevBusinessChainProjection,
  projectDevBusinessChainRoles,
} from './devBusinessChainProjection.mjs'
import { DEV_FLOW_STATE_CATALOG } from './devFlowStateCatalog.mjs'

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
