import { getPermissionCenterRoleName } from '../../erp/utils/permissionCenterAccess.mjs'

export const DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_VERSION =
  'dev-business-chain-customer-review/v1'

export const DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED = '当前正式合同未定义'

export const DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_COMPLETION_BOUNDARY =
  '流程或任务完成不等于库存、出货、生产或财务事实已经生效。'

export const DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_FOOTER =
  '本文件用于业务需求校对，不单独证明已经实现、发布或经甲方验收。'

const EXCEPTION_PATTERN =
  /拒绝|驳回|退回|取消|返工|报废|让步|冲正|超领|拒收|隔离|调整|退货|失败|阻塞/u

const EXCEPTION_GROUPS = Object.freeze([
  /拒绝|驳回/u,
  /退回/u,
  /取消/u,
  /返工/u,
  /报废/u,
  /让步/u,
  /冲正/u,
  /超领/u,
  /拒收/u,
  /隔离/u,
  /调整/u,
  /退货/u,
  /失败/u,
  /阻塞/u,
])

const CHAIN_KIND_LABELS = Object.freeze({
  primary: '业务主链',
  supporting: '支撑链',
  exception: '异常链',
  rework: '返工链',
  reversal: '冲正与纠正链',
})

const LAYER_GUIDANCE = Object.freeze({
  source_document: Object.freeze({
    systemAction: '保存单据和当前状态。',
    personAction: '核对单据并办理当前动作。',
    completion: '当前单据动作完成；后续业务结果是否生效另行判断。',
  }),
  masterdata_lifecycle: Object.freeze({
    systemAction: '校验并保存可用资料或版本。',
    personAction: '维护并确认资料完整、有效。',
    completion: '资料有效，可以被后续业务引用。',
  }),
  process_runtime: Object.freeze({
    systemAction: '按登记路线推进，必要时派发岗位任务。',
    personAction: '办理收到的岗位任务。',
    completion: '当前流程步骤结束；业务结果未必生效。',
  }),
  workflow_task: Object.freeze({
    systemAction: '记录分派、退回、完成或阻塞结果。',
    personAction: '责任岗位办理、退回或说明阻塞。',
    completion: '岗位任务已有办理结果；业务结果未必生效。',
  }),
  fact_ledger: Object.freeze({
    systemAction: '保存可追溯、可纠正的正式业务结果。',
    personAction: '核对并确认实际发生结果。',
    completion: '正式业务结果已生效，可按规则纠正。',
  }),
  derived_result: Object.freeze({
    systemAction: '按已生效的上游记录汇总。',
    personAction: '核对上游记录是否完整。',
    completion: '上游记录完整，计算结果已更新。',
  }),
})

const DIAGRAM_LEGEND = freezeList([
  { tone: 'normal', label: '业务资料或系统步骤' },
  { tone: 'person', label: '需要人员办理' },
  { tone: 'attention', label: '异常或纠正分支' },
  { tone: 'result', label: '正式业务结果' },
])

const OVERVIEW_DIAGRAM_LEGEND = freezeList([
  { tone: 'normal', label: '履约主链' },
  { tone: 'person', label: '供给与库存支撑' },
  { tone: 'attention', label: '异常与返工' },
  { tone: 'result', label: '冲正与纠正' },
])

const asArray = (value) => (Array.isArray(value) ? value : [])

const uniqueStrings = (values) => [
  ...new Set(
    asArray(values)
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ),
]

function freezeList(items) {
  return Object.freeze(items.map((item) => Object.freeze(item)))
}

function formatGeneratedAt(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) {
    throw new Error('customer review generatedAt is invalid')
  }
  return date.toISOString()
}

function collectProcessDefinitions(catalog, definitionKeys) {
  const definitionByKey = new Map(
    asArray(catalog?.processDefinitions).map((definition) => [
      definition.key,
      definition,
    ])
  )
  return uniqueStrings(definitionKeys)
    .map((key) => definitionByKey.get(key))
    .filter(Boolean)
}

function formalRoleLabel(roleKey) {
  const label = getPermissionCenterRoleName({ role_key: roleKey })
  return label === '已配置岗位' ? '' : label
}

function processDefinitionKeysForNode(chain, node) {
  const directKeys = uniqueStrings(node.processDefinitionKeys)
  if (directKeys.length > 0) return directKeys
  if (node.layer !== 'workflow_task') return []

  const adjacentNodeKeys = new Set(
    chain.edges
      .filter((edge) => edge.from === node.key || edge.to === node.key)
      .flatMap((edge) => [edge.from, edge.to])
  )
  const adjacentKeys = uniqueStrings(
    chain.nodes
      .filter(
        (candidate) =>
          adjacentNodeKeys.has(candidate.key) &&
          candidate.layer === 'process_runtime'
      )
      .flatMap((candidate) => candidate.processDefinitionKeys)
  )
  if (adjacentKeys.length > 0) return adjacentKeys

  return uniqueStrings(
    chain.nodes.flatMap((candidate) => candidate.processDefinitionKeys)
  )
}

function resolveResponsibleRole(catalog, chain, node) {
  const explicitRoleKeys = uniqueStrings(node.responsibleRoleKeys)
  const definitions = collectProcessDefinitions(
    catalog,
    processDefinitionKeysForNode(chain, node)
  )
  const ownerPools = uniqueStrings([
    ...explicitRoleKeys,
    ...(explicitRoleKeys.length > 0
      ? []
      : definitions.flatMap((definition) =>
          asArray(definition.nodes).map((candidate) => candidate.ownerPool)
        )),
  ])
  if (ownerPools.length === 0) {
    return DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED
  }

  const knownLabels = uniqueStrings(ownerPools.map(formalRoleLabel))
  const unknownCount = ownerPools.length - knownLabels.length
  if (knownLabels.length === 0) {
    return DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED
  }
  return unknownCount > 0
    ? `${knownLabels.join('、')}；其余岗位${DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED}`
    : knownLabels.join('、')
}

function nodeAction(node) {
  return `完成“${node.label}”对应的业务动作。`
}

function nodeTrigger(chain, node) {
  const nodeByKey = new Map(
    chain.nodes.map((candidate) => [candidate.key, candidate])
  )
  const incoming = chain.edges.filter((edge) => edge.to === node.key)
  if (incoming.length === 0) {
    return `“${node.label}”满足进入条件；其他统一条件${DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED}。`
  }
  return uniqueStrings(
    incoming.map((edge) => {
      const source = nodeByKey.get(edge.from)
      return `${source?.label || '上一步'}：${edge.label}`
    })
  ).join('；')
}

function nodeNext(chain, node) {
  const nodeByKey = new Map(
    chain.nodes.map((candidate) => [candidate.key, candidate])
  )
  const outgoing = chain.edges.filter((edge) => edge.from === node.key)
  if (outgoing.length === 0) {
    return `本链在此结束；后续${DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED}。`
  }
  return uniqueStrings(
    outgoing.map((edge) => {
      const target = nodeByKey.get(edge.to)
      return `${edge.label} → ${target?.label || '下一步'}`
    })
  ).join('；')
}

function escapeMermaid(value) {
  return String(value || '')
    .trim()
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', ' ')
}

function diagramToneForNode(node) {
  if (node.layer === 'workflow_task') return 'person'
  if (node.layer === 'fact_ledger' || node.layer === 'derived_result') {
    return 'result'
  }
  if (EXCEPTION_PATTERN.test(node.label)) return 'attention'
  return 'normal'
}

function appendDiagramStyles(lines) {
  lines.push(
    '  classDef normal fill:#edf8ef,stroke:#2b8a3e,color:#173f2a,stroke-width:1.5px',
    '  classDef person fill:#eaf3ff,stroke:#2f6fbd,color:#17365d,stroke-width:1.5px',
    '  classDef attention fill:#fff4e6,stroke:#c86b16,color:#6f3500,stroke-width:1.5px',
    '  classDef result fill:#f3edff,stroke:#7654b4,color:#34205f,stroke-width:1.5px'
  )
}

function buildChainDiagram(chain) {
  const ids = new Map(
    chain.nodes.map((node, index) => [node.key, `N${index + 1}`])
  )
  const lines = ['flowchart TB']
  chain.nodes.forEach((node, index) => {
    lines.push(
      `  ${ids.get(node.key)}["${index + 1}. ${escapeMermaid(node.label)}"]`
    )
  })
  chain.edges.forEach((edge, index) => {
    lines.push(
      `  ${ids.get(edge.from)} -->|"${escapeMermaid(edge.label)}"| ${ids.get(edge.to)}`
    )
    if (EXCEPTION_PATTERN.test(edge.label)) {
      lines.push(
        `  linkStyle ${index} stroke:#c86b16,stroke-width:2px,color:#6f3500`
      )
    }
  })
  appendDiagramStyles(lines)
  chain.nodes.forEach((node) => {
    lines.push(`  class ${ids.get(node.key)} ${diagramToneForNode(node)}`)
  })
  return Object.freeze({
    title: '先看图：业务怎么走',
    description: '按箭头看主路径；有分支时按箭头文字选择去向。',
    mermaidSource: lines.join('\n'),
    legend: DIAGRAM_LEGEND,
  })
}

function buildOverviewDiagram(catalog) {
  const chainByKey = new Map(
    asArray(catalog.businessChains).map((chain) => [chain.key, chain])
  )
  const idByChainKey = new Map()
  const lines = ['flowchart LR']
  let sequence = 0

  asArray(catalog.businessChainOverview?.lanes).forEach((lane, laneIndex) => {
    lines.push(`  subgraph L${laneIndex + 1}["${escapeMermaid(lane.label)}"]`)
    lines.push('    direction TB')
    asArray(lane.chainKeys).forEach((chainKey) => {
      const chain = chainByKey.get(chainKey)
      sequence += 1
      const id = `C${sequence}`
      idByChainKey.set(chainKey, id)
      lines.push(`    ${id}["${sequence}. ${escapeMermaid(chain?.label)}"]`)
    })
    lines.push('  end')
  })

  asArray(catalog.businessChainOverview?.relations).forEach((relation) => {
    lines.push(
      `  ${idByChainKey.get(relation.fromChainKey)} -->|"${escapeMermaid(relation.label)}"| ${idByChainKey.get(relation.toChainKey)}`
    )
  })
  appendDiagramStyles(lines)
  asArray(catalog.businessChains).forEach((chain) => {
    const tone =
      chain.kind === 'primary'
        ? 'normal'
        : chain.kind === 'supporting'
          ? 'person'
          : chain.kind === 'reversal'
            ? 'result'
            : 'attention'
    lines.push(`  class ${idByChainKey.get(chain.key)} ${tone}`)
  })

  return Object.freeze({
    title: '先看图：十二条业务链怎样衔接',
    description: '四个分区只展示链与链的关系，不展开每条链的内部步骤。',
    mermaidSource: lines.join('\n'),
    legend: OVERVIEW_DIAGRAM_LEGEND,
  })
}

function stateExceptionPaths(catalog, machineKeys) {
  const flowByKey = new Map(
    asArray(catalog?.flows).map((flow) => [flow.key, flow])
  )
  return uniqueStrings(
    uniqueStrings(machineKeys).flatMap((machineKey) => {
      const flow = flowByKey.get(machineKey)
      if (!flow) return []
      const stateByKey = new Map(
        asArray(flow.states).map((state) => [state.key, state.label])
      )
      return asArray(flow.transitions)
        .map((transition) => {
          const from = stateByKey.get(transition.from)
          const to = stateByKey.get(transition.to)
          if (!from || !to || !EXCEPTION_PATTERN.test(`${from}${to}`)) {
            return ''
          }
          return `${flow.label}：${from} → ${to}`
        })
        .filter(Boolean)
    })
  )
}

function processExceptionPaths(catalog, definitionKeys) {
  return uniqueStrings(
    collectProcessDefinitions(catalog, definitionKeys).flatMap((definition) => {
      const nodeByKey = new Map(
        asArray(definition.nodes).map((node) => [node.key, node.label])
      )
      return asArray(definition.edges)
        .map((edge) => {
          const from = nodeByKey.get(edge.from)
          const to = nodeByKey.get(edge.to)
          if (!from || !to || !EXCEPTION_PATTERN.test(`${from}${to}`)) {
            return ''
          }
          return `${definition.label}：${from} → ${to}`
        })
        .filter(Boolean)
    })
  )
}

function graphExceptionPaths(chain, node = null) {
  const nodeByKey = new Map(
    chain.nodes.map((candidate) => [candidate.key, candidate])
  )
  return uniqueStrings(
    chain.edges
      .filter((edge) => !node || edge.from === node.key || edge.to === node.key)
      .map((edge) => {
        const from = nodeByKey.get(edge.from)
        const to = nodeByKey.get(edge.to)
        const visibleText = `${from?.label || ''}${edge.label}${to?.label || ''}`
        if (!EXCEPTION_PATTERN.test(visibleText)) return ''
        return `${from?.label || '上一步'} → ${to?.label || '下一步'}：${edge.label}`
      })
      .filter(Boolean)
  )
}

function exceptionPathsForNode(catalog, chain, node) {
  const paths = uniqueStrings([
    ...graphExceptionPaths(chain, node),
    ...stateExceptionPaths(catalog, node.machineKeys),
    ...processExceptionPaths(
      catalog,
      processDefinitionKeysForNode(chain, node)
    ),
  ])
  return paths.length > 0
    ? Object.freeze(paths)
    : Object.freeze([DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED])
}

function compactExceptionPaths(paths) {
  const seenGroups = new Set()
  const compact = []
  for (const path of uniqueStrings(paths)) {
    const groups = EXCEPTION_GROUPS.flatMap((pattern, index) =>
      pattern.test(path) ? [index] : []
    )
    if (groups.length === 0 || groups.every((group) => seenGroups.has(group))) {
      continue
    }
    compact.push(path)
    groups.forEach((group) => seenGroups.add(group))
  }
  return Object.freeze(
    compact.length > 0
      ? compact
      : [DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED]
  )
}

function buildChainReview(catalog, chain) {
  const steps = chain.nodes.map((node, index) => {
    const layer = LAYER_GUIDANCE[node.layer]
    if (!layer) {
      throw new Error(
        `customer review does not support chain layer ${node.layer}`
      )
    }
    return {
      number: index + 1,
      name: node.label,
      action: nodeAction(node),
      responsibleRole: resolveResponsibleRole(catalog, chain, node),
      trigger: nodeTrigger(chain, node),
      systemAction: layer.systemAction,
      personAction: layer.personAction,
      completion: layer.completion,
      next: nodeNext(chain, node),
      exceptionPaths: exceptionPathsForNode(catalog, chain, node),
    }
  })
  const processKeys = uniqueStrings(
    chain.nodes.flatMap((node) => node.processDefinitionKeys)
  )
  const exceptionPaths = uniqueStrings([
    ...graphExceptionPaths(chain),
    ...chain.nodes.flatMap((node) =>
      stateExceptionPaths(catalog, node.machineKeys)
    ),
    ...processExceptionPaths(catalog, processKeys),
  ])
  const normalizedExceptionPaths =
    exceptionPaths.length > 0
      ? exceptionPaths
      : [DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED]

  return Object.freeze({
    chainName: chain.label,
    chainKind: CHAIN_KIND_LABELS[chain.kind] || '业务链',
    purpose: chain.summary,
    diagram: buildChainDiagram(chain),
    steps: freezeList(steps),
    displayExceptionPaths: compactExceptionPaths(normalizedExceptionPaths),
    exceptionPaths: Object.freeze(normalizedExceptionPaths),
  })
}

function buildOverviewReview(catalog) {
  const chainByKey = new Map(
    asArray(catalog.businessChains).map((chain) => [chain.key, chain])
  )
  let sequence = 0
  const lanes = asArray(catalog.businessChainOverview?.lanes).map((lane) => ({
    name: lane.label,
    purpose: lane.summary,
    chains: freezeList(
      asArray(lane.chainKeys).map((chainKey) => {
        const chain = chainByKey.get(chainKey)
        if (!chain) {
          throw new Error(
            'customer review overview references an unknown chain'
          )
        }
        sequence += 1
        return {
          number: sequence,
          name: chain.label,
          purpose: chain.summary,
        }
      })
    ),
  }))
  return Object.freeze({
    overviewName: '业务链总览',
    purpose: catalog.businessChainOverview.summary,
    compactOnly: true,
    detailBoundary:
      '本页只列业务链名称、用途和分区，不展开每条链的内部步骤、系统规则或开发证据。',
    lanes: freezeList(lanes),
    diagram: buildOverviewDiagram(catalog),
  })
}

export function buildDevBusinessChainCustomerReview({
  catalog,
  chainKey,
  generatedAt = new Date(),
}) {
  if (
    !catalog?.businessChainOverview?.key ||
    asArray(catalog?.businessChains).length === 0
  ) {
    throw new Error('customer review requires the business chain catalog')
  }
  const normalizedChainKey = String(chainKey || '').trim()
  const overviewSelected =
    normalizedChainKey === catalog.businessChainOverview.key
  const chain = overviewSelected
    ? null
    : catalog.businessChains.find((item) => item.key === normalizedChainKey)
  if (!overviewSelected && !chain) {
    throw new Error('customer review requires a known business chain')
  }

  const reviewContent = overviewSelected
    ? { overview: buildOverviewReview(catalog) }
    : { chain: buildChainReview(catalog, chain) }
  const subjectName = overviewSelected ? '业务链总览' : chain.label

  return Object.freeze({
    version: DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_VERSION,
    documentTitle: `业务链甲方校对版｜${subjectName}`,
    designScope: '产品通用设计校对稿',
    customerBinding: '未绑定客户发布版本',
    releaseVersion: '未绑定发布版本',
    generatedAt: formatGeneratedAt(generatedAt),
    applicableScope:
      '用于跨岗位、跨模块、状态和异常路径的业务需求校对；不包含真实业务记录、任务实例或业务凭证。',
    completionBoundary: DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_COMPLETION_BOUNDARY,
    footer: DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_FOOTER,
    ...reviewContent,
  })
}
