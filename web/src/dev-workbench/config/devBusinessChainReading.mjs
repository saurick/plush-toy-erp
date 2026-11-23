import {
  arrangeBusinessChainGraph,
  businessChainNodeContext,
  businessChainRoutePoints,
  CHAIN_DESIGN_NODE_SIZE,
  isBusinessChainStep,
  orientBusinessChainPoint,
} from './devBusinessChainDesignView.mjs'

export const CHAIN_READING_LAYERS = Object.freeze([
  { value: 'normal', label: '主线与供给', shortLabel: '主线', kinds: ['continues', 'supplies'] },
  { value: 'exception', label: '异常与回接', shortLabel: '异常', kinds: ['branches_to', 'returns_to', 'reworks'] },
  { value: 'correction', label: '过账后纠正', shortLabel: '纠正', kinds: ['corrects'] },
  { value: 'impact', label: '横切影响', shortLabel: '横切', kinds: ['cross_cuts'] },
])

export function businessChainRelationLayer(relation) {
  const layer = CHAIN_READING_LAYERS.find((item) => item.kinds.includes(relation.kind))
  if (!layer) throw new Error(`Unknown chain relationship: ${relation.kind}`)
  return layer.value
}

export function businessChainHandoffKind(relation) {
  const layer = businessChainRelationLayer(relation)
  return layer === 'exception' || layer === 'correction' ? layer : 'known'
}

export function businessChainHandoffs(catalog, chainKey) {
  return catalog.businessChainOverview.relations.filter((edge) => edge.fromChainKey === chainKey || edge.toChainKey === chainKey)
}

export function describeBusinessChainReading(catalog, chainKey) {
  const chain = catalog.businessChains.find((item) => item.key === chainKey)
  if (!chain) throw new Error(`Unknown business chain: ${chainKey}`)
  const outgoing = new Set(chain.edges.map((edge) => edge.from))
  return {
    chain,
    inputs: chain.nodes.filter((node) => chain.entryNodeKeys.includes(node.key)),
    outputs: chain.nodes.filter((node) => node.terminal || !outgoing.has(node.key)),
    handoffs: businessChainHandoffs(catalog, chainKey),
  }
}

export function businessChainApprovalChoices(catalog, library, node) {
  const context = node.processNode ? [node] : businessChainNodeContext(library, node.id)
  const definitions = new Set(context.map((item) => item.processNode?.definitionKey).filter(Boolean))
  return catalog.processDefinitions.filter((definition) => definitions.has(definition.key)).flatMap((definition) =>
    definition.nodes.filter((item) => item.type === 'approval').map((approval) => ({
      key: `${definition.key}:${approval.key}`,
      definition,
      approval,
      outcomes: definition.edges.filter((edge) => edge.from === approval.key).map((edge) => ({
        key: edge.to,
        label: definition.nodes.find((item) => item.key === edge.to).label,
      })),
    }))
  )
}

export function businessChainApprovalReading(library, choice, outcomeKey) {
  const { definition, approval } = choice
  const incoming = definition.edges.filter((edge) => edge.to === approval.key)
  const outcome = choice.outcomes.find((item) => item.key === outcomeKey) || choice.outcomes[0]
  const selected = new Set([approval.key, ...incoming.map((edge) => edge.from)])
  const queue = outcome ? [outcome.key] : []
  for (const key of queue) {
    if (selected.has(key)) continue
    selected.add(key)
    const item = definition.nodes.find((node) => node.key === key)
    // Stop at a new decision rather than imply its outcome has already been chosen.
    if (item.type === 'end' || item.type === 'approval') continue
    queue.push(...definition.edges.filter((edge) => edge.from === key).map((edge) => edge.to))
  }
  const mapped = new Map(library.nodes.filter((node) => node.processNode?.definitionKey === definition.key)
    .map((node) => [node.processNode.nodeKey, node]))
  const edges = definition.edges.filter((edge) => selected.has(edge.from) && selected.has(edge.to))
  return {
    outcome,
    nodeIds: [...selected].map((key) => mapped.get(key)?.id).filter(Boolean),
    graph: {
      direction: 'LR',
      nodes: definition.nodes.filter((node) => selected.has(node.key)).map((node) => ({
        key: node.key,
        label: mapped.get(node.key)?.label || node.label,
        type: node.type === 'approval' ? 'task' : node.type === 'end' ? 'result' : 'business_action',
      })),
      edges: edges.map((edge) => ({
        ...edge,
        label: library.byPair.get(JSON.stringify([mapped.get(edge.from)?.id, mapped.get(edge.to)?.id]))?.evidence.condition || '',
      })),
    },
  }
}

function primarySteps(graph, library) {
  const keys = [...new Set(graph.nodes.map((node) => library.byId.get(node.id)?.chainKey))]
  if (keys.length !== 1 || !keys[0]) return null
  const definition = library.chainDefinitions.get(keys[0])
  const normal = definition.acceptanceScenarios.find((scenario) => scenario.kind === 'happy_path')
  if (!normal) throw new Error(`Missing registered normal path: ${keys[0]}`)
  const rank = new Map(normal.stepKeys.map((key, index) => [key, index]))
  const specialPurpose = ['exception', 'rework', 'reversal'].includes(definition.kind)
  const primary = graph.nodes.filter((node) => {
    const item = library.byId.get(node.id)
    return isBusinessChainStep(item) && (specialPurpose || !item.steps.length || item.steps.some((step) =>
      rank.has(step.key) || rank.has(step.edgeKey) || step.scenarioKeys?.includes(normal.key)
    ))
  })
  return primary.sort((a, b) => {
    const order = (node) => Math.min(...library.byId.get(node.id).steps.map((step) => rank.get(step.key) ?? rank.get(step.edgeKey) ?? Infinity))
    return order(a) - order(b)
  })
}

// Categories describe the business action. Shared endpoints provide context on either side of it.
export function businessChainBaseLayer(chain) {
  if (chain.kind === 'exception' || chain.kind === 'rework') return 'exception'
  if (chain.key === 'purchase_posting_corrections') return 'correction'
  return 'normal'
}

export function businessChainSourceEdgeKind(chain, edge) {
  if (businessChainBaseLayer(chain) === 'correction' || edge.kind === 'reverses' ||
    edge.from === 'finance_credit_note' || edge.to === 'finance_credit_note') return 'correction'
  return ['returns', 'reworks'].includes(edge.kind) ? 'exception' : 'known'
}

export function businessChainStepLayer(node, library) {
  const chain = library.chainDefinitions.get(node.chainKey)
  const base = businessChainBaseLayer(chain)
  if (base !== 'normal') return base
  if (node.processNode && node.exception) return 'exception'
  const { steps } = node
  if (steps.length && steps.every((step) => chain.edges.some((edge) =>
    edge.key === step.edgeKey && businessChainSourceEdgeKind(chain, edge) === 'correction'))) return 'correction'
  const normal = chain.acceptanceScenarios.find((scenario) => scenario.kind === 'happy_path')
  if (steps.length && normal && steps.every((step) => !step.scenarioKeys.includes(normal.key))) return 'exception'
  return 'normal'
}

export function projectBusinessChainReading(graph, library, { scope, mode, layout, layers, expandedNodes = [], selection, pathIds = [] } = {}) {
  const detailView = mode === 'all' || mode === 'mainline' || (mode === 'overview' && graph.scopeSummary)
  if (!detailView || graph.nodes.some((node) => node.summary) || (scope !== 'whole' && !layers)) return graph
  const nodeLayer = new Map(graph.nodes.map(({ id }) => [id, businessChainStepLayer(library.byId.get(id), library)]))
  const enabled = new Set(layers || ['normal'])
  const context = new Set([...expandedNodes, ...pathIds])
  const selected = !selection?.detailsOnly && selection?.nodeId
  if (selected) context.add(selected)
  // In the finest view a connected document, record or result follows its visible paths.
  // An isolated loaded node can still be read by its own category.
  const connected = mode === 'all' ? new Set(graph.edges.flatMap(({ from, to }) => [from, to])) : null
  const layerNodes = new Set(graph.nodes.filter(({ id, manual }) => {
    if (manual) return true
    if (!enabled.has(nodeLayer.get(id))) return false
    return !connected?.has(id) || isBusinessChainStep(library.byId.get(id))
  }).map(({ id }) => id))
  const visible = new Set([...layerNodes, ...context])
  const edges = graph.edges.filter((edge) => {
    const target = nodeLayer.get(edge.to)
    const endpointLayer = target === 'normal' ? nodeLayer.get(edge.from) : target
    const category = edge.kind === 'correction' || (mode === 'all' && endpointLayer === 'normal' && edge.kind === 'exception')
      ? edge.kind : endpointLayer
    if (enabled.has(category) || edge.kind === 'unknown') {
      layerNodes.add(edge.from)
      layerNodes.add(edge.to)
    } else if (edge.from !== selected && edge.to !== selected && !(context.has(edge.from) && context.has(edge.to))) {
      return false
    }
    visible.add(edge.from)
    visible.add(edge.to)
    return true
  })
  const nodes = graph.nodes.filter(({ id }) => visible.has(id))
  const result = nodes.length === graph.nodes.length && edges.length === graph.edges.length ? graph : { ...graph, nodes, edges }
  if (graph.wholeDetail) return layoutWholeChainSections(result, library, layout)
  if (layout !== 'lanes' || scope !== 'whole') return result
  const stableNodes = nodes.filter(({ id }) => layerNodes.has(id))
  return compactBusinessChainLanes(result, library, stableNodes, mode !== 'all')
}

const lanePaddingTop = 30
const lanePaddingBottom = 14
const laneGap = 32
const columnStride = CHAIN_DESIGN_NODE_SIZE.width + 54

// Whole-map detail has its own reading coordinates. Saved local and manual layouts remain in the draft.
function layoutWholeChainSections(graph, library, layout = 'flow') {
  const chainOf = (id) => library.byId.get(id).chainKey
  const regions = []
  for (const { value, label } of library.chains) {
    const members = graph.nodes.filter(({ id }) => chainOf(id) === value)
    if (!members.length) continue
    const edges = graph.edges.filter(({ from, to }) => chainOf(from) === value && chainOf(to) === value)
    const positions = arrangeBusinessChainReading({ nodes: members, edges, salesAcceptance: value === 'sales_to_production' }, library, layout)
    const nodes = members.map((node) => ({ ...node, ...positions.get(node.id) }))
    const routes = businessChainRoutePoints({ nodes, edges })
    const points = [...routes.values()].flat()
    const minX = Math.min(0, ...points.map(({ x }) => x - 16))
    const minY = Math.min(0, ...points.map(({ y }) => y - 48))
    const width = Math.max(...nodes.map(({ x }) => x + columnStride), ...points.map(({ x }) => x + 32)) - minX
    const height = Math.max(...nodes.map(({ y }) => y + CHAIN_DESIGN_NODE_SIZE.height + 100), ...points.map(({ y }) => y + 60)) - minY
    regions.push({ key: value, label, nodes, routes, minX, minY, width, height })
  }
  // Wrap whole chains together, leaving room for their headings in either orientation.
  const targetWidth = Math.sqrt(2 * regions.reduce((area, region) => area + region.width * region.height, 0))
  let left = 0
  let top = 0
  let rowHeight = 0
  const routePoints = new Map()
  const sections = regions.map((region) => {
    if (left && left + region.width > targetWidth) {
      top += rowHeight
      left = 0
      rowHeight = 0
    }
    const offset = (point) => ({ ...point, x: left + point.x - region.minX, y: top + point.y - region.minY })
    for (const [key, points] of region.routes) routePoints.set(key, points.map(offset))
    const nodes = region.nodes.map(offset)
    const routeOrigin = { x: left + 16, y: top + 18 }
    left += region.width
    rowHeight = Math.max(rowHeight, region.height)
    return { key: region.key, label: region.label, nodes, routeOrigin }
  })
  return { ...graph, nodes: sections.flatMap((section) => section.nodes), sections, routePoints }
}

// The existing graph determines order. Same-domain steps can share a column;
// lanes preserve those columns and separate responsibility without inventing edges.
export function arrangeBusinessChainReading(graph, library, layout = 'flow') {
  if (graph.nodes.length && graph.nodes.every((node) => node.summary)) {
    const edges = graph.edges.filter((edge) => edge.overview && businessChainRelationLayer(edge.overview) === 'normal')
    const active = new Set(edges.flatMap((edge) => [edge.from, edge.to]))
    const main = graph.nodes.filter((node) => active.has(node.id))
    const ranked = arrangeBusinessChainGraph({ nodes: main, edges })
    const columns = [...new Set([...ranked.values()].map((position) => position.x))].sort((a, b) => a - b)
    const rows = new Map()
    const positions = new Map()
    for (const node of main) {
      const column = columns.indexOf(ranked.get(node.id).x)
      const row = rows.get(column) || 0
      rows.set(column, row + 1)
      positions.set(node.id, { x: 32 + column * 230, y: 48 + row * 146 })
    }
    const bottomRow = Math.max(1, ...rows.values()) + 1
    graph.nodes.filter((node) => !active.has(node.id)).forEach((node, index) => {
      positions.set(node.id, { x: 32 + (index % 5) * 230, y: 48 + (bottomRow + Math.floor(index / 5)) * 146 })
    })
    return positions
  }
  const primary = primarySteps(graph, library)
  if (primary?.length && layout === 'flow') {
    const positions = new Map()
    let column = 0
    let row = 0
    let previousDomain = null
    for (const node of primary) {
      const { domain } = library.byId.get(node.id)
      if (previousDomain !== null && (domain !== previousDomain || row === 3)) { column++; row = 0 }
      positions.set(node.id, { x: 32 + column * 230, y: 48 + row++ * 130 })
      previousDomain = domain
    }
    const bottom = Math.max(...[...positions.values()].map((point) => point.y))
    const right = Math.max(...[...positions.values()].map((point) => point.x))
    const free = (point) => ![...positions.values()].some((other) => Math.abs(point.x - other.x) < 196 && Math.abs(point.y - other.y) < 108)
    const extra = graph.nodes.filter((item) => !positions.has(item.id)).sort((a, b) => Number(isBusinessChainStep(library.byId.get(b.id))) - Number(isBusinessChainStep(library.byId.get(a.id))))
    for (const node of extra) {
      const relations = [...library.stepRelations, ...graph.edges]
      const edge = relations.find((item) => item.to === node.id && positions.has(item.from)) || relations.find((item) => item.from === node.id && positions.has(item.to))
      const anchor = edge && positions.get(edge.from === node.id ? edge.to : edge.from)
      const domainAnchor = primary.find((item) => library.byId.get(item.id).domain === library.byId.get(node.id).domain)
      const origin = anchor || positions.get(domainAnchor?.id) || { x: 32, y: 48 }
      const candidates = []
      if (isBusinessChainStep(library.byId.get(node.id))) {
        for (const dx of [0, 230, -230]) {
          for (const dy of [130, 260, 0]) {
            const point = { x: origin.x + dx, y: origin.y + dy }
            if (point.x >= 32 && point.x <= right && point.y >= 48 && point.y <= bottom) candidates.push(point)
          }
        }
      }
      let position = candidates.find(free)
      if (!position) {
        position = { x: origin.x, y: bottom + 170 }
        while (!free(position)) position.y += 130
      }
      positions.set(node.id, position)
    }
    return positions
  }
  const ordered = arrangeBusinessChainGraph(graph)
  const original = new Map(graph.nodes.map((node) => [node.id, node]))
  const domain = (id) => library.byId.get(id)?.domain || original.get(id)?.domain || 'group'
  const sorted = [...ordered].sort(([, a], [, b]) => a.x - b.x || a.y - b.y)
  const columns = new Map()
  for (const [id, position] of sorted) {
    const parents = graph.edges.filter((edge) => edge.to === id && columns.has(edge.from) && ordered.get(edge.from).x < position.x)
    const exceptionParent = graph.salesAcceptance && layout === 'lanes' && parents.find((edge) =>
      edge.kind === 'exception' && original.get(edge.from)?.sourceIds && original.get(id)?.sourceIds && domain(edge.from) === domain(id)
    )
    if (exceptionParent) {
      columns.set(id, columns.get(exceptionParent.from))
      continue
    }
    columns.set(id, parents.length ? Math.max(...parents.map((edge) =>
      columns.get(edge.from) + (layout === 'flow' && domain(edge.from) === domain(id) ? 0 : 1)
    )) : 0)
  }
  const positions = new Map()
  const rowHeight = CHAIN_DESIGN_NODE_SIZE.height + 42
  if (layout === 'lanes') {
    const domains = [...new Set(sorted.map(([id]) => domain(id)))]
    let top = 48
    for (const key of domains) {
      const rows = new Map()
      for (const [id] of sorted.filter(([id]) => domain(id) === key)) {
        const column = columns.get(id)
        const row = rows.get(column) || 0
        rows.set(column, row + 1)
        positions.set(id, { x: 32 + column * columnStride, y: top + row * rowHeight })
      }
      const lastRow = Math.max(...rows.values()) - 1
      const bottom = top + lastRow * rowHeight + CHAIN_DESIGN_NODE_SIZE.height + lanePaddingBottom
      top = bottom + laneGap + lanePaddingTop
    }
  } else {
    const rows = new Map()
    for (const [id] of sorted) {
      const column = columns.get(id)
      const row = rows.get(column) || 0
      rows.set(column, row + 1)
      positions.set(id, { x: 32 + column * columnStride, y: 48 + row * rowHeight })
    }
  }
  return positions
}

export function businessChainLaneBands(graph, library, direction = 'LR') {
  if (graph.sections) {
    return graph.sections.flatMap((section) =>
      businessChainLaneBands({ nodes: section.nodes }, library, direction).map((band) => ({
        ...band, chainKey: section.key, chainLabel: section.label,
      }))
    )
  }
  const domains = [...new Set(graph.nodes.filter((node) => !node.summary).map((node) => library.byId.get(node.id).domain))]
  return domains.map((domain) => {
    const nodes = graph.nodes.filter((node) => !node.summary && library.byId.get(node.id).domain === domain)
    const left = Math.min(...nodes.map((node) => node.x)) - (direction === 'TB' ? 60 : 16)
    const top = Math.min(...nodes.map((node) => node.y)) - lanePaddingTop
    const origin = orientBusinessChainPoint({ x: left, y: top }, direction)
    const end = orientBusinessChainPoint({
      x: Math.max(...graph.nodes.map((node) => node.x + CHAIN_DESIGN_NODE_SIZE.width)) + 16,
      y: Math.max(...nodes.map((node) => node.y + CHAIN_DESIGN_NODE_SIZE.height)) + lanePaddingBottom,
    }, direction)
    return {
      domain,
      ...origin,
      width: end.x - origin.x,
      height: end.y - origin.y,
    }
  })
}

// Compact only the reading projection, keeping user-placed nodes and the saved layout intact.
function compactBusinessChainLanes(graph, library, stableNodes, collapseEmptyColumns) {
  if (!stableNodes.length || graph.nodes.some((node) => node.manual)) return graph
  const domainOf = (node) => library.byId.get(node.id).domain
  const bands = businessChainLaneBands({ ...graph, nodes: stableNodes }, library).sort((a, b) => a.y - b.y)
  const lanes = new Map()
  let bottom = bands[0].y - laneGap
  for (const band of bands) {
    const top = Math.min(band.y, bottom + laneGap)
    lanes.set(band.domain, { offset: band.y - top, minY: top + lanePaddingTop, maxY: top + band.height - lanePaddingBottom - CHAIN_DESIGN_NODE_SIZE.height })
    bottom = Math.max(bottom, top + band.height)
  }

  // Remove only whole empty columns. Details revealed by inspection do not shift the base layout.
  const columns = collapseEmptyColumns
    ? [...new Set(stableNodes.map(({ x }) => x))].sort((a, b) => a - b)
    : []
  const emptySpans = []
  for (let index = 1; index < columns.length; index++) {
    const start = columns[index - 1] + columnStride
    const width = Math.floor((columns[index] - start) / columnStride) * columnStride
    if (width > 0) emptySpans.push({ start, width })
  }
  const xInView = (x) => x - emptySpans.reduce(
    (removed, { start, width }) => removed + Math.min(width, Math.max(0, x - start)),
    0
  )
  const positions = new Map(stableNodes.map((node) => [
    node.id, { ...node, x: xInView(node.x), y: node.y - lanes.get(domainOf(node)).offset },
  ]))
  // Inspection can reveal neighbors while the inspector is open. Use a free column
  // in their lane so opening details keeps the existing steps under the pointer.
  for (const node of graph.nodes) {
    if (positions.has(node.id)) continue
    const domain = domainOf(node)
    if (!lanes.has(domain)) {
      const y = bottom + laneGap + lanePaddingTop
      lanes.set(domain, { offset: node.y - y, minY: y, maxY: y })
      bottom = y + CHAIN_DESIGN_NODE_SIZE.height + lanePaddingBottom
    }
    const lane = lanes.get(domain)
    const y = Math.max(lane.minY, Math.min(node.y - lane.offset, lane.maxY))
    let x = xInView(node.x)
    const row = [...positions.values()].filter((other) => Math.abs(other.y - y) < CHAIN_DESIGN_NODE_SIZE.height)
    const occupied = (candidateX) => row.some((other) => Math.abs(other.x - candidateX) < columnStride)
    while (occupied(x)) x += columnStride
    positions.set(node.id, { ...node, x, y })
  }
  return { ...graph, nodes: graph.nodes.map((node) => positions.get(node.id)) }
}
