import test from 'node:test'
import assert from 'node:assert/strict'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import {
  buildBusinessChainDesignLibrary,
  emptyBusinessChainDraft,
  parseBusinessChainDraft,
} from './devBusinessChainDesign.mjs'
import {
  addBusinessChainMapNode,
  arrangeBusinessChainMap,
  businessChainMapCanCollapseGrowth,
  businessChainMapCanGrow,
  collapseBusinessChainMapGrowth,
  expandBusinessChainMap,
  focusBusinessChainMap,
  growBusinessChainMap,
  moveBusinessChainMapNode,
  projectBusinessChainMap,
  showBusinessChainWhole,
  toggleBusinessChainMapRegion,
  hideBusinessChainMapEdges,
  removeBusinessChainMapNode,
} from './devBusinessChainMap.mjs'
import { businessChainNeighbors } from './devBusinessChainDesignView.mjs'

const library = buildBusinessChainDesignLibrary(catalog)
const start = library.nodes.find((node) => node.label === '提交委外订单').id
const positions = (draft) => new Map(draft.nodes.map((node) => [node.id, node]))
const stable = (before, after) => {
  const next = positions(after)
  for (const node of before.nodes) assert.deepEqual(next.get(node.id), node)
}

test('范围与颗粒度独立：概览、步骤、全部已载入节点投影不改变局部范围或坐标', () => {
  const draft = expandBusinessChainMap(
    addBusinessChainMapNode(emptyBusinessChainDraft(), library, start),
    library,
    start,
    'downstream'
  )
  const original = structuredClone(draft)
  const overview = projectBusinessChainMap(draft, library, 'overview')
  const steps = projectBusinessChainMap(draft, library, 'mainline')
  const details = projectBusinessChainMap(draft, library, 'all')
  assert.equal(overview.nodes.length, 1)
  assert.equal(steps.nodes.length, 2)
  assert(details.nodes.length > steps.nodes.length)
  assert.deepEqual(draft, original)
  for (const node of steps.nodes) {
    assert.deepEqual(
      details.nodes.find(({ id }) => id === node.id),
      node
    )
  }
})

test('部分载入的保存视图只展示已载入内容，不补出关联节点或关系', () => {
  const draft = {
    ...emptyBusinessChainDraft(),
    nodes: [{ id: start, x: -80, y: 96, manual: true }],
  }
  const before = structuredClone(draft)
  for (const mode of ['mainline', 'all']) {
    const graph = projectBusinessChainMap(draft, library, mode)
    assert.deepEqual(graph.nodes, draft.nodes)
    assert.deepEqual(graph.edges, [])
  }
  assert.deepEqual(draft, before)
  const summaryId = projectBusinessChainMap(draft, library, 'overview').nodes[0].id
  const moved = moveBusinessChainMapNode(draft, library, summaryId, { x: 320, y: -90 })
  assert.deepEqual(moved.nodes, draft.nodes, '手动摆放概览不载入业务节点')
  assert.deepEqual(moved.edges, draft.edges)
  const restored = parseBusinessChainDraft(JSON.stringify(moved), library)
  const summary = projectBusinessChainMap(restored, library, 'overview').nodes[0]
  assert.equal(summary.x, 320)
  assert.equal(summary.y, -90)
  assert.equal(summary.manual, true)
  const loaded = addBusinessChainMapNode(emptyBusinessChainDraft(), library, start)
  assert(loaded.nodes.length > draft.nodes.length)
  assert(loaded.edges.length > 0)
  const withoutRelations = { ...loaded, edges: [] }
  assert.deepEqual(projectBusinessChainMap(withoutRelations, library, 'all').edges, [])
})

test('从业务步骤扩大下游不会反向绕到输入单据、再跳进其他办理分支', () => {
  const focused = focusBusinessChainMap(
    showBusinessChainWhole(
      emptyBusinessChainDraft(),
      library,
      'outsourcing_to_inventory'
    ),
    library,
    start
  )
  const expanded = growBusinessChainMap(
    growBusinessChainMap(focused, library, 'downstream'),
    library,
    'downstream'
  )
  const steps = projectBusinessChainMap(expanded, library).nodes.map(
    ({ id }) => library.byId.get(id).label
  )
  assert.deepEqual(
    new Set(steps),
    new Set([
      '提交委外订单',
      '确认委外订单',
      '登记委外发料草稿',
      '过账委外发料',
    ])
  )
  stable(focused, expanded)
})

test('逐层扩大只走当前边界的一层，保留原坐标；完整展开遇终点和循环后收敛', () => {
  let draft = addBusinessChainMapNode(emptyBusinessChainDraft(), library, start)
  const expected = [
    start,
    ...businessChainNeighbors(library, start, 'downstream').map(({ to }) => to),
  ]
  const next = growBusinessChainMap(draft, library, 'downstream')
  assert.deepEqual(new Set(next.map.visibleIds), new Set(expected))
  stable(draft, next)
  draft = expandBusinessChainMap(next, library, start, 'both', true)
  for (let i = 0; i < library.nodes.length; i++) {
    const previous = draft
    draft = growBusinessChainMap(
      growBusinessChainMap(draft, library, 'upstream'),
      library,
      'downstream'
    )
    stable(previous, draft)
    if (draft.map.visibleIds.length === previous.map.visibleIds.length) break
  }
  assert.equal(businessChainMapCanGrow(draft, library, 'upstream'), false)
  assert.equal(businessChainMapCanGrow(draft, library, 'downstream'), false)
  assert.deepEqual(growBusinessChainMap(draft, library, 'downstream'), draft)
  assert.equal(
    new Set(draft.nodes.map(({ id }) => id)).size,
    draft.nodes.length
  )
})

test('整体范围可收起额外展开，再次展开时复用缓存节点、关系和坐标', () => {
  const whole = showBusinessChainWhole(
    emptyBusinessChainDraft(),
    library,
    'purchase_to_inventory'
  )
  assert.equal(businessChainMapCanCollapseGrowth(whole, library), false)

  const expanded = growBusinessChainMap(whole, library, 'downstream')
  assert(expanded.map.visibleIds.length > whole.map.visibleIds.length)
  assert.equal(businessChainMapCanCollapseGrowth(expanded, library), true)

  const collapsed = collapseBusinessChainMapGrowth(expanded, library)
  assert.deepEqual(collapsed.map.visibleIds, whole.map.visibleIds)
  assert.deepEqual(collapsed.nodes, expanded.nodes)
  assert.deepEqual(collapsed.edges, expanded.edges)
  assert.equal(businessChainMapCanCollapseGrowth(collapsed, library), false)

  const reopened = growBusinessChainMap(collapsed, library, 'downstream')
  assert.deepEqual(reopened.map.visibleIds, expanded.map.visibleIds)
  assert.deepEqual(reopened.nodes, expanded.nodes)
  assert.deepEqual(reopened.edges, expanded.edges)
  const focused = focusBusinessChainMap(whole, library, start)
  assert.equal(businessChainMapCanCollapseGrowth(focused, library), false)
  assert.equal(collapseBusinessChainMapGrowth(focused, library), focused)
})

test('聚焦、回到整体及不同链路往返保留已缓存和手动调整的节点坐标', () => {
  let draft = showBusinessChainWhole(
    emptyBusinessChainDraft(),
    library,
    'outsourcing_to_inventory'
  )
  draft = moveBusinessChainMapNode(draft, library, start, { x: -300, y: 42 })
  draft.presentation = { mode: 'all', role: 'quality' }
  const whole = structuredClone(draft)
  draft = focusBusinessChainMap(draft, library, start)
  assert.equal(draft.map.scope, 'local')
  assert(draft.map.visibleIds.length < whole.map.visibleIds.length)
  assert.deepEqual(draft.presentation, whole.presentation)
  stable(whole, draft)
  draft = showBusinessChainWhole(draft, library)
  assert.deepEqual(new Set(draft.map.visibleIds), new Set(whole.map.visibleIds))
  stable(whole, draft)
  draft = showBusinessChainWhole(
    showBusinessChainWhole(draft, library, 'sales_to_production'),
    library,
    'outsourcing_to_inventory'
  )
  stable(whole, draft)
  assert.equal(draft.nodes.find(({ id }) => id === start).manual, true)
})

test('采购入库调整聚焦时收紧同一组节点，展开和局部调整都保留原图布局', () => {
  const { id } = library.nodes.find(({ label }) => label === '采购入库调整')
  const mode = 'all'
  const whole = moveBusinessChainMapNode(
    showBusinessChainWhole(emptyBusinessChainDraft(), library),
    library,
    id,
    { x: 728, y: 5100 }
  )
  const focused = focusBusinessChainMap(whole, library, id, mode)
  const compact = projectBusinessChainMap(focused, library, mode)
  const wholePositions = positions(whole)
  const spanY = (nodes) => {
    const ys = nodes.map((node) => node.y)
    return Math.max(...ys) - Math.min(...ys)
  }
  assert.equal(compact.nodes.length, 6)
  const originalNodes = compact.nodes.map(({ id }) => wholePositions.get(id))
  assert(
    spanY(compact.nodes) < spanY(originalNodes) / 3
  )
  stable(whole, focused)
  stable(projectBusinessChainMap(focused, library), compact)

  const extended = growBusinessChainMap(focused, library, 'downstream')
  const expanded = projectBusinessChainMap(extended, library, mode)
  assert(expanded.nodes.length > compact.nodes.length)
  stable(compact, expanded)

  const original = positions(compact).get(id)
  const moved = moveBusinessChainMapNode(focused, library, id, {
    x: original.x,
    y: original.y - 48,
  })
  const restored = parseBusinessChainDraft(JSON.stringify(moved), library)
  const restoredGraph = projectBusinessChainMap(restored, library, mode)
  assert.equal(positions(restoredGraph).get(id).y, original.y - 48)
  const arranged = arrangeBusinessChainMap(restored, library, mode)
  assert.deepEqual(projectBusinessChainMap(arranged, library, mode), compact)
  const returned = showBusinessChainWhole(arranged, library)
  assert.deepEqual(
    projectBusinessChainMap(returned, library, mode),
    projectBusinessChainMap(whole, library, mode)
  )
})

test('整体概览覆盖登记的 11 条链路，跨链连线只来自正式概览；只展开一个区域', () => {
  const draft = showBusinessChainWhole(
    emptyBusinessChainDraft(),
    library,
    'all'
  )
  const overview = projectBusinessChainMap(draft, library, 'overview')
  assert.equal(overview.nodes.length, library.chains.length)
  assert.equal(
    overview.edges.length,
    catalog.businessChainOverview.relations.length
  )
  assert(
    overview.edges.every((edge) =>
      catalog.businessChainOverview.relations.includes(edge.overview)
    )
  )
  const expanded = projectBusinessChainMap(
    {
      ...draft,
      map: { ...draft.map, expandedChains: ['outsourcing_to_inventory'] },
    },
    library,
    'overview'
  )
  assert(expanded.nodes.length > overview.nodes.length)
  assert(
    expanded.nodes
      .filter((node) => !node.summary)
      .every(
        (node) =>
          library.byId.get(node.id).chainKey === 'outsourcing_to_inventory'
      )
  )
  for (const node of overview.nodes) {
    assert.deepEqual(
      expanded.nodes.find(({ id }) => id === node.id),
      node
    )
  }
})

test('保存往返完整保留局部范围、颗粒度、分区展开、局部细节与手动位置；不保存规则副本', () => {
  let draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'all')
  draft = focusBusinessChainMap(draft, library, start)
  draft = moveBusinessChainMapNode(draft, library, start, { x: -800, y: -60 })
  draft = moveBusinessChainMapNode(
    draft,
    library,
    'map:outsourcing_to_inventory',
    { x: 33, y: 55 }
  )
  draft.presentation = { mode: 'overview', role: '' }
  draft.map.expandedChains = ['outsourcing_to_inventory']
  draft.map.expandedNodes = [start]
  const parsed = parseBusinessChainDraft(
    JSON.stringify({ ...draft, rules: ['not a source'] }),
    library
  )
  assert.deepEqual(parsed, draft)
  assert.deepEqual(
    projectBusinessChainMap(parsed, library, 'overview'),
    projectBusinessChainMap(draft, library, 'overview')
  )
  for (const change of [
    { scope: 'unknown' },
    { chainKey: 'unknown' },
    { focusId: 'missing' },
    { visibleIds: ['missing'] },
    { expandedNodes: ['missing'] },
    { expandedChains: ['missing'] },
    { summaries: [{ id: 'outsourcing_to_inventory', x: null, y: 3 }] },
  ]) {
    assert.throws(() =>
      parseBusinessChainDraft(
        JSON.stringify({ ...draft, map: { ...draft.map, ...change } }),
        library
      )
    )
  }
})

test('主动重新排布只调整可见区域，局部隐藏区域仍保留；增量排布没有重叠', () => {
  const whole = showBusinessChainWhole(
    emptyBusinessChainDraft(),
    library,
    'all'
  )
  for (const node of whole.nodes) {
    assert.equal(
      whole.nodes.some(
        (other) =>
          node.id !== other.id &&
          Math.abs(node.x - other.x) < 176 &&
          Math.abs(node.y - other.y) < 88
      ),
      false
    )
  }
  const local = focusBusinessChainMap(whole, library, start)
  const visible = new Set(
    projectBusinessChainMap(local, library).nodes.map(({ id }) => id)
  )
  const arranged = arrangeBusinessChainMap(local, library, 'mainline')
  for (const node of local.nodes.filter(({ id }) => !visible.has(id))) {
    assert.deepEqual(
      arranged.nodes.find(({ id }) => id === node.id),
      node
    )
  }
  assert.deepEqual(arranged.map.visibleIds, local.map.visibleIds)
})

test('概览重排后再展开避让现有概览节点，已显示区域及手动节点保持稳定', () => {
  let draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'all')
  draft = arrangeBusinessChainMap(draft, library, 'overview')
  const before = projectBusinessChainMap(draft, library, 'overview')
  const expanded = toggleBusinessChainMapRegion(
    draft,
    library,
    'outsourcing_to_inventory'
  )
  const graph = projectBusinessChainMap(expanded, library, 'overview')
  for (const node of before.nodes) {
    assert.deepEqual(
      graph.nodes.find(({ id }) => id === node.id),
      node
    )
  }
  for (const node of graph.nodes) {
    assert.equal(
      graph.nodes.some(
        (other) =>
          node.id !== other.id &&
          Math.abs(node.x - other.x) < 176 &&
          Math.abs(node.y - other.y) < 88
      ),
      false
    )
  }
  const manual = moveBusinessChainMapNode(expanded, library, start, {
    x: -123,
    y: -456,
  })
  const collapsed = toggleBusinessChainMapRegion(
    manual,
    library,
    'outsourcing_to_inventory'
  )
  const reopened = toggleBusinessChainMapRegion(
    collapsed,
    library,
    'outsourcing_to_inventory'
  )
  assert.deepEqual(
    reopened.nodes.find(({ id }) => id === start),
    manual.nodes.find(({ id }) => id === start)
  )
})

test('隐藏视图关系或中间单据不会被自动细节重新补回；保存恢复一致，回到整体重置隐藏', () => {
  const whole = showBusinessChainWhole(
    emptyBusinessChainDraft(),
    library,
    'sales_to_production'
  )
  const graph = projectBusinessChainMap(whole, library)
  const condensed = graph.edges.find((edge) =>
    edge.paths.some((path) => path.length > 1)
  )
  assert(condensed)
  const hidden = hideBusinessChainMapEdges(
    whole,
    library,
    condensed.paths.map((path) =>
      JSON.stringify([path.at(-1).from, path.at(-1).to])
    )
  )
  assert.equal(
    projectBusinessChainMap(hidden, library).edges.some(
      (edge) => edge.from === condensed.from && edge.to === condensed.to
    ),
    false
  )
  const intermediate = condensed.paths.find((path) => path.length > 1)[0].to
  const removed = removeBusinessChainMapNode(hidden, library, intermediate)
  const restored = parseBusinessChainDraft(JSON.stringify(removed), library)
  assert.deepEqual(restored, removed)
  assert.equal(
    projectBusinessChainMap(restored, library, 'all').nodes.some(
      ({ id }) => id === intermediate
    ),
    false
  )
  const returned = showBusinessChainWhole(restored, library)
  assert(
    projectBusinessChainMap(returned, library, 'all').nodes.some(
      ({ id }) => id === intermediate
    )
  )
  assert(
    projectBusinessChainMap(returned, library).edges.some(
      (edge) => edge.from === condensed.from && edge.to === condensed.to
    )
  )
})
