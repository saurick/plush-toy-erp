import assert from 'node:assert/strict'
import test from 'node:test'

import { yoyoosunRoleFlowMatrix } from '../../../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import {
  buildDevBusinessChainProjection,
  projectDevBusinessChainRoles,
  describeDevBusinessChainNode,
  describeDevBusinessChainResponsibility,
  buildDevBusinessChainRoleGuide,
  buildDevBusinessChainTopics,
} from './devBusinessChainProjection.mjs'
import { DEV_FLOW_STATE_CATALOG } from './devFlowStateCatalog.mjs'

test('business topics follow registered role duties and preserve complete handoffs', () => {
  const all = buildDevBusinessChainTopics(DEV_FLOW_STATE_CATALOG).flatMap((lane) => lane.topics)
  assert.deepEqual(new Set(all.map((topic) => topic.chain.key)), new Set(DEV_FLOW_STATE_CATALOG.businessChains.map((chain) => chain.key)))
  assert.equal(all.length, DEV_FLOW_STATE_CATALOG.businessChains.length)
  const engineering = buildDevBusinessChainTopics(DEV_FLOW_STATE_CATALOG, 'engineering').flatMap((lane) => lane.topics)
  assert.deepEqual(engineering.map((topic) => topic.chain.key), ['sales_to_production'])
  const warehouse = buildDevBusinessChainTopics(DEV_FLOW_STATE_CATALOG, 'warehouse').flatMap((lane) => lane.topics)
  assert(warehouse.some((topic) => topic.chain.key === 'purchase_posting_corrections'))
  const purchase = warehouse.find((topic) => topic.chain.key === 'purchase_to_inventory')
  assert(purchase.matchingSteps.every((step) => step.role_keys.includes('warehouse')))
  assert(purchase.steps.some((step) => step.role_keys.includes('finance')), 'a role entry must retain downstream financial handoffs')
  assert(purchase.steps.some((step) => step.role_keys.includes('quality')), 'a role entry must retain quality handoffs')
  assert.deepEqual(buildDevBusinessChainTopics(DEV_FLOW_STATE_CATALOG, 'unregistered-role'), [], 'unknown roles must not acquire duties from a permission or label guess')
})

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

test('purchase topic reuses role handoffs and retains both payable draft and posting', () => {
  const steps = buildDevBusinessChainRoleGuide(DEV_FLOW_STATE_CATALOG, 'purchase_to_inventory')
  assert.deepEqual(steps.slice(0, 3).map((step) => step.stage), ['purchasing', 'purchase_count', 'incoming_quality'])
  assert.equal(steps.length, 5)
  const finance = steps.filter((step) => step.role_keys.includes('finance'))
  assert.equal(finance.length, 2)
  assert(finance.every((step) => step.role === '财务'))
  assert.match(finance[0].result, /草稿/u)
  assert.match(finance[1].result, /草稿.*已过账/u)
  assert(finance.every((step) => step.stages.length === 0), 'financial facts must not acquire invented task links')
  assert(!steps.some((step) => step.stage === 'finished_inbound'))
})

test('every topic has grounded role guidance, and exception branches retain their conditions', () => {
  for (const chain of DEV_FLOW_STATE_CATALOG.businessChains) {
    const steps = buildDevBusinessChainRoleGuide(DEV_FLOW_STATE_CATALOG, chain.key)
    assert(steps.length > 0, chain.key)
    assert.equal(new Set(steps.map((step) => step.stage)).size, steps.length)
    for (const step of steps) {
      assert.equal(step.business_chain, chain.key)
      if (step.nodeKey) assert(chain.nodes.some((node) => node.key === step.nodeKey))
      assert(step.role)
      assert(!step.role.includes('具有对应业务权限的岗位'), `${chain.key}/${step.stage} needs an explicit registered responsibility`)
      assert(step.result)
      assert.doesNotMatch([step.role, step.result, ...(step.handoffs || [])].join(' '), /finance_fact_|orchestration_only|source_document_only/u)
    }
  }
  const exception = buildDevBusinessChainRoleGuide(DEV_FLOW_STATE_CATALOG, 'purchase_quality_disposition')
  const chain = DEV_FLOW_STATE_CATALOG.businessChains.find((item) => item.key === 'purchase_quality_disposition')
  for (const step of chain.steps.filter((item) => item.condition)) {
    const projected = exception.find((item) => item.stage === step.key)
    assert(projected.handoffs.includes(step.condition))
    assert.equal(projected.branch, true, 'mutually exclusive outcomes remain conditional even when both have happy-path scenarios')
  }
  assert.throws(() => buildDevBusinessChainRoleGuide(DEV_FLOW_STATE_CATALOG, 'missing'), /unknown business chain/u)
})
