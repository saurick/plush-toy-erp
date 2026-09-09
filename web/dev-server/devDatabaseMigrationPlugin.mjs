import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { LocalRuntimePreflightError } from '../../scripts/local-runtime-preflight.mjs'

import {
  isLoopbackAPIOrigin,
  normalizeAPIOrigin,
} from '../../scripts/local-runtime-preflight-core.mjs'
import {
  acquireDatabaseMigrationExecutionLock,
  createOrReuseDatabaseMigrationOperation,
  listDatabaseMigrationOperations,
  publicDatabaseMigrationOperation,
  readDatabaseMigrationOperation,
  recoverInterruptedDatabaseMigrationOperations,
  releaseDatabaseMigrationExecutionLock,
  resolveDatabaseMigrationOperationStore,
  transitionDatabaseMigrationOperation,
} from '../../scripts/qa/dev-database-migration-operation-store.mjs'
import {
  isSameOriginRequest,
  readJsonBody,
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'
import {
  createDevDatabaseMigrationRuntime,
  redactDatabaseMigrationDiagnostic,
} from './devDatabaseMigrationRuntime.mjs'

export {
  parseMigrationPlanOutput,
  parseMigrationStatusOutput,
  readMigrationSourceIdentity,
} from './devDatabaseMigrationRuntime.mjs'

export const DEV_DATABASE_MIGRATION_API_PREFIX = '/__dev/api/database-migration'
export const DEV_DATABASE_MIGRATION_SESSION_API_PATH = `${DEV_DATABASE_MIGRATION_API_PREFIX}/session`
export const DEV_DATABASE_MIGRATION_SUMMARY_API_PATH = `${DEV_DATABASE_MIGRATION_API_PREFIX}/summary`
export const DEV_DATABASE_MIGRATION_ACTION_API_PATH = `${DEV_DATABASE_MIGRATION_API_PREFIX}/actions`
export const DEV_DATABASE_MIGRATION_OPERATION_API_PREFIX = `${DEV_DATABASE_MIGRATION_API_PREFIX}/operations`

const OPERATION_PATH_PATTERN = new RegExp(
  `^${DEV_DATABASE_MIGRATION_OPERATION_API_PREFIX}/([0-9a-f-]+)$`,
  'u'
)
const OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const IDEMPOTENCY_PATTERN =
  /^database-migration:(?:prepare|restart):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const MAX_REQUEST_BYTES = 16 * 1024
const TOOL_CHECK_KEYS = new Set([
  'container_runtime',
  'atlas',
  'postgresql_client',
  'supporting_commands',
])

class DatabaseMigrationActionError extends Error {
  constructor(
    message,
    { code = 'operation_blocked', outcome = 'blocked' } = {}
  ) {
    super(message)
    this.code = code
    this.outcome = outcome
  }
}

function assertExactKeys(value, expected, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} is invalid`)
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${field} contains unsupported fields`)
  }
}

export function validateDevDatabaseMigrationAction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('database migration action is invalid')
  }
  if (value.action === 'prepare') {
    assertExactKeys(value, ['action', 'idempotencyKey'], 'prepare action')
    if (!IDEMPOTENCY_PATTERN.test(String(value.idempotencyKey || ''))) {
      throw new Error('prepare idempotency key is invalid')
    }
    return value
  }
  if (value.action === 'restart') {
    assertExactKeys(value, ['action', 'idempotencyKey'], 'restart action')
    if (!IDEMPOTENCY_PATTERN.test(String(value.idempotencyKey || ''))) {
      throw new Error('restart idempotency key is invalid')
    }
    return value
  }
  if (value.action === 'execute') {
    assertExactKeys(
      value,
      ['action', 'confirmation', 'operationId'],
      'execute action'
    )
    if (
      !OPERATION_ID_PATTERN.test(String(value.operationId || '')) ||
      typeof value.confirmation !== 'string' ||
      value.confirmation.length < 20 ||
      value.confirmation.length > 160
    ) {
      throw new Error('execute confirmation is invalid')
    }
    return value
  }
  throw new Error('database migration action is unsupported')
}

function normalizeTarget(status) {
  const { targetConfirmation: _targetConfirmation, ...publicTarget } = status
  return publicTarget
}

function blockedToolReadiness() {
  return {
    schemaVersion: 'plush.dev-database-migration-tools/v1',
    status: 'blocked',
    checks: [
      {
        key: 'container_runtime',
        label: '迁移准备工具',
        status: 'blocked',
        message: '迁移准备工具状态暂时无法读取，请刷新后重试',
      },
    ],
  }
}

function normalizeToolReadiness(value) {
  if (
    value?.schemaVersion !== 'plush.dev-database-migration-tools/v1' ||
    !['ready', 'blocked'].includes(value.status) ||
    !Array.isArray(value.checks) ||
    value.checks.length < 1 ||
    value.checks.length > TOOL_CHECK_KEYS.size
  ) {
    throw new Error('migration tool readiness is invalid')
  }
  const seen = new Set()
  for (const check of value.checks) {
    if (
      !check ||
      typeof check !== 'object' ||
      !TOOL_CHECK_KEYS.has(check.key) ||
      seen.has(check.key) ||
      typeof check.label !== 'string' ||
      check.label.length < 1 ||
      check.label.length > 80 ||
      !['passed', 'blocked'].includes(check.status) ||
      typeof check.message !== 'string' ||
      check.message.length < 1 ||
      check.message.length > 600
    ) {
      throw new Error('migration tool readiness check is invalid')
    }
    seen.add(check.key)
  }
  const allPassed = value.checks.every((check) => check.status === 'passed')
  if (
    (value.status === 'ready') !== allPassed ||
    (value.status === 'ready' && seen.size !== TOOL_CHECK_KEYS.size)
  ) {
    throw new Error('migration tool readiness status is inconsistent')
  }
  return value
}

function migrationToolIssueMessage() {
  return '迁移准备环境未就绪；请准备可用的 Docker-compatible 容器运行环境、Atlas v1.2.0、PostgreSQL 18 客户端及基础命令。容器运行环境不限定操作系统或产品，可使用 Docker Engine、Docker Desktop、Colima、Rancher Desktop、OrbStack，或提供兼容 docker CLI/socket 的 Podman 配置'
}

function databaseClientDiagnosticMessage(diagnostic) {
  const details = [
    ...String(diagnostic || '').matchAll(/^\[migration-client\] (.+)$/gmu),
  ]
    .filter((match) => /\bblocks_migration=true\b/u.test(match[1]))
    .slice(0, 4)
    .map((match) => match[1])
    .join('; ')
  return details
    ? `共享开发库存在会影响 migration 的连接（${details}）；普通无事务 idle/ClientRead 连接已忽略`
    : '共享开发库存在活动查询、打开事务、持锁或状态不明的连接；处理后重新准备'
}

function publicIssue(error, fallbackCode = 'operation_blocked') {
  const diagnostic = String(error?.diagnostic || error?.message || '')
  if (error instanceof LocalRuntimePreflightError) {
    return { code: error.code, severity: 'blocked', message: error.message }
  }
  if (
    error?.outcome === 'not_proven' ||
    /committed_unverified|result=not_proven/iu.test(diagnostic)
  ) {
    return {
      code: 'migration_outcome_unknown',
      severity: 'blocked',
      message: '迁移写入或读回结果尚未证明；请刷新状态核对，系统不会自动重试',
    }
  }
  if (error?.code === 'migration_command_timeout') {
    return {
      code: 'migration_command_timeout',
      severity: 'blocked',
      message:
        '迁移命令等待超时，本次命令及其子进程已停止；请检查当前步骤后重新准备',
    }
  }
  if (
    /数据库.*(?:配置|地址|连接)|(?:dial tcp|connection refused|context deadline|timed? ?out|aborted|password authentication failed|no such host|could not translate host name)|超时/iu.test(
      diagnostic
    )
  ) {
    return {
      code: 'database_status_unavailable',
      severity: 'blocked',
      message:
        '无法核对数据库状态；请检查本地数据库配置、网络连接和数据库服务，然后刷新状态',
    }
  }
  if (/\berror_code=target_identity_failed\b/u.test(diagnostic)) {
    return {
      code: 'database_target_unverified',
      severity: 'blocked',
      message:
        '当前数据库身份未通过登记核对；请检查本地配置是否指向共享开发库，然后刷新状态',
    }
  }
  if (
    /影响 migration 的 client session|\bblocks_migration=true\b|other_client_sessions(?:_final)?_blocking=[1-9]\d*/iu.test(
      diagnostic
    )
  ) {
    return {
      code: 'database_clients_active',
      severity: 'blocked',
      message: databaseClientDiagnosticMessage(diagnostic),
    }
  }
  if (
    /backup_restore_failed|备份.*(?:失效|缺失|变化|验证失败|校验失败)/iu.test(
      diagnostic
    )
  ) {
    return {
      code: 'backup_restore_failed',
      severity: 'blocked',
      message: '准备阶段的备份或隔离恢复证据已失效，请重新准备',
    }
  }
  if (/docker|pg_dump|pg_restore|atlas.*not found|ENOENT/iu.test(diagnostic)) {
    return {
      code: 'migration_tool_unavailable',
      severity: 'blocked',
      message: migrationToolIssueMessage(),
    }
  }
  if (
    error?.code === 'migration_source_changed' ||
    /\berror_code=(?:workspace_guard_failed|migration_source_changed)\b|checksum.*(?:mismatch|error)|migration source.*(?:changed|missing|invalid)|schema\/migration.*(?:失败|不一致|未收口)/iu.test(
      diagnostic
    )
  ) {
    return {
      code: 'migration_source_changed',
      severity: 'blocked',
      message: 'migration 或 schema 真源未收口或在操作期间发生变化，请重新准备',
    }
  }
  return {
    code: typeof error?.code === 'string' ? error.code : fallbackCode,
    severity: 'blocked',
    message:
      error?.message && error instanceof DatabaseMigrationActionError
        ? error.message
        : '操作未完成；系统没有自动重试，请刷新状态后按提示处理',
  }
}

function logFailure(label, error) {
  const diagnostic = redactDatabaseMigrationDiagnostic(
    error?.diagnostic || error?.stack || error
  )
  process.stderr.write(
    `[dev-database-migration] ${label}: ${diagnostic.slice(-6000)}\n`
  )
}

function confirmationPrompt(operationId, latestVersion) {
  return `升级共享开发库:${latestVersion}:${operationId}`
}

export function createDevDatabaseMigrationService({
  projectRoot,
  apiOrigin = 'http://127.0.0.1:8300',
  operationStore,
  dependencies,
  now = () => new Date(),
  onRuntimeReady,
} = {}) {
  if (!projectRoot) throw new Error('projectRoot is required')
  const root = path.resolve(projectRoot)
  const normalizedApiOrigin = normalizeAPIOrigin(apiOrigin)
  if (!isLoopbackAPIOrigin(normalizedApiOrigin)) {
    throw new Error('database migration runtime target must be loopback')
  }
  const store = operationStore || resolveDatabaseMigrationOperationStore(root)
  const runtime =
    dependencies || createDevDatabaseMigrationRuntime(root, normalizedApiOrigin)
  const runtimeReadyCallback =
    typeof onRuntimeReady === 'function' ? onRuntimeReady : () => {}
  let runtimeReadyReported = false
  recoverInterruptedDatabaseMigrationOperations(store, now().toISOString())

  const reportRuntimeReady = async (target, runtimeReadback) => {
    if (
      target?.key !== 'shared-dev' ||
      target?.pendingFiles !== 0 ||
      runtimeReadback?.available !== true
    ) {
      return
    }
    // Recovery must satisfy the same checks that blocked ordinary startup.
    await runtime.verifyReadiness()
    if (!runtimeReadyReported) {
      runtimeReadyReported = true
      runtimeReadyCallback()
    }
  }

  const transitionFailure = (
    operationId,
    error,
    fallbackStatus = 'blocked'
  ) => {
    logFailure(operationId, error)
    const issue = publicIssue(error)
    const status =
      error?.outcome === 'not_proven' ||
      issue.code === 'migration_outcome_unknown'
        ? 'not_proven'
        : fallbackStatus
    return transitionDatabaseMigrationOperation(store, operationId, {
      status,
      message:
        status === 'not_proven'
          ? '操作结果尚未证明，已停止自动处理'
          : readDatabaseMigrationOperation(store, operationId).readback
                ?.migrationVerified
            ? '数据库升级已完成，后端恢复未完成；修正启动问题后只需重启后端'
            : '操作被安全停止',
      issues: [issue],
      now: now().toISOString(),
    })
  }

  const runPrepare = async (operationId) => {
    const progress = (message) =>
      transitionDatabaseMigrationOperation(store, operationId, {
        status: 'preparing',
        message,
        now: now().toISOString(),
      })
    try {
      const initialTarget = await runtime.status()
      if (
        initialTarget.key !== 'shared-dev' ||
        !initialTarget.targetConfirmation
      ) {
        throw new DatabaseMigrationActionError(
          '当前目标不是项目登记的共享开发库'
        )
      }
      const source = await runtime.sourceIdentity()
      if (initialTarget.pendingFiles === 0) {
        const runtimeReadback = await runtime.runtime()
        await reportRuntimeReady(initialTarget, runtimeReadback)
        transitionDatabaseMigrationOperation(store, operationId, {
          status: 'passed',
          message: '共享开发库已是最新版本，无需迁移',
          target: normalizeTarget(initialTarget),
          source,
          readback: {
            migrationVerified: true,
            currentVersion: initialTarget.currentVersion,
            latestVersion: initialTarget.latestVersion,
            pendingFiles: 0,
            runtime: runtimeReadback,
          },
          now: now().toISOString(),
        })
        return
      }
      progress('正在检查迁移准备工具')
      const tools = normalizeToolReadiness(await runtime.toolReadiness())
      if (tools.status !== 'ready') {
        throw new DatabaseMigrationActionError(migrationToolIssueMessage(), {
          code: 'migration_tool_unavailable',
        })
      }
      progress('正在停止本地后端，准备验证迁移计划')
      await runtime.stopRuntime()
      progress('正在验证迁移计划及事务回滚')
      const plan = await runtime.plan(initialTarget.targetConfirmation)
      const reusableBackupOperation = listDatabaseMigrationOperations(store, {
        limit: 30,
      }).find(
        (operation) =>
          operation.id !== operationId &&
          operation.backup?.restoreVerified === true &&
          operation.source?.fingerprint === source.fingerprint &&
          operation.target?.key === initialTarget.key &&
          operation.target?.currentVersion === initialTarget.currentVersion &&
          operation.target?.latestVersion === initialTarget.latestVersion &&
          operation.target?.pendingFiles === initialTarget.pendingFiles
      )
      const reusableBackup =
        reusableBackupOperation &&
        typeof runtime.verifyBackup === 'function' &&
        (await runtime.verifyBackup(reusableBackupOperation.backup))
          ? reusableBackupOperation.backup
          : null
      progress('正在验证备份与隔离恢复')
      const backup =
        reusableBackup ||
        (await runtime.backup(operationId, initialTarget, progress))
      progress('正在复核迁移文件、目标状态和备份证据')
      const finalSource = await runtime.sourceIdentity()
      if (finalSource.fingerprint !== source.fingerprint) {
        throw new DatabaseMigrationActionError(
          '迁移真源在备份验证期间发生变化，请重新准备',
          { code: 'migration_source_changed' }
        )
      }
      const finalTarget = await runtime.status()
      if (
        finalTarget.key !== initialTarget.key ||
        finalTarget.currentVersion !== initialTarget.currentVersion ||
        finalTarget.latestVersion !== initialTarget.latestVersion ||
        finalTarget.pendingFiles !== initialTarget.pendingFiles ||
        finalTarget.targetConfirmation !== initialTarget.targetConfirmation
      ) {
        throw new DatabaseMigrationActionError(
          '数据库状态在准备期间发生变化，请重新准备',
          { code: 'database_state_changed' }
        )
      }
      const prompt = confirmationPrompt(
        operationId,
        initialTarget.latestVersion
      )
      transitionDatabaseMigrationOperation(store, operationId, {
        status: 'ready',
        message: '升级计划、真实备份和隔离恢复验证已完成',
        target: normalizeTarget(initialTarget),
        source,
        plan: {
          hash: plan.outputHash,
          preparedAt: now().toISOString(),
        },
        backup,
        confirmationPrompt: prompt,
        internal: {
          targetConfirmation: initialTarget.targetConfirmation,
          applyConfirmation: plan.applyConfirmation,
          maintenanceConfirmation: plan.maintenanceConfirmation,
          sourceFingerprint: source.fingerprint,
        },
        now: now().toISOString(),
      })
    } catch (error) {
      transitionFailure(operationId, error, 'blocked')
    } finally {
      releaseDatabaseMigrationExecutionLock(store, operationId)
    }
  }

  const runExecute = async (operationId) => {
    let applyStarted = false
    let noWritesProven = false
    try {
      const operation = readDatabaseMigrationOperation(store, operationId)
      const source = await runtime.sourceIdentity()
      if (
        source.fingerprint !== operation.internal?.sourceFingerprint ||
        source.fingerprint !== operation.source?.fingerprint
      ) {
        throw new DatabaseMigrationActionError(
          'migration 或 schema 真源已变化，旧计划不能执行',
          { code: 'migration_source_changed' }
        )
      }
      const before = await runtime.status()
      if (
        before.key !== 'shared-dev' ||
        before.currentVersion !== operation.target?.currentVersion ||
        before.latestVersion !== operation.target?.latestVersion ||
        before.pendingFiles !== operation.target?.pendingFiles ||
        before.targetConfirmation !== operation.internal?.targetConfirmation
      ) {
        throw new DatabaseMigrationActionError(
          '目标库状态已变化，旧计划不能执行',
          { code: 'database_state_changed' }
        )
      }
      if (
        typeof runtime.verifyBackup !== 'function' ||
        !(await runtime.verifyBackup(operation.backup))
      ) {
        throw new DatabaseMigrationActionError(
          '准备阶段的备份文件身份已失效，请重新准备',
          { code: 'backup_restore_failed' }
        )
      }
      try {
        applyStarted = true
        await runtime.apply(operation.internal)
      } catch (error) {
        const diagnostic = String(error?.diagnostic || '')
        noWritesProven =
          /^\[migration-summary\] result=(?:blocked|failed|action_required) writes=0 apply=(?:not_started|not_requested|attempted_once) auto_retry=false$/mu.test(
            diagnostic
          )
        throw error
      }
      const after = await runtime.status()
      if (
        after.currentVersion !== operation.target.latestVersion ||
        after.latestVersion !== operation.target.latestVersion ||
        after.pendingFiles !== 0
      ) {
        throw new DatabaseMigrationActionError('迁移返回后未读回到最新版本', {
          code: 'migration_readback_failed',
          outcome: 'not_proven',
        })
      }
      transitionDatabaseMigrationOperation(store, operationId, {
        status: 'restarting',
        message: '数据库升级已证明，正在重启本地后端',
        readback: {
          migrationVerified: true,
          currentVersion: after.currentVersion,
          latestVersion: after.latestVersion,
          pendingFiles: after.pendingFiles,
          runtime: null,
        },
        internal: null,
        now: now().toISOString(),
      })
      const runtimeReadback = await runtime.restart(operationId)
      await reportRuntimeReady(after, runtimeReadback)
      transitionDatabaseMigrationOperation(store, operationId, {
        status: 'passed',
        message: '数据库升级、读回和本地后端重启均已完成',
        readback: {
          migrationVerified: true,
          currentVersion: after.currentVersion,
          latestVersion: after.latestVersion,
          pendingFiles: 0,
          runtime: runtimeReadback,
        },
        now: now().toISOString(),
      })
    } catch (error) {
      const current = readDatabaseMigrationOperation(store, operationId)
      if (
        applyStarted &&
        !noWritesProven &&
        !current.readback?.migrationVerified
      ) {
        error.outcome = 'not_proven'
      }
      transitionFailure(
        operationId,
        error,
        current.status === 'restarting' ? 'failed' : 'blocked'
      )
    } finally {
      releaseDatabaseMigrationExecutionLock(store, operationId)
    }
  }

  const runRestart = async (operationId) => {
    try {
      const target = await runtime.status()
      if (
        target.key !== 'shared-dev' ||
        !target.targetConfirmation ||
        target.pendingFiles !== 0
      ) {
        throw new DatabaseMigrationActionError(
          '数据库仍有待执行 migration，不能只重启后端'
        )
      }
      const runtimeReadback = await runtime.restart(operationId)
      await reportRuntimeReady(target, runtimeReadback)
      transitionDatabaseMigrationOperation(store, operationId, {
        status: 'passed',
        message: '本地后端已重启并通过 health / ready',
        target: normalizeTarget(target),
        readback: {
          migrationVerified: true,
          currentVersion: target.currentVersion,
          latestVersion: target.latestVersion,
          pendingFiles: 0,
          runtime: runtimeReadback,
        },
        now: now().toISOString(),
      })
    } catch (error) {
      transitionFailure(operationId, error, 'failed')
    } finally {
      releaseDatabaseMigrationExecutionLock(store, operationId)
    }
  }

  return {
    async summary() {
      const operations = listDatabaseMigrationOperations(store, {
        publicOnly: true,
      })
      let target = null
      let runtimeReadback = null
      let tools = null
      const issues = []
      try {
        target = normalizeTarget(await runtime.status())
      } catch (error) {
        logFailure('summary-status', error)
        issues.push(publicIssue(error, 'migration_status_unavailable'))
      }
      try {
        runtimeReadback = await runtime.runtime()
      } catch (error) {
        logFailure('summary-runtime', error)
        runtimeReadback = {
          available: false,
          health: { status: 'unavailable', httpCode: 0 },
          ready: { status: 'unavailable', httpCode: 0 },
        }
      }
      try {
        tools = normalizeToolReadiness(await runtime.toolReadiness())
      } catch (error) {
        logFailure('summary-tools', error)
        tools = blockedToolReadiness()
      }
      try {
        await reportRuntimeReady(target, runtimeReadback)
      } catch (error) {
        logFailure('summary-preflight', error)
        issues.push(publicIssue(error, 'local_runtime_preflight_failed'))
      }
      return {
        schemaVersion: 'plush.dev-database-migration-summary/v1',
        status: issues.length > 0 ? 'blocked' : 'success',
        target,
        runtime: runtimeReadback,
        tools,
        operations,
        issues,
        boundary: {
          targetKey: 'shared-dev',
          arbitraryTargetAccepted: false,
          arbitraryCommandAccepted: false,
          automaticApply: false,
          automaticRetry: false,
          productionSupported: false,
        },
      }
    },
    readOperation(operationId) {
      return publicDatabaseMigrationOperation(
        readDatabaseMigrationOperation(store, operationId)
      )
    },
    async act(action) {
      if (action.action === 'prepare') {
        const created = createOrReuseDatabaseMigrationOperation(store, {
          idempotencyKey: action.idempotencyKey,
          kind: 'migration',
          status: 'preparing',
          message: '正在检查目标、准备计划并验证备份恢复',
          now: now().toISOString(),
        })
        if (!created.reused) {
          try {
            acquireDatabaseMigrationExecutionLock(store, created.operation.id, {
              now: now().toISOString(),
            })
            for (const previous of listDatabaseMigrationOperations(store)) {
              if (
                previous.id !== created.operation.id &&
                previous.status === 'ready'
              ) {
                transitionDatabaseMigrationOperation(store, previous.id, {
                  status: 'blocked',
                  message: '已重新检查并准备，旧计划不再执行',
                  confirmationPrompt: null,
                  internal: null,
                  now: now().toISOString(),
                })
              }
            }
            runPrepare(created.operation.id).catch((error) =>
              logFailure('prepare-background', error)
            )
          } catch (error) {
            transitionFailure(created.operation.id, error, 'blocked')
          }
        }
        return {
          schemaVersion: 'plush.dev-database-migration-action-result/v1',
          accepted: !created.reused,
          operation: publicDatabaseMigrationOperation(
            readDatabaseMigrationOperation(store, created.operation.id)
          ),
        }
      }
      if (action.action === 'execute') {
        const operation = readDatabaseMigrationOperation(
          store,
          action.operationId
        )
        if (
          operation.status !== 'ready' ||
          operation.confirmationPrompt !== action.confirmation
        ) {
          throw new DatabaseMigrationActionError(
            '确认文本或操作状态与当前不可变计划不一致'
          )
        }
        acquireDatabaseMigrationExecutionLock(store, operation.id, {
          now: now().toISOString(),
        })
        const applying = transitionDatabaseMigrationOperation(
          store,
          operation.id,
          {
            status: 'applying',
            message: '已接受明确确认，正在执行数据库升级',
            confirmationPrompt: null,
            now: now().toISOString(),
          }
        )
        runExecute(operation.id).catch((error) =>
          logFailure('execute-background', error)
        )
        return {
          schemaVersion: 'plush.dev-database-migration-action-result/v1',
          accepted: true,
          operation: publicDatabaseMigrationOperation(applying),
        }
      }
      const created = createOrReuseDatabaseMigrationOperation(store, {
        idempotencyKey: action.idempotencyKey,
        kind: 'restart',
        status: 'restarting',
        message: '正在重启本地后端并检查 health / ready',
        now: now().toISOString(),
      })
      if (!created.reused) {
        try {
          acquireDatabaseMigrationExecutionLock(store, created.operation.id, {
            now: now().toISOString(),
          })
          runRestart(created.operation.id).catch((error) =>
            logFailure('restart-background', error)
          )
        } catch (error) {
          transitionFailure(created.operation.id, error, 'blocked')
        }
      }
      return {
        schemaVersion: 'plush.dev-database-migration-action-result/v1',
        accepted: !created.reused,
        operation: publicDatabaseMigrationOperation(
          readDatabaseMigrationOperation(store, created.operation.id)
        ),
      }
    },
  }
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.statusCode = statusCode
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'no-referrer')
  for (const [name, value] of Object.entries(extraHeaders)) {
    response.setHeader(name, value)
  }
  response.end(JSON.stringify(payload))
}

export function createDevDatabaseMigrationMiddleware({
  projectRoot,
  apiOrigin,
  service,
  onRuntimeReady,
  csrfToken = randomBytes(32).toString('base64url'),
} = {}) {
  const migrationService =
    service ||
    createDevDatabaseMigrationService({
      projectRoot,
      apiOrigin,
      onRuntimeReady,
    })
  return async (request, response, next) => {
    let requestPath
    try {
      requestPath = new URL(request.url || '/', 'http://localhost').pathname
    } catch {
      next()
      return
    }
    if (!requestPath.startsWith(`${DEV_DATABASE_MIGRATION_API_PREFIX}/`)) {
      next()
      return
    }
    if (
      !isLoopbackRemoteAddress(request.socket?.remoteAddress) ||
      !isLoopbackHostHeader(request.headers?.host)
    ) {
      sendJson(response, 403, {
        status: 'failed',
        message: '该数据库迁移接口仅允许本机访问',
      })
      return
    }
    try {
      if (
        request.method === 'GET' &&
        requestPath === DEV_DATABASE_MIGRATION_SESSION_API_PATH
      ) {
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-database-migration-session/v1',
          csrfToken,
          target: 'shared-dev',
        })
        return
      }
      if (
        request.method === 'GET' &&
        requestPath === DEV_DATABASE_MIGRATION_SUMMARY_API_PATH
      ) {
        sendJson(response, 200, await migrationService.summary())
        return
      }
      const operationMatch = OPERATION_PATH_PATTERN.exec(requestPath)
      if (request.method === 'GET' && operationMatch) {
        if (!OPERATION_ID_PATTERN.test(operationMatch[1])) {
          throw new Error('operation id is invalid')
        }
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-database-migration-operation-result/v1',
          operation: migrationService.readOperation(operationMatch[1]),
        })
        return
      }
      if (
        request.method === 'POST' &&
        requestPath === DEV_DATABASE_MIGRATION_ACTION_API_PATH
      ) {
        if (
          !isSameOriginRequest(request) ||
          request.headers?.['x-csrf-token'] !== csrfToken ||
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
            String(request.headers?.['content-type'] || '')
          )
        ) {
          sendJson(response, 403, {
            status: 'failed',
            message: '请求来源或会话校验失败',
          })
          return
        }
        const result = await migrationService.act(
          validateDevDatabaseMigrationAction(
            await readJsonBody(request, {
              maxBytes: MAX_REQUEST_BYTES,
              label: 'request',
            })
          )
        )
        sendJson(response, result.accepted ? 202 : 200, result)
        return
      }
      sendJson(
        response,
        405,
        { status: 'failed', message: '该迁移接口不支持此方法或路径' },
        { allow: 'GET, POST' }
      )
    } catch (error) {
      logFailure('middleware', error)
      const inputError =
        /invalid|unsupported|fields|body|JSON|confirmation|request/iu.test(
          String(error?.message || '')
        )
      sendJson(response, inputError ? 400 : 409, {
        status: 'failed',
        message: inputError
          ? '请求参数不符合固定数据库迁移合同'
          : '操作未完成；请刷新数据库迁移页查看已记录状态',
      })
    }
  }
}

export function createDevDatabaseMigrationPlugin(options = {}) {
  return {
    name: 'plush-dev-database-migration',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createDevDatabaseMigrationMiddleware(options))
    },
  }
}
