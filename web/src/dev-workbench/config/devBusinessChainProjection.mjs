import { getPermissionCenterRoleName } from '../../erp/utils/permissionCenterAccess.mjs'
import { WorkflowTaskDiscoveryCatalog as taskCatalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { fulfillmentStepMatchesRole } from '../../erp/utils/workflowFulfillment.mjs'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function uniqueStrings(values) {
  return Object.freeze([...new Set(asArray(values).filter(Boolean))])
}

function exactChain(catalog, chainKey) {
  const chain = asArray(catalog?.businessChains).find(
    (candidate) => candidate.key === chainKey
  )
  if (!chain) throw new Error(`unknown business chain projection: ${chainKey}`)
  return chain
}

export function buildDevBusinessChainProjection({
  catalog,
  chainKey,
  nodeKey = '',
}) {
  const chain = exactChain(catalog, chainKey)
  const node = nodeKey
    ? chain.nodes.find((candidate) => candidate.key === nodeKey)
    : null
  if (nodeKey && !node) {
    throw new Error(
      `unknown business chain node projection: ${chainKey}/${nodeKey}`
    )
  }
  const steps = Object.freeze(
    node
      ? chain.steps.filter(
          (step) => step.fromNodeKey === node.key || step.toNodeKey === node.key
        )
      : [...chain.steps]
  )
  const stepKeys = new Set(steps.map((step) => step.key))
  const scenarios = Object.freeze(
    chain.acceptanceScenarios.filter((scenario) =>
      scenario.stepKeys.some((key) => stepKeys.has(key))
    )
  )
  const machineKeys = uniqueStrings([
    ...(node?.machineKeys || []),
    ...steps.flatMap((step) =>
      step.preconditionStateRefs.map((ref) => ref.machineKey)
    ),
    ...steps.flatMap((step) =>
      step.resultStateRefs.map((ref) => ref.machineKey)
    ),
    ...steps.flatMap((step) =>
      step.stateTransitionRefs.map((ref) => ref.machineKey)
    ),
  ])
  const processDefinitionKeys = uniqueStrings([
    ...(node?.processDefinitionKeys || []),
    ...steps.flatMap((step) =>
      step.processNodeRefs.map((ref) => ref.processDefinitionKey)
    ),
  ])
  const factKeys = uniqueStrings([
    ...(node?.factKeys || []),
    ...steps.flatMap((step) => step.factKeys),
  ])
  const ownerPoolKeys = uniqueStrings(
    steps.flatMap((step) => step.responsibility.ownerPoolKeys)
  )
  const capabilityKeys = uniqueStrings(
    steps.flatMap((step) => step.responsibility.capabilityKeys)
  )
  const roleModes = uniqueStrings(steps.map((step) => step.responsibility.mode))
  return Object.freeze({
    chain,
    node,
    steps,
    scenarios,
    machineKeys,
    processDefinitionKeys,
    factKeys,
    responsibility: Object.freeze({
      modes: roleModes,
      ownerPoolKeys,
      capabilityKeys,
    }),
    flows: Object.freeze(
      machineKeys.flatMap((key) =>
        asArray(catalog.flows).filter((flow) => flow.key === key)
      )
    ),
    processDefinitions: Object.freeze(
      processDefinitionKeys.flatMap((key) =>
        asArray(catalog.processDefinitions).filter(
          (definition) => definition.key === key
        )
      )
    ),
    factDefinitions: Object.freeze(
      factKeys.flatMap((key) =>
        asArray(catalog.factDefinitions).filter(
          (definition) => definition.factKey === key
        )
      )
    ),
    readOnly: true,
    allowsActionExecution: false,
  })
}

export function projectDevBusinessChainRoles(projection, roles) {
  const ownerPoolKeys = new Set(projection.responsibility.ownerPoolKeys)
  const capabilityKeys = new Set(projection.responsibility.capabilityKeys)
  return Object.freeze(
    asArray(roles)
      .filter(
        (role) =>
          asArray(role.ownerPools).some((key) => ownerPoolKeys.has(key)) ||
          asArray(role.capabilityKeys).some((key) => capabilityKeys.has(key))
      )
      .map((role) =>
        Object.freeze({
          roleKey: role.roleKey,
          displayName: role.displayName,
          ownerPoolKeys: Object.freeze(
            asArray(role.ownerPools).filter((key) => ownerPoolKeys.has(key))
          ),
          capabilityKeys: Object.freeze(
            asArray(role.capabilityKeys).filter((key) =>
              capabilityKeys.has(key)
            )
          ),
        })
      )
  )
}

// Describe each action independently. Adjacent actions include rejection and reversal,
// so their states must never become one combined completion requirement.
export function describeDevBusinessChainStep(catalog, step) {
  const stateLabel = (machineKey, stateKey) => {
    const flow = catalog.flows.find((item) => item.key === machineKey)
    const value = flow?.states.find((item) => item.key === stateKey)
    if (!value) {
      throw new Error(`unknown chain state: ${machineKey}/${stateKey}`)
    }
    return `${flow.label}为“${value.label}”`
  }
  const transitions = step.stateTransitionRefs.map(
    (ref) =>
      `${stateLabel(ref.machineKey, ref.from)} → ${stateLabel(ref.machineKey, ref.to)}`
  )
  const results = step.resultStateRefs
    .filter(
      (ref) =>
        !step.stateTransitionRefs.some(
          (transition) =>
            transition.machineKey === ref.machineKey &&
            transition.to === ref.stateKey
        )
    )
    .map((ref) => stateLabel(ref.machineKey, ref.stateKey))
  const preconditions = step.preconditionStateRefs
    .filter(
      (ref) =>
        !step.stateTransitionRefs.some(
          (transition) =>
            transition.machineKey === ref.machineKey &&
            transition.from === ref.stateKey
        )
    )
    .map((ref) => stateLabel(ref.machineKey, ref.stateKey))
  return {
    key: step.key,
    label: step.label,
    condition: step.condition || '',
    preconditions,
    results: [...transitions, ...results],
  }
}

export function describeDevBusinessChainNode(catalog, chain, node) {
  const outgoing = chain.steps.filter((step) => step.fromNodeKey === node.key)
  const steps = outgoing.length
    ? outgoing
    : chain.steps.filter((step) => step.toNodeKey === node.key)
  return steps.map((step) => describeDevBusinessChainStep(catalog, step))
}

export function describeDevBusinessChainResponsibility(responsibility) {
  const ownerPools = uniqueStrings(responsibility.ownerPoolKeys)
  const labels = ownerPools.map((key) =>
    getPermissionCenterRoleName({ role_key: key })
  )
  const knownLabels = labels.filter((label) => label !== '已配置岗位')
  const modes = new Set(responsibility.modes || [responsibility.mode])
  const result = [...knownLabels]
  if (
    modes.has('human') &&
    (knownLabels.length !== ownerPools.length ||
      ownerPools.length === 0)
  ) {
    result.push('具有对应业务权限的岗位')
  }
  if (modes.has('system')) result.push('系统自动处理')
  if (modes.has('derived')) result.push('系统按已生效结果计算')
  return uniqueStrings(result).join('、')
}

// Reuse the business handoffs where they are registered. Financial follow-through
// comes from the same topic contracts, rather than a second role/action catalogue.
export function buildDevBusinessChainRoleGuide(catalog, chainKey) {
  const chain = exactChain(catalog, chainKey)
  const fulfillment = taskCatalog.fulfillment_flow.filter(
    (item) => item.business_chain === chainKey
  )
  const happySteps = new Set(
    chain.acceptanceScenarios
      .filter((scenario) => scenario.kind === 'happy_path')
      .flatMap((scenario) => scenario.stepKeys)
  )
  const actions = chain.steps.filter((item) => {
    if (!fulfillment.length) return true
    const target = chain.nodes.find((node) => node.key === item.toNodeKey)
    return target.machineKeys.includes('fact.finance')
  })
  return Object.freeze([
    ...fulfillment,
    ...actions.map((item) => {
      const description = describeDevBusinessChainStep(catalog, item)
      const source = chain.nodes.find((node) => node.key === item.fromNodeKey)
      const target = chain.nodes.find((node) => node.key === item.toNodeKey)
      return Object.freeze({
        stage: item.key,
        stages: [],
        business_chain: chainKey,
        nodeKey: source.key,
        label: item.label,
        role: describeDevBusinessChainResponsibility(item.responsibility),
        role_keys: item.responsibility.mode === 'human'
          ? item.responsibility.ownerPoolKeys
          : [],
        result: description.results.join('；') || `核对${target.label}的正式结果；协同完成不代表业务已经入账。`,
        handoffs: [
          description.condition,
          description.preconditions.length
            ? `开始条件：${description.preconditions.join('；')}`
            : '',
          `来源：${source.label}；交接结果：${target.label}。`,
        ].filter(Boolean),
        branch: Boolean(item.condition) || !happySteps.has(item.key),
      })
    }),
  ])
}

export function buildDevBusinessChainTopics(catalog, role = 'all') {
  const topics = new Map(catalog.businessChains.map((chain) => {
    const steps = buildDevBusinessChainRoleGuide(catalog, chain.key)
    const matchingSteps = steps.filter((step) => fulfillmentStepMatchesRole(step, role))
    return [chain.key, { chain, steps, matchingSteps }]
  }))
  return catalog.businessChainOverview.lanes.map((lane) => ({
    ...lane,
    topics: lane.chainKeys.map((key) => topics.get(key))
      .filter((topic) => role === 'all' || topic.matchingSteps.length > 0),
  })).filter((lane) => lane.topics.length > 0)
}

export function buildChainMermaid(chain, currentRuntimeNodeKey, { compact = false } = {}) {
  if (!chain) return ''
  const ids = new Map(chain.nodes.map((node, index) => [node.key, `N${index}`]))
  const label = (value) => {
    const text = String(value)
    const width = Math.max(1, Math.ceil(text.length / Math.ceil(text.length / 10)))
    return compact ? (text.match(new RegExp(`.{1,${width}}`, 'gu')) || []).map(escapeGraphLabel).join('<br/>') : escapeGraphLabel(text)
  }
  const lines = ['---', 'config:', '  flowchart:', '    nodeSpacing: 24', '    rankSpacing: 24', '    padding: 12', '---', 'flowchart LR']
  for (const node of chain.nodes) {
    lines.push(`  ${ids.get(node.key)}["${label(node.label)}"]`)
  }
  for (const edge of chain.edges) {
    const condition = compact ? edge.condition || (['posts_fact', 'returns', 'reverses', 'requires', 'reworks'].includes(edge.kind) ? edge.label : '') : edge.label
    lines.push(`  ${ids.get(edge.from)} -->${condition ? `|"${label(condition)}"|` : ''} ${ids.get(edge.to)}`)
  }
  lines.push(
    '  classDef source_document fill:#e6f4ff,stroke:#1677ff,color:#102a43',
    '  classDef masterdata_lifecycle fill:#f9f0ff,stroke:#722ed1,color:#2d1648',
    '  classDef process_runtime fill:#fff7e6,stroke:#d46b08,color:#452500',
    '  classDef workflow_task fill:#f6ffed,stroke:#389e0d,color:#163300',
    '  classDef fact_ledger fill:#fff1f0,stroke:#cf1322,color:#3d0b0b',
    '  classDef derived_result fill:#f0f5ff,stroke:#2f54eb,color:#061b57',
    '  classDef runtime_current fill:#fffbe6,stroke:#fa8c16,stroke-width:4px,color:#422006'
  )
  for (const node of chain.nodes) {
    const classes = [node.layer]
    if (node.key === currentRuntimeNodeKey) classes.push('runtime_current')
    lines.push(`  class ${ids.get(node.key)} ${classes.join(',')}`)
  }
  return lines.join('\n')
}

const escapeGraphLabel = (value) => String(value).replaceAll('"', '#quot;').replaceAll('<', '#lt;').replaceAll('>', '#gt;')
