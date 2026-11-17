// Presentation only: every condensed path retains its original draft edges.
export const CHAIN_DESIGN_NODE_SIZE = Object.freeze({ width: 176, height: 88 })
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

// Orthogonal routes use gaps between columns; returns run outside the node rows.
export function routeBusinessChainEdges(graph) {
  const { width, height } = CHAIN_DESIGN_NODE_SIZE
  const positions = new Map(graph.nodes.map((node) => [node.id, node]))
  const bottom = graph.nodes.length
    ? Math.max(...graph.nodes.map(({ y }) => y + height))
    : 0
  let outer = 0
  return graph.edges.map((edge) => {
    const from = positions.get(edge.from)
    const to = positions.get(edge.to)
    const a = { x: from.x + width, y: from.y + height / 2 }
    const b = { x: to.x, y: to.y + height / 2 }
    const middle = (a.x + b.x) / 2
    const intersects = (x1, y1, x2, y2) =>
      graph.nodes.some((node) => {
        if ([edge.from, edge.to].includes(node.id)) return false
        return x1 === x2
          ? x1 > node.x - 8 &&
              x1 < node.x + width + 8 &&
              Math.max(y1, y2) > node.y - 8 &&
              Math.min(y1, y2) < node.y + height + 8
          : y1 > node.y - 8 &&
              y1 < node.y + height + 8 &&
              Math.max(x1, x2) > node.x - 8 &&
              Math.min(x1, x2) < node.x + width + 8
      })
    const direct =
      edge.kind !== 'exception' &&
      b.x - a.x >= 40 &&
      !intersects(a.x, a.y, middle, a.y) &&
      !intersects(middle, a.y, middle, b.y) &&
      !intersects(middle, b.y, b.x, b.y)
    const center = from.x + width / 2
    if (Math.abs(from.x - to.x) < 1 && to.y > from.y + height + 12 &&
        !intersects(center, from.y + height, center, to.y)) {
      return {
        ...edge,
        d: `M ${center} ${from.y + height} V ${to.y}`,
        labelX: center + 20,
        labelY: (from.y + height + to.y) / 2,
      }
    }
    if (Math.abs(from.x - to.x) < 1) {
      const side = a.x + 24
      const beforeTarget = to.y - 20
      const entry = b.x - 24
      if (!intersects(a.x, a.y, side, a.y) && !intersects(side, a.y, side, beforeTarget) &&
          !intersects(side, beforeTarget, entry, beforeTarget) && !intersects(entry, beforeTarget, entry, b.y)) {
        return {
          ...edge,
          d: `M ${a.x} ${a.y} H ${side} V ${beforeTarget} H ${entry} V ${b.y} H ${b.x}`,
          labelX: side + 12,
          labelY: (a.y + beforeTarget) / 2,
        }
      }
    }
    if (direct) {
      return {
        ...edge,
        d: `M ${a.x} ${a.y} H ${middle} V ${b.y} H ${b.x}`,
        labelX: middle,
        labelY: (a.y + b.y) / 2 - 10,
      }
    }
    if (edge.overview) {
      const gap = 18 + (outer++ % 4) * 6
      const lane = Math.min(from.y, to.y) - gap
      return {
        ...edge,
        d: `M ${a.x} ${a.y} H ${a.x + gap} V ${lane} H ${b.x - gap} V ${b.y} H ${b.x}`,
        labelX: middle,
        labelY: lane - 8,
      }
    }
    const lane = bottom + 32 + outer++ * 24
    const startX = a.x + 24
    const endX = b.x - 24
    return {
      ...edge,
      d: `M ${a.x} ${a.y} H ${startX} V ${lane} H ${endX} V ${b.y} H ${b.x}`,
      labelX: (startX + endX) / 2,
      labelY: lane - 8,
    }
  })
}
