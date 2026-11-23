import {
  businessChainNeighbors,
  arrangeBusinessChainGraph,
  expandBusinessChainView,
  isBusinessChainStep,
  layoutBusinessChainDraft,
  projectBusinessChainDraft,
} from './devBusinessChainDesignView.mjs'
import { arrangeBusinessChainReading, businessChainHandoffKind } from './devBusinessChainReading.mjs'

const pair = ({ from, to }) => JSON.stringify([from, to])
const unique = (values) => [...new Set(values)]
const currentNodes = (library) =>
  library.nodes.filter((node) => !node.representedBy && !node.splitInto)
const wholeScopeIds = (library, chainKey) =>
  currentNodes(library)
    .filter((node) => chainKey === 'all' || node.chainKey === chainKey)
    .map(({ id }) => id)
const visibleChains = (map, library) =>
  unique(map.visibleIds.map((id) => library.byId.get(id).chainKey))
const focusPositionsById = (map) =>
  new Map(map.focusPositions.map((position) => [position.id, position]))

function withFocusPositions(draft, positions) {
  return {
    ...draft,
    map: {
      ...draft.map,
      focusPositions: [...positions].map(([id, { x, y }]) => ({ id, x, y })),
    },
  }
}

export function businessChainMapState(draft, library) {
  if (draft.map) return draft.map
  const chains = unique(
    draft.nodes.map(({ id }) => library.byId.get(id).chainKey)
  )
  return {
    scope: 'local',
    chainKey: chains.length === 1 ? chains[0] : 'all',
    focusId: draft.nodes[0]?.id || null,
    visibleIds: draft.nodes.map(({ id }) => id),
    expandedChains: [],
    expandedNodes: [],
    summaries: [],
  }
}

// Reading scope and cached coordinates are separate: hiding a region never discards its layout.
export function businessChainMapScope(draft, library) {
  const map = businessChainMapState(draft, library)
  const visible = new Set(map.visibleIds)
  return {
    ...draft,
    nodes: draft.nodes.filter(({ id }) => visible.has(id)),
    edges: draft.edges.filter(
      ({ from, to }) => visible.has(from) && visible.has(to)
    ),
  }
}

function freePosition(nodes, preferred) {
  const { x } = preferred
  let { y } = preferred
  const occupied = (candidate) =>
    nodes.some(
      (node) => Math.abs(node.x - x) < 216 && Math.abs(node.y - candidate) < 120
    )
  while (occupied(y)) y += 144
  return { x, y }
}

function mergeRegion(draft, region, map) {
  const nodes = new Map(draft.nodes.map((node) => [node.id, node]))
  const edges = new Map(draft.edges.map((edge) => [pair(edge), edge]))
  for (const node of region.nodes) {
    if (!nodes.has(node.id)) {
      nodes.set(node.id, {
        ...node,
        ...(node.manual
          ? {}
          : freePosition([...nodes.values(), ...map.summaries], node)),
      })
    }
  }
  for (const edge of region.edges) edges.set(pair(edge), edge)
  return {
    ...draft,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    map,
  }
}

export function showBusinessChainWhole(
  draft,
  library,
  chainKey = businessChainMapState(draft, library).chainKey
) {
  const ids = new Set(wholeScopeIds(library, chainKey))
  const region = layoutBusinessChainDraft(
    {
      nodes: [...ids].map((id) => ({ id, x: 0, y: 0 })),
      edges: library.explorationRelations
        .filter(({ from, to }) => ids.has(from) && ids.has(to))
        .map(({ from, to }) => ({ from, to, kind: 'known' })),
    },
    library
  )
  const map = { ...businessChainMapState(draft, library) }
  delete map.showHandoffs
  delete map.focusPositions
  return ensureBusinessChainMapLayout(
    mergeRegion(draft, region, {
      ...map,
      scope: 'whole',
      chainKey,
      focusId: null,
      visibleIds: [...ids],
      hiddenNodes: [],
      hiddenEdges: [],
    }),
    library
  )
}

export function addBusinessChainMapNode(draft, library, id, position) {
  const map = businessChainMapState(draft, library)
  const cached = draft.nodes.find((node) => node.id === id)
  const adjacent = [...library.explorationRelations, ...library.relations].find(
    (edge) =>
      (edge.from === id && map.visibleIds.includes(edge.to)) ||
      (edge.to === id && map.visibleIds.includes(edge.from))
  )
  const anchor =
    adjacent &&
    draft.nodes.find(
      (node) => node.id === (adjacent.from === id ? adjacent.to : adjacent.from)
    )
  const automatic = anchor
    ? { x: anchor.x + (adjacent.from === id ? -252 : 252), y: anchor.y }
    : {
        x: 536 + (map.visibleIds.length % 3) * 252,
        y: 192 + Math.floor(map.visibleIds.length / 3) * 144,
      }
  const basePosition = map.focusPositions ? null : position
  const next = mergeRegion(
    draft,
    {
      nodes: [
        cached || {
          id,
          ...(basePosition || automatic),
          ...(basePosition ? { manual: true } : {}),
        },
      ],
      edges: [],
    },
    {
      ...map,
      showHandoffs: map.showHandoffs && map.chainKey === library.byId.get(id).chainKey,
      scope: 'local',
      chainKey: map.visibleIds.length
        ? map.chainKey === library.byId.get(id).chainKey
          ? map.chainKey
          : 'all'
        : library.byId.get(id).chainKey,
      focusId: id,
      visibleIds: unique([...map.visibleIds, id]),
      hiddenNodes: (map.hiddenNodes || []).filter((nodeId) => nodeId !== id),
      expandedChains:
        draft.presentation?.mode === 'overview'
          ? unique([...map.expandedChains, library.byId.get(id).chainKey])
          : map.expandedChains,
    }
  )
  return ensureBusinessChainMapLayout(
    map.focusPositions && position
      ? withFocusPositions(next, focusPositionsById(next.map).set(id, position))
      : next,
    library
  )
}

export function focusBusinessChainMap(
  draft,
  library,
  id,
  mode = draft.presentation?.mode ?? 'mainline'
) {
  const map = { ...businessChainMapState(draft, library) }
  delete map.showHandoffs
  delete map.focusPositions
  const root = draft.nodes.find((node) => node.id === id) || {
    id,
    x: 536,
    y: 192,
  }
  const next = {
    ...draft,
    map: {
      ...map,
      scope: 'local',
      chainKey: map.visibleIds.includes(id) ? map.chainKey : library.byId.get(id).chainKey,
      focusId: id,
      visibleIds: [id],
      expandedNodes: unique([...map.expandedNodes, id]),
    },
  }
  if (!draft.nodes.some((node) => node.id === id)) {
    next.nodes = [...draft.nodes, root]
  }
  const focused = expandBusinessChainMap(next, library, id, 'both')
  const graph = projectBusinessChainMap(focused, library, mode)
  const positions = draft.presentation?.layout
    ? arrangeBusinessChainReading(graph, library, draft.presentation.layout)
    : arrangeBusinessChainGraph(graph)
  return extendFocusPositions(withFocusPositions(focused, positions), library)
}

export function expandBusinessChainMap(
  draft,
  library,
  id,
  direction = 'both',
  recursive = false,
  targetId = null
) {
  const map = businessChainMapState(draft, library)
  const region = expandBusinessChainView(
    businessChainMapScope(draft, library),
    library,
    id,
    direction,
    recursive,
    targetId
  )
  return ensureBusinessChainMapLayout(
    mergeRegion(draft, region, {
      ...map,
      visibleIds: region.nodes.map((node) => node.id),
    }),
    library
  )
}

function directionRoots(draft, library, direction) {
  const map = businessChainMapState(draft, library)
  if (!map.focusId) return map.visibleIds
  const visible = new Set(map.visibleIds)
  const visited = new Set([map.focusId])
  const queue = [map.focusId]
  for (const id of queue) {
    for (const edge of businessChainNeighbors(library, id, direction)) {
      const next = direction === 'upstream' ? edge.from : edge.to
      if (visible.has(next) && !visited.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }
  return queue
}

// Follow the chosen direction from the focus; an input document must not open unrelated sibling branches.
export function growBusinessChainMap(draft, library, direction) {
  const roots = directionRoots(draft, library, direction)
  let next = draft
  for (const id of roots) {
    next = expandBusinessChainMap(next, library, id, direction)
  }
  return next
}

export function businessChainMapCanGrow(draft, library, direction) {
  const visible = new Set(businessChainMapState(draft, library).visibleIds)
  return directionRoots(draft, library, direction).some((id) =>
    businessChainNeighbors(library, id, direction).some(
      (edge) => !visible.has(direction === 'upstream' ? edge.from : edge.to)
    )
  )
}

export function businessChainMapCanCollapseGrowth(draft, library) {
  const map = businessChainMapState(draft, library)
  if (map.scope !== 'whole') return false
  const defaultIds = new Set(wholeScopeIds(library, map.chainKey))
  return map.visibleIds.some((id) => !defaultIds.has(id))
}

export function collapseBusinessChainMapGrowth(draft, library) {
  if (!businessChainMapCanCollapseGrowth(draft, library)) return draft
  const map = businessChainMapState(draft, library)
  return {
    ...draft,
    map: {
      ...map,
      visibleIds: wholeScopeIds(library, map.chainKey),
    },
  }
}

function detailedRegion(draft, library, loadedOnly = false) {
  const scope = businessChainMapScope(draft, library)
  const ids = new Set(scope.nodes.map(({ id }) => id))
  const steps = new Set(
    scope.nodes
      .filter(({ id }) => isBusinessChainStep(library.byId.get(id)))
      .map(({ id }) => id)
  )
  const edges = new Map(scope.edges.map((edge) => [pair(edge), edge]))
  const loadedEdges = loadedOnly ? new Set(draft.edges.map(pair)) : null
  // Include the selected steps' immediate documents and the original paths behind condensed edges.
  for (const edge of scope.edges) {
    const paths = library.byPair.get(pair(edge))?.paths
    if (!paths?.length) continue
    if (loadedEdges && paths.flat().some((part) => !loadedEdges.has(pair(part)))) {
      continue
    }
    edges.delete(pair(edge))
    for (const part of paths.flat()) {
      ids.add(part.from)
      ids.add(part.to)
      edges.set(pair(part), { from: part.from, to: part.to, kind: 'known' })
    }
  }
  for (const edge of library.explorationRelations) {
    if (loadedEdges && !loadedEdges.has(pair(edge))) continue
    const from = library.byId.get(edge.from)
    const to = library.byId.get(edge.to)
    if (
      (steps.has(edge.from) &&
        !isBusinessChainStep(to) &&
        !to.splitInto &&
        !to.representedBy) ||
      (steps.has(edge.to) &&
        !isBusinessChainStep(from) &&
        !from.splitInto &&
        !from.representedBy)
    ) {
      ids.add(edge.from)
      ids.add(edge.to)
      edges.set(pair(edge), { from: edge.from, to: edge.to, kind: 'known' })
    }
  }
  const hidden = new Set(
    businessChainMapState(draft, library).hiddenEdges || []
  )
  const hiddenNodes = new Set(
    businessChainMapState(draft, library).hiddenNodes || []
  )
  return {
    ...scope,
    nodes: [...ids]
      .filter((id) => !hiddenNodes.has(id))
      .map(
        (id) =>
          draft.nodes.find((node) => node.id === id) || { id, x: 32, y: 48 }
      ),
    edges: [...edges.values()].filter(
      (edge) =>
        !hidden.has(pair(edge)) &&
        !hiddenNodes.has(edge.from) &&
        !hiddenNodes.has(edge.to)
    ),
  }
}

export function ensureBusinessChainMapLayout(draft, library) {
  const map = businessChainMapState(draft, library)
  const detail = detailedRegion(draft, library)
  const existing = new Set(draft.nodes.map(({ id }) => id))
  const region = {
    ...detail,
    nodes: detail.nodes.map((node) => {
      if (existing.has(node.id)) return node
      const edge = detail.edges.find(
        (edge) =>
          [edge.from, edge.to].includes(node.id) &&
          existing.has(edge.from === node.id ? edge.to : edge.from)
      )
      const anchor =
        edge &&
        draft.nodes.find(
          ({ id }) => id === (edge.from === node.id ? edge.to : edge.from)
        )
      return {
        ...node,
        x: anchor ? anchor.x : node.x,
        y: anchor ? anchor.y + 144 : node.y,
      }
    }),
  }
  const next = mergeRegion(draft, region, map)
  const summaries = new Map(map.summaries.map((node) => [node.id, node]))
  const chainKeys = visibleChains(map, library)
  for (const key of chainKeys) {
    if (summaries.has(key)) continue
    const index = library.chains.findIndex((chain) => chain.value === key)
    const lane = library.overview?.lanes.findIndex((item) =>
      item.chainKeys.includes(key)
    )
    const column =
      lane >= 0
        ? library.overview.lanes[lane].chainKeys.indexOf(key)
        : index % 3
    summaries.set(key, {
      id: key,
      x: 32 + column * 300,
      y: -800 + (lane >= 0 ? lane : Math.floor(index / 3)) * 180,
    })
  }
  const laidOut = { ...next, map: { ...map, summaries: [...summaries.values()] } }
  return map.focusPositions ? extendFocusPositions(laidOut, library) : laidOut
}

function projectVisibleBusinessChainMap(draft, library, map, mode) {
  // Only scope actions load related objects; changing detail never adds unsaved graph content.
  const region = detailedRegion(draft, library, true)
  const wholeDetail = map.scope === 'whole' && map.chainKey === 'all' && mode !== 'overview'
  const salesScope = map.scope === 'whole' && map.chainKey === 'sales_to_production'
  const terminalIds = (salesScope || wholeDetail) ? region.nodes.filter(({ id }) => {
    const node = library.byId.get(id)
    return node.terminal && library.salesAcceptanceVariants.some(({ key }) => key === node.processNode?.definitionKey)
  }).map(({ id }) => id) : []
  const raw = projectBusinessChainDraft(
    region,
    library,
    mode === 'all' ? 'all' : 'mainline',
    [...map.expandedNodes, ...terminalIds]
  )
  if (wholeDetail) {
    return { ...projectSalesAcceptance(raw, library, undefined, true), wholeDetail: true, salesAcceptance: false }
  }
  const graph = salesScope ? projectSalesAcceptance(raw, library, draft.presentation?.salesAcceptanceVariant) : raw
  if (mode !== 'overview') return graph
  const chains = visibleChains(map, library)
  const expanded = new Set(map.expandedChains)
  const steps = graph.nodes.filter(({ id }) => expanded.has(library.byId.get(id).chainKey))
  const shown = new Set(steps.map(({ id }) => id))
  const stepEdges = graph.edges.filter(({ from, to }) => shown.has(from) && shown.has(to))
  const summaries = chains.map((key, index) => ({
    ...(map.summaries.find((node) => node.id === key) || {
      x: 32 + (index % 3) * 300,
      y: 48 + Math.floor(index / 3) * 180,
    }),
    id: `map:${key}`,
    chainKey: key,
    summary: true,
    label: library.chains.find((chain) => chain.value === key).label,
    domain: library.nodes.find((node) => node.chainKey === key)?.domain,
    count: salesScope ? graph.nodes.filter(({ id }) => library.byId.get(id).chainKey === key && isBusinessChainStep(library.byId.get(id))).length : map.visibleIds.filter(
      (id) =>
        library.byId.get(id).chainKey === key &&
        isBusinessChainStep(library.byId.get(id))
    ).length,
  }))
  if (summaries.length === 1 && summaries[0].chainKey === map.chainKey) {
    // In a single chain the scope bar carries the expanded summary; map coordinates stay cached.
    return {
      scopeSummary: summaries[0],
nodes: steps.length ? steps : summaries,
edges: stepEdges,
      ...(salesScope && steps.length ? { salesAcceptance: true } : {}),
    }
  }
  return {
    nodes: [...summaries, ...steps],
    edges: [
      ...stepEdges,
      ...(library.overview?.relations || [])
        .filter(
          (edge) =>
            chains.includes(edge.fromChainKey) &&
            chains.includes(edge.toChainKey)
        )
        .map((edge) => ({
          key: `map:${edge.fromChainKey}:${edge.toChainKey}`,
          from: `map:${edge.fromChainKey}`,
          to: `map:${edge.toChainKey}`,
          kind: businessChainHandoffKind(edge),
          paths: [],
          overview: edge,
        })),
    ],
  }
}

// Only the whole-chain reading combines variants. Draft IDs, edits and source paths stay concrete.
function projectSalesAcceptance(graph, library, variant, autoLayout = false) {
  const definitions = new Set(library.salesAcceptanceVariants.map(({ key }) => key))
  const groups = new Map()
  const visibleId = new Map()
  const nodes = []
  for (const node of graph.nodes) {
    const item = library.byId.get(node.id)
    const definition = item?.processNode?.definitionKey
    if (!definitions.has(definition)) {
      nodes.push(node)
      visibleId.set(node.id, node.id)
      continue
    }
    if (variant && variant !== definition) continue
    // A shared title alone does not establish the same command, responsibility or fact boundary.
    const key = JSON.stringify([node.manual && !autoLayout ? node.id : item.chainKey, item.source, item.roles, item.domain, item.entry, item.terminal, item.exception])
    let group = groups.get(key)
    if (!group) {
      group = { ...node, sourceIds: [] }
      groups.set(key, group)
      nodes.push(group)
    }
    group.sourceIds.push(node.id)
    visibleId.set(node.id, group.id)
  }
  const edges = new Map()
  for (const edge of graph.edges) {
    const from = visibleId.get(edge.from)
    const to = visibleId.get(edge.to)
    if (!from || !to) continue
    const key = JSON.stringify([from, to, edge.kind, edge.dependency])
    const current = edges.get(key)
    if (current) current.paths.push(...edge.paths)
    else edges.set(key, { ...edge, from, to, key, paths: [...edge.paths] })
  }
  const visibleEdges = [...edges.values()]
  for (const edge of visibleEdges) {
    if (edge.kind !== 'exception') continue
    const to = library.byId.get(edge.to)
    if (to.rejectionCommand) edge.readingLabel = '驳回'
    else if (to.terminal && library.byId.get(edge.from).rejectionCommand) edge.readingLabel = ''
  }
  for (const node of groups.values()) {
    if (node.sourceIds.length < 2) continue
    const exits = visibleEdges.filter((edge) => edge.from === node.id && edge.kind === 'known' && library.byId.get(edge.to).processNode)
    if (exits.length < 2) continue
    for (const edge of exits) {
      const sources = new Set(edge.paths.map((path) => library.byId.get(path[0].from).processNode?.definitionKey))
      if (sources.size === 1) {
        edge.readingLabel = library.salesAcceptanceVariants.find(({ key }) => sources.has(key))?.readingLabel
      }
    }
  }
  return { ...graph, nodes, edges: visibleEdges, salesAcceptance: true }
}

export function projectBusinessChainMap(draft, library, mode = 'mainline') {
  const map = businessChainMapState(draft, library)
  const graph = projectVisibleBusinessChainMap(draft, library, map, mode)
  const layout = draft.presentation?.layout
  if (layout && graph.salesAcceptance && !draft.nodes.some((node) => node.manual && map.visibleIds.includes(node.id))) {
    // Use the finest graph as the coordinate source across granularities, including restored drafts.
    const full = mode === 'all' ? graph : projectVisibleBusinessChainMap(draft, library, map, 'all')
    const positions = arrangeBusinessChainReading(full, library, layout)
    return { ...graph, nodes: graph.nodes.map((node) => ({ ...node, ...positions.get(node.id) })) }
  }
  if (!map.focusPositions) return graph
  const positions = focusPositionsById(map)
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const position = positions.get(node.id)
      return position ? { ...node, ...position } : node
    }),
  }
}

function extendFocusPositions(draft, library) {
  const { map } = draft
  const positions = focusPositionsById(map)
  const { nodes, edges } = projectVisibleBusinessChainMap(
    draft,
    library,
    map,
    'all'
  )
  const ids = [
    ...nodes.map(({ id }) => id),
    ...visibleChains(map, library).map((key) => `map:${key}`),
  ]
  const added = ids.filter((id) => !positions.has(id))
  if (!added.length) return draft

  // Also place detail nodes that the current granularity hides, so revealing them never moves existing nodes.
  const occupied = ids.map((id) => positions.get(id)).filter(Boolean)
  for (const id of added) {
    const edge = edges.find(
      ({ from, to }) =>
        (id === to && positions.has(from)) || (id === from && positions.has(to))
    )
    const anchor = edge && positions.get(id === edge.to ? edge.from : edge.to)
    const position = freePosition(
      occupied,
      anchor
        ? { x: anchor.x + (id === edge.to ? 252 : -252), y: anchor.y }
        : { x: 32, y: 48 }
    )
    positions.set(id, position)
    occupied.push(position)
  }
  return withFocusPositions(draft, positions)
}

export function hideBusinessChainMapEdges(draft, library, pairs) {
  const map = businessChainMapState(draft, library)
  const hidden = new Set([...(map.hiddenEdges || []), ...pairs])
  return {
    ...draft,
    edges: draft.edges.filter((edge) => !hidden.has(pair(edge))),
    map: { ...map, hiddenEdges: [...hidden] },
  }
}

export function removeBusinessChainMapNode(draft, library, id) {
  const map = businessChainMapState(draft, library)
  return {
    ...draft,
    nodes: draft.nodes.filter((node) => node.id !== id),
    edges: draft.edges.filter((edge) => edge.from !== id && edge.to !== id),
    map: {
      ...map,
      scope: 'local',
      focusId: map.focusId === id ? null : map.focusId,
      visibleIds: map.visibleIds.filter((item) => item !== id),
      expandedNodes: map.expandedNodes.filter((item) => item !== id),
      hiddenNodes: unique([...(map.hiddenNodes || []), id]),
      ...(map.focusPositions
        ? {
            focusPositions: map.focusPositions.filter(
              (placed) => placed.id !== id
            ),
          }
        : {}),
    },
  }
}

export function toggleBusinessChainMapRegion(draft, library, key) {
  const map = businessChainMapState(draft, library)
  const collapsing = map.expandedChains.includes(key)
  const next = ensureBusinessChainMapLayout(
    {
      ...draft,
      map: {
        ...map,
        expandedChains: collapsing
          ? map.expandedChains.filter((item) => item !== key)
          : [...map.expandedChains, key],
      },
    },
    library
  )
  if (collapsing || map.focusPositions) return next
  const before = projectBusinessChainMap(draft, library, 'overview').nodes
  const visible = new Set(before.map(({ id }) => id))
  const after = projectBusinessChainMap(next, library, 'overview').nodes
  const added = after.filter(({ id }) => !visible.has(id))
  const occupied = after.filter((node) => visible.has(node.id) || node.manual)
  const placements = new Map()
  for (const node of added.filter((node) => !node.manual)) {
    const placement = { ...node, ...freePosition(occupied, node) }
    occupied.push(placement)
    placements.set(node.id, placement)
  }
  return {
    ...next,
    nodes: next.nodes.map((node) => placements.get(node.id) || node),
  }
}

export function arrangeBusinessChainMap(draft, library, mode, layout) {
  const map = businessChainMapState(draft, library)
  const graph = projectBusinessChainMap(draft, library, layout && mode !== 'overview' ? 'all' : mode)
  const positions = layout
    ? arrangeBusinessChainReading(graph, library, layout)
    : arrangeBusinessChainGraph(graph)
  if (map.focusPositions) {
    return withFocusPositions(
      draft,
      new Map([...focusPositionsById(map), ...positions])
    )
  }
  return {
    ...draft,
    nodes: draft.nodes.map((node) =>
      positions.has(node.id) ? { id: node.id, ...positions.get(node.id) } : node
    ),
    map: {
      ...map,
      summaries: map.summaries.map((node) =>
        positions.has(`map:${node.id}`)
          ? { id: node.id, ...positions.get(`map:${node.id}`) }
          : node
      ),
    },
  }
}

export function parseBusinessChainMap(map, library, ids) {
  if (
    !map ||
    !['local', 'whole'].includes(map.scope) ||
    !['all', ...library.chains.map(({ value }) => value)].includes(
      map.chainKey
    ) ||
    (map.showHandoffs !== undefined && typeof map.showHandoffs !== 'boolean') ||
    !(map.focusId === null || ids.has(map.focusId))
  ) {
    throw new Error('Invalid map scope')
  }
  const strings = (values, allowed) => {
    if (
      !Array.isArray(values) ||
      new Set(values).size !== values.length ||
      values.some((id) => !allowed.has(id))
    ) {
      throw new Error('Invalid map expansion')
    }
    return [...values]
  }
  const chainKeys = new Set(library.chains.map(({ value }) => value))
  const hiddenEdges = strings(
    map.hiddenEdges || [],
    new Set(
      (map.hiddenEdges || []).filter((key) => {
        try {
          const parts = JSON.parse(key)
          return (
            Array.isArray(parts) &&
            parts.length === 2 &&
            parts[0] !== parts[1] &&
            parts.every((id) => library.byId.has(id))
          )
        } catch {
          return false
        }
      })
    )
  )
  const positions = (items, allowed, allowManual = false) => {
    if (!Array.isArray(items)) {
      throw new Error('Invalid map layout')
    }
    const seen = new Set()
    return items.map(({ id, x, y, manual }) => {
      if (
        !allowed.has(id) ||
        seen.has(id) ||
        ![x, y].every(Number.isFinite) ||
        (manual !== undefined && (!allowManual || typeof manual !== 'boolean'))
      ) {
        throw new Error('Invalid map layout')
      }
      seen.add(id)
      return { id, x, y, ...(manual ? { manual: true } : {}) }
    })
  }
  if (map.focusPositions !== undefined && map.scope !== 'local') {
    throw new Error('Invalid focus layout scope')
  }
  return {
    scope: map.scope,
    chainKey: map.chainKey,
    ...(map.showHandoffs && map.chainKey !== 'all' ? { showHandoffs: true } : {}),
    focusId: map.focusId,
    visibleIds: strings(map.visibleIds, ids),
    expandedChains: strings(map.expandedChains, chainKeys),
    expandedNodes: strings(map.expandedNodes, ids),
    summaries: positions(map.summaries, chainKeys, true),
    ...(map.hiddenEdges ? { hiddenEdges } : {}),
    ...(map.hiddenNodes
      ? { hiddenNodes: strings(map.hiddenNodes, new Set(library.byId.keys())) }
      : {}),
    ...(map.focusPositions !== undefined
      ? {
          focusPositions: positions(
            map.focusPositions,
            new Set([...ids, ...[...chainKeys].map((key) => `map:${key}`)])
          ),
        }
      : {}),
  }
}
