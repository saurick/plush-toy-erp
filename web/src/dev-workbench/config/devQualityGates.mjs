import { DEV_QUALITY_GATES_ROUTE } from './devRoutes.mjs'

export { DEV_QUALITY_GATES_ROUTE }

export const DEV_QUALITY_GATE_API_PATH = '/__dev/api/qa/quality-gates'
export const DEV_QUALITY_GATE_SESSION_API_PATH = `${DEV_QUALITY_GATE_API_PATH}/session`
export const DEV_QUALITY_GATE_ACTION_API_PATH = `${DEV_QUALITY_GATE_API_PATH}/actions`
export const DEV_QUALITY_GATE_GOVERNANCE_API_PATH = `${DEV_QUALITY_GATE_API_PATH}/governance`
export const DEV_QUALITY_GATE_GAPS_API_PATH = `${DEV_QUALITY_GATE_API_PATH}/gaps`
export const DEV_QUALITY_GATE_OPERATION_API_PREFIX = `${DEV_QUALITY_GATE_API_PATH}/operations`
export const DEV_QUALITY_GATE_OPERATION_SCHEMA =
  'plush.dev-quality-gate-operation-public/v1'

export const QUERY_KEYS = Object.freeze({
  view: 'view',
  profile: 'profile',
  operation: 'operation',
  q: 'q',
  filter: 'filter',
  range: 'range',
  risk: 'risk',
})
export const VIEW_ITEMS = Object.freeze([
  Object.freeze({
    value: 'run',
    label: '运行与结果',
    description: '运行 full 或 strict，并查看当前状态和真实耗时。',
  }),
  Object.freeze({
    value: 'governance',
    label: '门禁治理',
    description: '判断门禁是否必要、重复、可靠以及成本是否合理。',
  }),
  Object.freeze({
    value: 'gaps',
    label: '覆盖缺口',
    description: '检查当前改动还有哪些高风险证据没有补齐。',
  }),
])
export const VIEW_KEYS = Object.freeze(VIEW_ITEMS.map((item) => item.value))
export const VIEW_QUERY_KEYS = Object.freeze({
  run: Object.freeze(['view', 'profile', 'operation']),
  governance: Object.freeze(['view', 'q', 'filter']),
  gaps: Object.freeze(['view', 'range', 'risk']),
})
export const DEFAULT_VIEW = 'run'
export const DEV_QUALITY_GATE_PROFILES = Object.freeze(['full', 'strict'])
export const DEV_QUALITY_GATE_GOVERNANCE_FILTERS = Object.freeze([
  'relevant',
  'attention',
  'all',
])
export const DEV_QUALITY_GATE_GAP_RANGES = Object.freeze(['current', 'staged'])
export const DEV_QUALITY_GATE_GAP_RISKS = Object.freeze(['all', 'high'])
export const DEV_QUALITY_GATE_ACTIVE_STATUSES = Object.freeze([
  'queued',
  'running',
  'cancelling',
])

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u
const HASH_PATTERN = /^[0-9a-f]{64}$/u
const STRUCTURED_ID_PATTERN = /^[a-z][a-z0-9_]{1,63}$/u
const AFFECTED_SCOPE_PATTERN = /^T[0-8]$/u
const LOCAL_GATE_VALUES = Object.freeze(['focused', 'full'])
const IDEMPOTENCY_PATTERN =
  /^quality-gate:(full|strict):([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u
const OPERATION_STATUSES = Object.freeze([
  'queued',
  'running',
  'cancelling',
  'passed',
  'failed',
  'cancelled',
  'timed_out',
  'blocked',
  'not_proven',
])
const STAGE_STATUSES = Object.freeze(['pending', 'running', 'passed', 'failed'])
const STATUS_META = Object.freeze({
  queued: Object.freeze({ label: '等待启动', tone: 'processing' }),
  running: Object.freeze({ label: '正在运行', tone: 'processing' }),
  cancelling: Object.freeze({ label: '正在取消', tone: 'warning' }),
  passed: Object.freeze({ label: '已通过', tone: 'success' }),
  failed: Object.freeze({ label: '未通过', tone: 'error' }),
  cancelled: Object.freeze({ label: '已取消', tone: 'default' }),
  timed_out: Object.freeze({ label: '已超时', tone: 'error' }),
  blocked: Object.freeze({ label: '前置未就绪', tone: 'warning' }),
  not_proven: Object.freeze({ label: '结果无法证明', tone: 'warning' }),
  missing: Object.freeze({ label: '尚未运行', tone: 'default' }),
  stale: Object.freeze({ label: '旧版本结果', tone: 'warning' }),
})

function assertExactKeys(value, expected, field) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${field} must be a plain object`)
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${field} contains unsupported fields`)
  }
  return value
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint <= 31 || codePoint === 127
  })
}

function safeText(value, field, { allowEmpty = false, max = 2000 } = {}) {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length < 1) ||
    value.length > max ||
    hasControlCharacter(value)
  ) {
    throw new Error(`${field} is invalid`)
  }
  return value
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function normalizeRepository(repository) {
  assertExactKeys(
    repository,
    ['commit', 'dirty', 'fingerprint'],
    'quality gate repository'
  )
  if (
    !COMMIT_PATTERN.test(repository.commit) ||
    typeof repository.dirty !== 'boolean' ||
    !HASH_PATTERN.test(repository.fingerprint)
  ) {
    throw new Error('quality gate repository is invalid')
  }
  return { ...repository }
}

function normalizeStageTiming(stage) {
  assertExactKeys(
    stage,
    ['durationMs', 'finishedAt', 'id', 'label', 'startedAt', 'status'],
    'quality gate stage timing'
  )
  if (
    !/^[a-z][a-z0-9_]{1,63}$/u.test(stage.id) ||
    !STAGE_STATUSES.includes(stage.status) ||
    !isIsoDate(stage.startedAt) ||
    (stage.finishedAt !== null && !isIsoDate(stage.finishedAt)) ||
    (stage.durationMs !== null &&
      (!Number.isSafeInteger(stage.durationMs) || stage.durationMs < 0))
  ) {
    throw new Error('quality gate stage timing is invalid')
  }
  return {
    ...stage,
    label: safeText(stage.label, 'quality gate stage label', { max: 120 }),
  }
}

function normalizeReceipt(receipt) {
  if (receipt === null) return null
  assertExactKeys(
    receipt,
    [
      'bottleneckStageId',
      'durationMs',
      'environmentFingerprint',
      'executed',
      'failed',
      'finishedAt',
      'gitCommit',
      'passed',
      'profile',
      'skipped',
      'stageTimings',
      'status',
      'treeState',
    ],
    'quality gate receipt'
  )
  if (
    !DEV_QUALITY_GATE_PROFILES.includes(receipt.profile) ||
    !['passed', 'failed'].includes(receipt.status) ||
    !COMMIT_PATTERN.test(receipt.gitCommit) ||
    !['clean', 'dirty'].includes(receipt.treeState) ||
    !isIsoDate(receipt.finishedAt) ||
    !HASH_PATTERN.test(receipt.environmentFingerprint) ||
    !Array.isArray(receipt.stageTimings) ||
    !['durationMs', 'executed', 'passed', 'failed', 'skipped'].every(
      (field) => Number.isSafeInteger(receipt[field]) && receipt[field] >= 0
    )
  ) {
    throw new Error('quality gate receipt is invalid')
  }
  return {
    ...receipt,
    stageTimings: receipt.stageTimings.map(normalizeStageTiming),
  }
}

export function normalizeDevQualityGateOperation(operation) {
  assertExactKeys(
    operation,
    [
      'cancelRequestedAt',
      'cleanup',
      'createdAt',
      'finishedAt',
      'firstFailure',
      'id',
      'message',
      'profile',
      'receipt',
      'repository',
      'revision',
      'schemaVersion',
      'stage',
      'stageTimings',
      'status',
      'updatedAt',
    ],
    'quality gate operation'
  )
  if (
    operation.schemaVersion !== DEV_QUALITY_GATE_OPERATION_SCHEMA ||
    !UUID_PATTERN.test(operation.id) ||
    !DEV_QUALITY_GATE_PROFILES.includes(operation.profile) ||
    !OPERATION_STATUSES.includes(operation.status) ||
    !/^[a-z][a-z0-9_]{1,63}$/u.test(operation.stage) ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 1 ||
    !isIsoDate(operation.createdAt) ||
    !isIsoDate(operation.updatedAt) ||
    (operation.finishedAt !== null && !isIsoDate(operation.finishedAt)) ||
    (operation.cancelRequestedAt !== null &&
      !isIsoDate(operation.cancelRequestedAt)) ||
    !Array.isArray(operation.stageTimings)
  ) {
    throw new Error('quality gate operation is invalid')
  }
  assertExactKeys(operation.cleanup, ['message', 'status'], 'quality cleanup')
  if (
    !['pending', 'complete', 'failed', 'not_required'].includes(
      operation.cleanup.status
    )
  ) {
    throw new Error('quality gate cleanup is invalid')
  }
  return {
    ...operation,
    repository: normalizeRepository(operation.repository),
    message: safeText(operation.message, 'quality gate message'),
    firstFailure: safeText(operation.firstFailure, 'quality gate failure', {
      allowEmpty: true,
    }),
    cleanup: {
      ...operation.cleanup,
      message: safeText(operation.cleanup.message, 'quality cleanup message'),
    },
    stageTimings: operation.stageTimings.map(normalizeStageTiming),
    receipt: normalizeReceipt(operation.receipt),
  }
}

function normalizeProof(proof, profile) {
  assertExactKeys(
    proof,
    ['current', 'profile', 'receipt', 'releaseEligible', 'reused', 'status'],
    'quality gate proof'
  )
  if (
    proof.profile !== profile ||
    !['missing', 'passed', 'failed'].includes(proof.status) ||
    typeof proof.current !== 'boolean' ||
    typeof proof.releaseEligible !== 'boolean' ||
    typeof proof.reused !== 'boolean'
  ) {
    throw new Error('quality gate proof is invalid')
  }
  return { ...proof, receipt: normalizeReceipt(proof.receipt) }
}

function normalizeBusy(busy) {
  assertExactKeys(busy, ['active', 'kind', 'profile'], 'quality gate busy')
  if (
    typeof busy.active !== 'boolean' ||
    typeof busy.kind !== 'string' ||
    typeof busy.profile !== 'string' ||
    (busy.active &&
      (!['coverage', 'testing', 'quality'].includes(busy.kind) ||
        ![
          'baseline',
          'fast',
          'role-access',
          'field-linkage',
          'full',
          'strict',
        ].includes(busy.profile))) ||
    (!busy.active && (busy.kind || busy.profile))
  ) {
    throw new Error('quality gate busy state is invalid')
  }
  return { ...busy }
}

function normalizeProfiles(profiles) {
  assertExactKeys(profiles, DEV_QUALITY_GATE_PROFILES, 'quality profiles')
  return Object.fromEntries(
    DEV_QUALITY_GATE_PROFILES.map((profile) => {
      const definition = profiles[profile]
      assertExactKeys(
        definition,
        ['stages', 'substeps', 'timeoutMs'],
        'quality profile'
      )
      if (
        !Number.isSafeInteger(definition.timeoutMs) ||
        definition.timeoutMs < 1 ||
        !Array.isArray(definition.stages) ||
        definition.stages.length < 1 ||
        definition.stages.length > 32
      ) {
        throw new Error('quality profile is invalid')
      }
      const stageIds = new Set()
      const stages = definition.stages.map((stage) => {
        assertExactKeys(
          stage,
          ['id', 'label', 'parallel'],
          'quality profile stage'
        )
        if (
          !STRUCTURED_ID_PATTERN.test(stage.id) ||
          stageIds.has(stage.id) ||
          typeof stage.parallel !== 'boolean'
        ) {
          throw new Error('quality profile stage is invalid')
        }
        stageIds.add(stage.id)
        return {
          id: stage.id,
          label: safeText(stage.label, 'quality profile stage label', {
            max: 120,
          }),
          parallel: stage.parallel,
        }
      })
      if (
        !definition.substeps ||
        typeof definition.substeps !== 'object' ||
        Array.isArray(definition.substeps) ||
        Object.getPrototypeOf(definition.substeps) !== Object.prototype
      ) {
        throw new Error('quality profile substeps are invalid')
      }
      const substeps = Object.fromEntries(
        Object.entries(definition.substeps).map(([stageId, items]) => {
          if (
            !stageIds.has(stageId) ||
            !Array.isArray(items) ||
            items.length < 1 ||
            items.length > 20
          ) {
            throw new Error('quality profile substeps are invalid')
          }
          const substepIds = new Set()
          return [
            stageId,
            items.map((item) => {
              assertExactKeys(item, ['id', 'label'], 'quality profile substep')
              if (
                !STRUCTURED_ID_PATTERN.test(item.id) ||
                substepIds.has(item.id)
              ) {
                throw new Error('quality profile substep is invalid')
              }
              substepIds.add(item.id)
              return {
                id: item.id,
                label: safeText(item.label, 'quality profile substep label', {
                  max: 120,
                }),
              }
            }),
          ]
        })
      )
      return [
        profile,
        {
          timeoutMs: definition.timeoutMs,
          stages,
          substeps,
        },
      ]
    })
  )
}

export function normalizeDevQualityGateSummary(summary) {
  assertExactKeys(
    summary,
    [
      'busy',
      'currentOperation',
      'environment',
      'generatedAt',
      'operations',
      'profiles',
      'proofs',
      'repository',
      'schemaVersion',
      'status',
    ],
    'quality gate summary'
  )
  if (
    summary.schemaVersion !== 'plush.dev-quality-gates-summary/v1' ||
    !isIsoDate(summary.generatedAt) ||
    !Array.isArray(summary.operations)
  ) {
    throw new Error('quality gate summary is invalid')
  }
  assertExactKeys(
    summary.environment,
    ['disposableDatabaseReady', 'message'],
    'quality environment'
  )
  assertExactKeys(summary.proofs, DEV_QUALITY_GATE_PROFILES, 'quality proofs')
  assertExactKeys(
    summary.status,
    [
      'description',
      'notProven',
      'recommendation',
      'releaseEligible',
      'title',
      'tone',
    ],
    'quality status'
  )
  const operations = summary.operations.map(normalizeDevQualityGateOperation)
  const currentOperation = summary.currentOperation
    ? normalizeDevQualityGateOperation(summary.currentOperation)
    : null
  if (
    currentOperation &&
    !operations.some((operation) => operation.id === currentOperation.id)
  ) {
    throw new Error('quality current operation is inconsistent')
  }
  return {
    ...summary,
    repository: normalizeRepository(summary.repository),
    environment: {
      disposableDatabaseReady: Boolean(
        summary.environment.disposableDatabaseReady
      ),
      message: safeText(summary.environment.message, 'quality environment'),
    },
    busy: normalizeBusy(summary.busy),
    profiles: normalizeProfiles(summary.profiles),
    operations,
    currentOperation,
    proofs: Object.fromEntries(
      DEV_QUALITY_GATE_PROFILES.map((profile) => [
        profile,
        normalizeProof(summary.proofs[profile], profile),
      ])
    ),
    status: {
      tone: ['success', 'info', 'warning', 'error'].includes(
        summary.status.tone
      )
        ? summary.status.tone
        : 'warning',
      title: safeText(summary.status.title, 'quality status title'),
      description: safeText(
        summary.status.description,
        'quality status description'
      ),
      recommendation: safeText(
        summary.status.recommendation,
        'quality recommendation'
      ),
      releaseEligible: Boolean(summary.status.releaseEligible),
      notProven: Array.isArray(summary.status.notProven)
        ? summary.status.notProven.map((item) =>
            safeText(item, 'quality not proven item')
          )
        : [],
    },
  }
}

function normalizeStatistics(statistics) {
  assertExactKeys(
    statistics,
    [
      'enoughSamples',
      'environmentFingerprint',
      'medianDurationMs',
      'sampleCount',
      'slowerDurationMs',
      'treeState',
    ],
    'quality statistics'
  )
  return { ...statistics }
}

export function normalizeDevQualityGateGovernance(value) {
  assertExactKeys(
    value,
    [
      'catalogSchemaVersion',
      'changedCount',
      'complexity',
      'filter',
      'q',
      'rows',
      'schemaVersion',
    ],
    'quality governance'
  )
  if (
    value.schemaVersion !== 'plush.quality-gate-governance/v1' ||
    value.catalogSchemaVersion !== 'plush.quality-gate-catalog/v1' ||
    !DEV_QUALITY_GATE_GOVERNANCE_FILTERS.includes(value.filter) ||
    !Number.isSafeInteger(value.changedCount) ||
    value.changedCount < 0 ||
    !Array.isArray(value.rows) ||
    !Array.isArray(value.complexity)
  ) {
    throw new Error('quality governance is invalid')
  }
  return {
    ...value,
    rows: value.rows.map((row) => ({
      ...row,
      label: safeText(row.label, 'gate label'),
      prevents: safeText(row.prevents, 'gate risk'),
      trigger: safeText(row.trigger, 'gate trigger'),
      advice: safeText(row.advice, 'gate advice'),
      statistics: normalizeStatistics(row.statistics),
      sources: Array.isArray(row.sources)
        ? row.sources.map((source) => safeText(source, 'gate source'))
        : [],
    })),
    complexity: value.complexity.map((item) => ({
      ...item,
      signal: safeText(item.signal, 'complexity signal'),
      detail: safeText(item.detail, 'complexity detail'),
      recommendation: safeText(
        item.recommendation,
        'complexity recommendation'
      ),
    })),
  }
}

export function normalizeDevQualityGateGaps(value) {
  assertExactKeys(
    value,
    [
      'affectedScopes',
      'boundaries',
      'categories',
      'changedCount',
      'localGate',
      'matched',
      'maxAffectedScope',
      'range',
      'risk',
      'schemaVersion',
    ],
    'quality gaps'
  )
  if (
    value.schemaVersion !== 'plush.quality-gate-gap-analysis/v2' ||
    !DEV_QUALITY_GATE_GAP_RANGES.includes(value.range) ||
    !DEV_QUALITY_GATE_GAP_RISKS.includes(value.risk) ||
    !Array.isArray(value.affectedScopes) ||
    value.affectedScopes.length < 1 ||
    !value.affectedScopes.every((scope) =>
      AFFECTED_SCOPE_PATTERN.test(scope)
    ) ||
    !AFFECTED_SCOPE_PATTERN.test(value.maxAffectedScope) ||
    value.affectedScopes.at(-1) !== value.maxAffectedScope ||
    !LOCAL_GATE_VALUES.includes(value.localGate) ||
    !Array.isArray(value.categories) ||
    !Array.isArray(value.boundaries)
  ) {
    throw new Error('quality gaps are invalid')
  }
  return {
    ...value,
    affectedScopes: [...value.affectedScopes],
    categories: value.categories.map((category) => ({
      ...category,
      label: safeText(category.label, 'gap label'),
      risk: safeText(category.risk, 'gap risk'),
      gateResults: Array.isArray(category.gateResults)
        ? category.gateResults.map((result) => ({
            ...result,
            label: safeText(result.label, 'gap gate label'),
          }))
        : [],
      evidence: Array.isArray(category.evidence)
        ? category.evidence.map((item) => safeText(item, 'gap evidence'))
        : [],
    })),
    boundaries: value.boundaries.map((item) => safeText(item, 'gap boundary')),
  }
}

export function parseQualityGateSearch(search, { operationIds = null } = {}) {
  const params =
    search instanceof URLSearchParams
      ? new URLSearchParams(search)
      : new URLSearchParams(String(search || '').replace(/^\?/u, ''))
  const issues = []
  const keys = [...new Set(params.keys())]
  for (const key of keys) {
    if (!Object.values(QUERY_KEYS).includes(key)) {
      issues.push(`不支持参数“${key}”`)
    }
    if (params.getAll(key).length > 1) {
      issues.push(`参数“${key}”重复出现`)
    }
  }
  const requestedView = params.get(QUERY_KEYS.view) || DEFAULT_VIEW
  const view = VIEW_KEYS.includes(requestedView) ? requestedView : DEFAULT_VIEW
  if (!VIEW_KEYS.includes(requestedView)) {
    issues.push('当前视图不存在或已经过期')
  }
  const allowed = new Set(VIEW_QUERY_KEYS[view])
  for (const key of keys) {
    if (Object.values(QUERY_KEYS).includes(key) && !allowed.has(key)) {
      issues.push(`参数“${key}”不属于当前视图`)
    }
  }
  const values = { view }
  if (view === 'run') {
    const profile = params.get(QUERY_KEYS.profile) || ''
    const operation = params.get(QUERY_KEYS.operation) || ''
    if (profile && !DEV_QUALITY_GATE_PROFILES.includes(profile)) {
      issues.push('门禁类型只能是完整门禁或严格门禁')
    }
    if (operation && !UUID_PATTERN.test(operation)) {
      issues.push('运行记录标识无效或已经过期')
    } else if (
      operation &&
      Array.isArray(operationIds) &&
      !operationIds.includes(operation)
    ) {
      issues.push('运行记录不存在或已经过期')
    }
    values.profile = profile
    values.operation = operation
  } else if (view === 'governance') {
    const q = params.get(QUERY_KEYS.q) || ''
    const filter = params.get(QUERY_KEYS.filter) || 'relevant'
    if (q.length > 80 || hasControlCharacter(q)) {
      issues.push('搜索内容过长或包含无效字符')
    }
    if (!DEV_QUALITY_GATE_GOVERNANCE_FILTERS.includes(filter)) {
      issues.push('门禁筛选条件无效或已经过期')
    }
    values.q = q
    values.filter = filter
  } else {
    const range = params.get(QUERY_KEYS.range) || 'current'
    const risk = params.get(QUERY_KEYS.risk) || 'all'
    if (!DEV_QUALITY_GATE_GAP_RANGES.includes(range)) {
      issues.push('改动范围无效或已经过期')
    }
    if (!DEV_QUALITY_GATE_GAP_RISKS.includes(risk)) {
      issues.push('风险筛选无效或已经过期')
    }
    values.range = range
    values.risk = risk
  }
  return Object.freeze({
    valid: issues.length === 0,
    canonicalMissingView: !params.has(QUERY_KEYS.view),
    issues: Object.freeze([...new Set(issues)]),
    view,
    values: Object.freeze(values),
  })
}

export function buildQualityGateViewSearch(view, values = {}) {
  if (!VIEW_KEYS.includes(view)) throw new Error('质量门禁视图无效')
  const params = new URLSearchParams({ view })
  for (const key of VIEW_QUERY_KEYS[view]) {
    if (key === 'view' || values[key] === undefined || values[key] === '') {
      continue
    }
    params.set(key, String(values[key]))
  }
  const parsed = parseQualityGateSearch(params)
  if (!parsed.valid) throw new Error('质量门禁视图参数无效')
  return `?${params.toString()}`
}

export function createQualityGateIdempotencyKey(
  profile,
  { randomUUID = () => globalThis.crypto.randomUUID() } = {}
) {
  if (!DEV_QUALITY_GATE_PROFILES.includes(profile)) {
    throw new Error('质量门禁类型无效')
  }
  const value = randomUUID()
  if (!UUID_PATTERN.test(value)) throw new Error('无法生成运行请求标识')
  return `quality-gate:${profile}:${value}`
}

export function getQualityGateStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.not_proven
}

export function getQualityGateStageLabel(stage, registeredStages = []) {
  if (!stage || !Array.isArray(registeredStages)) return '未登记阶段'
  const registered = registeredStages.find((item) => item?.id === stage.id)
  return typeof registered?.label === 'string' && registered.label
    ? registered.label
    : '未登记阶段'
}

function matchingStageSuffixLength(leftStages, rightStages) {
  let matched = 0
  const limit = Math.min(leftStages.length, rightStages.length)
  while (
    matched < limit &&
    leftStages[leftStages.length - matched - 1]?.id ===
      rightStages[rightStages.length - matched - 1]?.id
  ) {
    matched += 1
  }
  return matched
}

export function getQualityGateFlowSegments(profiles, profile) {
  if (!DEV_QUALITY_GATE_PROFILES.includes(profile)) return []
  const stages = Array.isArray(profiles?.[profile]?.stages)
    ? profiles[profile].stages
    : []
  if (stages.length === 0) return []

  if (profile === 'full') {
    const strictStages = Array.isArray(profiles?.strict?.stages)
      ? profiles.strict.stages
      : []
    const shared =
      matchingStageSuffixLength(strictStages, stages) === stages.length
    return [
      {
        id: 'full-core',
        label: shared ? '完整门禁共用主路径' : '完整门禁主路径',
        scopeLabel: shared ? 'full / strict 共用' : '仅 full',
        stages: [...stages],
      },
    ]
  }

  const fullStages = Array.isArray(profiles?.full?.stages)
    ? profiles.full.stages
    : []
  const sharedCount = matchingStageSuffixLength(stages, fullStages)
  const specificCount = stages.length - sharedCount
  const segments = []
  if (specificCount > 0) {
    segments.push({
      id: 'strict-extra',
      label: '严格门禁附加检查',
      scopeLabel: '仅 strict',
      stages: stages.slice(0, specificCount),
    })
  }
  if (sharedCount > 0) {
    segments.push({
      id: 'full-core',
      label: '完整门禁共用主路径',
      scopeLabel: 'full / strict 共用',
      stages: stages.slice(specificCount),
    })
  }
  if (segments.length === 0) {
    segments.push({
      id: 'strict-core',
      label: '严格门禁主路径',
      scopeLabel: '仅 strict',
      stages: [...stages],
    })
  }
  return segments
}

export function buildQualityGateStageDurationComposition(stages) {
  const recorded = (Array.isArray(stages) ? stages : []).filter(
    (stage) => Number.isFinite(stage?.durationMs) && stage.durationMs >= 0
  )
  const totalDurationMs = recorded.reduce(
    (total, stage) => total + stage.durationMs,
    0
  )
  if (totalDurationMs <= 0) {
    return { totalDurationMs: 0, hasParallel: false, items: [] }
  }
  const longestDurationMs = Math.max(
    ...recorded.map((stage) => stage.durationMs)
  )
  return {
    totalDurationMs,
    hasParallel: recorded.some((stage) => stage.parallel === true),
    items: recorded.map((stage) => ({
      id: stage.id,
      label: stage.label,
      durationMs: stage.durationMs,
      sharePercent: Number(
        ((stage.durationMs / totalDurationMs) * 100).toFixed(1)
      ),
      parallel: stage.parallel === true,
      longest: stage.durationMs === longestDurationMs,
    })),
  }
}

export function buildQualityGateHistoryTrend(operations, referenceOperation) {
  const referenceReceipt = referenceOperation?.receipt
  if (
    !DEV_QUALITY_GATE_PROFILES.includes(referenceOperation?.profile) ||
    !referenceReceipt ||
    !HASH_PATTERN.test(referenceReceipt.environmentFingerprint) ||
    !['clean', 'dirty'].includes(referenceReceipt.treeState)
  ) {
    return {
      profile: '',
      treeState: '',
      environmentFingerprint: '',
      sampleCount: 0,
      enoughSamples: false,
      maxDurationMs: 0,
      samples: [],
    }
  }
  const samples = (Array.isArray(operations) ? operations : [])
    .filter(
      (operation) =>
        operation?.profile === referenceOperation.profile &&
        operation.status === 'passed' &&
        operation.receipt?.status === 'passed' &&
        operation.receipt.environmentFingerprint ===
          referenceReceipt.environmentFingerprint &&
        operation.receipt.treeState === referenceReceipt.treeState &&
        Number.isFinite(operation.receipt.durationMs) &&
        operation.receipt.durationMs >= 0 &&
        isIsoDate(operation.receipt.finishedAt)
    )
    .sort(
      (left, right) =>
        Date.parse(left.receipt.finishedAt) -
        Date.parse(right.receipt.finishedAt)
    )
    .slice(-8)
    .map((operation) => ({
      id: operation.id,
      finishedAt: operation.receipt.finishedAt,
      durationMs: operation.receipt.durationMs,
    }))
  return {
    profile: referenceOperation.profile,
    treeState: referenceReceipt.treeState,
    environmentFingerprint: referenceReceipt.environmentFingerprint,
    sampleCount: samples.length,
    enoughSamples: samples.length >= 3,
    maxDurationMs: Math.max(0, ...samples.map((sample) => sample.durationMs)),
    samples,
  }
}

export function buildQualityGateCoverageMatrix(categories) {
  const source = Array.isArray(categories) ? categories : []
  const gates = []
  const gateKeys = new Set()
  for (const category of source) {
    for (const result of category.gateResults || []) {
      if (gateKeys.has(result.gateKey)) continue
      gateKeys.add(result.gateKey)
      gates.push({ key: result.gateKey, label: result.label })
    }
  }
  return {
    gates,
    rows: source.map((category) => {
      const results = new Map(
        (category.gateResults || []).map((result) => [result.gateKey, result])
      )
      return {
        key: category.key,
        label: category.label,
        highRisk: Boolean(category.highRisk),
        cells: gates.map((gate) => ({
          gateKey: gate.key,
          status: results.get(gate.key)?.status || 'not_applicable',
        })),
      }
    }),
  }
}

export function formatQualityGateDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '尚无可用耗时记录'
  const totalSeconds = Math.floor(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [
    hours ? `${hours} 小时` : '',
    minutes ? `${minutes} 分` : '',
    `${seconds} 秒`,
  ]
    .filter(Boolean)
    .join(' ')
}

function operationMatchesCurrentRepository(operation, repository) {
  return Boolean(
    operation?.repository?.commit === repository?.commit &&
      operation?.repository?.dirty === repository?.dirty &&
      operation?.repository?.fingerprint === repository?.fingerprint
  )
}

function projectHistoricalQualityGateOperation(operation) {
  return {
    ...operation,
    displayContext: 'history',
    message:
      '这是旧版本的历史运行记录，不代表当前版本；请以当前仓库身份的正式回执为准。',
  }
}

export function projectCurrentQualityGateProof(summary, profile) {
  if (!DEV_QUALITY_GATE_PROFILES.includes(profile)) return null
  const proof = summary?.proofs?.[profile]
  const receipt = proof?.receipt
  if (!proof?.current || !receipt) return null
  const { finishedAt } = receipt
  const startedAt = new Date(
    Math.max(0, Date.parse(finishedAt) - receipt.durationMs)
  ).toISOString()
  const failedStage = receipt.stageTimings.find(
    (stage) => stage.status === 'failed'
  )
  return {
    schemaVersion: DEV_QUALITY_GATE_OPERATION_SCHEMA,
    id: `current-proof-${profile}`,
    profile,
    repository: summary.repository,
    status: receipt.status,
    stage:
      failedStage?.id || receipt.stageTimings.at(-1)?.id || 'formal_receipt',
    stageTimings: receipt.stageTimings,
    receipt,
    cleanup: {
      status: 'complete',
      message: '当前版本正式回执已完成门禁终态与一次性数据库清理证明',
    },
    firstFailure: failedStage ? `${failedStage.label}未通过` : '',
    cancelRequestedAt: null,
    revision: 1,
    createdAt: startedAt,
    updatedAt: finishedAt,
    finishedAt,
    message:
      receipt.status === 'passed'
        ? '当前版本的正式验证回执已通过，并与当前仓库身份一致。'
        : '当前版本的正式验证回执未通过，请先修复失败阶段。',
    displayContext: 'current-proof',
    proofOnly: true,
  }
}

export function selectDisplayedQualityGateOperation(
  summary,
  { operationId = '', profile = '' } = {}
) {
  if (!summary) return null
  if (summary.currentOperation) {
    return { ...summary.currentOperation, displayContext: 'active' }
  }
  const operations = Array.isArray(summary.operations) ? summary.operations : []
  if (operationId) {
    const selected = operations.find(
      (operation) => operation.id === operationId
    )
    if (!selected) return null
    return operationMatchesCurrentRepository(selected, summary.repository)
      ? { ...selected, displayContext: 'current-operation' }
      : projectHistoricalQualityGateOperation(selected)
  }
  const profiles = profile ? [profile] : ['strict', 'full']
  for (const candidateProfile of profiles) {
    if (!DEV_QUALITY_GATE_PROFILES.includes(candidateProfile)) continue
    const currentOperation = operations.find(
      (operation) =>
        operation.profile === candidateProfile &&
        operationMatchesCurrentRepository(operation, summary.repository)
    )
    if (currentOperation) {
      return { ...currentOperation, displayContext: 'current-operation' }
    }
    const proof = projectCurrentQualityGateProof(summary, candidateProfile)
    if (proof) return proof
  }
  const historical = profile
    ? operations.find((operation) => operation.profile === profile)
    : operations[0]
  return historical ? projectHistoricalQualityGateOperation(historical) : null
}

function requestError() {
  return new Error('质量门禁接口暂时不可用')
}

async function readJsonResponse(response) {
  let payload
  try {
    payload = await response.json()
  } catch {
    throw requestError()
  }
  if (!response.ok) throw requestError()
  return payload
}

export function createDevQualityGateClient({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  async function readSession(signal) {
    const response = await fetchImpl(DEV_QUALITY_GATE_SESSION_API_PATH, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    })
    const payload = await readJsonResponse(response)
    assertExactKeys(
      payload,
      ['apiPath', 'csrfToken', 'schemaVersion'],
      'quality gate session'
    )
    if (
      payload.schemaVersion !== 'plush.dev-quality-gate-session/v1' ||
      payload.apiPath !== DEV_QUALITY_GATE_API_PATH ||
      typeof payload.csrfToken !== 'string' ||
      payload.csrfToken.length < 32 ||
      payload.csrfToken.length > 128
    ) {
      throw requestError()
    }
    return payload.csrfToken
  }

  return {
    async summary({ signal } = {}) {
      const response = await fetchImpl(DEV_QUALITY_GATE_API_PATH, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      })
      return normalizeDevQualityGateSummary(await readJsonResponse(response))
    },
    async governance({ filter = 'relevant', q = '', signal } = {}) {
      const query = new URLSearchParams({ filter })
      if (q) query.set('q', q)
      const response = await fetchImpl(
        `${DEV_QUALITY_GATE_GOVERNANCE_API_PATH}?${query.toString()}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          credentials: 'same-origin',
          signal,
        }
      )
      return normalizeDevQualityGateGovernance(await readJsonResponse(response))
    },
    async gaps({ range = 'current', risk = 'all', signal } = {}) {
      const query = new URLSearchParams({ range, risk })
      const response = await fetchImpl(
        `${DEV_QUALITY_GATE_GAPS_API_PATH}?${query.toString()}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          credentials: 'same-origin',
          signal,
        }
      )
      return normalizeDevQualityGateGaps(await readJsonResponse(response))
    },
    async start(profile, idempotencyKey, { signal } = {}) {
      const match = IDEMPOTENCY_PATTERN.exec(String(idempotencyKey || ''))
      if (
        !DEV_QUALITY_GATE_PROFILES.includes(profile) ||
        match?.[1] !== profile
      ) {
        throw new Error('质量门禁运行请求无效')
      }
      const csrfToken = await readSession(signal)
      const response = await fetchImpl(DEV_QUALITY_GATE_ACTION_API_PATH, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          action: 'run',
          payload: { profile, idempotencyKey },
        }),
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      })
      const payload = await readJsonResponse(response)
      assertExactKeys(
        payload,
        ['operation', 'profile', 'reused', 'schemaVersion'],
        'quality gate action result'
      )
      if (
        payload.schemaVersion !== 'plush.dev-quality-gate-action-result/v1' ||
        payload.profile !== profile ||
        typeof payload.reused !== 'boolean'
      ) {
        throw requestError()
      }
      return {
        operation: normalizeDevQualityGateOperation(payload.operation),
        reused: payload.reused,
      }
    },
    async cancel(operationId, { signal } = {}) {
      if (!UUID_PATTERN.test(String(operationId || ''))) {
        throw new Error('质量门禁运行记录无效')
      }
      const csrfToken = await readSession(signal)
      const response = await fetchImpl(
        `${DEV_QUALITY_GATE_OPERATION_API_PREFIX}/${operationId}/cancel`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({ action: 'cancel' }),
          cache: 'no-store',
          credentials: 'same-origin',
          signal,
        }
      )
      const payload = await readJsonResponse(response)
      assertExactKeys(
        payload,
        ['operation', 'schemaVersion'],
        'quality gate cancel result'
      )
      if (payload.schemaVersion !== 'plush.dev-quality-gate-cancel-result/v1') {
        throw requestError()
      }
      return normalizeDevQualityGateOperation(payload.operation)
    },
  }
}
