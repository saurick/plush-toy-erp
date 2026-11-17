import test from 'node:test'
import assert from 'node:assert/strict'
import { DEV_FLOW_STATE_CATALOG as catalog } from './devFlowStateCatalog.mjs'
import {
  buildBusinessChainDesignLibrary,
  emptyBusinessChainDraft,
  assessBusinessChainConnection,
} from './devBusinessChainDesign.mjs'
import {
  projectBusinessChainDraft,
  businessChainNodeContext,
  routeBusinessChainEdges,
} from './devBusinessChainDesignView.mjs'

import { showBusinessChainWhole } from './devBusinessChainMap.mjs'

const library = buildBusinessChainDesignLibrary(catalog)
const key = ({ from, to }) => JSON.stringify([from, to])

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

test('自动整理后的 11 条主线不重叠，连线绕开无关节点，保留用户自排坐标', () => {
  for (const chain of library.chains) {
    const draft = showBusinessChainWhole(emptyBusinessChainDraft(), library, chain.value)
    const graph = projectBusinessChainDraft(draft, library)
    for (const a of graph.nodes) {
      for (const b of graph.nodes) {
        if (a.id === b.id) continue
        assert(
          Math.abs(a.x - b.x) >= 176 || Math.abs(a.y - b.y) >= 88,
          chain.label
        )
      }
    }
    for (const edge of routeBusinessChainEdges(graph)) {
      let x = 0
      let y = 0
      for (const match of edge.d.matchAll(
        /([MHV])\s+(-?[\d.]+)(?:\s+(-?[\d.]+))?/gu
      )) {
        const nextX = match[1] === 'V' ? x : Number(match[2])
        const nextY =
          match[1] === 'M'
            ? Number(match[3])
            : match[1] === 'V'
              ? Number(match[2])
              : y
        if (match[1] !== 'M') {
          for (const node of graph.nodes) {
            if ([edge.from, edge.to].includes(node.id)) continue
            const inside =
              nextX === x
                ? x > node.x &&
                  x < node.x + 176 &&
                  Math.max(y, nextY) > node.y &&
                  Math.min(y, nextY) < node.y + 88
                : y > node.y &&
                  y < node.y + 88 &&
                  Math.max(x, nextX) > node.x &&
                  Math.min(x, nextX) < node.x + 176
            assert.equal(
              inside,
              false,
              `${chain.label}: ${edge.key} intersects ${node.id}`
            )
          }
        }
        x = nextX
        y = nextY
      }
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
