export const DEV_TESTING_OPERATION_API_PATH = '/__dev/api/qa/testing'
export const DEV_TESTING_OPERATION_SESSION_API_PATH = `${DEV_TESTING_OPERATION_API_PATH}/session`
export const DEV_TESTING_OPERATION_PLAN_API_PATH = `${DEV_TESTING_OPERATION_API_PATH}/plan`
export const DEV_TESTING_OPERATION_ACTION_API_PATH = `${DEV_TESTING_OPERATION_API_PATH}/actions`
export const DEV_TESTING_OPERATION_API_PREFIX = `${DEV_TESTING_OPERATION_API_PATH}/operations`
export const DEV_TESTING_OPERATION_SCHEMA =
  'plush.dev-qa-testing-operation-public/v1'

export const DEV_TESTING_FIXED_ACTIONS = Object.freeze([
  Object.freeze({
    key: 'fast',
    priority: 'P0',
    label: '运行开发门禁',
    description:
      '执行带回执的 fast 门禁，覆盖静态守卫、关键合同、Web 检查与服务端快速测试。',
    boundary: '不包含 PostgreSQL、真实业务浏览器、目标环境部署或客户 UAT。',
  }),
  Object.freeze({
    key: 'role-access',
    priority: 'P1',
    label: '岗位权限与任务可见性巡检',
    description:
      '九岗位真实登录，验证允许读取、越权写入被拒绝、前后任务总量不串权。',
    boundary:
      '需要本地后端与演示账号凭据；预期业务写入为零，不等于完整角色协同闭环。',
  }),
  Object.freeze({
    key: 'field-linkage',
    priority: 'P1',
    label: '字段联动专项',
    description:
      '验证字段来源、覆盖、清空、列表回显及打印合同，并原子更新专项报告。',
    boundary: '不连接数据库、不启动真实业务浏览器，也不代替端到端验收。',
  }),
])

export const DEV_TESTING_OPERATION_ACTIVE_STATUSES = Object.freeze([
  'queued',
  'running',
])
export const DEV_TESTING_OPERATION_TERMINAL_STATUSES = Object.freeze([
  'completed',
  'failed',
  'blocked',
  'not_proven',
])

const ACTION_KEYS = DEV_TESTING_FIXED_ACTIONS.map((action) => action.key)
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const COMMIT_PATTERN = /^[0-9a-f]{40,64}$/u
const HASH_PATTERN = /^[0-9a-f]{64}$/u
const LEVEL_PATTERN = /^T[0-8]$/u
const IDEMPOTENCY_PATTERN =
  /^testing:(fast|role-access|field-linkage):([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u
const STATUS_META = Object.freeze({
  queued: Object.freeze({ label: '等待启动', tone: 'primary' }),
  running: Object.freeze({ label: '运行中', tone: 'primary' }),
  completed: Object.freeze({ label: '已通过', tone: 'success' }),
  failed: Object.freeze({ label: '未通过', tone: 'danger' }),
  blocked: Object.freeze({ label: '前置未就绪', tone: 'warning' }),
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

function safeText(value, field, max = 1000) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > max ||
    [...value].some((character) => {
      const code = character.codePointAt(0)
      return code <= 31 || code === 127
    })
  ) {
    throw new Error(`${field} is invalid`)
  }
  return value
}

function normalizeRepository(repository) {
  assertExactKeys(
    repository,
    ['commit', 'dirty', 'fingerprint'],
    'testing repository'
  )
  if (
    !COMMIT_PATTERN.test(repository.commit) ||
    typeof repository.dirty !== 'boolean' ||
    !HASH_PATTERN.test(repository.fingerprint)
  ) {
    throw new Error('testing repository is invalid')
  }
  return { ...repository }
}

export function normalizeDevTestingOperation(operation) {
  assertExactKeys(
    operation,
    [
      'action',
      'createdAt',
      'exitCode',
      'finishedAt',
      'id',
      'message',
      'outcome',
      'repository',
      'revision',
      'schemaVersion',
      'stage',
      'status',
      'updatedAt',
    ],
    'testing operation'
  )
  if (
    operation.schemaVersion !== DEV_TESTING_OPERATION_SCHEMA ||
    !UUID_PATTERN.test(operation.id) ||
    !ACTION_KEYS.includes(operation.action) ||
    !Object.hasOwn(STATUS_META, operation.status) ||
    !['queued', 'running', 'identity-check', 'finished'].includes(
      operation.stage
    ) ||
    !Number.isSafeInteger(operation.revision) ||
    operation.revision < 1 ||
    !isIsoDate(operation.createdAt) ||
    !isIsoDate(operation.updatedAt)
  ) {
    throw new Error('testing operation is invalid')
  }
  const terminal = DEV_TESTING_OPERATION_TERMINAL_STATUSES.includes(
    operation.status
  )
  if (
    (terminal &&
      (!isIsoDate(operation.finishedAt) || operation.stage !== 'finished')) ||
    (!terminal && operation.finishedAt !== null) ||
    (operation.status === 'completed' &&
      (operation.outcome !== 'passed' || operation.exitCode !== 0)) ||
    (operation.status === 'blocked' &&
      (operation.outcome !== 'blocked' || operation.exitCode !== 2)) ||
    (!['completed', 'blocked'].includes(operation.status) &&
      operation.outcome !== null) ||
    (operation.exitCode !== null &&
      (!Number.isSafeInteger(operation.exitCode) ||
        operation.exitCode < 0 ||
        operation.exitCode > 255))
  ) {
    throw new Error('testing operation state is inconsistent')
  }
  return {
    ...operation,
    repository: normalizeRepository(operation.repository),
    message: safeText(operation.message, 'testing operation message'),
  }
}

export function normalizeOptionalDevTestingOperation(operation) {
  if (operation === null || operation === undefined) return null
  try {
    return normalizeDevTestingOperation(operation)
  } catch {
    return null
  }
}

function normalizeBusy(busy) {
  assertExactKeys(busy, ['active', 'kind', 'profile'], 'testing busy state')
  if (
    typeof busy.active !== 'boolean' ||
    typeof busy.kind !== 'string' ||
    typeof busy.profile !== 'string' ||
    (busy.active &&
      (!['coverage', 'testing'].includes(busy.kind) ||
        !['baseline', ...ACTION_KEYS].includes(busy.profile))) ||
    (!busy.active && (busy.kind || busy.profile))
  ) {
    throw new Error('testing busy state is invalid')
  }
  return { ...busy }
}

export function normalizeDevTestingSummary(summary) {
  assertExactKeys(
    summary,
    ['busy', 'operations', 'schemaVersion'],
    'testing summary'
  )
  if (summary.schemaVersion !== 'plush.dev-qa-testing-summary/v1') {
    throw new Error('testing summary is invalid')
  }
  assertExactKeys(summary.operations, ACTION_KEYS, 'testing operations')
  return {
    schemaVersion: summary.schemaVersion,
    busy: normalizeBusy(summary.busy),
    operations: Object.fromEntries(
      ACTION_KEYS.map((action) => {
        const operation = normalizeOptionalDevTestingOperation(
          summary.operations[action]
        )
        if (operation && operation.action !== action) {
          throw new Error('testing summary action is inconsistent')
        }
        return [action, operation]
      })
    ),
  }
}

function normalizePlanCommand(command) {
  assertExactKeys(
    command,
    ['command', 'cwd', 'id', 'label', 'level'],
    'testing plan command'
  )
  if (
    !LEVEL_PATTERN.test(command.level) ||
    typeof command.cwd !== 'string' ||
    command.cwd.length < 1 ||
    command.cwd.startsWith('/') ||
    command.cwd.split('/').includes('..')
  ) {
    throw new Error('testing plan command is invalid')
  }
  return {
    id: safeText(command.id, 'testing plan command id', 100),
    level: command.level,
    label: safeText(command.label, 'testing plan command label', 200),
    cwd: command.cwd,
    command: safeText(command.command, 'testing plan command text', 1000),
  }
}

function normalizePlanFollowUp(item) {
  assertExactKeys(item, ['level', 'text'], 'testing plan follow-up')
  if (!LEVEL_PATTERN.test(item.level)) {
    throw new Error('testing plan follow-up is invalid')
  }
  return {
    level: item.level,
    text: safeText(item.text, 'testing plan follow-up text', 1000),
  }
}

export function normalizeDevTestingPlan(plan) {
  assertExactKeys(
    plan,
    [
      'changedCount',
      'commands',
      'followUps',
      'generatedAt',
      'highestLevel',
      'levels',
      'prePushGate',
      'repository',
      'requiresFull',
      'schemaVersion',
    ],
    'testing plan'
  )
  if (
    plan.schemaVersion !== 'plush.dev-qa-testing-plan/v1' ||
    !isIsoDate(plan.generatedAt) ||
    !Number.isSafeInteger(plan.changedCount) ||
    plan.changedCount < 0 ||
    !Array.isArray(plan.levels) ||
    plan.levels.length < 1 ||
    !plan.levels.every((level) => LEVEL_PATTERN.test(level)) ||
    !LEVEL_PATTERN.test(plan.highestLevel) ||
    typeof plan.requiresFull !== 'boolean' ||
    !Array.isArray(plan.commands) ||
    !Array.isArray(plan.followUps) ||
    plan.prePushGate !== 'bash scripts/qa/prepare-push.sh'
  ) {
    throw new Error('testing plan is invalid')
  }
  return {
    ...plan,
    repository: normalizeRepository(plan.repository),
    levels: [...plan.levels],
    commands: plan.commands.map(normalizePlanCommand),
    followUps: plan.followUps.map(normalizePlanFollowUp),
  }
}

export function isDevTestingOperationActive(operation) {
  return DEV_TESTING_OPERATION_ACTIVE_STATUSES.includes(operation?.status)
}

export function getDevTestingOperationPresentation(operation) {
  if (!operation) {
    return {
      active: false,
      terminal: false,
      label: '尚未运行',
      tone: 'default',
    }
  }
  const status = STATUS_META[operation.status] || STATUS_META.not_proven
  return {
    active: isDevTestingOperationActive(operation),
    terminal: DEV_TESTING_OPERATION_TERMINAL_STATUSES.includes(
      operation.status
    ),
    label: status.label,
    tone: status.tone,
  }
}

function requestError() {
  return new Error('固定验证接口暂时不可用')
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

export function createDevTestingIdempotencyKey(
  action,
  { randomUUID = () => globalThis.crypto.randomUUID() } = {}
) {
  if (!ACTION_KEYS.includes(action)) {
    throw new Error('固定验证动作无效')
  }
  const value = randomUUID()
  if (!UUID_PATTERN.test(value)) {
    throw new Error('无法生成固定验证请求标识')
  }
  return `testing:${action}:${value}`
}

export function createDevTestingOperationClient({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  async function readSession(signal) {
    const response = await fetchImpl(DEV_TESTING_OPERATION_SESSION_API_PATH, {
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
      'testing session'
    )
    if (
      payload.schemaVersion !== 'plush.dev-qa-testing-session/v1' ||
      payload.apiPath !== DEV_TESTING_OPERATION_API_PATH ||
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
      const response = await fetchImpl(DEV_TESTING_OPERATION_API_PATH, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      })
      return normalizeDevTestingSummary(await readJsonResponse(response))
    },

    async plan({ signal } = {}) {
      const response = await fetchImpl(DEV_TESTING_OPERATION_PLAN_API_PATH, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      })
      return normalizeDevTestingPlan(await readJsonResponse(response))
    },

    async start(action, idempotencyKey, { signal } = {}) {
      const match = IDEMPOTENCY_PATTERN.exec(String(idempotencyKey || ''))
      if (!ACTION_KEYS.includes(action) || match?.[1] !== action) {
        throw new Error('固定验证请求标识无效')
      }
      const csrfToken = await readSession(signal)
      const response = await fetchImpl(DEV_TESTING_OPERATION_ACTION_API_PATH, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          action,
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
        'testing action result'
      )
      if (
        payload.schemaVersion !== 'plush.dev-qa-testing-action-result/v1' ||
        payload.action !== action ||
        typeof payload.reused !== 'boolean'
      ) {
        throw requestError()
      }
      return normalizeDevTestingOperation(payload.operation)
    },

    async read(operationId, { signal } = {}) {
      if (!UUID_PATTERN.test(String(operationId || ''))) {
        throw new Error('固定验证任务标识无效')
      }
      const response = await fetchImpl(
        `${DEV_TESTING_OPERATION_API_PREFIX}/${operationId}`,
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
        'testing operation result'
      )
      if (
        payload.schemaVersion !== 'plush.dev-qa-testing-operation-result/v1'
      ) {
        throw requestError()
      }
      return normalizeDevTestingOperation(payload.operation)
    },
  }
}
