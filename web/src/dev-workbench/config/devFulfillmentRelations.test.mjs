import assert from 'node:assert/strict'
import test from 'node:test'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import { WorkflowTaskDiscoveryCatalog as tasks } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { describeDevBusinessChainResponsibility } from './devBusinessChainProjection.mjs'
import { buildFulfillmentRelations, buildChainActionRelations, buildRelationFacets, relationMatches, EMPTY_RELATION_FILTERS, projectFulfillmentRelations, projectChainRelations, projectAllActionRelations } from './devFulfillmentRelations.mjs'

const relations = buildFulfillmentRelations(catalog)
const incoming = relations.find((item) => item.stage.stage === 'incoming_quality')
const filters = (values) => ({ ...EMPTY_RELATION_FILTERS, ...values })

test('every formal fulfillment stage resolves live action contracts without copying state or permission definitions', () => {
  assert.deepEqual(relations.map((item) => item.stage), tasks.fulfillment_flow)
  const permissions = new Set(Object.values(PermissionCode))
  for (const relation of relations) {
    assert(relation.actions.length > 0, relation.stage.stage)
    assert.equal(new Set(relation.actions.map((action) => action.key)).size, relation.actions.length)
    for (const action of relation.actions) {
      assert(action.input && action.result)
      assert(action.permissionKeys.every((key) => permissions.has(key)))
      for (const { flow, transition } of action.transitions) {
        assert(catalog.flows.includes(flow))
        assert(flow.transitions.includes(transition))
      }
      if (action.step) assert(catalog.businessChains.some((chain) => chain.steps.includes(action.step)))
    }
  }
})

test('different facets must match one action rather than unioning adjacent duties', () => {
  const find = (value) => incoming.actions.filter((action) => relationMatches(action, filters(value)))
  assert.equal(find({ machine: 'fact.purchase_receipt', permission: 'quality.inspection.update' }).length, 0)
  assert.equal(find({ role: 'quality', permission: 'warehouse.inbound.confirm' }).length, 0)
  const inbound = find({ role: 'warehouse', machine: 'fact.purchase_receipt', permission: 'warehouse.inbound.confirm' })
  assert.equal(inbound.length, 1)
  assert.equal(inbound[0].substepKey, 'inbound')
  assert.equal(inbound[0].transitions[0].transition.to, 'POSTED')
})

test('finished quality records its decision before the system writes the WIP result', () => {
  const finished = relations.find((item) => item.stage.stage === 'finished_quality')
  const result = finished.actions.find((action) => action.substepKey === 'passed')
  assert.equal(result.responsibilityMode, 'system')
  assert.deepEqual(result.roleKeys, [])
  assert.equal(describeDevBusinessChainResponsibility({ mode: result.responsibilityMode, ownerPoolKeys: result.roleKeys }), '系统自动处理')
  assert(result.permissionKeys.includes(PermissionCode.QUALITY_INSPECTION_UPDATE))
  assert.equal(result.transitions[0].transition.systemOnly, false, 'responsibility presentation must not remove a canonical domain transition')
  assert.match(result.transitions[0].transition.guard, /质检事务自动回写/u)
  const inspect = finished.actions.find((action) => action.substepKey === 'quality' && action.responsibilityMode === 'human')
  assert(inspect.roleKeys.includes('quality'))
})

test('facets count matching actions and retain an invalid restored value for deliberate recovery', () => {
  const selected = filters({ machine: 'fact.purchase_receipt', permission: 'quality.inspection.update' })
  const facets = buildRelationFacets(catalog, incoming.actions, selected)
  const current = facets.permission.find((option) => option.value === selected.permission)
  assert.equal(current.count, 0)
  assert.equal(current.disabled, false)
  assert.equal(facets.permission.find((option) => option.value === 'warehouse.inbound.confirm').count, 1)
  assert.equal(incoming.actions.filter((action) => relationMatches(action, filters({ permission: 'retired.permission' }))).length, 0)
})

test('empty or stale action context never falls back to global definitions', () => {
  for (const [selectedFilters, key] of [[filters({ permission: 'retired' }), null], [filters({}), 'retired']]) {
    const projection = projectFulfillmentRelations(catalog, incoming, selectedFilters, key)
    assert.deepEqual(projection.flows, [])
    assert.deepEqual(projection.factDefinitions, [])
    assert.deepEqual(projection.processDefinitions, [])
  }
})

test('action context retains real prerequisites and results without unrelated finance actions', () => {
  const action = incoming.actions.find((item) => item.substepKey === 'inbound')
  const projection = projectFulfillmentRelations(catalog, incoming, filters({}), action.key)
  assert(projection.machineKeys.includes('fact.purchase_receipt'))
  assert(projection.machineKeys.includes('fact.quality_inspection'))
  assert(!projection.machineKeys.includes('fact.finance_payment'))
  assert.equal(projection.contextLabel, incoming.stage.label)
  assert.equal(projection.readOnly, true)
  assert.equal(projection.allowsActionExecution, false)
})

test('missing canonical references fail closed instead of inventing an action', () => {
  assert.throws(() => buildFulfillmentRelations({ ...catalog, flows: catalog.flows.filter((flow) => flow.key !== 'fact.production_wip_batch') }), /Unknown fulfillment relation/u)
})

test('direct state transitions retain their canonical fact definitions', () => {
  const relation = relations.find((item) => item.stage.stage === 'cutting_return')
  const projection = projectFulfillmentRelations(catalog, relation, filters({}))
  const fact = catalog.factDefinitions.find((item) => item.machineKey === 'fact.production_wip_batch')
  assert(fact)
  assert(projection.factDefinitions.includes(fact))
})

test('overview filters constrain rule definitions without requiring a selected stage', () => {
  const actions = relations.flatMap((item) => item.actions)
  assert.equal(projectAllActionRelations(catalog, actions, filters({})), null)
  const projection = projectAllActionRelations(catalog, actions, filters({ machine: 'fact.purchase_receipt', permission: 'quality.inspection.update' }))
  assert.deepEqual(projection.flows, [])
  assert.deepEqual(projection.factDefinitions, [])
  assert.equal(projection.chain, null)
})

test('exception action links retain the selected canonical step and reject stale action keys', () => {
  const chain = catalog.businessChains.find((item) => item.key === 'purchase_quality_disposition')
  const action = buildChainActionRelations(catalog, chain)[0]
  assert.deepEqual(projectChainRelations(catalog, chain.key, '', filters({}), action.key).steps, [action.step])
  assert.deepEqual(projectChainRelations(catalog, chain.key, '', filters({}), 'retired').flows, [])
})
