import { DEV_DATABASE_MIGRATION_ROUTE } from './devRoutes.mjs'
import { isDevTimestamp } from './devTimestamp.mjs'

export { DEV_DATABASE_MIGRATION_ROUTE }

export const DEV_DATABASE_MIGRATION_API_PREFIX = '/__dev/api/database-migration'
export const DEV_DATABASE_MIGRATION_SESSION_API_PATH = `${DEV_DATABASE_MIGRATION_API_PREFIX}/session`
export const DEV_DATABASE_MIGRATION_SUMMARY_API_PATH = `${DEV_DATABASE_MIGRATION_API_PREFIX}/summary`
export const DEV_DATABASE_MIGRATION_ACTION_API_PATH = `${DEV_DATABASE_MIGRATION_API_PREFIX}/actions`
export const DEV_DATABASE_MIGRATION_OPERATION_API_PREFIX = `${DEV_DATABASE_MIGRATION_API_PREFIX}/operations`
export const DEV_DATABASE_MIGRATION_SOURCE_PATH =
  'docs/engineering/研发效能工作台与CI-CD设计.md'

const OPERATION_STATUSES = new Set([
  'preparing',
  'ready',
  'applying',
  'restarting',
  'passed',
  'failed',
  'blocked',
  'not_proven',
])
const ACTIVE_STATUSES = new Set([
  'preparing',
  'ready',
  'applying',
  'restarting',
])
const OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const TOOL_CHECK_KEYS = new Set([
  'container_runtime',
  'atlas',
  'postgresql_client',
  'supporting_commands',
])

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} 返回结构无效`)
  }
  return value
}

function assertSafeText(value, field, { empty = false, max = 1000 } = {}) {
  if (
    typeof value !== 'string' ||
    (!empty && value.length === 0) ||
    value.length > max ||
    /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/u.test(value) ||
    /(?:TRUST_SHARED_DEV_DATABASE|APPLY_DEV_MIGRATIONS|SHARED_DEV_MAINTENANCE_READY):/u.test(
      value
    )
  ) {
    throw new Error(`${field} 返回了不安全内容`)
  }
}

function validateIssue(issue) {
  assertObject(issue, '问题')
  if (
    !/^[a-z][a-z0-9_]{2,63}$/u.test(String(issue.code || '')) ||
    !['warning', 'blocked'].includes(issue.severity)
  ) {
    throw new Error('问题返回结构无效')
  }
  assertSafeText(issue.message, '问题说明')
  return issue
}

function validateEvent(event) {
  assertObject(event, '迁移状态事件')
  if (!isDevTimestamp(event.at) || !OPERATION_STATUSES.has(event.status)) {
    throw new Error('迁移状态事件返回结构无效')
  }
  assertSafeText(event.message, '迁移状态事件说明')
  return event
}

export function validateDatabaseMigrationOperation(operation) {
  assertObject(operation, '迁移操作')
  if (
    operation.schemaVersion !== 'plush.dev-database-migration-operation/v1' ||
    !OPERATION_ID_PATTERN.test(String(operation.id || '')) ||
    !['migration', 'restart'].includes(operation.kind) ||
    !OPERATION_STATUSES.has(operation.status) ||
    !isDevTimestamp(operation.createdAt) ||
    !isDevTimestamp(operation.updatedAt) ||
    Object.hasOwn(operation, 'internal')
  ) {
    throw new Error('迁移操作返回结构无效')
  }
  assertSafeText(operation.message, '操作说明')
  if (!Array.isArray(operation.issues)) {
    throw new Error('迁移操作问题列表无效')
  }
  operation.issues.forEach(validateIssue)
  if (operation.confirmationPrompt !== null) {
    assertSafeText(operation.confirmationPrompt, '确认文本', { max: 180 })
  }
  if (operation.target !== null) {
    assertObject(operation.target, '数据库目标')
    if (
      operation.target.key !== 'shared-dev' ||
      typeof operation.target.safeTarget !== 'string' ||
      !Number.isSafeInteger(operation.target.pendingFiles) ||
      operation.target.pendingFiles < 0
    ) {
      throw new Error('数据库目标返回结构无效')
    }
    assertSafeText(operation.target.safeTarget, '数据库目标')
  }
  if (operation.plan !== null) {
    assertObject(operation.plan, '迁移计划')
    if (
      !/^[0-9a-f]{64}$/u.test(String(operation.plan.hash || '')) ||
      !isDevTimestamp(operation.plan.preparedAt)
    ) {
      throw new Error('迁移计划返回结构无效')
    }
  }
  if (operation.backup !== null) {
    assertObject(operation.backup, '备份验证')
    if (
      operation.backup.restoreVerified !== true ||
      !Number.isSafeInteger(operation.backup.sizeBytes) ||
      operation.backup.sizeBytes < 1 ||
      !/^[0-9a-f]{64}$/u.test(String(operation.backup.sha256 || '')) ||
      !isDevTimestamp(operation.backup.verifiedAt)
    ) {
      throw new Error('备份验证返回结构无效')
    }
  }
  if (!Array.isArray(operation.events) || operation.events.length > 100) {
    throw new Error('迁移状态事件列表无效')
  }
  operation.events.forEach(validateEvent)
  return operation
}

function validateRuntime(runtime) {
  assertObject(runtime, '运行状态')
  if (typeof runtime.available !== 'boolean') {
    throw new Error('运行状态返回结构无效')
  }
  return runtime
}

function validateToolReadiness(tools) {
  assertObject(tools, '迁移准备环境')
  if (
    tools.schemaVersion !== 'plush.dev-database-migration-tools/v1' ||
    !['ready', 'blocked'].includes(tools.status) ||
    !Array.isArray(tools.checks) ||
    tools.checks.length < 1 ||
    tools.checks.length > TOOL_CHECK_KEYS.size
  ) {
    throw new Error('迁移准备环境返回结构无效')
  }
  const seen = new Set()
  tools.checks.forEach((check) => {
    assertObject(check, '迁移准备环境检查')
    if (
      !TOOL_CHECK_KEYS.has(check.key) ||
      seen.has(check.key) ||
      !['passed', 'blocked'].includes(check.status)
    ) {
      throw new Error('迁移准备环境检查返回结构无效')
    }
    assertSafeText(check.label, '迁移准备环境名称', { max: 80 })
    assertSafeText(check.message, '迁移准备环境说明', { max: 600 })
    seen.add(check.key)
  })
  const allPassed = tools.checks.every((check) => check.status === 'passed')
  if (
    (tools.status === 'ready') !== allPassed ||
    (tools.status === 'ready' && seen.size !== TOOL_CHECK_KEYS.size)
  ) {
    throw new Error('迁移准备环境状态不一致')
  }
  return tools
}

export function validateDatabaseMigrationSummary(summary) {
  assertObject(summary, '数据库迁移摘要')
  if (
    summary.schemaVersion !== 'plush.dev-database-migration-summary/v1' ||
    !['success', 'blocked'].includes(summary.status) ||
    !Array.isArray(summary.operations) ||
    !Array.isArray(summary.issues)
  ) {
    throw new Error('数据库迁移摘要返回结构无效')
  }
  summary.issues.forEach(validateIssue)
  summary.operations.forEach(validateDatabaseMigrationOperation)
  validateRuntime(summary.runtime)
  validateToolReadiness(summary.tools)
  if (summary.target !== null) {
    assertObject(summary.target, '数据库目标')
    if (
      summary.target.key !== 'shared-dev' ||
      !Number.isSafeInteger(summary.target.pendingFiles) ||
      summary.target.pendingFiles < 0
    ) {
      throw new Error('数据库目标返回结构无效')
    }
    assertSafeText(summary.target.safeTarget, '数据库目标')
  }
  assertObject(summary.boundary, '迁移边界')
  if (
    summary.boundary.targetKey !== 'shared-dev' ||
    summary.boundary.arbitraryTargetAccepted !== false ||
    summary.boundary.arbitraryCommandAccepted !== false ||
    summary.boundary.automaticApply !== false ||
    summary.boundary.automaticRetry !== false ||
    summary.boundary.productionSupported !== false
  ) {
    throw new Error('数据库迁移边界返回结构无效')
  }
  return summary
}

function validateSession(session) {
  assertObject(session, '数据库迁移会话')
  if (
    session.schemaVersion !== 'plush.dev-database-migration-session/v1' ||
    session.target !== 'shared-dev' ||
    typeof session.csrfToken !== 'string' ||
    session.csrfToken.length < 20
  ) {
    throw new Error('数据库迁移会话返回结构无效')
  }
  return session
}

async function readJson(response, fallback) {
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error(fallback)
  }
  if (!response.ok) {
    throw new Error(
      typeof payload?.message === 'string' ? payload.message : fallback
    )
  }
  return payload
}

export function createDatabaseMigrationIdempotencyKey(kind) {
  if (!['prepare', 'restart'].includes(kind)) {
    throw new Error('不支持的迁移操作类型')
  }
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('当前浏览器不能生成安全的操作标识')
  }
  return `database-migration:${kind}:${globalThis.crypto.randomUUID()}`
}

export function createDevDatabaseMigrationClient({
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前环境不支持数据库迁移接口')
  }
  let sessionPromise
  const session = () => {
    if (!sessionPromise) {
      sessionPromise = fetchImpl(DEV_DATABASE_MIGRATION_SESSION_API_PATH, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
        .then((response) => readJson(response, '数据库迁移会话读取失败'))
        .then(validateSession)
        .catch((error) => {
          sessionPromise = undefined
          throw error
        })
    }
    return sessionPromise
  }
  return {
    async summary() {
      const response = await fetchImpl(
        DEV_DATABASE_MIGRATION_SUMMARY_API_PATH,
        {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json' },
        }
      )
      return validateDatabaseMigrationSummary(
        await readJson(response, '数据库迁移状态读取失败')
      )
    },
    async operation(operationId) {
      if (!OPERATION_ID_PATTERN.test(String(operationId || ''))) {
        throw new Error('迁移操作标识无效')
      }
      const response = await fetchImpl(
        `${DEV_DATABASE_MIGRATION_OPERATION_API_PREFIX}/${operationId}`,
        {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json' },
        }
      )
      const result = await readJson(response, '迁移操作读取失败')
      return validateDatabaseMigrationOperation(result.operation)
    },
    async act(action) {
      const currentSession = await session()
      const response = await fetchImpl(DEV_DATABASE_MIGRATION_ACTION_API_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-csrf-token': currentSession.csrfToken,
        },
        body: JSON.stringify(action),
      })
      const result = await readJson(response, '数据库迁移操作提交失败')
      assertObject(result, '数据库迁移操作结果')
      return validateDatabaseMigrationOperation(result.operation)
    },
  }
}

export function databaseMigrationStatusPresentation(status) {
  return (
    {
      preparing: { color: 'processing', label: '正在准备' },
      ready: { color: 'warning', label: '等待确认' },
      applying: { color: 'processing', label: '正在升级' },
      restarting: { color: 'processing', label: '正在重启' },
      passed: { color: 'success', label: '已完成' },
      failed: { color: 'error', label: '失败' },
      blocked: { color: 'error', label: '已阻断' },
      not_proven: { color: 'error', label: '结果待核对' },
    }[status] || { color: 'default', label: '未知' }
  )
}

export function formatDatabaseMigrationTimestamp(value) {
  if (!Number.isFinite(Date.parse(value))) return '未知时间'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(value))
}

export function selectActiveDatabaseMigrationOperation(operations = []) {
  return (
    operations.find((operation) => ACTIVE_STATUSES.has(operation.status)) ||
    null
  )
}

export function isDatabaseMigrationOperationPolling(status) {
  return ['preparing', 'applying', 'restarting'].includes(status)
}

export function isUUID(value) {
  return UUID_PATTERN.test(String(value || ''))
}
