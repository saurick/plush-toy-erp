import {
  DEV_PROJECT_GRAPH_EXAMPLES,
  DEV_PROJECT_GRAPH_MODELS,
} from './devRelationshipPerspectives.mjs'

const QUERY_KEYS = ['model', 'example', 'node', 'references', 'loops']
const singleValue = (params, key) => params.getAll(key).length === 1 ? params.get(key) : ''
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

export function resolveProjectGraphSelection(search) {
  const params = new URLSearchParams(search)
  const requestedModel = singleValue(params, 'model')
  const modelKey = owns(DEV_PROJECT_GRAPH_MODELS, requestedModel) ? requestedModel : 'dag'
  const model = DEV_PROJECT_GRAPH_MODELS[modelKey]
  const requestedExample = singleValue(params, 'example')
  const exampleKey = params.getAll('example').length === 1 && requestedExample === '' ? '' : model.examples.includes(requestedExample) ? requestedExample : model.examples[0]
  const example = DEV_PROJECT_GRAPH_EXAMPLES[exampleKey]
  const requestedNode = singleValue(params, 'node')
  return {
    modelKey,
    exampleKey,
    nodeId: example?.nodes.some((node) => node.id === requestedNode) ? requestedNode : '',
    references: Boolean(example?.referenceEdge && singleValue(params, 'references') === '1'),
    highlightReturns: !example?.edges.some((edge) => edge.kind === 'return') || singleValue(params, 'loops') !== '0',
  }
}

export function updateProjectGraphSearch(search, changes) {
  const previous = resolveProjectGraphSelection(search)
  const requested = { ...previous, ...changes }
  if (requested.modelKey !== previous.modelKey || requested.exampleKey !== previous.exampleKey) {
    if (!owns(changes, 'nodeId')) requested.nodeId = ''
    if (!owns(changes, 'references')) requested.references = false
    if (!owns(changes, 'highlightReturns')) requested.highlightReturns = true
    if (requested.modelKey !== previous.modelKey && !owns(changes, 'exampleKey')) requested.exampleKey = DEV_PROJECT_GRAPH_MODELS[requested.modelKey]?.examples[0]
  }
  const selected = resolveProjectGraphSelection(new URLSearchParams({
    model: requested.modelKey,
    example: requested.exampleKey,
    node: requested.nodeId,
    references: requested.references ? '1' : '0',
    loops: requested.highlightReturns ? '1' : '0',
  }))
  const next = new URLSearchParams(search)
  QUERY_KEYS.forEach((key) => next.delete(key))
  next.set('model', selected.modelKey)
  next.set('example', selected.exampleKey)
  if (selected.nodeId) next.set('node', selected.nodeId)
  if (selected.references) next.set('references', '1')
  if (!selected.highlightReturns) next.set('loops', '0')
  return next
}

export function classifyProjectGraph({ nodes, edges, directed }) {
  if (!nodes.length || new Set(nodes.map(({ id }) => id)).size !== nodes.length) throw new Error('项目图节点缺失或重复')
  const outgoing = new Map(nodes.map(({ id }) => [id, []]))
  const incoming = new Map(nodes.map(({ id }) => [id, []]))
  const parents = new Map(nodes.map(({ id }) => [id, id]))
  const find = (id) => parents.get(id) === id ? id : find(parents.get(id))
  let underlyingCycle = false
  for (const { from, to } of edges) {
    if (!outgoing.has(from) || !outgoing.has(to)) throw new Error('项目图包含未知节点引用')
    outgoing.get(from).push(to)
    incoming.get(to).push(from)
    const left = find(from); const
right = find(to)
    if (left === right) underlyingCycle = true
    else parents.set(left, right)
  }
  const visited = new Set(); const
active = new Set()
  const visit = (id) => {
    if (active.has(id)) return true
    if (visited.has(id)) return false
    active.add(id)
    if (outgoing.get(id).some(visit)) return true
    active.delete(id)
    visited.add(id)
    return false
  }
  const hasCycle = directed ? nodes.some(({ id }) => visit(id)) : underlyingCycle
  const roots = nodes.filter(({ id }) => incoming.get(id).length === 0).map(({ id }) => id)
  const isHierarchy = directed && !hasCycle && !underlyingCycle && nodes.every(({ id }) => incoming.get(id).length <= 1)
  let label = directed ? (hasCycle ? '有向 · 含环' : '有向 · 无环（DAG）') : (hasCycle ? '无向 · 含环' : '无向 · 无环')
  if (isHierarchy) label = roots.length > 1 ? '有向森林 · DAG 特例' : '有根树 · DAG 特例'
  return { label, hasCycle, isHierarchy, roots }
}

const escapeLabel = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

export function buildProjectGraph(exampleKey, { references = false, highlightReturns = true } = {}) {
  if (!owns(DEV_PROJECT_GRAPH_EXAMPLES, exampleKey)) throw new Error('项目图示例未登记')
  const example = DEV_PROJECT_GRAPH_EXAMPLES[exampleKey]
  const edges = references && example.referenceEdge ? [...example.edges, example.referenceEdge] : example.edges
  const lines = [`flowchart ${example.direction}`]
  for (const node of example.nodes) lines.push(`  ${node.id}["${escapeLabel(node.label)}"]`)
  for (const edge of edges) {
    let connector = example.directed ? '-->' : '---'
    if (edge.kind === 'reference') connector = example.directed ? '-.->' : '-.-'
    if (edge.label) connector = `${connector}|"${escapeLabel(edge.label)}"|`
    lines.push(`  ${edge.from} ${connector} ${edge.to}`)
  }
  const returns = edges.flatMap((edge, index) => edge.kind === 'return' ? [index] : [])
  if (highlightReturns && returns.length) lines.push(`  linkStyle ${returns.join(',')} stroke-width:3px,stroke-dasharray:5 4`)
  const graph = { ...example, edges }
  return { ...graph, chart: lines.join('\n'), classification: classifyProjectGraph(graph) }
}

export function getProjectGraphNodeContext(graph, nodeId) {
  const node = graph.nodes.find(({ id }) => id === nodeId)
  if (!node) return null
  const labels = (ids) => [...new Set(ids)].map((id) => graph.nodes.find((entry) => entry.id === id).label)
  if (!graph.directed) {
    return {
      ...node,
      relationships: `相关模块：${labels(graph.edges.flatMap(({ from, to }) => from === nodeId ? [to] : to === nodeId ? [from] : [])).join('、') || '无'}`,
    }
  }
  const incoming = labels(graph.edges.filter(({ to }) => to === nodeId).map(({ from }) => from))
  const outgoing = labels(graph.edges.filter(({ from }) => from === nodeId).map(({ to }) => to))
  return { ...node, relationships: `接自：${incoming.join('、') || '起点'}；指向：${outgoing.join('、') || '终点'}` }
}
