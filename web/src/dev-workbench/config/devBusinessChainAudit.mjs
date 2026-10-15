import { DEV_STATUS_FLOWS_ROUTE } from './devRoutes.mjs'

export const DEV_CHAIN_AUDIT_API = '/__dev/api/qa/business-chain-audit'
export const CHAIN_AUDIT_BATCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u
export const CHAIN_AUDIT_TABS = Object.freeze([
  { value: 'chains', label: '链路结果' },
  { value: 'findings', label: '问题与复验' },
  { value: 'evidence', label: '执行与证据' },
])
export const CHAIN_AUDIT_STATES = Object.freeze({
  passed: { label: '通过', color: 'green' },
  failed: { label: '阻断', color: 'red' },
  drift: { label: '口径失配', color: 'gold' },
  blocked: { label: '受阻', color: 'orange' },
  not_run: { label: '未执行', color: 'default' },
  not_proven: { label: '未证明', color: 'default' },
})

function requireValue(condition) {
  if (!condition) throw new Error('链路报告格式或计数不完整')
}
const isText = (value) => typeof value === 'string' && value.length <= 20000
const isList = (value, max = 2000) =>
  Array.isArray(value) && value.length <= max
const textList = (value) => isList(value) && value.every(isText)
const hasState = (row) => Object.hasOwn(CHAIN_AUDIT_STATES, row?.status)

export function aggregateChainAuditStatus(steps) {
  // A mixed or incomplete run cannot become passed through a chain-level label.
  return (
    ['failed', 'blocked', 'drift', 'not_proven', 'not_run', 'passed'].find(
      (status) => steps.some((step) => step.status === status)
    ) || 'not_run'
  )
}

export const CHAIN_DEFINITION_STATES = Object.freeze({
  unverified: '缺少定义快照，无法判定一致',
  unchanged: '定义一致',
  changed: '定义已变化，需复验',
  added: '当前新增定义',
  removed: '当前已移除',
})

// Report rows are frozen observations. Current definitions remain in the chain catalog.
export function validateBusinessChainReport(report) {
  requireValue(
    isText(report?.title) &&
      isText(report.verdict) &&
      isText(report.generatedAt) &&
      Number.isFinite(Date.parse(report.generatedAt)) &&
      /^[a-f0-9]{40,64}$/u.test(report.scope?.sourceCommit || '') &&
      ['customer', 'data', 'mode', 'terminal'].every((key) =>
        isText(report.scope[key])
      ) &&
      textList(report.scope.notIncluded) &&
      textList(report.coverageLimits) &&
      isList(report.chains, 100) &&
      report.chains.length > 0 &&
      isList(report.findings, 200)
  )
  const evidenceValid = (items) =>
    isList(items) &&
    items.every((item) => isText(item?.path) && isText(item?.label))
  requireValue(evidenceValid(report.evidence))
  const stepStates = Object.fromEntries(
    Object.keys(CHAIN_AUDIT_STATES).map((key) => [key, 0])
  )
  for (const chain of report.chains) {
    requireValue(
      /^[a-z][a-z0-9_]{0,99}$/u.test(chain?.key || '') &&
        ['label', 'summary', 'statusLabel'].every((key) =>
          isText(chain[key])
        ) &&
        hasState(chain) &&
        isList(chain.steps) &&
        chain.steps.length > 0 &&
        chain.stepCount === chain.steps.length &&
        isList(chain.scenarios) &&
        evidenceValid(chain.evidence)
    )
    for (const step of chain.steps) {
      requireValue(
        hasState(step) &&
          [
            'key',
            'label',
            'fromLabel',
            'toLabel',
            'responsibleRole',
            'observed',
            'level',
            'statusLabel',
          ].every((key) => isText(step[key])) &&
          ['preconditions', 'actions', 'results', 'facts'].every((key) =>
            textList(step[key])
          ) &&
          Number.isSafeInteger(step.number) &&
          step.number > 0
      )
      stepStates[step.status] += 1
    }
    requireValue(
      new Set(chain.steps.map((step) => step.key)).size === chain.steps.length
    )
    requireValue(chain.status === aggregateChainAuditStatus(chain.steps))
    requireValue(
      chain.scenarios.every((row) =>
        ['key', 'label', 'result'].every((key) => isText(row?.[key]))
      ) &&
        new Set(chain.scenarios.map((row) => row.key)).size ===
          chain.scenarios.length
    )
  }
  requireValue(
    new Set(report.chains.map((chain) => chain.key)).size ===
      report.chains.length
  )
  requireValue(
    report.scope.chainCount === report.chains.length &&
      report.scope.stepCount ===
        Object.values(stepStates).reduce((sum, n) => sum + n, 0)
  )
  requireValue(
    Number.isSafeInteger(report.scope.registeredScenarioCount) &&
      report.scope.registeredScenarioCount ===
        report.chains.reduce((sum, chain) => sum + chain.scenarios.length, 0)
  )
  requireValue(
    Object.entries(stepStates).every(
      ([key, count]) => (report.metrics?.stepStates?.[key] ?? 0) === count
    )
  )
  for (const finding of report.findings) {
    requireValue(
      [
        'id',
        'title',
        'trigger',
        'observed',
        'impact',
        'cause',
        'recommendation',
        'kind',
      ].every((key) => isText(finding?.[key])) &&
        /^P[0-2]$/u.test(finding.priority) &&
        evidenceValid(finding.evidence)
    )
  }
  requireValue(
    new Set(report.findings.map((row) => row.id)).size ===
      report.findings.length
  )
  const retests = report.retests || []
  requireValue(
    isList(retests, 200) &&
      retests.every((row) =>
        ['id', 'title', 'summary'].every((key) => isText(row?.[key])) &&
        CHAIN_AUDIT_BATCH_PATTERN.test(row.sourceBatch || '') &&
        hasState(row) && evidenceValid(row.evidence)
      ) &&
      new Set(retests.map((row) => row.id)).size === retests.length
  )
  for (const key of ['createEdit', 'mobileActions', 'pages', 'lineage']) {
    requireValue(
      isList(report[key]) &&
        report[key].every(
          (row) => row && typeof row === 'object' && !Array.isArray(row)
        )
    )
  }
  requireValue(
    report.lineage.every((row) =>
      ['stage', 'record', 'proof'].every((key) => isText(row[key]))
    )
  )
  requireValue(
    report.createEdit.every((row) => isText(row.name) && hasState(row))
  )
  requireValue(
    report.mobileActions.every(
      (row) =>
        ['role', 'action', 'taskStatus'].every((key) => isText(row[key])) &&
        hasState(row)
    )
  )
  requireValue(
    report.pages.every((row) =>
      ['key', 'title', 'roleKey', 'status'].every((key) => isText(row[key]))
    )
  )
  requireValue(
    isList(report.printing?.templates, 100) &&
      isList(report.pdfValidation?.templates, 100)
  )
  requireValue(report.pdfValidation.templates.every((row) => isText(row?.file)))
  for (const diagram of Object.values(report.diagrams || {})) {
    requireValue(
      isList(diagram?.nodes, 60) &&
        isList(diagram.edges, 100) &&
        diagram.nodes.every((node) =>
          ['id', 'label', 'detail'].every((key) => isText(node?.[key]))
        ) &&
        new Set(diagram.nodes.map((node) => node.id)).size ===
          diagram.nodes.length &&
        diagram.edges.every(
          (edge) => isList(edge, 3) && edge.length === 3 && edge.every(isText)
        )
    )
  }
  return report
}

export function chainAuditFreshness(report, currentRepository) {
  if (!currentRepository?.commit) return 'unknown'
  if (report.scope.sourceCommit !== currentRepository.commit)
    { return 'historical' }
  // This report format does not bind a complete workspace fingerprint.
  // Matching HEAD alone cannot prove that the executed dirty source is current.
  return 'unverified'
}

export function chainAuditArtifactURL(batch, file) {
  return `${DEV_CHAIN_AUDIT_API}/artifact?${new URLSearchParams({ batch, file })}`
}

export function chainDefinitionURL(chain = 'all') {
  return `${DEV_STATUS_FLOWS_ROUTE}?${new URLSearchParams({ view: 'chain', chain })}`
}

export function filterChainAuditSteps(
  report,
  { chain = 'all', status = 'all', keyword = '' } = {}
) {
  const query = keyword.trim().toLowerCase()
  return report.chains
    .filter((item) => chain === 'all' || item.key === chain)
    .flatMap((item) =>
      item.steps.map((step) => ({
        ...step,
        rowKey: `${item.key}:${step.key}`,
        chainKey: item.key,
        chainLabel: item.label,
      }))
    )
    .filter(
      (step) =>
        (status === 'all' || step.status === status) &&
        (!query ||
          [
            step.chainLabel,
            step.label,
            step.responsibleRole,
            step.observed,
            step.level,
            ...step.preconditions,
            ...step.actions,
            ...step.results,
          ]
            .join(' ')
            .toLowerCase()
            .includes(query))
    )
}

export function buildChainAuditDiagram(diagram) {
  if (
    !isList(diagram?.nodes, 60) ||
    !isList(diagram.edges, 100) ||
    !diagram.nodes.length
  )
    { return '' }
  const ids = new Map(diagram.nodes.map((node, i) => [node.id, `n${i}`]))
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"#\n\r]/gu,
      (char) =>
        ({
          '&': '#38;',
          '<': '#60;',
          '>': '#62;',
          '"': '#quot;',
          '#': '#35;',
          '\n': ' ',
          '\r': ' ',
        })[char]
    )
  const lines = [
    'flowchart LR',
    'classDef danger fill:#fff1f0,stroke:#cf1322,color:#a8071a',
    'classDef success fill:#f6ffed,stroke:#389e0d,color:#135200',
  ]
  diagram.nodes.forEach((node) => {
    lines.push(
      `${ids.get(node.id)}["${escape(node.label)} · ${escape(node.detail)}"]`
    )
    if (['danger', 'success'].includes(node.kind))
      { lines.push(`class ${ids.get(node.id)} ${node.kind}`) }
  })
  diagram.edges.forEach(([from, to, label]) => {
    if (ids.has(from) && ids.has(to))
      { lines.push(
        `${ids.get(from)} -->|"${escape(label || ' ')}"| ${ids.get(to)}`
      ) }
  })
  return lines.join('\n')
}
