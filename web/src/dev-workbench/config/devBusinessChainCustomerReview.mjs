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

const CHAIN_KIND_LABELS = Object.freeze({
  primary: '业务主链',
  supporting: '支撑链',
  exception: '异常链',
  rework: '返工链',
  reversal: '冲正与纠正链',
})

const LAYER_GUIDANCE = Object.freeze({
  source_document: Object.freeze({
    systemAction:
      '系统保存业务单据及其当前状态，但不会仅凭单据状态认定后续业务结果已经生效。',
    personAction: '经办人员核对并办理这份业务单据允许的当前动作。',
    completion:
      '业务单据完成当前允许动作，并满足进入下一步的正式条件；单据状态不等于后续业务结果已经生效。',
  }),
  masterdata_lifecycle: Object.freeze({
    systemAction: '系统保存并校验可供后续引用的基础资料或有效版本。',
    personAction: '获授权人员维护并确认基础资料完整、有效。',
    completion:
      '基础资料已经生效并满足后续引用条件；停用或缺少有效版本时不能继续。',
  }),
  process_runtime: Object.freeze({
    systemAction: '系统按已登记路径推进，并在需要人工处理时创建对应岗位任务。',
    personAction: '人员只办理收到的岗位任务，不直接修改系统保存的流程轨迹。',
    completion:
      '当前流程步骤按正式结果结束并进入已登记的下一步；流程走完不代表业务结果已经生效。',
  }),
  workflow_task: Object.freeze({
    systemAction: '系统记录任务分派、办理结果和接棒关系。',
    personAction: '责任岗位办理、退回或说明阻塞原因。',
    completion:
      '任务留下完成、退回或阻塞记录；任务完成不等于库存、出货、生产或财务结果已经生效。',
  }),
  fact_ledger: Object.freeze({
    systemAction: '系统通过受控业务动作保存可以追溯和纠正的正式业务结果。',
    personAction: '有权限人员通过对应业务操作核对并确认实际发生结果。',
    completion: '正式业务凭证已经生效，并能按对应取消、调整或冲正规则纠正。',
  }),
  derived_result: Object.freeze({
    systemAction: '系统根据已经生效的上游记录计算或汇总结果。',
    personAction: '人员核对上游记录是否完整，不在计算结果上补造业务数据。',
    completion:
      '上游权威数据完整且计算结果已经更新；计算结果本身不会反写上游业务记录。',
  }),
})

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

function nodeAction(chain, node) {
  if (node.summary) return node.summary
  const outgoingLabels = uniqueStrings(
    chain.edges
      .filter((edge) => edge.from === node.key)
      .map((edge) => edge.label)
  )
  if (outgoingLabels.length === 0) {
    return `形成并核对“${node.label}”，作为这条业务链当前阶段的结果。`
  }
  return `核对并办理“${node.label}”，完成后按“${outgoingLabels.join(
    '；'
  )}”衔接。`
}

function nodeTrigger(chain, node) {
  const nodeByKey = new Map(
    chain.nodes.map((candidate) => [candidate.key, candidate])
  )
  const incoming = chain.edges.filter((edge) => edge.to === node.key)
  if (incoming.length === 0) {
    return `以“${node.label}”满足本链正式进入条件为前提；统一触发条件当前正式合同未定义。`
  }
  return uniqueStrings(
    incoming.map((edge) => {
      const source = nodeByKey.get(edge.from)
      return `“${source?.label || '上一步'}”完成“${edge.label}”后进入`
    })
  ).join('；')
}

function nodeNext(chain, node) {
  const nodeByKey = new Map(
    chain.nodes.map((candidate) => [candidate.key, candidate])
  )
  const outgoing = chain.edges.filter((edge) => edge.from === node.key)
  if (outgoing.length === 0) {
    return '本链在此结束；后续衔接由其他正式业务链或业务合同决定。'
  }
  return uniqueStrings(
    outgoing.map((edge) => {
      const target = nodeByKey.get(edge.to)
      return `${edge.label}，进入“${target?.label || '下一步'}”`
    })
  ).join('；')
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
      action: nodeAction(chain, node),
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

  return Object.freeze({
    chainName: chain.label,
    chainKind: CHAIN_KIND_LABELS[chain.kind] || '业务链',
    purpose: chain.summary,
    steps: freezeList(steps),
    exceptionPaths: Object.freeze(
      exceptionPaths.length > 0
        ? exceptionPaths
        : [DEV_BUSINESS_CHAIN_CUSTOMER_REVIEW_UNDEFINED]
    ),
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
