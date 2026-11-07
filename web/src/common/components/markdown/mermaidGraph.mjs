// IDs are generated locally; business keys and labels never become executable Mermaid syntax.
export const escapeBusinessGraphLabel = (value) =>
  String(value ?? '').replace(
    /[&"<>|\\#%\r\n]/gu,
    (character) =>
      ({
        '&': '#38;',
        '"': '#34;',
        '<': '#60;',
        '>': '#62;',
        '|': '#124;',
        '\\': '#92;',
        '#': '#35;',
        '%': '#37;',
        '\r': ' ',
        '\n': '<br/>',
      })[character]
  )

const labelSegments = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })

// Wrap before escaping so entities and grapheme clusters remain intact.
export function formatBusinessGraphLabel(value) {
  const lines = String(value ?? '').split('\n').flatMap((line) => {
    const segments = [...labelSegments.segment(line)].map(({ segment }) => ({
      segment,
      advance: segment.codePointAt(0) <= 0xff ? 1 : 2,
    }))
    const total = segments.reduce((width, item) => width + item.advance, 0)
    let remaining = total
    let lineWidth = Math.ceil(remaining / Math.max(1, Math.ceil(remaining / 10)))
    const wrapped = []
    let text = ''
    let width = 0
    for (const { segment, advance } of segments) {
      if (text && width + advance > lineWidth) {
        wrapped.push(text)
        remaining -= width
        lineWidth = Math.ceil(remaining / Math.max(1, Math.ceil(remaining / 10)))
        text = ''
        width = 0
      }
      text += segment
      width += advance
    }
    return [...wrapped, text]
  })
  return escapeBusinessGraphLabel(lines.join('\n'))
}

export function businessFlowEdges(flow) {
  const keys = new Set(flow.nodes.map((node) => node.key))
  const edges = flow.edges.map((edge) => ({
    ...edge,
    key:
      edge.key ||
      [edge.from, edge.to, edge.label || '', edge.condition || ''].join(':'),
  }))
  if (
    keys.size !== flow.nodes.length ||
    new Set(edges.map((edge) => edge.key)).size !== edges.length
  ) {
    throw new Error('Duplicate business graph key')
  }
  if (edges.some((edge) => !keys.has(edge.from) || !keys.has(edge.to))) {
    throw new Error('Unknown business graph endpoint')
  }
  return edges
}

// Paper-sized subsets retain every relationship; repeated endpoints join the parts.
export function splitBusinessFlowForPrint(flow, maxEdges = 3) {
  if (!Number.isInteger(maxEdges) || maxEdges < 1)
    { throw new RangeError('Print relationship limit must be positive') }
  const edges = businessFlowEdges(flow)
  const parts = []
  const used = new Set()
  let selected = []
  const sources = new Set()
  const targets = new Set()
  const appendPart = () => {
    if (!selected.length) return
    const keys = new Set(selected.flatMap((edge) => [edge.from, edge.to]))
    keys.forEach((key) => used.add(key))
    parts.push({
      ...flow,
      direction: 'LR',
      groups: undefined,
      nodes: flow.nodes.filter((node) => keys.has(node.key)),
      edges: selected,
    })
    selected = []
    sources.clear()
    targets.clear()
  }
  for (const edge of edges) {
    // Forks and joins need separate diagrams to keep long conditions distinct.
    if (selected.length === maxEdges || sources.has(edge.from) || targets.has(edge.to)) appendPart()
    selected.push(edge)
    sources.add(edge.from)
    targets.add(edge.to)
  }
  appendPart()
  const isolated = flow.nodes.filter((node) => !used.has(node.key))
  for (let offset = 0; offset < isolated.length; offset += 6)
    { parts.push({
      ...flow,
      direction: 'LR',
      groups: undefined,
      nodes: isolated.slice(offset, offset + 6),
      edges: [],
    }) }
  return parts
}

export function buildBusinessFlowMermaid(
  flow,
  { role = 'all', matchingKeys, runtimeKey } = {}
) {
  const edges = businessFlowEdges(flow)
  const ids = new Map(flow.nodes.map((node, index) => [node.key, `N${index}`]))
  const labelByKey = new Map(
    flow.nodes.map((node) => [node.key, node.label || node.key])
  )
  const vertical = flow.direction === 'TB' || flow.direction === 'TD' || (!flow.direction && edges.length === 0)
  const curve = flow.curve === 'basis' ? 'basis' : 'step'
  const lines = ['---', 'config:', '  flowchart:', '    nodeSpacing: 28', '    rankSpacing: 24', '    padding: 12', `    curve: ${curve}`, '---', vertical ? 'flowchart TB' : 'flowchart LR']
  const layerLabels = {
    source_document: '单据',
    masterdata_lifecycle: '基础资料',
    process_runtime: '流程',
    workflow_task: '协同任务',
    fact_ledger: '业务事实',
    derived_result: '结果',
    topic: '专题',
    terminal: '结束',
  }
  const definition = (node) => {
    const subtitle = [
      ...new Set(
        [
          node.role || layerLabels[node.kind || node.layer],
          node.key === runtimeKey ? '实例所在' : '',
          node.terminal || node.kind === 'terminal' ? '结束' : '',
        ].filter(Boolean)
      ),
    ].join(' · ')
    const label = formatBusinessGraphLabel(
      [node.label || node.key, subtitle].filter(Boolean).join('\n')
    )
    return `  ${ids.get(node.key)}${node.terminal || node.kind === 'terminal' ? `(["${label}"])` : `["${label}"]`}`
  }
  const grouped = new Set()
  for (const [index, group] of (flow.groups || []).entries()) {
    lines.push(
      `  subgraph G${index}["${escapeBusinessGraphLabel(group.label)}"]`
    )
    for (const key of group.nodeKeys) {
      if (!ids.has(key) || grouped.has(key)) {
        throw new Error('Unknown or duplicate business graph group member')
      }
      lines.push(definition(flow.nodes.find((node) => node.key === key)))
      grouped.add(key)
    }
    lines.push('  end')
  }
  lines.push(
    ...flow.nodes.filter((node) => !grouped.has(node.key)).map(definition)
  )
  const interactiveEdges = edges.map((edge, index) => {
    const branch = Boolean(
      edge.branch ||
      edge.dasharray ||
      ['return', 'returns', 'reverses', 'terminates', 'branches_to'].includes(
        edge.kind
      )
    )
    const id = `E${index}`
    const edgeLabel = edge.label || (edge.condition ? '办理条件' : '')
    lines.push(
      `  ${ids.get(edge.from)} ${id}@${branch ? '-.->' : '-->'}${edgeLabel ? `|"${formatBusinessGraphLabel(edgeLabel)}"|` : ''} ${ids.get(edge.to)}`
    )
    if (/^#[\da-f]{3,8}$/iu.test(edge.stroke || '')) {
      lines.push(`  linkStyle ${index} stroke:${edge.stroke}`)
    }
    return {
      id,
      label: `查看条件：${edge.label || `${labelByKey.get(edge.from)} → ${labelByKey.get(edge.to)}`}`,
      description: edge.condition || edge.label || '',
      key: edge.key,
      from: edge.from,
      to: edge.to,
      branch,
      selectId: ids.get(edge.from),
      data: {
        'graph-edge': edge.key,
        from: edge.from,
        to: edge.to,
        branch: branch || undefined,
      },
    }
  })
  const nodes = flow.nodes.map((node) => {
    const roleMatch = Boolean(
      node.match ||
      (matchingKeys
        ? matchingKeys.has(node.key)
        : role !== 'all' && node.role_keys?.includes(role))
    )
    const classes = [node.risk || node.exception_guide ? 'branch' : ''].filter(
      Boolean
    )
    if (classes.length) {
      lines.push(`  class ${ids.get(node.key)} ${classes.join(',')}`)
    }
    return {
      ...node,
      id: ids.get(node.key),
      label: node.accessibleLabel || node.label || node.key,
      description: node.summary || node.condition || '',
      data: {
        'graph-node': node.key,
        kind: node.terminal ? 'terminal' : node.kind || node.layer,
        risk: node.risk || undefined,
        'role-match': roleMatch || undefined,
        'runtime-current': node.key === runtimeKey || undefined,
        ...node.data,
      },
    }
  })
  lines.push('  classDef branch stroke-dasharray:4 4')
  return { chart: lines.join('\n'), nodes, edges: interactiveEdges, ids }
}
