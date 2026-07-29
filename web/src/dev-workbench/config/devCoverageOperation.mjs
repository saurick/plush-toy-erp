export const DEV_COVERAGE_API_PATH = '/__dev/api/qa/coverage'
export const DEV_COVERAGE_SESSION_API_PATH = `${DEV_COVERAGE_API_PATH}/session`
export const DEV_COVERAGE_ACTION_API_PATH = `${DEV_COVERAGE_API_PATH}/actions`
export const DEV_COVERAGE_OPERATION_API_PREFIX =
  `${DEV_COVERAGE_API_PATH}/operations`

export const DEV_COVERAGE_OPERATION_SCHEMA =
  'plush.dev-qa-coverage-operation-public/v1'
export const DEV_COVERAGE_OPERATION_ACTIVE_STATUSES = Object.freeze([
  'queued',
  'running',
])
export const DEV_COVERAGE_OPERATION_TERMINAL_STATUSES = Object.freeze([
  'completed',
  'failed',
  'not_proven',
])

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const COMMIT_PATTERN = /^[0-9a-f]{40,64}$/u
const HASH_PATTERN = /^[0-9a-f]{64}$/u
const IDEMPOTENCY_PATTERN =
  /^coverage:collect:baseline:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

const STAGE_META = Object.freeze({
  queued: Object.freeze({
    step: 0,
    label: '准备固定 baseline 采集器',
  }),
  't0-static': Object.freeze({ step: 1, label: 'T0 静态检查' }),
  't1-docs': Object.freeze({ step: 2, label: 'T1 文档合同' }),
  go: Object.freeze({ step: 3, label: 'Go 测试与代码覆盖' }),
  'web-lint': Object.freeze({ step: 4, label: 'Web ESLint' }),
  'web-css': Object.freeze({ step: 5, label: 'Web Stylelint' }),
  web: Object.freeze({ step: 6, label: 'Web 测试与代码覆盖' }),
  import: Object.freeze({ step: 7, label: '导入合同' }),
  'field-linkage': Object.freeze({ step: 8, label: '字段联动专项' }),
  'identity-check': Object.freeze({ step: 9, label: '仓库身份核对' }),
  aggregate: Object.freeze({ step: 10, label: '聚合覆盖报告' }),
  finished: Object.freeze({ step: 10, label: '采集结束' }),
})

const STATUS_META = Object.freeze({
  queued: Object.freeze({ label: '等待启动', tone: 'primary' }),
  running: Object.freeze({ label: '正在采集', tone: 'primary' }),
  completed: Object.freeze({ label: '采集完成', tone: 'success' }),
  failed: Object.freeze({ label: '采集失败', tone: 'danger' }),
  not_proven: Object.freeze({ label: '结果无法证明', tone: 'warning' }),
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

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function safeText(value, field, max = 500) {
  const hasControlCharacter =
    typeof value === 'string' &&
    [...value].some((character) => {
      const code = character.codePointAt(0)
      return code <= 31 || code === 127
    })
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > max ||
    hasControlCharacter
  ) {
    throw new Error(`${field} is invalid`)
  }
  return value
}

function normalizeRepository(repository) {
  assertExactKeys(
    repository,
    ['commit', 'dirty', 'fingerprint'],
    'coverage operation repository'
  )
  if (
    !COMMIT_PATTERN.test(repository.commit) ||
    typeof repository.dirty !== 'boolean' ||
    !HASH_PATTERN.test(repository.fingerprint)
  ) {
    throw new Error('coverage operation repository is invalid')
  }
  return {
    commit: repository.commit,
    dirty: repository.dirty,
    fingerprint: repository.fingerprint,
  }
}

function normalizeEvent(event) {
  assertExactKeys(
    event,
    ['at', 'message', 'stage', 'status'],
    'coverage operation event'
  )
  if (
    !isIsoDate(event.at) ||
    !Object.hasOwn(STAGE_META, event.stage) ||
    !Object.hasOwn(STATUS_META, event.status)
  ) {
    throw new Error('coverage operation event is invalid')
  }
  return {
    at: event.at,
    status: event.status,
    stage: event.stage,
    message: safeText(event.message, 'coverage operation event message'),
  }
}

export function normalizeDevCoverageOperation(operation) {
  assertExactKeys(
    operation,
    [
      'createdAt',
      'events',
      'exitCode',
      'finishedAt',
      'id',
      'message',
      'outcome',
      'profile',
      'repository',
      'revision',
      'schemaVersion',
      'stage',
      'status',
      'updatedAt',
    ],
    'coverage operation'
  )
  if (
    operation.schemaVersion !== DEV_COVERAGE_OPERATION_SCHEMA ||
    !UUID_PATTERN.test(operation.id) ||
    operation.profile !== 'baseline' ||
    !Object.hasOwn(STATUS_META, operation.status) ||
    !Object.hasOwn(STAGE_META, operation.stage) ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 1 ||
    !isIsoDate(operation.createdAt) ||
    !isIsoDate(operation.updatedAt) ||
    !Array.isArray(operation.events) ||
    operation.events.length < 1 ||
    operation.events.length > 100
  ) {
    throw new Error('coverage operation is invalid')
  }
  const terminal = DEV_COVERAGE_OPERATION_TERMINAL_STATUSES.includes(
    operation.status
  )
  if (
    (terminal && (!isIsoDate(operation.finishedAt) || operation.stage !== 'finished')) ||
    (!terminal && operation.finishedAt !== null) ||
    (operation.status === 'completed' &&
      (!['passed', 'issues'].includes(operation.outcome) ||
        ![0, 2].includes(operation.exitCode))) ||
    (operation.status !== 'completed' && operation.outcome !== null) ||
    (operation.exitCode !== null &&
      (!Number.isSafeInteger(operation.exitCode) ||
        operation.exitCode < 0 ||
        operation.exitCode > 255))
  ) {
    throw new Error('coverage operation state is inconsistent')
  }
  return {
    schemaVersion: operation.schemaVersion,
    id: operation.id,
    profile: operation.profile,
    repository: normalizeRepository(operation.repository),
    status: operation.status,
    stage: operation.stage,
    outcome: operation.outcome,
    exitCode: operation.exitCode,
    revision: operation.revision,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    finishedAt: operation.finishedAt,
    message: safeText(operation.message, 'coverage operation message'),
    events: operation.events.map(normalizeEvent),
  }
}

export function normalizeOptionalDevCoverageOperation(operation) {
  if (operation === null || operation === undefined) return null
  try {
    return normalizeDevCoverageOperation(operation)
  } catch {
    return null
  }
}

export function isDevCoverageOperationActive(operation) {
  return DEV_COVERAGE_OPERATION_ACTIVE_STATUSES.includes(operation?.status)
}

export function getDevCoverageOperationPresentation(operation) {
  if (!operation) {
    return {
      active: false,
      terminal: false,
      label: '尚未发起采集',
      tone: 'default',
      stageLabel: '等待一键采集',
      step: 0,
      totalSteps: 10,
      percentage: 0,
    }
  }
  const stage = STAGE_META[operation.stage] || STAGE_META.queued
  const status = STATUS_META[operation.status] || STATUS_META.not_proven
  const active = isDevCoverageOperationActive(operation)
  const terminal = DEV_COVERAGE_OPERATION_TERMINAL_STATUSES.includes(
    operation.status
  )
  const tone =
    operation.status === 'completed' && operation.outcome === 'issues'
      ? 'warning'
      : status.tone
  return {
    active,
    terminal,
    label:
      operation.status === 'completed' && operation.outcome === 'issues'
        ? '采集完成，有失败或缺失项'
        : status.label,
    tone,
    stageLabel:
      stage.step > 0
        ? `第 ${stage.step}/10 阶段 · ${stage.label}`
        : stage.label,
    step: stage.step,
    totalSteps: 10,
    percentage: Math.min(100, stage.step * 10),
  }
}

function createRequestError() {
  return new Error('覆盖采集接口暂时不可用')
}

async function readJsonResponse(response) {
  let payload
  try {
    payload = await response.json()
  } catch {
    throw createRequestError()
  }
  if (!response.ok) throw createRequestError()
  return payload
}

export function createDevCoverageIdempotencyKey({
  randomUUID = () => globalThis.crypto.randomUUID(),
} = {}) {
  const value = randomUUID()
  if (!UUID_PATTERN.test(value)) {
    throw new Error('无法生成覆盖采集请求标识')
  }
  return `coverage:collect:baseline:${value}`
}

export function createDevCoverageOperationClient({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  async function readSession(signal) {
    const response = await fetchImpl(DEV_COVERAGE_SESSION_API_PATH, {
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
      'coverage session'
    )
    if (
      payload.schemaVersion !== 'plush.dev-qa-coverage-session/v1' ||
      payload.apiPath !== DEV_COVERAGE_API_PATH ||
      typeof payload.csrfToken !== 'string' ||
      payload.csrfToken.length < 32 ||
      payload.csrfToken.length > 128
    ) {
      throw createRequestError()
    }
    return payload.csrfToken
  }

  return {
    async start(idempotencyKey, { signal } = {}) {
      if (!IDEMPOTENCY_PATTERN.test(String(idempotencyKey || ''))) {
        throw new Error('覆盖采集请求标识无效')
      }
      const csrfToken = await readSession(signal)
      const response = await fetchImpl(DEV_COVERAGE_ACTION_API_PATH, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          action: 'collect',
          payload: { idempotencyKey },
        }),
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      })
      const payload = await readJsonResponse(response)
      assertExactKeys(
        payload,
        ['action', 'operation', 'reused', 'schemaVersion'],
        'coverage action result'
      )
      if (
        payload.schemaVersion !==
          'plush.dev-qa-coverage-action-result/v1' ||
        payload.action !== 'collect' ||
        typeof payload.reused !== 'boolean'
      ) {
        throw createRequestError()
      }
      return normalizeDevCoverageOperation(payload.operation)
    },

    async read(operationId, { signal } = {}) {
      if (!UUID_PATTERN.test(String(operationId || ''))) {
        throw new Error('覆盖采集任务标识无效')
      }
      const response = await fetchImpl(
        `${DEV_COVERAGE_OPERATION_API_PREFIX}/${operationId}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          credentials: 'same-origin',
          signal,
        }
      )
      const payload = await readJsonResponse(response)
      assertExactKeys(
        payload,
        ['operation', 'schemaVersion'],
        'coverage operation result'
      )
      if (
        payload.schemaVersion !==
        'plush.dev-qa-coverage-operation-result/v1'
      ) {
        throw createRequestError()
      }
      return normalizeDevCoverageOperation(payload.operation)
    },
  }
}
