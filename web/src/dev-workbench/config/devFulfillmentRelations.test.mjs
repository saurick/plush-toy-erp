import assert from 'node:assert/strict'
import test from 'node:test'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import { WorkflowTaskDiscoveryCatalog as tasks } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { describeDevBusinessChainResponsibility } from './devBusinessChainProjection.mjs'
import { buildFulfillmentRelations } from './devFulfillmentRelations.mjs'

const relations = buildFulfillmentRelations(catalog)

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

test('missing canonical references fail closed instead of inventing an action', () => {
  assert.throws(() => buildFulfillmentRelations({ ...catalog, flows: catalog.flows.filter((flow) => flow.key !== 'fact.production_wip_batch') }), /Unknown fulfillment relation/u)
})
