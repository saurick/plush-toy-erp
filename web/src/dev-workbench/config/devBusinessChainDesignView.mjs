// Presentation only: every condensed path retains its original draft edges.
export const CHAIN_DISPLAY_OPTIONS = {
  overview: { label: '链路概览', description: '每条链路一张卡' },
  mainline: { label: '业务步骤', description: '看办理顺序和参与岗位' },
  all: { label: '节点明细', description: '进一步显示单据、记录和结果' },
}
export const CHAIN_LAYOUT_OPTIONS = {
  lanes: { label: '业务泳道', description: '按业务领域分组' },
  flow: { label: '阶段排布', description: '按办理顺序排列' },
}

export const CHAIN_DESIGN_NODE_SIZE = Object.freeze({ width: 176, height: 88 })

export function businessChainRoleHighlight(nodeRoles, selectedRoles) {
  const labels = selectedRoles.filter(({ value }) => nodeRoles.includes(value)).map(({ label }) => label)
  if (!labels.length) return null
  const shared = labels.length > 1
  return { kind: shared ? 'shared' : 'single', text: shared ? `共同 · ${labels.join('、')}` : labels[0] }
}

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

export function businessChainPathKind(kinds) {
  if (kinds.includes('unknown')) return 'unknown'
  if (kinds.includes('exception')) return 'exception'
  if (kinds.includes('correction')) return 'correction'
  return 'known'
}

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
        const node = library.byId.get(id)
        const adjacent = [...incoming.get(id), ...outgoing.get(id)]
        return (
          mode === 'all' ||
          expandedNodes.includes(id) ||
          isBusinessChainStep(node) ||
          (node.terminal && node.type === 'result' && !node.processNode) ||
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
    const kind = businessChainPathKind(path.map((edge) =>
      edge.kind === 'unknown' ? 'unknown' : library.byPair.get(pair(edge))?.kind
    ))
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
const routeTrackSpacing = 24

function businessChainRoutingSpace(nodes, width, height, horizontal = new Map(), vertical = new Map()) {
  return {
    nodes,
    width,
    height,
    positions: new Map(nodes.map((node) => [node.id, node])),
    tracks: [...new Set(nodes.flatMap(({ y }) => [y - routeLaneGap, y + height + routeLaneGap]))],
    horizontal,
    vertical,
  }
}

// Index occupied intervals in both orientations. Disjoint parts of a track remain reusable.
function visitRouteSegments(points, space, visit) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const horizontal = a.y === b.y
    const low = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y)
    const high = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y)
    if (low < high) visit(horizontal ? space.horizontal : space.vertical, horizontal ? a.y : a.x, low, high)
  }
}

function reserveRoute(points, space) {
  visitRouteSegments(points, space, (tracks, axis, low, high) => {
    if (!tracks.has(axis)) tracks.set(axis, [])
    tracks.get(axis).push([low, high])
  })
}

function routeBetweenCards(space, from, to, sideLanes = 8) {
  const { nodes, width, height, tracks } = space
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
  let best = null
  const consider = (points) => {
    let cost = 0
    let overlap = 0
    visitRouteSegments(points, space, (occupied, axis, low, high) => {
      cost += high - low
      for (const [otherAxis, intervals] of occupied) {
        const distance = Math.abs(otherAxis - axis)
        if (distance >= routeTrackSpacing) continue
        for (const [a, b] of intervals) {
          const common = Math.max(0, Math.min(high, b) - Math.max(low, a))
          // Allow short stems to meet at a port, but separate longer shared spans first.
          if (!distance) overlap += Math.max(0, common - routeTrackSpacing)
          cost += (1 - distance / routeTrackSpacing) * common
        }
      }
    })
    if ((!best || overlap < best.overlap || (overlap === best.overlap && cost < best.cost)) && clear(points)) {
      best = { points, overlap, cost }
    }
  }
  const gap = end.x - start.x
  if (gap >= routeClearance * 2) {
    if (start.y === end.y) {
      consider([start, end])
    } else {
      const bends = [(start.x + end.x) / 2]
      if (gap >= routeLaneGap * 2) bends.push(start.x + routeLaneGap, end.x - routeLaneGap)
      for (const x of bends) consider([start, { x, y: start.y }, { x, y: end.y }, end])
    }
  }
  if (best?.cost === gap + Math.abs(end.y - start.y)) return best
  // Distant steps can leave and enter through a free side of the cards. Separate
  // these spans above/below the row instead of piling them onto the mainline ports.
  if (Math.abs(start.y - end.y) <= height * 2 && Math.abs(from.x - to.x) >= width) {
    for (const side of [-1, 1]) {
      const startY = from.y + (side > 0 ? height : 0)
      const endY = to.y + (side > 0 ? height : 0)
      const outerY = side > 0 ? Math.max(startY, endY) : Math.min(startY, endY)
      const freePort = (card, y) => {
        const center = card.x + width / 2
        for (const offset of [0, -16, 16, -32, 32]) {
          const x = center + offset
          if (!space.vertical.get(x)?.some(([a, b]) => a <= y && b >= y)) return x
        }
        return center
      }
      const x1 = freePort(from, startY)
      const x2 = freePort(to, endY)
      for (let lane = 0; lane < sideLanes; lane++) {
        const y = outerY + side * (routeLaneGap + lane * routeTrackSpacing)
        consider([{ x: x1, y: startY }, { x: x1, y }, { x: x2, y }, { x: x2, y: endY }])
      }
    }
  }
  const middleY = (start.y + end.y) / 2
  const nearby = [middleY, from.y - routeLaneGap, from.y + height + routeLaneGap,
    to.y - routeLaneGap, to.y + height + routeLaneGap]
  const detour = (y) => {
    for (const out of routeLeads) {
      for (const into of routeLeads) {
        const startX = start.x + out
        const endX = end.x - into
        consider([start, { x: startX, y: start.y }, { x: startX, y },
          { x: endX, y }, { x: endX, y: end.y }, end])
      }
    }
  }
  for (const y of new Set(nearby)) detour(y)
  if (!best || best.overlap || best.cost > Math.abs(gap) + Math.abs(end.y - start.y) + width) {
    const top = Math.min(from.y, to.y) - routeLaneGap
    const bottom = Math.max(from.y, to.y) + height + routeLaneGap
    for (let lane = 1; lane < sideLanes; lane++) {
      detour(top - lane * routeTrackSpacing)
      detour(bottom + lane * routeTrackSpacing)
    }
  }
  if (!best) {
    for (const y of [...tracks].sort((a, b) => Math.abs(a - middleY) - Math.abs(b - middleY))) {
      detour(y)
      if (best) break
    }
  }
  return best
}

function renderBusinessChainRoute(edge, points, direction) {
  const vertices = points.map((point) => orientBusinessChainPoint(point, direction))
  const segments = []
  let previous = vertices[0]
  const d = [`M ${previous.x} ${previous.y}`]
  for (const next of vertices.slice(1)) {
    const horizontal = previous.y === next.y
    const length = Math.abs(horizontal ? next.x - previous.x : next.y - previous.y)
    if (!length) continue
    d.push(horizontal ? `H ${next.x}` : `V ${next.y}`)
    segments.push({ start: previous, end: next, horizontal, length })
    previous = next
  }
  return { ...edge, d: d.join(' '), segments }
}

// Center text on horizontal runs; keep vertical labels upright beside their line.
export function placeBusinessChainLabel(segments, width, height, obstacles) {
  const gap = 4
  for (const segment of [...segments].sort((a, b) => b.length - a.length)) {
    const { start, end, horizontal, length } = segment
    const span = horizontal ? width : height
    const endMargin = horizontal ? 12 : gap
    if (length < span + 2 * endMargin) continue
    const low = Math.min(horizontal ? start.x : start.y, horizontal ? end.x : end.y) + endMargin
    const high = low + length - span - 2 * endMargin
    const sides = horizontal ? [start.y - height / 2] : [start.x - gap - width, start.x + gap]
    for (const near of sides) {
      const blocked = obstacles.filter((box) => box.segment !== segment && (horizontal
        ? box.top < near + height + gap && box.bottom > near - gap
        : box.left < near + width + gap && box.right > near - gap))
        .map((box) => horizontal ? [box.left, box.right] : [box.top, box.bottom])
      const middle = (low + high) / 2
      const candidates = [middle, ...blocked.flatMap(([a, b]) => [a - gap - span, b + gap])]
        .filter((pos) => pos >= low && pos <= high)
        .sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))
      const pos = candidates.find((value) => blocked.every(([a, b]) => value + span + gap <= a || value >= b + gap))
      if (pos === undefined) continue
      const left = horizontal ? pos : near
      const top = horizontal ? near : pos
      return { left, top, right: left + width, bottom: top + height }
    }
  }
  return null
}

// Choose gaps in the saved coordinate system so both directions use the same route.
export function businessChainRoutePoints({ nodes, edges, routePoints = new Map() }) {
  const remaining = edges.filter((edge) => !routePoints.has(edge.key))
  if (!remaining.length) return routePoints
  const { width, height } = CHAIN_DESIGN_NODE_SIZE
  const forward = businessChainRoutingSpace(nodes, width, height)
  const sideways = ({ x, y }) => ({ x: y, y: x })
  const cross = businessChainRoutingSpace(
    nodes.map((node) => ({ id: node.id, ...sideways(node) })), height, width, forward.vertical, forward.horizontal
  )
  const span = (edge) => {
    const from = forward.positions.get(edge.from)
    const to = forward.positions.get(edge.to)
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y)
  }
  // Reserve short mainline connections before placing branches; preserve SVG and keyboard order.
  const order = remaining.sort((a, b) => Number(b.kind === 'known') - Number(a.kind === 'known') || span(a) - span(b))
  const routes = new Map(routePoints)
  for (const points of routes.values()) reserveRoute(points, forward)
  for (const edge of order) {
    const from = forward.positions.get(edge.from)
    const to = forward.positions.get(edge.to)
    const sideFrom = cross.positions.get(edge.from)
    const sideTo = cross.positions.get(edge.to)
    const along = () => routeBetweenCards(forward, from, to)
    const across = () => {
      const reverse = from.y > to.y
      const route = reverse ? routeBetweenCards(cross, sideTo, sideFrom, 2) : routeBetweenCards(cross, sideFrom, sideTo, 2)
      if (!route) return null
      return { ...route, points: (reverse ? route.points.toReversed() : route.points).map(sideways) }
    }
    const sameColumn = from.x === to.x && Math.abs(to.y - from.y) >= height
    let route = sameColumn ? across() : along()
    if (!route || route.overlap) {
      const alternate = sameColumn ? along() : across()
      if (alternate && (!route || alternate.overlap < route.overlap)) route = alternate
    }
    let points = route?.points
    if (!points) {
      // Hand-placed cards can overlap and leave no unobstructed route.
      const start = { x: from.x + width, y: from.y + height / 2 }
      const end = { x: to.x, y: to.y + height / 2 }
      const middle = (start.x + end.x) / 2
      points = [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end]
    }
    reserveRoute(points, forward)
    routes.set(edge.key, points)
  }
  return routes
}

export function routeBusinessChainEdges(graph, direction = 'LR') {
  const points = businessChainRoutePoints(graph)
  return graph.edges.map((edge) => renderBusinessChainRoute(edge, points.get(edge.key), direction))
}
