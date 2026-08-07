function asArray(value) {
  return Array.isArray(value) ? value : []
}

function selectOption(value, businessLabel, machineKey = '') {
  const label = machineKey ? `${businessLabel} · ${machineKey}` : businessLabel
  return {
    value,
    label,
    title: label,
    businessLabel,
    machineKey,
  }
}

function selectGroup(key, label, options) {
  if (options.length === 0) {
    throw new Error(`definition select group is empty: ${key}`)
  }
  return {
    key,
    label: `${label} · ${options.length}`,
    businessGroupLabel: label,
    options,
  }
}

function assertExactCoverage(items, options, keyOf, label) {
  const expectedKeys = items.map(keyOf)
  const optionKeys = options.flatMap((option) =>
    asArray(option.options).length > 0
      ? option.options.map((item) => item.value)
      : [option.value]
  )
  if (
    optionKeys.length !== expectedKeys.length ||
    new Set(optionKeys).size !== optionKeys.length ||
    expectedKeys.some((key) => !optionKeys.includes(key))
  ) {
    throw new Error(`${label} select groups do not exactly cover the catalog`)
  }
}

export function buildBusinessChainSelectOptions(catalog) {
  const chains = asArray(catalog?.businessChains)
  const overview = catalog?.businessChainOverview
  const lanes = asArray(overview?.lanes)
  const chainByKey = new Map(chains.map((chain) => [chain.key, chain]))
  if (!overview?.key || !overview?.label || lanes.length === 0) {
    throw new Error('business chain select is missing its overview groups')
  }

  const groups = lanes.map((lane) =>
    selectGroup(
      `chain:${lane.key}`,
      lane.label,
      asArray(lane.chainKeys).map((chainKey) => {
        const chain = chainByKey.get(chainKey)
        if (!chain) {
          throw new Error(`business chain select references ${chainKey}`)
        }
        return selectOption(chain.key, chain.label)
      })
    )
  )
  assertExactCoverage(chains, groups, (chain) => chain.key, 'business chain')
  return [selectOption(overview.key, overview.label), ...groups]
}

function factGroupDefinitions(catalog, group) {
  return asArray(catalog?.factDefinitions).filter(
    (definition) => definition.displayGroupKey === group.key
  )
}

export function buildFactDefinitionSelectOptions(catalog) {
  const definitions = asArray(catalog?.factDefinitions)
  const groups = asArray(catalog?.factDefinitionGroups).map((group) =>
    selectGroup(
      `fact:${group.key}`,
      group.label,
      factGroupDefinitions(catalog, group).map((definition) =>
        selectOption(definition.factKey, definition.label, definition.factKey)
      )
    )
  )
  assertExactCoverage(
    definitions,
    groups,
    (definition) => definition.factKey,
    'fact definition'
  )
  return groups
}

export function buildStateDefinitionSelectOptions(catalog) {
  const flows = asArray(catalog?.flows)
  const scopes = asArray(catalog?.scopes)
  const scopeByKey = new Map(scopes.map((scope) => [scope.key, scope]))
  const factDefinitionByKey = new Map(
    asArray(catalog?.factDefinitions).map((definition) => [
      definition.factKey,
      definition,
    ])
  )
  const handledScopes = new Set()
  const groups = []

  for (const flow of flows) {
    if (handledScopes.has(flow.scopeKey)) continue
    handledScopes.add(flow.scopeKey)
    const scope = scopeByKey.get(flow.scopeKey)
    if (!scope) {
      throw new Error(`state select references unknown scope ${flow.scopeKey}`)
    }

    if (flow.scopeKey === 'fact_ledger') {
      for (const factGroup of asArray(catalog?.factDefinitionGroups)) {
        const options = flows
          .filter((candidate) => {
            if (candidate.scopeKey !== 'fact_ledger') return false
            return (
              factDefinitionByKey.get(candidate.key)?.displayGroupKey ===
              factGroup.key
            )
          })
          .map((candidate) =>
            selectOption(candidate.key, candidate.label, candidate.key)
          )
        groups.push(
          selectGroup(
            `state:${flow.scopeKey}:${factGroup.key}`,
            `${scope.label} · ${factGroup.label}`,
            options
          )
        )
      }
      continue
    }

    const options = flows
      .filter((candidate) => candidate.scopeKey === flow.scopeKey)
      .map((candidate) =>
        selectOption(candidate.key, candidate.label, candidate.key)
      )
    groups.push(selectGroup(`state:${flow.scopeKey}`, scope.label, options))
  }

  assertExactCoverage(flows, groups, (flow) => flow.key, 'state definition')
  return groups
}
