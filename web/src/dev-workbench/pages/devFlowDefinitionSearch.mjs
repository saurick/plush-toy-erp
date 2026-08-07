const MIN_EMBEDDED_ASCII_LENGTH = 4
const MIN_EMBEDDED_CJK_LENGTH = 2
const SEARCH_TOKEN_SEPARATOR = /[\s,，;；、|+＋]+/gu
const SEARCH_TERM_ALIASES = Object.freeze({
  发货: Object.freeze(['出货']),
  待发货: Object.freeze(['待出货', '出货']),
  待出货: Object.freeze(['待发货', '出货']),
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function normalizeDevFlowDefinitionSearchText(value) {
  return typeof value === 'string'
    ? value
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/gu, '')
        .replace(/\s+/gu, ' ')
        .trim()
        .toLocaleLowerCase('zh-CN')
    : ''
}

function candidate(value, context = '', target = {}, priority = 1) {
  return { value, context, priority, ...target }
}

function uniqueCandidates(values) {
  const seen = new Set()
  return values.filter((item) => {
    const normalized = normalizeDevFlowDefinitionSearchText(item?.value)
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function isUsefulEmbeddedTerm(value) {
  const compact = value.replace(/\s+/gu, '')
  if (/\p{Script=Han}/u.test(compact)) {
    return Array.from(compact).length >= MIN_EMBEDDED_CJK_LENGTH
  }
  return compact.length >= MIN_EMBEDDED_ASCII_LENGTH
}

function matchCandidate(item, normalizedTerm, { allowEmbedded = false } = {}) {
  const normalizedValue = normalizeDevFlowDefinitionSearchText(item.value)
  let rank = 0
  if (normalizedValue === normalizedTerm) rank = 4
  else if (normalizedValue.includes(normalizedTerm)) rank = 3
  else if (
    allowEmbedded &&
    isUsefulEmbeddedTerm(normalizedValue) &&
    normalizedTerm.includes(normalizedValue)
  ) {
    rank = 2
  }
  if (rank === 0) return null
  return {
    ...item,
    score:
      rank * 1_000_000 +
      item.priority * 10_000 +
      Array.from(normalizedValue).length,
  }
}

function findBestTermMatch(normalizedTerm, values, options = {}) {
  let best = null
  for (const item of values) {
    const match = matchCandidate(item, normalizedTerm, options)
    if (match && (!best || match.score > best.score)) best = match
  }
  return best
}

function searchTerms(normalizedQuery) {
  return [
    ...new Set(
      normalizedQuery
        .split(SEARCH_TOKEN_SEPARATOR)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ]
}

function termAlternatives(term) {
  return [
    ...new Set(
      [term, ...asArray(SEARCH_TERM_ALIASES[term])]
        .map(normalizeDevFlowDefinitionSearchText)
        .filter(Boolean)
    ),
  ]
}

function findBestAlternativeMatch(term, values) {
  let best = null
  for (const [index, alternative] of termAlternatives(term).entries()) {
    const match = findBestTermMatch(alternative, values)
    if (!match) continue
    const aliasPenalty = index === 0 ? 0 : 500_000
    const adjusted = { ...match, score: match.score - aliasPenalty }
    if (!best || adjusted.score > best.score) best = adjusted
  }
  return best
}

function looksLikeCopiedContext(normalizedQuery, terms) {
  return (
    terms.length >= 3 ||
    /[:=]/u.test(normalizedQuery) ||
    (terms.length > 1 && terms.some((term) => /\p{Number}/u.test(term)))
  )
}

function findBestMatch(normalizedQuery, values) {
  const candidates = uniqueCandidates(values)
  const direct = findBestTermMatch(normalizedQuery, candidates)
  if (direct) return direct

  const terms = searchTerms(normalizedQuery)
  const termMatches = terms.map((term) =>
    findBestAlternativeMatch(term, candidates)
  )
  if (termMatches.length > 0 && termMatches.every(Boolean)) {
    const strongest = termMatches.reduce((best, match) =>
      !best || match.score > best.score ? match : best
    )
    const averageScore = Math.round(
      termMatches.reduce((total, match) => total + match.score, 0) /
        termMatches.length
    )
    return { ...strongest, score: averageScore + 100_000 }
  }

  if (!looksLikeCopiedContext(normalizedQuery, terms)) return null
  return findBestTermMatch(normalizedQuery, candidates, {
    allowEmbedded: true,
  })
}

function sortResults(items) {
  const strongestPriority = Math.max(
    0,
    ...items.map((item) => item.matchPriority)
  )
  const relevantItems =
    strongestPriority >= 3
      ? items.filter((item) => item.matchPriority === strongestPriority)
      : items
  return relevantItems.sort(
    (left, right) =>
      right.matchScore - left.matchScore ||
      left.label.localeCompare(right.label, 'zh-CN')
  )
}

function resultFor({ key, label, type, match, target = {} }) {
  if (!match) return null
  return {
    key,
    label,
    type,
    matchedText: String(match.value),
    matchContext: match.context || '',
    matchScore: match.score,
    matchPriority: match.priority,
    ...target,
  }
}

function flowCandidates(flow) {
  return [
    candidate(flow.label, '', {}, 3),
    candidate(flow.summary, '', {}, 2),
    candidate(flow.key, '定义 key', {}, 3),
    ...asArray(flow.states).flatMap((state) => [
      candidate(state.label, `状态：${state.label}`),
      candidate(state.key, `状态 key：${state.key}`),
    ]),
  ]
}

function processCandidates(definition, flowByBusinessRefType) {
  const sourceFlow = flowByBusinessRefType.get(definition.businessRefType)
  return [
    candidate(definition.label, '', {}, 3),
    candidate(definition.key, '流程 key', {}, 3),
    candidate(definition.processKey, '流程 key', {}, 3),
    candidate(definition.variantKey, '流程变体', {}, 2),
    candidate(definition.businessRefType, '业务对象 key', {}, 2),
    candidate(
      sourceFlow?.label,
      sourceFlow ? `业务对象：${sourceFlow.label}` : '',
      {},
      3
    ),
    ...asArray(definition.nodes).flatMap((node) => [
      candidate(node.label, `流程节点：${node.label}`, {}, 2),
      candidate(node.key, `流程节点 key：${node.key}`, {}, 2),
    ]),
  ]
}

function factCandidates(definition) {
  return [
    candidate(definition.label, '', {}, 3),
    candidate(definition.factKey, '事实 key', {}, 3),
    candidate(definition.machineKey, '事实 key', {}, 3),
    candidate(definition.occurrenceCondition, '发生条件'),
    candidate(definition.sourceDocument, '来源单据', {}, 2),
    candidate(definition.businessImpact, '业务影响'),
    candidate(definition.voucher, '业务凭证'),
    candidate(definition.correction, '纠正方式'),
  ]
}

function chainCandidates({ chain, flowByKey, processByKey, factByKey }) {
  const defaultNodeKey = chain.nodes?.[0]?.key || ''
  const values = [
    candidate(chain.label, '', { nodeKey: defaultNodeKey }, 3),
    candidate(chain.summary, '业务链说明', { nodeKey: defaultNodeKey }, 2),
    candidate(chain.key, '业务链 key', { nodeKey: defaultNodeKey }, 3),
  ]
  for (const node of asArray(chain.nodes)) {
    const context = `链路节点：${node.label}`
    values.push(
      candidate(node.label, context, { nodeKey: node.key }, 3),
      candidate(node.summary, context, { nodeKey: node.key }, 2),
      candidate(node.key, `${context} · 节点 key`, { nodeKey: node.key }, 3)
    )
    for (const machineKey of asArray(node.machineKeys)) {
      const definition = flowByKey.get(machineKey) || factByKey.get(machineKey)
      values.push(
        candidate(
          machineKey,
          `${context} · 定义 key`,
          { nodeKey: node.key },
          3
        ),
        candidate(definition?.label, context, { nodeKey: node.key }, 3)
      )
    }
    for (const factKey of asArray(node.factKeys)) {
      const definition = factByKey.get(factKey)
      values.push(
        candidate(factKey, `${context} · 事实 key`, { nodeKey: node.key }, 3),
        candidate(definition?.label, context, { nodeKey: node.key }, 3)
      )
    }
    for (const processKey of asArray(node.processDefinitionKeys)) {
      const definition = processByKey.get(processKey)
      values.push(
        candidate(
          processKey,
          `${context} · 流程 key`,
          { nodeKey: node.key },
          3
        ),
        candidate(definition?.label, context, { nodeKey: node.key }, 3)
      )
    }
  }
  return values
}

function buildDefinitionSearchEntries(catalog) {
  const flows = asArray(catalog?.flows)
  const processDefinitions = asArray(catalog?.processDefinitions)
  const factDefinitions = asArray(catalog?.factDefinitions)
  const businessChains = asArray(catalog?.businessChains)
  const flowByKey = new Map(flows.map((flow) => [flow.key, flow]))
  const processByKey = new Map(
    processDefinitions.map((definition) => [definition.key, definition])
  )
  const factByKey = new Map(
    factDefinitions.map((definition) => [definition.factKey, definition])
  )
  const flowByBusinessRefType = new Map(
    flows
      .filter((flow) => flow.key?.startsWith('source.'))
      .map((flow) => [flow.key.slice('source.'.length), flow])
  )

  const flowEntry = (flow) => ({
    key: flow.key,
    label: flow.label,
    type: 'states',
    candidates: flowCandidates(flow),
  })

  return {
    chains: businessChains.map((chain) => ({
      key: chain.key,
      label: chain.label,
      type: 'chain',
      defaultNodeKey: chain.nodes?.[0]?.key || '',
      candidates: chainCandidates({
        chain,
        flowByKey,
        processByKey,
        factByKey,
      }),
    })),
    workflow: flows
      .filter((flow) => flow.key === 'workflow.task')
      .map((flow) => ({
        key: flow.key,
        label: flow.label,
        type: 'workflow',
        candidates: flowCandidates(flow),
      })),
    runtime: processDefinitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      type: 'runtime',
      candidates: processCandidates(definition, flowByBusinessRefType),
    })),
    states: flows
      .filter(
        (flow) =>
          !flow.key.startsWith('workflow.') &&
          !flow.key.startsWith('process.') &&
          flow.scopeKey !== 'fact_ledger'
      )
      .map(flowEntry),
    stateOptions: flows.map(flowEntry),
    facts: factDefinitions.map((definition) => ({
      key: definition.factKey,
      label: definition.label,
      type: 'facts',
      candidates: factCandidates(definition),
    })),
  }
}

function searchEntries(entries, normalizedQuery) {
  return sortResults(
    entries
      .map((entry) => {
        const match = findBestMatch(normalizedQuery, entry.candidates)
        return resultFor({
          key: entry.key,
          label: entry.label,
          type: entry.type,
          match,
          target:
            entry.type === 'chain'
              ? { nodeKey: match?.nodeKey || entry.defaultNodeKey }
              : {},
        })
      })
      .filter(Boolean)
  )
}

export function buildDevFlowDefinitionSearchGroups(catalog, keyword) {
  const normalizedQuery = normalizeDevFlowDefinitionSearchText(keyword)
  if (!normalizedQuery) return []

  const entries = buildDefinitionSearchEntries(catalog)

  return [
    {
      key: 'chains',
      label: '业务链',
      items: searchEntries(entries.chains, normalizedQuery),
    },
    {
      key: 'workflow',
      label: 'Workflow',
      items: searchEntries(entries.workflow, normalizedQuery),
    },
    {
      key: 'runtime',
      label: 'ProcessRuntime',
      items: searchEntries(entries.runtime, normalizedQuery),
    },
    {
      key: 'states',
      label: '状态机',
      items: searchEntries(entries.states, normalizedQuery),
    },
    {
      key: 'facts',
      label: 'Fact / Ledger',
      items: searchEntries(entries.facts, normalizedQuery),
    },
  ]
}

export function createDevFlowDefinitionOptionFilter(catalog, groupKey) {
  const entries = new Map(
    asArray(buildDefinitionSearchEntries(catalog)[groupKey]).map((entry) => [
      entry.key,
      entry,
    ])
  )
  return (keyword, option) => {
    const normalizedQuery = normalizeDevFlowDefinitionSearchText(keyword)
    if (!normalizedQuery) return true
    const entry = entries.get(String(option?.value || ''))
    return Boolean(entry && findBestMatch(normalizedQuery, entry.candidates))
  }
}
