export function businessFlowEdges(flow) {
  return flow.edges.map((edge) => ({
    ...edge,
    key:
      edge.key ||
      [edge.from, edge.to, edge.label || '', edge.condition || ''].join(':'),
  }))
}

export function buildBusinessFlowLayout(flow) {
  const keys = flow.nodes.map((node) => node.key).sort()
  const outgoing = new Map(keys.map((key) => [key, []]))
  const incoming = new Map(keys.map((key) => [key, 0]))
  const edges = businessFlowEdges(flow)
  if (
    new Set(keys).size !== keys.length ||
    new Set(edges.map((edge) => edge.key)).size !== edges.length
  ) {
    throw new Error('Duplicate business graph key')
  }
  for (const edge of edges) {
    if (!outgoing.has(edge.from) || !outgoing.has(edge.to)) {
      throw new Error('Unknown business graph endpoint')
    }
    outgoing.get(edge.from).push(edge)
    incoming.set(edge.to, incoming.get(edge.to) + 1)
  }
  for (const list of outgoing.values()) {
    list.sort((a, b) => `${a.to}:${a.key}`.localeCompare(`${b.to}:${b.key}`))
  }
  const colors = new Map()
  const cycles = new Set()
  const visit = (key) => {
    colors.set(key, 1)
    for (const edge of outgoing.get(key)) {
      if (colors.get(edge.to) === 1) cycles.add(edge.key)
      else if (!colors.has(edge.to)) visit(edge.to)
    }
    colors.set(key, 2)
  }
  const roots = [
    ...(flow.entryNodeKeys || []),
    ...keys.filter((key) => !incoming.get(key)),
    ...keys,
  ]
  for (const key of roots) if (outgoing.has(key) && !colors.has(key)) visit(key)
  const degree = new Map(keys.map((key) => [key, 0]))
  const ranks = new Map(keys.map((key) => [key, 0]))
  for (const edge of edges) {
    if (!cycles.has(edge.key)) degree.set(edge.to, degree.get(edge.to) + 1)
  }
  const queue = keys.filter((key) => !degree.get(key))
  while (queue.length) {
    const key = queue.shift()
    for (const edge of outgoing.get(key)) {
      if (!cycles.has(edge.key)) {
        ranks.set(edge.to, Math.max(ranks.get(edge.to), ranks.get(key) + 1))
        degree.set(edge.to, degree.get(edge.to) - 1)
        if (!degree.get(edge.to)) {
          queue.push(edge.to)
          queue.sort()
        }
      }
    }
  }
  return {
    edges,
    ranks,
    cycles,
    branchTargets: new Set(
      flow.nodes
        .filter((node) => node.exception_guide || node.risk)
        .map((node) => node.key)
    ),
    levels: Math.max(0, ...ranks.values()) + 1,
  }
}

export function buildBusinessFlowWires(layout, { width, nodes, labels }) {
  const paths = []
  let lane = 0
  const boxes = [...Object.entries(nodes), ...Object.entries(labels)]
  const blocked = (x, y1, y2, omit) =>
    boxes.some(
      ([key, r]) =>
        !omit.includes(key) &&
        x > r.x + 2 &&
        x < r.x + r.width - 2 &&
        Math.min(y1, y2) < r.y + r.height - 2 &&
        Math.max(y1, y2) > r.y + 2
    )
  for (const edge of layout.edges) {
    const a = nodes[edge.from]
    const z = nodes[edge.to]
    const label = labels[edge.key]
    if (!a || !z || !label || !width) continue
    const cx = (r) => r.x + r.width / 2
    const bottom = (r) => r.y + r.height
    const sourceBottom =
      Math.max(
        ...Object.entries(nodes)
          .filter(
            ([key]) => layout.ranks.get(key) === layout.ranks.get(edge.from)
          )
          .map(([, r]) => bottom(r))
      ) + 9
    const labelBottom =
      Math.max(
        ...Object.values(labels)
          .filter((r) => Math.abs(r.y - label.y) < 2)
          .map(bottom)
      ) + 8
    const side =
      lane++ % 2 === 0 ? width - 5 - (lane % 7) * 3 : 5 + (lane % 7) * 3
    let d = `M ${cx(a)} ${bottom(a)}`
    d += blocked(cx(a), bottom(a), sourceBottom, [edge.from])
      ? ` V ${bottom(a) + 6} H ${a.x - 8} V ${sourceBottom} H ${cx(a)}`
      : ` V ${sourceBottom}`
    d += blocked(cx(label), sourceBottom, label.y, [edge.from, edge.key])
      ? ` H ${side} V ${label.y - 8} H ${cx(label)} V ${label.y}`
      : ` H ${cx(label)} V ${label.y}`
    d += ` M ${cx(label)} ${bottom(label)} V ${labelBottom}`
    d +=
      layout.cycles.has(edge.key) ||
      layout.ranks.get(edge.to) !== layout.ranks.get(edge.from) + 1 ||
      blocked(cx(z), labelBottom, z.y, [edge.to, edge.key])
        ? ` H ${side} V ${z.y - 12} H ${cx(z)} V ${z.y - 3}`
        : ` H ${cx(z)} V ${z.y - 3}`
    paths.push({
      ...edge,
      d,
      branch:
        layout.cycles.has(edge.key) ||
        layout.branchTargets.has(edge.to) ||
        ['return', 'returns', 'reverses', 'terminates', 'branches_to'].includes(
          edge.kind
        ),
    })
  }
  return paths
}
