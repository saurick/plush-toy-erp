import { getPermissionCenterRoleName } from '../../erp/utils/permissionCenterAccess.mjs'

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
      asArray(catalog.flows).filter((flow) => machineKeys.includes(flow.key))
    ),
    processDefinitions: Object.freeze(
      asArray(catalog.processDefinitions).filter((definition) =>
        processDefinitionKeys.includes(definition.key)
      )
    ),
    factDefinitions: Object.freeze(
      asArray(catalog.factDefinitions).filter((definition) =>
        factKeys.includes(definition.factKey)
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
      asArray(responsibility.capabilityKeys).length > 0 ||
      ownerPools.length === 0)
  ) {
    result.push('具有对应业务权限的岗位')
  }
  if (modes.has('system')) result.push('系统自动处理')
  if (modes.has('derived')) result.push('系统按已生效结果计算')
  return uniqueStrings(result).join('、')
}
