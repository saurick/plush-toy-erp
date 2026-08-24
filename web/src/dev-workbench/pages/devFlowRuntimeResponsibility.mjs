function asArray(value) {
  return Array.isArray(value) ? value : []
}

function cleanText(value) {
  return String(value || '').trim()
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function matchingRuntimeDefinitions(definitions, context) {
  const instance = context?.process_instance
  if (!instance) return []
  const nodeKeys = unique(
    asArray(context.nodes).map((node) => cleanText(node?.node_key))
  )
  return asArray(definitions).filter(
    (definition) =>
      cleanText(definition?.processKey) === cleanText(instance.process_key) &&
      cleanText(definition?.processVersion) ===
        cleanText(instance.process_version) &&
      nodeKeys.every((nodeKey) =>
        asArray(definition?.nodes).some(
          (node) => cleanText(node?.key) === nodeKey
        )
      )
  )
}

function alignment(left, right) {
  if (!left || !right) return 'unverified'
  return left === right ? 'aligned' : 'different'
}

export function buildDevFlowRuntimeResponsibility({
  definitions = [],
  context = null,
  task = null,
} = {}) {
  const instance = context?.process_instance || null
  const matchedDefinitions = matchingRuntimeDefinitions(definitions, context)
  const responsibilityByNodeID = new Map(
    asArray(context?.current_responsibilities).map((item) => [
      Number(item?.node_instance_id || 0),
      cleanText(item?.owner_role_key),
    ])
  )
  const currentItems = asArray(context?.current_nodes).map((node) => {
    const nodeKey = cleanText(node?.node_key)
    const matchingNodes = matchedDefinitions.flatMap((definition) =>
      asArray(definition?.nodes).filter(
        (candidate) => cleanText(candidate?.key) === nodeKey
      )
    )
    const staticOwnerPoolKeys = unique(
      matchingNodes.map((candidate) => cleanText(candidate?.ownerPool))
    )
    const runtimeRoleKey = responsibilityByNodeID.get(Number(node?.id || 0))
    const staticRoleKey =
      staticOwnerPoolKeys.length === 1 ? staticOwnerPoolKeys[0] : ''
    return {
      nodeInstanceID: Number(node?.id || 0),
      nodeKey,
      nodeLabel:
        matchingNodes.map((candidate) => cleanText(candidate?.label))[0] ||
        nodeKey,
      staticOwnerPoolKeys,
      runtimeRoleKey,
      definitionAlignment: alignment(staticRoleKey, runtimeRoleKey),
    }
  })
  const definitionAlignments = currentItems
    .map((item) => item.definitionAlignment)
    .filter((value) => value !== 'unverified')
  const definitionAlignment = definitionAlignments.includes('different')
    ? 'different'
    : definitionAlignments.length > 0 &&
        definitionAlignments.length === currentItems.length
      ? 'aligned'
      : 'unverified'
  const linkedNodeID = Number(context?.linked_node?.id || 0)
  const linkedRuntimeRoleKey = responsibilityByNodeID.get(linkedNodeID) || ''
  const taskRoleKey = cleanText(task?.owner_role_key)

  return {
    processKey: cleanText(instance?.process_key),
    processVersion: cleanText(instance?.process_version),
    matchedDefinitions: matchedDefinitions.map((definition) => ({
      key: cleanText(definition?.key),
      label: cleanText(definition?.label),
      variantKey: cleanText(definition?.variantKey),
    })),
    currentItems,
    taskRoleKey,
    linkedRuntimeRoleKey,
    definitionAlignment,
    taskAlignment: alignment(taskRoleKey, linkedRuntimeRoleKey),
  }
}
