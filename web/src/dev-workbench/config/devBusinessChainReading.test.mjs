import test from 'node:test'
import assert from 'node:assert/strict'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import { buildBusinessChainDesignLibrary, emptyBusinessChainDraft, parseBusinessChainDraft } from './devBusinessChainDesign.mjs'
import { showBusinessChainWhole, projectBusinessChainMap } from './devBusinessChainMap.mjs'
import { CHAIN_DESIGN_NODE_SIZE } from './devBusinessChainDesignView.mjs'
import {
  CHAIN_READING_LAYERS,
  businessChainRelationLayer,
  describeBusinessChainReading,
  businessChainApprovalChoices,
  businessChainApprovalReading,
  arrangeBusinessChainReading,
  projectBusinessChainReading,
} from './devBusinessChainReading.mjs'

const library = buildBusinessChainDesignLibrary(catalog)

test('全流程用途、入口、结果和跨链接点均引用当前目录，不补造步骤锚点', () => {
  for (const chain of catalog.businessChains) {
    const reading = describeBusinessChainReading(catalog, chain.key)
    assert.equal(reading.chain, chain)
    assert(reading.inputs.length)
    for (const input of reading.inputs) assert(chain.entryNodeKeys.includes(input.key))
    for (const output of reading.outputs) assert(chain.nodes.includes(output))
    for (const edge of reading.handoffs) assert(catalog.businessChainOverview.relations.includes(edge))
  }
  const grouped = new Map(CHAIN_READING_LAYERS.map((layer) => [layer.value, []]))
  for (const edge of catalog.businessChainOverview.relations) grouped.get(businessChainRelationLayer(edge)).push(edge)
  assert.equal(grouped.get('normal').length, 8)
  assert.equal([...grouped.values()].flat().length, catalog.businessChainOverview.relations.length)
  assert(grouped.get('exception').some((edge) => edge.kind === 'returns_to'))
})

test('选择审批驳回只展示登记的拒绝与终止路径，不能连到批准或到货', () => {
  const node = library.nodes.find((item) => item.processNode?.definitionKey === 'material_supply/purchase_order_approval' && item.processNode.nodeKey === 'submit_purchase_order')
  const [choice] = businessChainApprovalChoices(catalog, library, node)
  const rejected = businessChainApprovalReading(library, choice, 'reject_purchase_order')
  assert.deepEqual(rejected.graph.nodes.map((item) => item.key), ['submit_purchase_order', 'purchase_order_approval', 'reject_purchase_order', 'purchase_order_rejected_end'])
  assert(rejected.graph.edges.every((edge) => choice.definition.edges.some((source) => source.key === edge.key)))
  assert.equal(rejected.graph.edges.some((edge) => edge.from === 'purchase_order_rejected_end'), false)
  assert.equal(rejected.nodeIds.some((id) => library.byId.get(id).label.includes('到货')), false)
  const approved = businessChainApprovalReading(library, choice, 'approve_purchase_order')
  assert(approved.graph.nodes.some((item) => item.key === 'approve_purchase_order'))
  assert.equal(approved.graph.nodes.some((item) => item.key === 'reject_purchase_order'), false)
})

test('阶段排布和泳道保留全部节点与原始关系，默认位置不重叠', () => {
  let cases = 0
  for (const chain of catalog.businessChains) {
    const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.key)
    for (const mode of ['mainline', 'all']) {
      const graph = projectBusinessChainMap(draft, library, mode)
      const original = JSON.stringify(graph)
      for (const layout of ['flow', 'lanes']) {
        const positions = arrangeBusinessChainReading(graph, library, layout)
        assert.equal(positions.size, graph.nodes.length)
        const values = [...positions.values()]
        for (let i = 0; i < values.length; i++) {
          for (let j = i + 1; j < values.length; j++) {
            const a = values[i]
            const b = values[j]
            const overlaps = Math.abs(a.x - b.x) < CHAIN_DESIGN_NODE_SIZE.width && Math.abs(a.y - b.y) < CHAIN_DESIGN_NODE_SIZE.height
            assert.equal(overlaps, false, `${chain.key}/${mode}/${layout}`)
          }
        }
        assert.equal(JSON.stringify(graph), original)
        cases++
      }
    }
  }
  assert.equal(cases, 44)
})

test('主路径保留拆分动作，异常专题完整显示，点选与明确展开分别处理', () => {
  for (const chain of catalog.businessChains) {
    const graph = projectBusinessChainMap(showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.key), library, 'mainline')
    const shown = projectBusinessChainReading(graph, library, { scope: 'whole', mode: 'mainline' })
    assert(shown.nodes.length, chain.key)
    if (['exception', 'rework', 'reversal'].includes(chain.kind)) assert.equal(shown, graph)
    const normal = chain.acceptanceScenarios.find((item) => item.kind === 'happy_path')
    for (const node of graph.nodes) {
      const item = library.byId.get(node.id)
      if (item.steps.some((step) => step.scenarioKeys?.includes(normal.key)) && ['business_action', 'system', 'task'].includes(item.type)) {
        assert(shown.nodes.some((entry) => entry.id === node.id), item.label)
      }
    }
    assert.equal(projectBusinessChainReading(graph, library, { scope: 'local', mode: 'mainline' }), graph)
  }
  const graph = projectBusinessChainMap(showBusinessChainWhole(emptyBusinessChainDraft(), library, 'purchase_to_inventory'), library, 'mainline')
  const iqc = library.nodes.find((node) => node.label === '自动建立逐行待检 IQC').id
  const correction = library.nodes.find((node) => node.label === '创建来料纠正检验').id
  const base = { scope: 'whole', mode: 'mainline' }
  assert.equal(projectBusinessChainReading(graph, library, base).nodes.some((node) => node.id === correction), false)
  assert.equal(projectBusinessChainReading(graph, library, { ...base, selection: { nodeId: correction, detailsOnly: true } }).nodes.some((node) => node.id === correction), false)
  assert(projectBusinessChainReading(graph, library, { ...base, selection: { nodeId: iqc } }).nodes.some((node) => node.id === correction))
  assert(projectBusinessChainReading(graph, library, { ...base, expandedNodes: [correction] }).nodes.some((node) => node.id === correction))
})

test('本地视图保存阅读布局、图层和镜头，拒绝非法镜头', () => {
  const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'purchase_to_inventory')
  draft.presentation = { mode: 'mainline', role: 'quality', layout: 'lanes', layers: ['normal', 'exception'], viewport: { x: -37, y: 92, scale: 1.25, mode: 'manual', chainKey: null } }
  const restored = parseBusinessChainDraft(JSON.stringify(draft), library)
  assert.deepEqual(restored.presentation, draft.presentation)
  assert.deepEqual(restored.nodes, draft.nodes)
  assert.throws(() => parseBusinessChainDraft(JSON.stringify({ ...draft, presentation: { ...draft.presentation, viewport: { ...draft.presentation.viewport, scale: 0 } } }), library))
})
