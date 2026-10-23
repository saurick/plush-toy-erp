import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import {
  buildProjectGraph,
  classifyProjectGraph,
  getProjectGraphNodeContext,
  resolveProjectGraphSelection,
  updateProjectGraphSearch,
} from './devProjectGraph.mjs'
import { DEV_PROJECT_GRAPH_EXAMPLES } from './devRelationshipPerspectives.mjs'

test('project graph classifies DAG merges, directed return loops and undirected adjacency independently', () => {
  const ci = buildProjectGraph('ci')
  assert.equal(ci.classification.hasCycle, false)
  assert.equal(ci.classification.isHierarchy, false)
  assert.equal(ci.classification.label, '有向 · 无环（DAG）')
  assert.equal(buildProjectGraph('workflow').classification.hasCycle, true)
  const association = buildProjectGraph('association')
  assert.equal(association.directed, false)
  assert.equal(association.classification.label, '无向 · 含环')
  assert(!association.chart.includes('-->'))
  assert.throws(() => classifyProjectGraph({ nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'missing' }], directed: true }), /未知节点/u)
})

test('project graph distinguishes rooted trees, forests and cross-directory references without mutating the example', () => {
  assert.equal(buildProjectGraph('tree').classification.label, '有根树 · DAG 特例')
  assert.equal(buildProjectGraph('forest').classification.roots.length, 2)
  assert.equal(buildProjectGraph('forest').classification.label, '有向森林 · DAG 特例')
  const referenced = buildProjectGraph('tree', { references: true })
  assert.equal(referenced.classification.hasCycle, false)
  assert.equal(referenced.classification.isHierarchy, false)
  assert.equal(referenced.classification.label, '有向 · 无环（DAG）')
  assert.match(getProjectGraphNodeContext(referenced, 'master').relationships, /产品能力、测试验证/u)
  assert.equal(buildProjectGraph('tree').edges.length, DEV_PROJECT_GRAPH_EXAMPLES.tree.edges.length)
})

test('project graph node details match direction and never reuse a missing selection', () => {
  assert.equal(getProjectGraphNodeContext(buildProjectGraph('ci'), 'missing'), null)
  assert.match(getProjectGraphNodeContext(buildProjectGraph('ci'), 'gate').relationships, /Web 检查、Go 检查/u)
  const undirected = getProjectGraphNodeContext(buildProjectGraph('association'), 'inventory')
  assert.equal(undirected.relationships, '相关模块：采购、质检、生产')
  assert(!undirected.relationships.includes('指向'))
})

test('project graph query restoration rejects incompatible examples, duplicate keys and stale nodes', () => {
  assert.deepEqual(resolveProjectGraphSelection('view=relationships'), { modelKey: 'dag', exampleKey: 'overview', nodeId: '', references: false, highlightReturns: true })
  const valid = resolveProjectGraphSelection('model=tree&example=tree&node=master&references=1')
  assert.equal(valid.nodeId, 'master')
  assert.equal(valid.references, true)
  for (const query of ['model=dag&example=workflow&node=fix', 'model=dag&model=cycle&example=workflow&node=fix', 'model=__proto__&node=fix']) {
    const selection = resolveProjectGraphSelection(query)
    assert.equal(selection.modelKey, 'dag')
    assert.equal(selection.exampleKey, 'overview')
    assert.equal(selection.nodeId, '')
    assert.equal(selection.references, false)
  }
  assert.equal(resolveProjectGraphSelection('model=cycle&example=workflow&loops=0').highlightReturns, false)
  assert.equal(resolveProjectGraphSelection('model=dag&references=1&loops=0').highlightReturns, true)
})

test('project graph switches clear node/reference residue and preserve peer view and unrelated URL state', () => {
  const start = new URLSearchParams('view=relationships&model=tree&example=tree&node=master&references=1&customer=yoyoosun')
  const switched = updateProjectGraphSearch(start, { modelKey: 'dag' })
  assert.equal(switched.get('view'), 'relationships')
  assert.equal(switched.get('customer'), 'yoyoosun')
  assert.equal(switched.get('example'), 'overview')
  assert.equal(switched.has('node'), false)
  assert.equal(switched.has('references'), false)
  assert.equal(start.get('node'), 'master')
  const node = updateProjectGraphSearch(switched, { exampleKey: 'ci', nodeId: 'gate' })
  assert.equal(resolveProjectGraphSelection(node).nodeId, 'gate')
  const nextExample = updateProjectGraphSearch(node, { exampleKey: 'access' })
  assert.equal(nextExample.has('node'), false)
  const cleared = updateProjectGraphSearch(start, { exampleKey: '' })
  assert.equal(cleared.get('example'), '')
  assert.deepEqual(resolveProjectGraphSelection(cleared), { modelKey: 'tree', exampleKey: '', nodeId: '', references: false, highlightReturns: true })
  const restored = updateProjectGraphSearch(cleared, { exampleKey: 'tree' })
  assert.equal(resolveProjectGraphSelection(restored).exampleKey, 'tree')
})

test('project graph return highlighting changes presentation without removing edges or outcomes', () => {
  const highlighted = buildProjectGraph('workflow')
  const plain = buildProjectGraph('workflow', { highlightReturns: false })
  assert.deepEqual(highlighted.edges, plain.edges)
  assert.equal(highlighted.classification.hasCycle, plain.classification.hasCycle)
  assert.match(highlighted.chart, /linkStyle/u)
  assert(!plain.chart.includes('linkStyle'))
})

test('project graph examples and display variants produce valid bounded Mermaid diagrams', async () => {
  const require = createRequire(new URL('../../../package.json', import.meta.url))
  const { Window } = require('happy-dom')
  const window = new Window()
  Object.assign(globalThis, { window, document: window.document, Element: window.Element, SVGElement: window.SVGElement })
  try {
    const { default: mermaid } = await import(pathToFileURL(require.resolve('mermaid')).href)
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    const graphs = [...Object.keys(DEV_PROJECT_GRAPH_EXAMPLES).map((key) => buildProjectGraph(key)), buildProjectGraph('tree', { references: true }), buildProjectGraph('workflow', { highlightReturns: false })]
    for (const graph of graphs) {
      await assert.doesNotReject(() => mermaid.parse(graph.chart), graph.name)
      const parsed = await mermaid.mermaidAPI.getDiagramFromText(graph.chart)
      assert.equal(parsed.db.getVertices().size, graph.nodes.length)
      assert.equal(parsed.db.getEdges().length, graph.edges.length)
    }
  } finally {
    await window.happyDOM.close()
  }
})
