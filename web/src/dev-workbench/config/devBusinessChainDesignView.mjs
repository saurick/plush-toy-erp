// Presentation only: every condensed path retains its original draft edges.
export const CHAIN_DESIGN_NODE_SIZE = Object.freeze({ width: 176, height: 88 })

// The same mapping converts a vertical drop position back to the saved coordinates.
export function orientBusinessChainPoint(point, direction) {
  if (direction !== 'TB') return point
  const { width, height } = CHAIN_DESIGN_NODE_SIZE
  return { x: point.y * (width / height), y: point.x * (height / width) }
}
const stepTypes = new Set(['business_action', 'system'])
export const isBusinessChainStep = (node) =>
  !node.splitInto &&
  !node.representedBy &&
  (stepTypes.has(node.type) || (node.type === 'task' && !!node.processNode))
const pair = (edge) => JSON.stringify([edge.from, edge.to])

export function projectBusinessChainDraft(
  draft,
  library,
  mode = 'mainline',
  expandedNodes = []
) {
  const incoming = new Map(draft.nodes.map(({ id }) => [id, []]))
  const outgoing = new Map(draft.nodes.map(({ id }) => [id, []]))
  for (const edge of draft.edges) {
    incoming.get(edge.to).push(edge)
    outgoing.get(edge.from).push(edge)
  }
  const visible = new Set(
    draft.nodes
      .filter(({ id }) => {
        const adjacent = [...incoming.get(id), ...outgoing.get(id)]
        return (
          mode === 'all' ||
          expandedNodes.includes(id) ||
          isBusinessChainStep(library.byId.get(id)) ||
          !adjacent.length ||
          adjacent.some((edge) => edge.kind === 'unknown')
        )
      })
      .map(({ id }) => id)
  )
  // Keep an object-only component visible when no business step can anchor it.
  const reachable = new Set(visible)
  const queue = [...visible]
  for (const id of queue) {
    for (const edge of [...incoming.get(id), ...outgoing.get(id)]) {
      for (const next of [edge.from, edge.to]) {
        if (!reachable.has(next)) {
          reachable.add(next)
          queue.push(next)
        }
      }
    }
  }
  for (const { id } of draft.nodes) if (!reachable.has(id)) visible.add(id)
  const groups = new Map()
  const collect = (from, to, path) => {
    // Feedback within a condensed node remains available in its inline details.
    if (from === to) return
    const kind = path.some((edge) => edge.kind === 'unknown')
      ? 'unknown'
      : path.some(
            (edge) => library.byPair.get(pair(edge))?.kind === 'exception'
          )
        ? 'exception'
        : 'known'
    const dependency = path.some(
      (edge) => library.byPair.get(pair(edge))?.dependency
    )
    const key = JSON.stringify([from, to, kind, dependency])
    if (!groups.has(key)) {
      groups.set(key, { key, from, to, kind, dependency, paths: [] })
    }
    groups.get(key).paths.push(path)
  }
  for (const from of visible) {
    const walk = (id, path, visited) => {
      for (const edge of outgoing.get(id)) {
        const next = [...path, edge]
        if (visible.has(edge.to)) collect(from, edge.to, next)
        else if (!visited.has(edge.to)) {
          walk(edge.to, next, new Set([...visited, edge.to]))
        }
      }
    }
    walk(from, [], new Set([from]))
  }
  return {
    nodes: draft.nodes.filter(({ id }) => visible.has(id)),
    edges: [...groups.values()],
  }
}

export function businessChainNodeContext(library, nodeId) {
  const ids = new Set([nodeId])
  const queue = [nodeId]
  for (const id of queue) {
    for (const edge of [
      ...library.relations,
      ...(library.explorationRelations || []),
    ]) {
      if (edge.from !== id && edge.to !== id) continue
      const next = edge.from === id ? edge.to : edge.from
      if (ids.has(next)) continue
      ids.add(next)
      // Include the selected step's input/output, plus their associated actions and tasks.
      // Stop at the next business object rather than treating the whole chain as one task.
      if (id === nodeId || isBusinessChainStep(library.byId.get(next))) {
        queue.push(next)
      }
    }
  }
  for (const id of [...ids]) {
    for (const related of library.byId.get(id).relatedNodeIds || []) {
      ids.add(related)
    }
    for (const part of library.byId.get(id).splitInto || []) ids.add(part)
  }
  return [...ids].map((id) => library.byId.get(id))
}

export function businessChainNeighbors(library, nodeId, direction) {
  const node = library.byId.get(nodeId)
  const matches = (edge) =>
    direction === 'upstream' ? edge.to === nodeId : edge.from === nodeId
  const direct = (library.explorationRelations || library.relations).filter(
    matches
  )
  if (!isBusinessChainStep(node) || node.processNode) return direct
  const steps = library.stepRelations.filter(matches)
  const covered = new Set(
    steps.flatMap((edge) => (edge.paths || []).flat().map(pair))
  )
  // Source documents and final results have no neighboring action to condense into.
  // Retain these boundaries so "no preceding action" does not mean "no source".
  return [
    ...steps,
    ...direct.filter((edge) => {
      const other = library.byId.get(
        direction === 'upstream' ? edge.from : edge.to
      )
      return (
        other.catalogKind === 'node' &&
        !isBusinessChainStep(other) &&
        !covered.has(pair(edge))
      )
    }),
  ]
}

export function expandBusinessChainView(
  draft,
  library,
  nodeId,
  direction = 'both',
  recursive = false,
  targetId = null
) {
  const nodes = new Map(draft.nodes.map((node) => [node.id, node]))
  const edges = new Map(draft.edges.map((edge) => [pair(edge), edge]))
  const anchor = nodes.get(nodeId) || { x: 32, y: 48 }
  nodes.set(nodeId, { id: nodeId, ...anchor })
  const directions =
    direction === 'both' ? ['upstream', 'downstream'] : [direction]
  for (const side of directions) {
    const visited = new Set([nodeId])
    const queue = [{ id: nodeId, depth: 0 }]
    for (const current of queue) {
      const adjacent = businessChainNeighbors(library, current.id, side).filter(
        (edge) => !targetId || [edge.from, edge.to].includes(targetId)
      )
      for (const edge of adjacent) {
        const id = side === 'upstream' ? edge.from : edge.to
        edges.set(pair(edge), { from: edge.from, to: edge.to, kind: 'known' })
        if (!nodes.has(id)) {
          const x =
            anchor.x +
            (side === 'upstream' ? -1 : 1) * 252 * (current.depth + 1)
          let { y } = anchor
          const column = [...nodes.values()]
            .filter((node) => Math.abs(node.x - x) < 200)
            .sort((a, b) => a.y - b.y)
          for (const neighbor of column) {
            if (Math.abs(neighbor.y - y) < 112) y = neighbor.y + 132
          }
          nodes.set(id, { id, x, y })
        }
        if (recursive && !visited.has(id)) {
          visited.add(id)
          queue.push({ id, depth: current.depth + 1 })
        }
      }
    }
  }
  return { ...draft, nodes: [...nodes.values()], edges: [...edges.values()] }
}

export function arrangeBusinessChainGraph(graph) {
  const outgoing = new Map(graph.nodes.map(({ id }) => [id, []]))
  for (const edge of graph.edges) {
    if (edge.kind !== 'unknown') outgoing.get(edge.from).push(edge)
  }
  const active = new Set()
  const visited = new Set()
  const back = new Set()
  const ordered = []
  const visit = (id) => {
    if (visited.has(id)) return
    visited.add(id)
    active.add(id)
    for (const edge of outgoing.get(id)) {
      if (active.has(edge.to)) back.add(edge.key)
      else visit(edge.to)
    }
    active.delete(id)
    ordered.unshift(id)
  }
  graph.nodes.forEach(({ id }) => visit(id))
  const levels = new Map(graph.nodes.map(({ id }) => [id, 0]))
  for (const id of ordered) {
    for (const edge of outgoing.get(id)) {
      if (!back.has(edge.key)) {
        levels.set(edge.to, Math.max(levels.get(edge.to), levels.get(id) + 1))
      }
    }
  }
  const columns = new Map()
  for (const node of graph.nodes) {
    const column = levels.get(node.id)
    if (!columns.has(column)) columns.set(column, [])
    columns.get(column).push(node.id)
  }
  const rows = new Map()
  const positions = new Map()
  for (const [column, ids] of [...columns].sort(([a], [b]) => a - b)) {
    const rank = (id) => {
      const parents = graph.edges.filter(
        (edge) => edge.to === id && rows.has(edge.from) && !back.has(edge.key)
      )
      return parents.length
        ? parents.reduce((sum, edge) => sum + rows.get(edge.from), 0) /
            parents.length
        : 0
    }
    ids.sort((a, b) => rank(a) - rank(b))
    ids.forEach((id, row) => {
      rows.set(id, row)
      positions.set(id, { x: 32 + column * 252, y: 48 + row * 156 })
    })
  }
  return positions
}

export function layoutBusinessChainDraft(draft, library, mode = 'mainline') {
  const graph = projectBusinessChainDraft(draft, library, mode)
  const positions = arrangeBusinessChainGraph(graph)
  const bottom =
    Math.max(48, ...[...positions.values()].map(({ y }) => y)) + 180
  let hidden = 0
  return {
    ...draft,
    nodes: draft.nodes.map((node) => {
      const position = positions.get(node.id) || {
        x: 32 + (hidden % 3) * 252,
        y: bottom + Math.floor(hidden++ / 3) * 132,
      }
      return { ...node, ...position }
    }),
  }
}

const routeClearance = 8
const routeLaneGap = 16
const routeLeads = [24, 16, 32]

function businessChainRoutingSpace(nodes, width, height) {
  return {
    nodes,
    width,
    height,
    positions: new Map(nodes.map((node) => [node.id, node])),
    tracks: [...new Set(nodes.flatMap(({ y }) => [y - routeLaneGap, y + height + routeLaneGap]))],
    usedBends: new Map(),
  }
}

function routeBetweenCards({ nodes, width, height, tracks, usedBends }, from, to) {
  const start = { x: from.x + width, y: from.y + height / 2 }
  const end = { x: to.x, y: to.y + height / 2 }
  const clear = (points) => points.slice(1).every((next, index) => {
    const previous = points[index]
    const left = Math.min(previous.x, next.x)
    const right = Math.max(previous.x, next.x)
    const top = Math.min(previous.y, next.y)
    const bottom = Math.max(previous.y, next.y)
    return !nodes.some((node) =>
      !(node === from && index === 0) &&
      !(node === to && index === points.length - 2) &&
      right > node.x - routeClearance && left < node.x + width + routeClearance &&
      bottom > node.y - routeClearance && top < node.y + height + routeClearance)
  })
  const gap = end.x - start.x
  const middleX = (start.x + end.x) / 2
  if (gap >= routeClearance * 2) {
    const top = Math.min(start.y, end.y)
    const bottom = Math.max(start.y, end.y)
    const overlapsBend = (x) => usedBends.get(x)?.some(([low, high]) => top < high && bottom > low) ?? false
    const bends = gap >= routeLaneGap * 2
      ? [middleX, start.x + routeLaneGap, end.x - routeLaneGap]
      : [middleX]
    // Separate parallel turns within the same gap when there is room.
    for (const x of bends.sort((a, b) => Number(overlapsBend(a)) - Number(overlapsBend(b)))) {
      const points = start.y === end.y
        ? [start, end]
        : [start, { x, y: start.y }, { x, y: end.y }, end]
      if (!clear(points)) continue
      if (top < bottom) usedBends.set(x, [...(usedBends.get(x) || []), [top, bottom]])
      return points
    }
  }
  const middleY = (start.y + end.y) / 2
  // Try the nearby gaps first. Distant cards should not determine the detour.
  for (const y of [middleY, ...tracks].sort((a, b) => Math.abs(a - middleY) - Math.abs(b - middleY))) {
    for (const out of routeLeads) {
      for (const into of routeLeads) {
        const startX = start.x + out
        const endX = end.x - into
        const points = [
          start,
          { x: startX, y: start.y },
          { x: startX, y },
          { x: endX, y },
          { x: endX, y: end.y },
          end,
        ]
        if (clear(points)) return points
      }
    }
  }
  return null
}

function renderBusinessChainRoute(edge, points, direction) {
  let previous = orientBusinessChainPoint(points[0], direction)
  const d = [`M ${previous.x} ${previous.y}`]
  let longest = 0
  let labelX = previous.x
  let labelY = previous.y
  for (const point of points.slice(1)) {
    const next = orientBusinessChainPoint(point, direction)
    const horizontal = previous.y === next.y
    const length = Math.abs(horizontal ? next.x - previous.x : next.y - previous.y)
    if (length === 0) continue
    d.push(horizontal ? `H ${next.x}` : `V ${next.y}`)
    if (length > longest) {
      longest = length
      labelX = (previous.x + next.x) / 2
      labelY = (previous.y + next.y) / 2 + (horizontal ? -8 : 4)
    }
    previous = next
  }
  return { ...edge, d: d.join(' '), labelX, labelY }
}

// Choose gaps in the saved coordinate system so both directions use the same route.
export function routeBusinessChainEdges(graph, direction = 'LR') {
  const { width, height } = CHAIN_DESIGN_NODE_SIZE
  const { nodes, edges } = graph
  const forward = businessChainRoutingSpace(nodes, width, height)
  const sideways = ({ x, y }) => ({ x: y, y: x })
  const cross = businessChainRoutingSpace(
    nodes.map((node) => ({ id: node.id, ...sideways(node) })), height, width
  )
  return edges.map((edge) => {
    const from = forward.positions.get(edge.from)
    const to = forward.positions.get(edge.to)
    const sideFrom = cross.positions.get(edge.from)
    const sideTo = cross.positions.get(edge.to)
    const across = () => {
      const reverse = from.y > to.y
      const points = reverse ? routeBetweenCards(cross, sideTo, sideFrom) : routeBetweenCards(cross, sideFrom, sideTo)
      return points && (reverse ? points.reverse() : points).map(sideways)
    }
    // Same-stage cards read across the flow. Use facing sides if the main ports are blocked.
    const points = Math.abs(from.x - to.x) < 1 && to.y - from.y >= height
      ? across() || routeBetweenCards(forward, from, to)
      : routeBetweenCards(forward, from, to) || across()
    if (points) return renderBusinessChainRoute(edge, points, direction)
    // Hand-placed cards can overlap and leave no unobstructed route.
    const start = { x: from.x + width, y: from.y + height / 2 }
    const end = { x: to.x, y: to.y + height / 2 }
    const middle = (start.x + end.x) / 2
    return renderBusinessChainRoute(edge, [
      start, { x: middle, y: start.y }, { x: middle, y: end.y }, end,
    ], direction)
  })
}
