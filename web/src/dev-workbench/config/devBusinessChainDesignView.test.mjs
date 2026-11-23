import test from 'node:test'
import assert from 'node:assert/strict'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import {
  buildBusinessChainDesignLibrary,
  emptyBusinessChainDraft,
  assessBusinessChainConnection,
} from './devBusinessChainDesign.mjs'
import {
  CHAIN_DESIGN_NODE_SIZE,
  projectBusinessChainDraft,
  businessChainNodeContext,
  orientBusinessChainPoint,
  placeBusinessChainLabel,
  routeBusinessChainEdges,
} from './devBusinessChainDesignView.mjs'

import {
  arrangeBusinessChainMap,
  projectBusinessChainMap,
  showBusinessChainWhole,
  toggleBusinessChainMapRegion,
} from './devBusinessChainMap.mjs'

const library = buildBusinessChainDesignLibrary(catalog)
const key = ({ from, to }) => JSON.stringify([from, to])

function routePoints(path) {
  const points = []
  for (const [, command, value, y] of path.matchAll(/([MHV])\s+(-?[\d.]+)(?:\s+(-?[\d.]+))?/gu)) {
    const previous = points.at(-1)
    if (command === 'M') points.push({ x: Number(value), y: Number(y) })
    if (command === 'H') points.push({ x: Number(value), y: previous.y })
    if (command === 'V') points.push({ x: previous.x, y: Number(value) })
  }
  return points
}

function assertRouteClearsCards(points, nodes, message) {
  const { width, height } = CHAIN_DESIGN_NODE_SIZE
  for (const [index, next] of points.slice(1).entries()) {
    const { x, y } = points[index]
    assert(x !== next.x || y !== next.y, `${message} has an empty segment`)
    for (const node of nodes) {
      const inside = Math.max(x, next.x) > node.x && Math.min(x, next.x) < node.x + width &&
        Math.max(y, next.y) > node.y && Math.min(y, next.y) < node.y + height
      assert.equal(inside, false, `${message} intersects ${node.id}`)
    }
  }
}

test('连线说明沿本线寻找完整空位，避开卡片、圆点和已排说明', () => {
  const short = { start: { x: 0, y: 0 }, end: { x: 56, y: 0 }, horizontal: true, length: 56 }
  assert.equal(placeBusinessChainLabel([short], 108, 15, []), null)
  const long = { ...short, end: { x: 250, y: 0 }, length: 250 }
  const card = { left: 80, top: -50, right: 170, bottom: -14 }
  const port = { left: 0, top: -12, right: 12, bottom: 12 }
  const placed = placeBusinessChainLabel([short, long], 108, 15, [card, port])
  assert.deepEqual(placed, { left: 71, top: -7.5, right: 179, bottom: 7.5 })
  assert.equal(placeBusinessChainLabel([long], 108, 15, [card, port, placed]), null)
  const line = { left: 0, right: 250, top: 0, bottom: 0 }
  assert.deepEqual(placeBusinessChainLabel([long], 108, 15, [{ ...line, segment: long }]), placed)
  assert.equal(placeBusinessChainLabel([long], 108, 15, [line]), null, '不能在另一条重合的线上标注')
  const vertical = { start: { x: 80, y: 0 }, end: { x: 80, y: 100 }, horizontal: false, length: 100 }
  const shifted = placeBusinessChainLabel([vertical], 108, 15, [card, { left: -50, top: 36, right: 80, bottom: 70 }])
  assert.equal(shifted.right, 76)
  assert.equal(shifted.bottom, 32)
})

test('11 条主线只归并草稿已有路径，完整保留分支、异常和内部反馈，不写草稿或规则', () => {
  for (const chain of library.chains) {
    const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.value)
    const before = JSON.stringify(draft)
    const graph = projectBusinessChainDraft(draft, library)
    assert(graph.nodes.length < draft.nodes.length, chain.label)
    const original = new Set(draft.edges.map(key))
    const covered = new Set()
    for (const edge of graph.edges) {
      for (const path of edge.paths) {
        assert.equal(path[0].from, edge.from)
        assert.equal(path.at(-1).to, edge.to)
        path.forEach((part, i) => {
          assert(original.has(key(part)), chain.label)
          if (i) assert.equal(path[i - 1].to, part.from)
          covered.add(key(part))
        })
      }
    }
    const contexts = graph.nodes.map(
      ({ id }) =>
        new Set(businessChainNodeContext(library, id).map((node) => node.id))
    )
    for (const edge of draft.edges) {
      assert(
        covered.has(key(edge)) ||
          contexts.some((ids) => ids.has(edge.from) && ids.has(edge.to)),
        `${chain.label}: hidden feedback remains available inline`
      )
    }
    assert.equal(JSON.stringify(draft), before)
    const complete = projectBusinessChainDraft(draft, library, 'all')
    assert.equal(complete.nodes.length, draft.nodes.length)
    assert.equal(complete.edges.length, draft.edges.length)
  }
})

test('主线归并不允许跳过动作连线；未知、未接完整节点仍显式可编辑', () => {
  const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'sales_to_production')
  const graph = projectBusinessChainDraft(draft, library)
  assert(
    graph.nodes.some(({ id }) => library.byId.get(id).label === '老板批准用料')
  )
  assert(
    graph.nodes.some(({ id }) => library.byId.get(id).label === '财务批准采购')
  )
  assert.equal(
    graph.nodes.some(({ id }) => library.byId.get(id).splitInto),
    false
  )
  assert.equal(
    assessBusinessChainConnection(
      library,
      'node:sales_order',
      'node:sales_acceptance'
    ).status,
    'blocked'
  )
  const action =
    'process:sales_to_production:sales_order_acceptance/approval_pmc:submit_sales_order'
  const partial = {
    ...draft,
    edges: draft.edges.filter((edge) => edge.from !== action),
  }
  assert(
    projectBusinessChainDraft(partial, library).nodes.some(
      (node) => node.id === action
    )
  )
  const unknown = {
    ...draft,
    edges: [
      ...draft.edges,
      { from: action, to: 'node:effective_bom', kind: 'unknown' },
    ],
  }
  const result = projectBusinessChainDraft(unknown, library)
  assert(result.nodes.some((node) => node.id === action))
  assert(
    result.edges.some((edge) => edge.from === action && edge.kind === 'unknown')
  )
  const related = businessChainNodeContext(library, 'node:sales_acceptance')
  assert(
    related.some(
      (node) =>
        node.type === 'task' && node.machineKeys.includes('workflow.task')
    )
  )
  assert(related.some((node) => node.type === 'document'))
  assert(graph.edges.some((edge) => edge.dependency))
})

for (const direction of ['LR', 'TB']) {
  test(`自动整理后的 11 条主线不重叠，连线绕开无关节点 ${direction}`, () => {
    for (const chain of library.chains) {
      const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.value)
      const graph = projectBusinessChainDraft(draft, library)
      const nodes = graph.nodes.map((node) => ({ ...node, ...orientBusinessChainPoint(node, direction) }))
      for (const a of nodes) {
        for (const b of nodes) {
          if (a.id === b.id) continue
          assert(
            Math.abs(a.x - b.x) >= 176 || Math.abs(a.y - b.y) >= 88,
            chain.label
          )
        }
      }
      for (const edge of routeBusinessChainEdges(graph, direction)) {
        assertRouteClearsCards(routePoints(edge.d), nodes, `${chain.label} ${edge.key}`)
      }
      const visibleId = graph.nodes[0].id
      draft.nodes.find((node) => node.id === visibleId).x = 1234
      assert.equal(
        projectBusinessChainDraft(draft, library).nodes.find(
          (node) => node.id === visibleId
        ).x,
        1234
      )
    }
  })
}

test('全流程地图展开采购链路后，两种方向的连线都在节点附近避让，保留异常分支', () => {
  const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, 'all')
  const arranged = arrangeBusinessChainMap(draft, library, 'overview', 'lanes')
  const expanded = toggleBusinessChainMapRegion(arranged, library, 'purchase_to_inventory')
  const graph = projectBusinessChainMap(expanded, library, 'overview')
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const { width, height } = CHAIN_DESIGN_NODE_SIZE

  for (const direction of ['LR', 'TB']) {
    const nodes = graph.nodes.map((node) => ({ ...node, ...orientBusinessChainPoint(node, direction) }))
    const routes = routeBusinessChainEdges(graph, direction).filter((edge) => !edge.overview)
    assert(routes.some((edge) => edge.kind === 'exception'))
    const arrivals = routes.filter((edge) => edge.to === 'step:purchase_receipt:creates_fact_draft:purchase_quality')
    assert.equal(arrivals.length, 2)
    const turns = arrivals.map((edge) => orientBusinessChainPoint(routePoints(edge.d)[1], direction).x)
    assert.notEqual(turns[0], turns[1], `${direction} 逐行待检 IQC 的两条到货连线应错开`)
    for (const edge of routes) {
      const points = routePoints(edge.d)
      const endpoints = [byId.get(edge.from), byId.get(edge.to)]
      const left = Math.min(...endpoints.map(({ x }) => x)) - 48
      const right = Math.max(...endpoints.map(({ x }) => x + width)) + 48
      const top = Math.min(...endpoints.map(({ y }) => y)) - 48
      const bottom = Math.max(...endpoints.map(({ y }) => y + height)) + 48
      const coordinates = points.map((point) => orientBusinessChainPoint(point, direction))
      const message = `${direction} ${edge.key}`
      assert(coordinates.every(({ x, y }) => x >= left && x <= right && y >= top && y <= bottom), message)
      assertRouteClearsCards(points, nodes, message)
    }
  }
})
