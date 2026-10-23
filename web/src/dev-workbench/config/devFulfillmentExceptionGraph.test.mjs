import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentExceptionGraph, resolveFulfillmentExceptionOrigin } from './devFulfillmentExceptionGraph.mjs'

const guide = (key) => catalog.exception_guides.find((item) => item.key === key)

test('exception connections share the formal task catalog and link only registered stages and sources', () => {
  const source = JSON.parse(readFileSync(new URL('../../../../server/internal/biz/workflow_task_catalog.json', import.meta.url), 'utf8'))
  assert.deepEqual(JSON.parse(JSON.stringify(catalog)), source)
  for (const flow of catalog.fulfillment_flow) {
    for (const node of flow.subflow?.nodes || []) {
      if (node.exception_guide) assert(guide(node.exception_guide).entry_stages.includes(flow.stage))
    }
  }
  assert(guide('posted_purchase').entry_stages.includes('incoming_quality'), 'posted corrections start after the material inbound phase')
})

test('rework, remake, scrap and concession retain distinct source and return positions', () => {
  const quality = guide('production_quality')
  for (const [origin, next] of [['cutting_quality', 'sewing_execute'], ['shell_quality', 'handwork_execute'], ['finished_quality', 'packaging']]) {
    const rework = buildFulfillmentExceptionGraph(quality, { originStage: origin, planKey: 'original_rework' })
    assert.equal(rework.origin.stage, origin)
    assert.equal(rework.returnStage.stage, origin)
    assert(rework.edges.some((edge) => edge.to === 'main:return' && edge.label === '返工复检合格'))
    const remake = buildFulfillmentExceptionGraph(quality, { originStage: origin, planKey: 'remake' })
    assert.equal(remake.reentryStage.stage, 'cutting_issue')
    assert.equal(remake.returnStage.stage, origin)
    assert(remake.edges.some((edge) => edge.from === 'execute' && edge.to === 'main:reentry'))
    assert(remake.edges.some((edge) => edge.from === 'execute' && edge.to === 'end:original'))
    const concession = buildFulfillmentExceptionGraph(quality, { originStage: origin, planKey: 'concession' })
    assert.equal(concession.returnStage.stage, next)
    assert(concession.edges.some((edge) => edge.to === 'main:return' && /其余关口/u.test(edge.label)))
    assert(!concession.steps.some((node) => node.key === 'reinspect'))
    const scrap = buildFulfillmentExceptionGraph(quality, { originStage: origin, planKey: 'scrap' })
    assert.equal(scrap.returnStage, null)
    assert.equal(scrap.reentryStage, null)
    assert(!scrap.edges.some((edge) => edge.to === 'main:return'))
    assert.equal(scrap.nodes.find((node) => node.key === 'end:result').label, '本批报废终止')
  }
})

test('replacement returns through counting and inbound while vendor return has no fabricated re-entry', () => {
  const replacement = buildFulfillmentExceptionGraph(guide('purchase_rejection'), { planKey: 'replacement' })
  assert.equal(replacement.origin.stage, 'incoming_quality')
  assert.equal(replacement.reentryStage.stage, 'purchase_count')
  assert.equal(replacement.returnStage.stage, 'incoming_quality')
  assert(replacement.edges.some((edge) => edge.to === 'main:reentry' && edge.from === 'arrange'))
  assert.deepEqual(replacement.steps.map((node) => node.key), ['inspect', 'arrange', 'arrival', 'reinspect', 'inbound'])
  const returned = buildFulfillmentExceptionGraph(guide('purchase_rejection'), { planKey: 'return_to_vendor' })
  assert.equal(returned.returnStage, null)
  assert.match(returned.nodes.find((node) => node.kind === 'terminal').label, /不入库/u)
})

test('independent flows stay outside the 17-stage chain and stale source selections fail closed', () => {
  for (const key of ['over_issue', 'outsourcing_rejection']) {
    const graph = buildFulfillmentExceptionGraph(guide(key), { previousStage: 'cutting_issue' })
    assert.equal(graph.origin, null)
    assert.equal(graph.returnStage, null)
    assert(!graph.nodes.some((node) => node.kind === 'main'))
  }
  const quality = guide('production_quality')
  assert.equal(resolveFulfillmentExceptionOrigin(quality, null, 'shell_quality').stage.stage, 'shell_quality')
  const invalid = buildFulfillmentExceptionGraph(quality, { originStage: 'sales_order' })
  assert(invalid.invalid)
  assert.deepEqual(invalid.edges, [])
  const restored = buildFulfillmentExceptionGraph(quality, { originStage: null, previousStage: 'finished_quality' })
  assert.equal(restored.origin.stage, 'finished_quality')
})

test('all exception schemes preserve source steps, reachable outcomes and reentry order', () => {
  for (const source of catalog.exception_guides) {
    for (const plan of source.plans) {
      for (const origin of source.entry_stages.length ? source.entry_stages : [null]) {
        const graph = buildFulfillmentExceptionGraph(source, { planKey: plan.key, originStage: origin })
        const keys = new Set(graph.nodes.map((node) => node.key))
        assert.equal(keys.size, graph.nodes.length)
        assert(graph.edges.every((edge) => keys.has(edge.from) && keys.has(edge.to)))
        for (const node of graph.steps) assert(graph.nodes.some((item) => item.key === node.key && item.result === node.result))
        const reachable = new Set(['main:entry'])
        for (let i = 0; i < graph.nodes.length; i += 1) for (const edge of graph.edges) if (reachable.has(edge.from)) reachable.add(edge.to)
        assert.equal(reachable.size, graph.nodes.length)
        const split = plan.continuation.reentry ? graph.steps.findIndex((step) => step.key === plan.continuation.reentry.before_step) : graph.steps.length
        assert.deepEqual(graph.branchSteps, graph.steps.slice(0, split))
        if (graph.reentryStage) assert(graph.edges.some((edge) => edge.from === graph.branchSteps.at(-1).key && edge.to === 'main:reentry'))
      }
    }
  }
})

test('全局异常图不猜测来源，审批拒绝有独立终止出口', () => {
  for (const source of catalog.exception_guides) {
    for (const plan of source.plans) {
      const graph = buildFulfillmentExceptionGraph(source, { planKey: plan.key, overview: true })
      assert.equal(graph.origin, null)
      if (['origin', 'next'].includes(plan.continuation.target)) assert.equal(graph.returnStage, null)
      if (source.approval) {
        assert(graph.edges.some((edge) => edge.from === 'approval' && edge.to === 'end:rejected' && edge.label === '未通过'))
        assert(!graph.edges.some((edge) => edge.from === 'end:rejected'), '拒绝不进入已批准方案')
        assert.equal(graph.nodes.find((node) => node.key === 'end:rejected').result, source.approval.rejected)
      }
    }
  }
})
