import test from 'node:test'
import assert from 'node:assert/strict'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import { buildBusinessChainDesignLibrary, emptyBusinessChainDraft, parseBusinessChainDraft } from './devBusinessChainDesign.mjs'
import { arrangeBusinessChainMap, showBusinessChainWhole, projectBusinessChainMap, toggleBusinessChainMapRegion } from './devBusinessChainMap.mjs'
import { CHAIN_DESIGN_NODE_SIZE, routeBusinessChainEdges } from './devBusinessChainDesignView.mjs'
import {
  CHAIN_READING_LAYERS,
  businessChainStepLayer,
  businessChainRelationLayer,
  describeBusinessChainReading,
  businessChainApprovalChoices,
  businessChainApprovalReading,
  arrangeBusinessChainReading,
  businessChainLaneBands,
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

test('单链泳道按可见内容收紧间距，保留列的顺序与对齐、泳道内行距和草稿坐标', () => {
  const sortedColumns = (nodes) => [...new Set(nodes.map(({ x }) => x))].sort((a, b) => a - b)
  const allLayers = CHAIN_READING_LAYERS.map(({ value }) => value)
  for (const chain of catalog.businessChains) {
    const draft = arrangeBusinessChainMap(showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.key), library, 'mainline', 'lanes')
    const projected = projectBusinessChainMap(draft, library, 'mainline')
    for (const layers of [['normal'], allLayers]) {
      const reading = projectBusinessChainReading(projected, library, { scope: 'whole', mode: 'mainline', layers })
      const original = structuredClone(reading.nodes)
      const compact = projectBusinessChainReading(projected, library, { scope: 'whole', mode: 'mainline', layout: 'lanes', layers })
      const beforeColumns = sortedColumns(original)
      const compactColumns = sortedColumns(compact.nodes)
      assert.equal(compactColumns.length, beforeColumns.length, chain.key)
      const bands = businessChainLaneBands(compact, library).sort((a, b) => a.y - b.y)
      for (const [i, band] of bands.entries()) {
        if (i) assert.equal(band.y - bands[i - 1].y - bands[i - 1].height, 32, chain.key)
      }
      const offsets = new Map()
      for (const [i, node] of compact.nodes.entries()) {
        const { domain } = library.byId.get(node.id)
        const offset = original[i].y - node.y
        assert.equal(node.id, original[i].id)
        assert.equal(node.x, compactColumns[beforeColumns.indexOf(original[i].x)])
        if (offsets.has(domain)) assert.equal(offset, offsets.get(domain), domain)
        offsets.set(domain, offset)
      }
      assert.deepEqual(reading.nodes, original)
      const manual = { ...reading, nodes: reading.nodes.map((node, i) => i ? node : { ...node, manual: true }) }
      assert.deepEqual(projectBusinessChainReading(manual, library, { scope: 'whole', mode: 'mainline', layout: 'lanes', layers: allLayers }).nodes, manual.nodes)
    }
  }
})

test('委外泳道在步骤档收掉隐藏记录的空列，节点档仍能读到记录', () => {
  const draft = arrangeBusinessChainMap(
    showBusinessChainWhole(emptyBusinessChainDraft(), library, 'outsourcing_to_inventory'),
    library,
    'mainline',
    'lanes'
  )
  const options = { scope: 'whole', layout: 'lanes', layers: CHAIN_READING_LAYERS.map(({ value }) => value) }
  const read = (mode) => projectBusinessChainReading(projectBusinessChainMap(draft, library, mode), library, { ...options, mode })
  const byLabel = (graph, label) => graph.nodes.find(({ id }) => library.byId.get(id).label === label)
  const steps = read('mainline')
  const issue = byLabel(steps, '过账委外发料')
  const receipt = byLabel(steps, '登记委外回货草稿')
  const postReceipt = byLabel(steps, '过账委外回货')
  assert.equal(receipt.x - issue.x, postReceipt.x - receipt.x)
  assert.equal(byLabel(steps, '委外发料事实'), undefined)
  assert.deepEqual(steps.edges, projectBusinessChainMap(draft, library, 'mainline').edges)

  const details = read('all')
  const fact = byLabel(details, '委外发料事实')
  assert(fact.x > byLabel(details, '过账委外发料').x)
  assert(fact.x < byLabel(details, '登记委外回货草稿').x)
  assert.deepEqual(read('mainline'), steps)
})

test('查看节点的上下游时已有步骤原位保留，临时出现的节点互不遮挡', () => {
  for (const chain of catalog.businessChains) {
    const draft = arrangeBusinessChainMap(showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.key), library, 'mainline', 'lanes')
    for (const mode of ['mainline', 'all']) {
      const projected = projectBusinessChainMap(draft, library, mode)
      for (const layer of ['normal', 'exception']) {
        const options = { scope: 'whole', mode, layout: 'lanes', layers: [layer] }
        const original = projectBusinessChainReading(projected, library, options)
        for (const selected of original.nodes) {
          const inspected = projectBusinessChainReading(projected, library, { ...options, selection: { nodeId: selected.id } })
          const positions = new Map(inspected.nodes.map((node) => [node.id, node]))
          for (const node of original.nodes) assert.deepEqual(positions.get(node.id), node)
          for (const [i, node] of inspected.nodes.entries()) {
            for (const other of inspected.nodes.slice(i + 1)) {
              assert(Math.abs(node.x - other.x) >= CHAIN_DESIGN_NODE_SIZE.width || Math.abs(node.y - other.y) >= CHAIN_DESIGN_NODE_SIZE.height, `${chain.key}: ${node.id} / ${other.id}`)
            }
          }
        }
      }
    }
  }
})

test('主路径保留拆分动作，异常专题完整显示，点选与明确展开分别处理', () => {
  for (const chain of catalog.businessChains) {
    const graph = projectBusinessChainMap(showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.key), library, 'mainline')
    const shown = projectBusinessChainReading(graph, library, { scope: 'whole', mode: 'mainline' })
    if (chain.kind === 'exception' || chain.key === 'purchase_posting_corrections') {
      const layer = chain.kind === 'exception' ? 'exception' : 'correction'
      assert.equal(projectBusinessChainReading(graph, library, { scope: 'whole', mode: 'mainline', layers: [layer] }), graph)
      assert.equal(shown.nodes.length, 0)
      continue
    }
    assert(shown.nodes.length, chain.key)
    const normal = chain.acceptanceScenarios.find((item) => item.kind === 'happy_path')
    for (const node of graph.nodes) {
      const item = library.byId.get(node.id)
      if (businessChainStepLayer(item, library) === 'normal' && item.steps.some((step) => step.scenarioKeys?.includes(normal.key)) && ['business_action', 'system', 'task'].includes(item.type)) {
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

test('链内异常只保留已登记的驳回方向和终点，纠正与横切独立选择', () => {
  const read = (key, layer) => projectBusinessChainReading(
    projectBusinessChainMap(showBusinessChainWhole(emptyBusinessChainDraft(), library, key), library),
    library,
{ scope: 'whole', mode: 'mainline', layers: [layer] }
  )
  const purchase = read('purchase_to_inventory', 'exception')
  const edges = purchase.edges.map(({ from, to }) => [library.byId.get(from).label, library.byId.get(to).label])
  assert(edges.some(([a, b]) => a === '驳回采购订单' && b === '采购审批拒绝 · 本次结束'))
  assert(!edges.some(([a, b]) => a === '采购订单审批' && b === '批准采购订单'))
  const finance = read('finance_payment_and_reversal', 'exception')
  assert(finance.nodes.some(({ id }) => library.byId.get(id).label === '驳回收付款'))
  assert.equal(read('purchase_to_inventory', 'impact').nodes.length, 0)
  assert(read('purchase_posting_corrections', 'correction').nodes.some(({ id }) => library.byId.get(id).label === '冲正采购退货'))
})

test('最细颗粒度按可见关系保留单据、记录及终点，切换分类不改已载入图', () => {
  const key = 'sales_to_production'
  const graph = projectBusinessChainMap(showBusinessChainWhole(emptyBusinessChainDraft(), library, key), library, 'all')
  const before = structuredClone(graph)
  for (const scope of ['local', 'whole']) {
    const read = (layers) => projectBusinessChainReading(graph, library, { scope, mode: 'all', layers })
    const main = read(['normal'])
    assert(main.nodes.some(({ id }) => id === 'node:sales_order'))
    assert(!main.nodes.some(({ id }) => id.endsWith(':sales_order_rejected_end')))
    const rejected = read(['exception'])
    assert(rejected.edges.some(({ from, to }) => from.endsWith(':reject_sales_order') && to.endsWith(':sales_order_rejected_end')))
    assert(!rejected.nodes.some(({ id }) => id.endsWith(':activate_sales_order')))
    assert.deepEqual(read([]).nodes, [])
    assert.deepEqual(read([]).edges, [])
    assert.deepEqual(read(['normal', 'exception']), graph)
  }
  assert.deepEqual(graph, before)
})

test('单链概览展开为步骤后复用主线与分支阅读，卡片和总图不受影响', () => {
  const chainKey = 'purchase_to_inventory'
  const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, chainKey)
  const overview = { scope: 'whole', mode: 'overview' }
  const read = (graph, options) => projectBusinessChainReading(graph, library, { ...overview, ...options })
  const card = projectBusinessChainMap(draft, library, 'overview')
  assert.equal(read(card), card)

  const expanded = toggleBusinessChainMapRegion(draft, library, chainKey)
  const steps = projectBusinessChainMap(expanded, library, 'overview')
  const mainline = read(steps)
  assert(steps.nodes.length > mainline.nodes.length)
  assert.deepEqual(mainline.nodes, read(steps, { mode: 'mainline' }).nodes)
  assert.deepEqual(mainline.edges, read(steps, { mode: 'mainline' }).edges)
  assert.equal(read(steps, { layers: CHAIN_READING_LAYERS.map((item) => item.value) }), steps)
  assert.equal(read(steps, { scope: 'local' }), steps)

  const map = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'all')
  const expandedMap = projectBusinessChainMap(toggleBusinessChainMapRegion(map, library, chainKey), library, 'overview')
  assert(expandedMap.edges.some((edge) => edge.overview))
  assert.equal(read(expandedMap), expandedMap)
})

test('恢复已有草稿的阅读布局与图层，忽略旧缩放和偏移', () => {
  const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'purchase_to_inventory')
  draft.presentation = { mode: 'mainline', role: 'quality', layout: 'lanes', layers: ['normal', 'exception'], viewport: { x: -37, y: 92, scale: 1.25, mode: 'manual', chainKey: null } }
  const restored = parseBusinessChainDraft(JSON.stringify(draft), library)
  assert.deepEqual(restored.presentation, { mode: 'mainline', highlightedRoles: ['quality'], layout: 'lanes', layers: ['normal', 'exception'] })
  assert.deepEqual(restored.nodes, draft.nodes)
})

test('销售受理合并共同节点并保留每条来源，按流程查看只显示登记的出口', () => {
  const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'sales_to_production')
  draft.presentation = { mode: 'all', highlightedRoles: [], layout: 'lanes' }
  const read = () => projectBusinessChainMap(draft, library, 'all')
  const combined = read()
  const node = (graph, key) => graph.nodes.find(({ id }) => library.byId.get(id).processNode?.nodeKey === key)
  const edge = (graph, from, to) => graph.edges.find((item) => item.from === node(graph, from)?.id && item.to === node(graph, to)?.id)
  const approval = node(combined, 'order_approval')
  assert.equal(approval.sourceIds.length, 2)
  assert.equal(edge(combined, 'submit_sales_order', 'order_approval').paths.length, 2)
  for (const path of combined.edges.flatMap((item) => item.paths)) {
    assert(path.every(({ from, to }) => library.byPair.has(JSON.stringify([from, to]))))
  }
  for (const [from, to] of [['order_approval', 'reject_sales_order'], ['reject_sales_order', 'sales_order_rejected_end']]) {
    const rejected = edge(combined, from, to)
    assert.equal(rejected.kind, 'exception')
    assert.equal(node(combined, from).x, node(combined, to).x)
    assert(node(combined, from).y < node(combined, to).y)
  }
  assert.equal(approval.y, node(combined, 'order_review').y)
  for (const definition of library.salesAcceptanceVariants) {
    draft.presentation.salesAcceptanceVariant = definition.key
    const graph = read()
    const processNodes = graph.nodes.filter((item) => item.sourceIds)
    assert.equal(processNodes.length, definition.nodes.length)
    for (const item of processNodes) assert.deepEqual(item.sourceIds, [item.id])
    const edges = graph.edges.filter((item) => library.byId.get(item.from).processNode && library.byId.get(item.to).processNode)
    assert.deepEqual(new Set(edges.map((item) => [item.from.split(':').at(-1), item.to.split(':').at(-1)].join('->'))),
      new Set(definition.edges.map((item) => item.key)))
    assert.equal(parseBusinessChainDraft(JSON.stringify(draft), library).presentation.salesAcceptanceVariant, definition.key)
  }
})

test('全图两档按链分段；还原相撞坐标时，各段卡片与泳道分别排布、来源关系可回查', () => {
  const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'all')
  draft.nodes = draft.nodes.map((node) => ({ ...node, x: 50, y: 50, manual: true }))
  draft.presentation = { mode: 'all', highlightedRoles: [], readingChain: 'sales_to_production', salesAcceptanceVariant: library.salesAcceptanceVariants[0].key }
  const restored = parseBusinessChainDraft(JSON.stringify(draft), library)
  assert.equal(Object.hasOwn(restored.presentation, 'readingChain'), false)
  for (const mode of ['mainline', 'all']) {
    const graph = projectBusinessChainMap(restored, library, mode)
    const layers = CHAIN_READING_LAYERS.map(({ value }) => value)
    for (const layout of ['lanes', 'flow']) {
      const options = { scope: 'whole', mode, layout, layers }
      const all = projectBusinessChainReading(graph, library, options)
      assert.equal(all.nodes.filter(({ id }) => id.endsWith(':order_approval')).length, 1)
      assert(all.nodes.some(({ id }) => id.endsWith(':engineering_data')))
      assert.equal(all.sections.length, library.chains.length)
      assert.equal(all.nodes.length, graph.nodes.length)
      assert.deepEqual(all.edges, graph.edges)
      for (const [i, a] of all.nodes.entries()) {
        for (const b of all.nodes.slice(i + 1)) {
          assert(Math.abs(a.x - b.x) >= CHAIN_DESIGN_NODE_SIZE.width || Math.abs(a.y - b.y) >= CHAIN_DESIGN_NODE_SIZE.height, `${a.id} / ${b.id}`)
        }
      }
    }
  }
  assert(draft.nodes.every((n) => n.x === 50 && n.y === 50 && n.manual))
})

for (const layout of ['lanes', 'flow']) {
  test(`全流程同时展开全部分类时，不同关系的长线段独立可辨 ${layout}`, () => {
    const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'all')
    for (const mode of ['mainline', 'all']) {
      const graph = projectBusinessChainReading(projectBusinessChainMap(draft, library, mode), library, {
        scope: 'whole', layout, mode, layers: CHAIN_READING_LAYERS.map(({ value }) => value),
      })
      const routes = routeBusinessChainEdges(graph)
      assert(routes.some((edge) => edge.kind === 'correction') && routes.some((edge) => edge.kind === 'exception'))
      const tracks = new Map()
      for (const { key, segments } of routes) {
        for (const { horizontal, start, end } of segments) {
          const axis = horizontal ? 'x' : 'y'
          const track = horizontal ? `row:${start.y}` : `col:${start.x}`
          const low = Math.min(start[axis], end[axis])
          const high = Math.max(start[axis], end[axis])
          const occupied = tracks.get(track) || []
          for (const other of occupied) {
            const common = Math.min(high, other.high) - Math.max(low, other.low)
            assert(other.key === key || common <= 48, `${mode} ${key} / ${other.key} 共线 ${common}`)
          }
          occupied.push({ key, low, high })
          tracks.set(track, occupied)
        }
      }
    }
  })
}
