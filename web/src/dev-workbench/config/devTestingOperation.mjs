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

export const DEV_TESTING_GIT_HOOK_PATH_COMMAND =
  'git config --get core.hooksPath'
export const DEV_TESTING_PREPARE_PUSH_COMMAND =
  'bash scripts/qa/prepare-push.sh'

export const DEV_TESTING_GIT_HOOK_CHECKS = Object.freeze([
  Object.freeze({
    key: 'hooks-path',
    label: 'Git Hook 入口目录',
    sourcePath: 'git config core.hooksPath',
  }),
  Object.freeze({
    key: 'pre-commit-entry',
    label: '暂存检查入口',
    sourcePath: '.githooks/pre-commit',
  }),
  Object.freeze({
    key: 'commit-msg-entry',
    label: '提交信息入口',
    sourcePath: '.githooks/commit-msg',
  }),
  Object.freeze({
    key: 'pre-push-entry',
    label: '推送复核入口',
    sourcePath: '.githooks/pre-push',
  }),
  Object.freeze({
    key: 'pre-commit-runner',
    label: '暂存检查实现',
    sourcePath: 'scripts/git-hooks/pre-commit.sh',
  }),
  Object.freeze({
    key: 'commit-msg-runner',
    label: '提交信息实现',
    sourcePath: 'scripts/git-hooks/commit-msg.sh',
  }),
  Object.freeze({
    key: 'pre-push-runner',
    label: '推送复核实现',
    sourcePath: 'scripts/git-hooks/pre-push.sh',
  }),
  Object.freeze({
    key: 'prepare-push',
    label: '完整门禁与回执入口',
    sourcePath: 'scripts/qa/prepare-push.sh',
  }),
])

export const DEV_TESTING_GIT_CLOSEOUT_STAGES = Object.freeze([
  Object.freeze({
    key: 'pre-commit',
    label: '暂存内容检查',
    trigger: '提交时自动触发',
    description:
      '只核对本次暂存快照、快速门禁和相关静态合同，发现问题就阻止提交。',
    boundary:
      '这是 check-only 快速入口，不生成代码、不改 migration，也不等于完整 full 门禁。',
    sources: Object.freeze([
      '.githooks/pre-commit',
      'scripts/git-hooks/pre-commit.sh',
    ]),
  }),
  Object.freeze({
    key: 'commit-msg',
    label: '提交信息检查',
    trigger: '写入提交信息时自动触发',
    description: '检查提交信息是否符合仓库约定，让后续追踪和回滚能够读懂。',
    boundary: '只检查提交信息，不证明代码、测试或发布已经完成。',
    sources: Object.freeze([
      '.githooks/commit-msg',
      'scripts/git-hooks/commit-msg.sh',
    ]),
  }),
  Object.freeze({
    key: 'prepare-push',
    label: '完整门禁与短期回执',
    trigger: '准备推送前手动运行',
    description:
      '对干净且已提交的 HEAD 运行完整门禁，并生成与当前仓库身份绑定的短期回执。',
    boundary:
      '只准备推送证据，不执行 push，也不替代目标环境、发布回滚或客户 UAT。',
    sources: Object.freeze(['scripts/qa/prepare-push.sh']),
  }),
  Object.freeze({
    key: 'pre-push',
    label: '推送范围与回执复核',
    trigger: '更新远端引用前自动触发',
    description: '复核将要推送的范围，并校验短期回执仍对应当前干净 HEAD。',
    boundary:
      '回执缺失、过期或仓库身份变化都会阻止推送；这里不会重新运行完整门禁。',
    sources: Object.freeze([
      '.githooks/pre-push',
      'scripts/git-hooks/pre-push.sh',
    ]),
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
const HOOK_STATUS_META = Object.freeze({
  ready: Object.freeze({ label: '接线完整', tone: 'success' }),
  missing: Object.freeze({ label: '文件缺失', tone: 'danger' }),
  not_executable: Object.freeze({ label: '不可执行', tone: 'warning' }),
  misconfigured: Object.freeze({ label: '目录未接入', tone: 'danger' }),
  invalid: Object.freeze({ label: '无法确认', tone: 'warning' }),
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
      (!['coverage', 'testing', 'quality'].includes(busy.kind) ||
        !['baseline', ...ACTION_KEYS, 'full', 'strict'].includes(
          busy.profile
        ))) ||
    (!busy.active && (busy.kind || busy.profile))
  ) {
    throw new Error('testing busy state is invalid')
  }
  return { ...busy }
}

function normalizeGitHookGovernance(hooks) {
  assertExactKeys(
    hooks,
    ['checks', 'configuredHooksPath', 'expectedHooksPath', 'status'],
    'testing hook governance'
  )
  if (
    !['ready', 'blocked'].includes(hooks.status) ||
    hooks.expectedHooksPath !== '.githooks' ||
    !['.githooks', '未配置', '其他路径'].includes(hooks.configuredHooksPath) ||
    !Array.isArray(hooks.checks) ||
    hooks.checks.length !== DEV_TESTING_GIT_HOOK_CHECKS.length
  ) {
    throw new Error('testing hook governance is invalid')
  }
  const checks = hooks.checks.map((check, index) => {
    assertExactKeys(check, ['key', 'status'], 'testing hook check')
    const definition = DEV_TESTING_GIT_HOOK_CHECKS[index]
    if (
      check.key !== definition.key ||
      !Object.hasOwn(HOOK_STATUS_META, check.status)
    ) {
      throw new Error('testing hook check is invalid')
    }
    return { ...definition, status: check.status }
  })
  const allReady = checks.every((check) => check.status === 'ready')
  if (
    (hooks.status === 'ready') !== allReady ||
    (hooks.configuredHooksPath === '.githooks') !==
      (checks[0].status === 'ready')
  ) {
    throw new Error('testing hook governance is inconsistent')
  }
  return {
    status: hooks.status,
    expectedHooksPath: hooks.expectedHooksPath,
    configuredHooksPath: hooks.configuredHooksPath,
    checks,
  }
}

export function normalizeDevTestingSummary(summary) {
  assertExactKeys(
    summary,
    ['busy', 'hooks', 'operations', 'schemaVersion'],
    'testing summary'
  )
  if (summary.schemaVersion !== 'plush.dev-qa-testing-summary/v2') {
    throw new Error('testing summary is invalid')
  }
  assertExactKeys(summary.operations, ACTION_KEYS, 'testing operations')
  return {
    schemaVersion: summary.schemaVersion,
    busy: normalizeBusy(summary.busy),
    hooks: normalizeGitHookGovernance(summary.hooks),
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

export function getDevTestingGitHookStatusMeta(status) {
  return HOOK_STATUS_META[status] || HOOK_STATUS_META.invalid
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
