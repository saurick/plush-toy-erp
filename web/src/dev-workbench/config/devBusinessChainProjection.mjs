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
