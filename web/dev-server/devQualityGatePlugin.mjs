import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import {
  DEV_QUALITY_GATE_ACTIVE_STATUSES,
  DEV_QUALITY_GATE_PROFILES,
  createOrReuseDevQualityGateOperation,
  listDevQualityGateOperations,
  readDevQualityGateOperation,
  readDevQualityGateOperationByIdempotencyKey,
  resolveDevQualityGateOperationStore,
  transitionDevQualityGateOperation,
} from '../../scripts/qa/dev-quality-gate-operation-store.mjs'
import {
  acquireDevQaExecutionLock,
  attachDevQaExecutionChild,
  readDevQaExecutionLock,
  releaseDevQaExecutionLock,
} from '../../scripts/qa/dev-qa-execution-lock.mjs'
import { validateDevWorkbenchReceipt } from '../../scripts/qa/dev-workbench-receipt.mjs'
import {
  readRepositoryIdentity,
  repositoryIdentitiesEqual,
} from '../../scripts/qa/lib/repository-identity.mjs'
import {
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'
import { resolveProjectNodeRuntime } from './devQaCoveragePlugin.mjs'

export const DEV_QUALITY_GATE_API_PATH = '/__dev/api/qa/quality-gates'
export const DEV_QUALITY_GATE_SESSION_API_PATH = `${DEV_QUALITY_GATE_API_PATH}/session`
export const DEV_QUALITY_GATE_ACTION_API_PATH = `${DEV_QUALITY_GATE_API_PATH}/actions`
export const DEV_QUALITY_GATE_GOVERNANCE_API_PATH = `${DEV_QUALITY_GATE_API_PATH}/governance`
export const DEV_QUALITY_GATE_GAPS_API_PATH = `${DEV_QUALITY_GATE_API_PATH}/gaps`
export const DEV_QUALITY_GATE_OPERATION_API_PREFIX = `${DEV_QUALITY_GATE_API_PATH}/operations`
export const DEV_QUALITY_GATE_PUBLIC_OPERATION_SCHEMA =
  'plush.dev-quality-gate-operation-public/v1'
export const MAX_QUALITY_GATE_REQUEST_BYTES = 4 * 1024
export const QUALITY_GATE_TIMEOUT_MS = Object.freeze({
  full: 90 * 60 * 1000,
  strict: 180 * 60 * 1000,
})

const QA_RUNTIME_ROOT = path.resolve(import.meta.dirname, '..', '..')
const QA_RUNTIME_MODULE_URLS = Object.freeze({
  affected: pathToFileURL(
    path.join(QA_RUNTIME_ROOT, 'scripts', 'qa', 'affected.mjs')
  ).href,
  databaseTarget: pathToFileURL(
    path.join(QA_RUNTIME_ROOT, 'scripts', 'qa', 'database-target.mjs')
  ).href,
  qualityCatalog: pathToFileURL(
    path.join(QA_RUNTIME_ROOT, 'scripts', 'qa', 'quality-gate-catalog.mjs')
  ).href,
  receiptGate: pathToFileURL(
    path.join(QA_RUNTIME_ROOT, 'scripts', 'qa', 'run-gate-with-receipt.mjs')
  ).href,
})
const qaRuntimeModulePromises = new Map()

function loadQaRuntimeModule(key) {
  if (!Object.hasOwn(QA_RUNTIME_MODULE_URLS, key)) {
    throw new Error('quality gate runtime module is not allowlisted')
  }
  if (!qaRuntimeModulePromises.has(key)) {
    qaRuntimeModulePromises.set(key, import(QA_RUNTIME_MODULE_URLS[key]))
  }
  return qaRuntimeModulePromises.get(key)
}

const IDEMPOTENCY_PATTERN =
  /^quality-gate:(full|strict):([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u
const OPERATION_PATH_PATTERN = new RegExp(
  `^${DEV_QUALITY_GATE_OPERATION_API_PREFIX}/([0-9a-f-]{36})$`,
  'u'
)
const CANCEL_PATH_PATTERN = new RegExp(
  `^${DEV_QUALITY_GATE_OPERATION_API_PREFIX}/([0-9a-f-]{36})/cancel$`,
  'u'
)
const MAX_RECEIPT_BYTES = 256 * 1024
const TERMINATION_GRACE_MS = 120_000
const PROCESS_GROUP_READBACK_INTERVAL_MS = 100
const PROCESS_GROUP_TERM_READBACK_ATTEMPTS = 20
const PROCESS_GROUP_KILL_READBACK_ATTEMPTS = 50
const STAGE_MESSAGES = Object.freeze({
  strict_profile: '正在核对严格门禁配置',
  shellcheck: '正在检查 Shell 脚本',
  shfmt: '正在检查 Shell 格式',
  yamllint: '正在检查 YAML 配置',
  environment_profile: '正在准备环境与工具链',
  shared: '正在运行共享基础检查',
  secrets: '正在扫描敏感信息',
  web: '正在运行 Web 测试与生产构建',
  browser: '正在运行真实浏览器回归',
  server: '正在运行隔离数据库、迁移与 Server 测试',
  govulncheck: '正在运行 Go 可达漏洞检查',
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

export function validateDevQualityGateAction(value) {
  assertExactKeys(value, ['action', 'payload'], 'quality gate action')
  if (value.action !== 'run') {
    throw new Error('quality gate action is not allowlisted')
  }
  assertExactKeys(
    value.payload,
    ['idempotencyKey', 'profile'],
    'quality gate action payload'
  )
  const match = IDEMPOTENCY_PATTERN.exec(
    String(value.payload.idempotencyKey || '')
  )
  if (
    !DEV_QUALITY_GATE_PROFILES.includes(value.payload.profile) ||
    match?.[1] !== value.payload.profile
  ) {
    throw new Error('quality gate action payload is invalid')
  }
  return value
}

export function validateDevQualityGateCancel(value) {
  assertExactKeys(value, ['action'], 'quality gate cancel action')
  if (value.action !== 'cancel') {
    throw new Error('quality gate cancel action is invalid')
  }
  return value
}

export function buildDevQualityGateCommand({
  environment = process.env,
  nodeRuntime,
  profile,
  projectRoot,
}) {
  if (!DEV_QUALITY_GATE_PROFILES.includes(profile)) {
    throw new Error('quality gate profile is not allowlisted')
  }
  return {
    command: nodeRuntime,
    args: ['scripts/qa/run-gate-with-receipt.mjs', '--gate', profile],
    cwd: projectRoot,
    env: {
      ...environment,
      PATH: [path.dirname(nodeRuntime), String(environment.PATH || '')]
        .filter(Boolean)
        .join(path.delimiter),
    },
  }
}

function receiptFile(projectRoot, profile) {
  if (!DEV_QUALITY_GATE_PROFILES.includes(profile)) {
    throw new Error('quality gate receipt profile is invalid')
  }
  return path.join(
    projectRoot,
    'output',
    'dev-workbench',
    'receipts',
    `${profile}-latest.json`
  )
}

export function readFixedQualityGateReceipt(projectRoot, profile) {
  const file = receiptFile(projectRoot, profile)
  if (!existsSync(file)) return null
  const stats = lstatSync(file)
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > MAX_RECEIPT_BYTES
  ) {
    throw new Error('quality gate receipt file is invalid')
  }
  const receipt = validateDevWorkbenchReceipt(
    JSON.parse(readFileSync(file, 'utf8'))
  )
  if (receipt.gate !== profile || receipt.profile !== profile) {
    throw new Error('quality gate receipt profile does not match')
  }
  return receipt
}

function receiptStageTimings(receipt) {
  let cursor = Date.parse(receipt.startedAt)
  return (receipt.metrics?.stageTimings || []).map((stage) => {
    const startedAt = new Date(cursor).toISOString()
    cursor += stage.durationMs
    return {
      id: stage.id,
      label: stage.label,
      status: stage.status,
      startedAt,
      finishedAt: new Date(cursor).toISOString(),
      durationMs: stage.durationMs,
    }
  })
}

export function projectQualityGateReceipt(receipt) {
  if (!receipt) return null
  return {
    profile: receipt.profile,
    status: receipt.status,
    gitCommit: receipt.gitCommit,
    treeState: receipt.treeState,
    durationMs: receipt.durationMs,
    finishedAt: receipt.finishedAt,
    executed: receipt.executed,
    passed: receipt.passed,
    failed: receipt.failed,
    skipped: receipt.skipped,
    environmentFingerprint: receipt.environmentFingerprint,
    bottleneckStageId: receipt.metrics?.bottleneckStageId || '',
    stageTimings: receiptStageTimings(receipt),
  }
}

function publicOperation(operation) {
  if (!operation) return null
  return {
    schemaVersion: DEV_QUALITY_GATE_PUBLIC_OPERATION_SCHEMA,
    id: operation.id,
    profile: operation.profile,
    repository: operation.repository,
    status: operation.status,
    stage: operation.stage,
    stageTimings: operation.stageTimings,
    receipt: operation.receipt,
    cleanup: operation.cleanup,
    firstFailure: operation.firstFailure,
    cancelRequestedAt: operation.cancelRequestedAt,
    revision: operation.revision,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    finishedAt: operation.finishedAt,
    message: operation.message,
  }
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function processGroupIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function createLineConsumer(onLine) {
  let buffer = ''
  return {
    write(chunk) {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      const lines = buffer.split(/\r?\n/u)
      buffer = lines.pop() || ''
      lines.forEach((line) => onLine(line))
    },
    flush() {
      if (buffer) onLine(buffer)
      buffer = ''
    },
  }
}

function startFixedQualityProcess(spec, spawnProcess = spawn) {
  const child = spawnProcess(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (!Number.isSafeInteger(child?.pid) || child.pid < 1) {
    throw new Error('quality gate child pid is unavailable')
  }
  const consume = createLineConsumer(spec.onLine)
  child.stdout?.on?.('data', (chunk) => consume.write(chunk))
  child.stderr?.on?.('data', (chunk) => consume.write(chunk))
  const completion = new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      consume.flush()
      resolve(result)
    }
    child.once?.('error', () => finish({ code: null, signal: '' }))
    child.once?.('close', (code, signal) =>
      finish({
        code: Number.isSafeInteger(code) ? code : null,
        signal: signal || '',
      })
    )
  })
  return {
    pid: child.pid,
    completion,
    killGroup(signal = 'SIGTERM') {
      process.kill(-child.pid, signal)
    },
  }
}

function busyProjection(lock) {
  if (!lock) return { active: false, kind: '', profile: '' }
  return { active: true, kind: lock.kind, profile: lock.profile }
}

async function readEnvironmentReadiness(env) {
  const value = String(env.DISPOSABLE_DATABASE_BASE_URL || '')
  if (!value) {
    return {
      disposableDatabaseReady: false,
      message: '尚未登记可用于质量门禁的一次性数据库环境',
    }
  }
  try {
    const { parseLoopbackDatabaseURL } =
      await loadQaRuntimeModule('databaseTarget')
    parseLoopbackDatabaseURL(value)
    return {
      disposableDatabaseReady: true,
      message: '一次性数据库环境已就绪',
    }
  } catch {
    return {
      disposableDatabaseReady: false,
      message: '一次性数据库环境不符合本机隔离要求',
    }
  }
}

function receiptMatchesCurrent(receipt, repository, operations) {
  if (!receipt) return false
  if (receipt.gitCommit !== repository.commit) return false
  if (!repository.dirty) return receipt.treeState === 'clean'
  return operations.some(
    (operation) =>
      operation.profile === receipt.profile &&
      operation.repository.fingerprint === repository.fingerprint &&
      operation.receipt?.finishedAt === receipt.finishedAt
  )
}

function proofProjection(profile, receipt, repository, operations) {
  if (!receipt) {
    return {
      profile,
      status: 'missing',
      current: false,
      releaseEligible: false,
      reused: false,
      receipt: null,
    }
  }
  const projected = projectQualityGateReceipt(receipt)
  const current = receiptMatchesCurrent(projected, repository, operations)
  const pageOperation = operations.find(
    (operation) =>
      operation.profile === profile &&
      operation.receipt?.finishedAt === projected.finishedAt
  )
  return {
    profile,
    status: projected.status,
    current,
    releaseEligible:
      profile === 'strict' &&
      current &&
      projected.status === 'passed' &&
      !repository.dirty &&
      projected.treeState === 'clean',
    reused: current && projected.status === 'passed' && !pageOperation,
    receipt: projected,
  }
}

function statusProjection({
  repository,
  environment,
  currentOperation,
  strictProof,
}) {
  if (currentOperation) {
    return {
      tone: 'info',
      title:
        currentOperation.status === 'cancelling'
          ? '严格清理当前运行'
          : `${currentOperation.profile === 'strict' ? '严格' : '完整'}门禁正在运行`,
      description:
        currentOperation.status === 'cancelling'
          ? '正在停止测试并等待一次性数据库和进程完成清理。'
          : currentOperation.message,
      releaseEligible: false,
      recommendation: '等待当前运行结束；如确需停止，请使用取消运行。',
      notProven: ['目标环境发布', '客户 UAT'],
    }
  }
  if (!environment.disposableDatabaseReady) {
    return {
      tone: 'warning',
      title: '当前还不能运行完整或严格门禁',
      description: environment.message,
      releaseEligible: false,
      recommendation: '先通过项目正式启动入口登记本机一次性数据库环境。',
      notProven: ['隔离数据库验证', '目标环境发布', '客户 UAT'],
    }
  }
  if (repository.dirty) {
    const currentPassed =
      strictProof.current && strictProof.receipt?.status === 'passed'
    return {
      tone: 'warning',
      title: '工作区还有未提交改动',
      description: currentPassed
        ? '当前改动已经过严格门禁，但结果不能作为固定版本发布证明。'
        : strictProof.current
          ? '当前改动的严格门禁未通过，且 dirty 结果不能作为固定版本发布证明。'
          : '可以验证当前改动，但结果不能作为固定版本发布证明。',
      releaseEligible: false,
      recommendation: currentPassed
        ? '完成代码收口后，对干净的固定版本重新运行严格门禁。'
        : strictProof.current
          ? '先修复当前失败，再重新运行严格门禁。'
          : '运行严格门禁，先确认当前改动没有质量阻断。',
      notProven: ['干净 exact SHA', '目标环境发布', '客户 UAT'],
    }
  }
  if (strictProof.releaseEligible) {
    return {
      tone: 'success',
      title: '当前版本已通过严格门禁',
      description: '严格结果属于当前干净版本，可以进入版本发布。',
      releaseEligible: true,
      recommendation: '前往版本发布，继续核对制品、目标环境和回滚证据。',
      notProven: ['目标环境发布', '客户 UAT'],
    }
  }
  if (strictProof.current) {
    return {
      tone: 'error',
      title: '当前版本严格门禁未通过',
      description: '最近失败结果属于当前干净版本，不能进入版本发布。',
      releaseEligible: false,
      recommendation: '先修复第一失败阶段，再重新运行严格门禁。',
      notProven: ['当前版本严格门禁', '目标环境发布', '客户 UAT'],
    }
  }
  if (strictProof.receipt) {
    return {
      tone: 'warning',
      title: '最近严格结果属于旧版本',
      description: '该结果不能用于当前版本发布。',
      releaseEligible: false,
      recommendation: '运行严格门禁，为当前版本生成新的正式验证记录。',
      notProven: ['当前版本严格门禁', '目标环境发布', '客户 UAT'],
    }
  }
  return {
    tone: 'info',
    title: '当前版本尚未通过严格门禁',
    description: '尚无可用于当前版本的严格验证记录。',
    releaseEligible: false,
    recommendation: '运行严格门禁。',
    notProven: ['当前版本严格门禁', '目标环境发布', '客户 UAT'],
  }
}

function upsertStageTiming(operation, event, now) {
  const stageTimings = operation.stageTimings.map((stage) => ({ ...stage }))
  const index = stageTimings.findIndex((stage) => stage.id === event.id)
  const existing = index >= 0 ? stageTimings[index] : null
  const next =
    event.status === 'running'
      ? {
          id: event.id,
          label: event.label,
          status: 'running',
          startedAt: existing?.startedAt || now,
          finishedAt: null,
          durationMs: null,
        }
      : {
          id: event.id,
          label: event.label,
          status: event.status,
          startedAt:
            existing?.startedAt ||
            new Date(Date.parse(now) - event.durationMs).toISOString(),
          finishedAt: now,
          durationMs: event.durationMs,
        }
  if (index >= 0) stageTimings[index] = next
  else stageTimings.push(next)
  return stageTimings
}

export function createDevQualityGateService({
  projectRoot,
  operationStore,
  env = process.env,
  processId = process.pid,
  processAlive = processIsAlive,
  processGroupAlive = processGroupIsAlive,
  killOrphanedProcessGroup = (pid, signal) => process.kill(-pid, signal),
  attachExecutionChild = attachDevQaExecutionChild,
  randomOperationId = randomUUID,
  readRepositoryState = readRepositoryIdentity,
  readReceipt,
  collectChanges,
  resolveNodeRuntime = resolveProjectNodeRuntime,
  launchProcess = (spec) => startFixedQualityProcess(spec),
  now = () => new Date(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  waitForProcessReadback = (delayMs) =>
    new Promise((resolve) => setTimeout(resolve, delayMs)),
  timeoutMs = QUALITY_GATE_TIMEOUT_MS,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd())
  const store = operationStore || resolveDevQualityGateOperationStore(root)
  const active = new Map()
  const orphanStopTimers = new Map()
  const loadReceipt =
    readReceipt || ((profile) => readFixedQualityGateReceipt(root, profile))
  const loadChangedFiles =
    collectChanges ||
    (async (options) => {
      const { collectChangedFiles } = await loadQaRuntimeModule('affected')
      return collectChangedFiles(options)
    })

  function releaseLock(operation) {
    try {
      releaseDevQaExecutionLock(store, {
        kind: 'quality',
        profile: operation.profile,
        operationId: operation.id,
      })
    } catch {
      // Never remove a missing or foreign lock.
    }
  }

  function recoverInterruptedOperation() {
    const lock = readDevQaExecutionLock(store)
    const operations = listDevQualityGateOperations(store, { limit: 1000 })
    const openOperations = operations.filter((operation) =>
      DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)
    )
    if (!lock || lock.kind !== 'quality') {
      if (!lock) {
        for (const operation of openOperations) {
          transitionDevQualityGateOperation(store, operation.id, {
            status: 'not_proven',
            message: '开发服务中断，运行结果和清理状态无法证明，请重新运行',
            firstFailure: '运行中断，未取得完整验证记录',
            cleanup: {
              status: 'failed',
              message: '未取得进程与一次性数据库清理读回',
            },
            now: now().toISOString(),
          })
        }
      }
      return null
    }
    let operation
    try {
      operation = readDevQualityGateOperation(store, lock.operationId)
    } catch {
      return null
    }
    if (!DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)) {
      releaseLock(operation)
      return null
    }
    if (processAlive(lock.ownerPid)) {
      return operation
    }
    if (lock.childPid !== null && processAlive(lock.childPid)) {
      if (!orphanStopTimers.has(operation.id)) {
        try {
          killOrphanedProcessGroup(lock.childPid, 'SIGTERM')
        } catch {
          // Keep the operation blocked until a later readback proves it stopped.
        }
        orphanStopTimers.set(
          operation.id,
          setTimer(() => {
            let currentLock
            try {
              currentLock = readDevQaExecutionLock(store)
            } catch {
              return
            }
            if (
              currentLock?.operationId !== operation.id ||
              currentLock.childPid !== lock.childPid
            ) {
              return
            }
            if (!processAlive(lock.childPid)) return
            try {
              killOrphanedProcessGroup(lock.childPid, 'SIGKILL')
            } catch {
              // A later summary readback will keep the result fail closed.
            }
          }, TERMINATION_GRACE_MS)
        )
      }
      return transitionDevQualityGateOperation(store, operation.id, {
        status: 'cancelling',
        stage: operation.stage,
        message: '开发服务已重启，正在停止原运行并等待清理',
        cancelRequestedAt: operation.cancelRequestedAt || now().toISOString(),
        now: now().toISOString(),
      })
    }
    if (orphanStopTimers.has(operation.id)) {
      clearTimer(orphanStopTimers.get(operation.id))
      orphanStopTimers.delete(operation.id)
    }
    const interrupted = transitionDevQualityGateOperation(store, operation.id, {
      status: 'not_proven',
      message: '质量门禁进程中断，结果和清理状态无法证明，请重新运行',
      firstFailure: '运行进程中断',
      cleanup: {
        status: 'failed',
        message: '未取得进程与一次性数据库清理读回',
      },
      now: now().toISOString(),
    })
    releaseLock(interrupted)
    return interrupted
  }

  function handleLine(
    operationId,
    line,
    parseStageEvent,
    parseSubstepEvent
  ) {
    const context = active.get(operationId)
    if (!context) return
    if (/^\[disposable-database\].*cleanup=complete(?:\s|$)/u.test(line)) {
      context.databaseCleanup = 'complete'
      return
    }
    if (/^\[disposable-database\].*cleanup=failed(?:\s|$)/u.test(line)) {
      context.databaseCleanup = 'failed'
      return
    }
    const substepEvent =
      typeof parseSubstepEvent === 'function' ? parseSubstepEvent(line) : null
    if (substepEvent?.gate === context.profile) {
      if (substepEvent.status !== 'failed') return
      try {
        const operation = readDevQualityGateOperation(store, operationId)
        if (!DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)) return
        if (operation.firstFailure) return
        const timestamp = now().toISOString()
        transitionDevQualityGateOperation(store, operationId, {
          status: operation.status,
          stage: substepEvent.stage,
          message: `${substepEvent.label}未通过`,
          firstFailure: `Web 测试与生产构建：${substepEvent.label}未通过`,
          now: timestamp,
        })
      } catch {
        // A concurrent terminal transition wins over late output.
      }
      return
    }
    const event = parseStageEvent(line)
    if (!event || event.gate !== context.profile) return
    try {
      const operation = readDevQualityGateOperation(store, operationId)
      if (!DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)) return
      if (event.id === 'server') context.serverStarted = true
      const timestamp = now().toISOString()
      transitionDevQualityGateOperation(store, operationId, {
        status: operation.status,
        stage: event.id,
        stageTimings: upsertStageTiming(operation, event, timestamp),
        message:
          event.status === 'running'
            ? STAGE_MESSAGES[event.id] || `正在运行 ${event.label}`
            : event.status === 'passed'
              ? `${event.label}已通过`
              : `${event.label}未通过`,
        firstFailure:
          event.status === 'failed'
            ? operation.firstFailure || `${event.label}未通过`
            : operation.firstFailure,
        now: timestamp,
      })
    } catch {
      // A concurrent terminal transition wins over late output.
    }
  }

  async function stopResidualProcessGroup(context) {
    const hadResidual = processGroupAlive(context.handle.pid)
    if (!hadResidual) return { gone: true, hadResidual: false }
    try {
      context.handle.killGroup('SIGTERM')
    } catch {
      // The following process-group readback remains authoritative.
    }
    for (
      let attempt = 0;
      attempt < PROCESS_GROUP_TERM_READBACK_ATTEMPTS;
      attempt += 1
    ) {
      if (!processGroupAlive(context.handle.pid)) {
        return { gone: true, hadResidual: true }
      }
      await waitForProcessReadback(PROCESS_GROUP_READBACK_INTERVAL_MS)
    }
    try {
      context.handle.killGroup('SIGKILL')
    } catch {
      // The final bounded readback decides whether cleanup is proven.
    }
    for (
      let attempt = 0;
      attempt < PROCESS_GROUP_KILL_READBACK_ATTEMPTS;
      attempt += 1
    ) {
      if (!processGroupAlive(context.handle.pid)) {
        return { gone: true, hadResidual: true }
      }
      await waitForProcessReadback(PROCESS_GROUP_READBACK_INTERVAL_MS)
    }
    return {
      gone: !processGroupAlive(context.handle.pid),
      hadResidual: true,
    }
  }

  async function finishOperation(operationId, result) {
    const context = active.get(operationId)
    if (!context) return
    active.delete(operationId)
    clearTimer(context.timeoutTimer)
    clearTimer(context.forceTimer)
    let operation = readDevQualityGateOperation(store, operationId)
    const processReadback = await stopResidualProcessGroup(context)
    const groupGone = processReadback.gone
    const cleanupComplete =
      groupGone &&
      (!context.serverStarted || context.databaseCleanup === 'complete')
    const cleanup = cleanupComplete
      ? {
          status: 'complete',
          message: context.serverStarted
            ? '一次性数据库、进程组和运行锁已完成清理读回'
            : '运行未进入数据库阶段，进程组和运行锁已完成清理读回',
        }
      : {
          status: 'failed',
          message: '未取得一次性数据库或进程组的完整清理读回',
        }
    try {
      if (context.stopReason) {
        const startupFailure = context.stopReason === 'startup'
        transitionDevQualityGateOperation(store, operationId, {
          status: startupFailure
            ? 'failed'
            : context.stopReason === 'timeout'
              ? 'timed_out'
              : 'cancelled',
          message: startupFailure
            ? cleanupComplete
              ? '固定质量门禁启动失败，进程组已完成清理'
              : '固定质量门禁启动失败，且清理结果未完整证明'
            : context.stopReason === 'timeout'
              ? cleanupComplete
                ? '运行已超时并完成清理'
                : '运行已超时，但清理结果未完整证明'
              : cleanupComplete
                ? '运行已取消并完成清理'
                : '运行已取消，但清理结果未完整证明',
          firstFailure: startupFailure
            ? '运行进程未能安全启动'
            : context.stopReason === 'timeout'
              ? '运行超过固定时限'
              : operation.firstFailure,
          cleanup,
          now: now().toISOString(),
        })
        return
      }

      const repository = await readRepositoryState(root)
      if (!repositoryIdentitiesEqual(operation.repository, repository)) {
        transitionDevQualityGateOperation(store, operationId, {
          status: 'not_proven',
          message: '执行期间代码发生变化，结果不能证明当前工作区',
          firstFailure: '仓库身份在运行期间发生变化',
          cleanup,
          now: now().toISOString(),
        })
        return
      }
      let receipt = null
      try {
        receipt = projectQualityGateReceipt(loadReceipt(operation.profile))
      } catch {
        receipt = null
      }
      const receiptBelongsToRun =
        receipt &&
        Date.parse(receipt.finishedAt) >= Date.parse(operation.createdAt) &&
        receipt.gitCommit === operation.repository.commit &&
        receipt.treeState === (operation.repository.dirty ? 'dirty' : 'clean')
      if (!receiptBelongsToRun) receipt = null
      const passed = result.code === 0 && receipt?.status === 'passed'
      if (passed && cleanupComplete && !processReadback.hadResidual) {
        transitionDevQualityGateOperation(store, operationId, {
          status: 'passed',
          message: '质量门禁已通过，正式验证记录与仓库身份一致',
          receipt,
          stageTimings: receipt.stageTimings,
          cleanup,
          now: now().toISOString(),
        })
        return
      }
      operation = readDevQualityGateOperation(store, operationId)
      const failedStage = operation.stageTimings.find(
        (stage) => stage.status === 'failed'
      )
      const cleanupFailure = !cleanupComplete
      const processResidualFailure =
        passed && cleanupComplete && processReadback.hadResidual
      transitionDevQualityGateOperation(store, operationId, {
        status: 'failed',
        message: cleanupFailure
          ? '门禁阶段已结束，但未取得一次性数据库或进程组的完整清理读回'
          : processResidualFailure
            ? '门禁结束后发现残留进程组；已完成清理，但本次不能标为通过'
            : failedStage
              ? `${failedStage.label}未通过，请修复后重新运行`
              : '质量门禁未通过，请查看技术详情后修复',
        firstFailure:
          (cleanupFailure
            ? '未取得一次性数据库或进程组的完整清理读回'
            : processResidualFailure
              ? '门禁结束后发现残留进程组'
              : operation.firstFailure) ||
          (failedStage ? `${failedStage.label}未通过` : '未取得完整阶段结果'),
        receipt,
        cleanup,
        now: now().toISOString(),
      })
    } catch {
      const persisted = readDevQualityGateOperation(store, operationId)
      if (DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(persisted.status)) {
        transitionDevQualityGateOperation(store, operationId, {
          status: 'not_proven',
          message: '运行终态读回失败，结果不能证明，请重新运行',
          firstFailure: '终态读回失败',
          cleanup,
          now: now().toISOString(),
        })
      }
    } finally {
      operation = readDevQualityGateOperation(store, operationId)
      releaseLock(operation)
    }
  }

  function launchOperation(operation, receiptGateModule) {
    let processHandle
    try {
      const nodeRuntime = resolveNodeRuntime(root)
      const spec = buildDevQualityGateCommand({
        environment: env,
        nodeRuntime,
        profile: operation.profile,
        projectRoot: root,
      })
      processHandle = launchProcess({
        ...spec,
        onLine: (line) =>
          handleLine(
            operation.id,
            line,
            receiptGateModule.parseGateStageEvent,
            receiptGateModule.parseGateSubstepEvent
          ),
      })
      if (!Number.isSafeInteger(processHandle?.pid) || processHandle.pid < 1) {
        throw new Error('quality gate child pid is unavailable')
      }
    } catch {
      operation = transitionDevQualityGateOperation(store, operation.id, {
        status: 'failed',
        message: '固定质量门禁启动失败',
        firstFailure: '运行进程未能安全启动',
        cleanup: {
          status: 'not_required',
          message: '门禁进程未创建',
        },
        now: now().toISOString(),
      })
      releaseLock(operation)
      return operation
    }

    const context = {
      profile: operation.profile,
      handle: processHandle,
      stopReason: '',
      serverStarted: false,
      databaseCleanup: '',
      timeoutTimer: null,
      forceTimer: null,
    }
    active.set(operation.id, context)
    Promise.resolve(processHandle.completion)
      .then((result) => finishOperation(operation.id, result))
      .catch(() => finishOperation(operation.id, { code: null, signal: '' }))

    try {
      attachExecutionChild(store, {
        kind: 'quality',
        profile: operation.profile,
        operationId: operation.id,
        childPid: processHandle.pid,
      })
      operation = transitionDevQualityGateOperation(store, operation.id, {
        status: 'running',
        stage: 'preparing',
        message: `正在准备${operation.profile === 'strict' ? '严格' : '完整'}门禁`,
        now: now().toISOString(),
      })
    } catch {
      context.stopReason = 'startup'
      try {
        processHandle.killGroup('SIGTERM')
      } catch {
        // The bounded readback below remains authoritative.
      }
      context.forceTimer = setTimer(() => {
        if (!processGroupAlive(processHandle.pid)) return
        try {
          processHandle.killGroup('SIGKILL')
        } catch {
          // finishOperation will report incomplete cleanup.
        }
      }, TERMINATION_GRACE_MS)
      try {
        operation = transitionDevQualityGateOperation(store, operation.id, {
          status: 'running',
          stage: 'preparing',
          message: '启动未完成，正在停止进程并等待清理',
          now: now().toISOString(),
        })
      } catch {
        operation = readDevQualityGateOperation(store, operation.id)
      }
      return operation
    }
    context.timeoutTimer = setTimer(() => {
      void requestStop(operation.id, 'timeout')
    }, timeoutMs[operation.profile])
    return operation
  }

  async function start(profile, payload) {
    recoverInterruptedOperation()
    const existing = readDevQualityGateOperationByIdempotencyKey(
      store,
      payload.idempotencyKey
    )
    if (existing) {
      return {
        schemaVersion: 'plush.dev-quality-gate-action-result/v1',
        profile,
        reused: true,
        operation: publicOperation(existing),
      }
    }
    if (!(await readEnvironmentReadiness(env)).disposableDatabaseReady) {
      const error = new Error('quality gate database environment is blocked')
      error.code = 'DEV_QUALITY_GATE_ENVIRONMENT_BLOCKED'
      throw error
    }
    if (readDevQaExecutionLock(store)) {
      const error = new Error('another DEV QA operation is running')
      error.code = 'DEV_QA_EXECUTION_LOCKED'
      throw error
    }
    const operationId = randomOperationId()
    acquireDevQaExecutionLock(store, {
      kind: 'quality',
      profile,
      operationId,
      ownerPid: processId,
      now: now().toISOString(),
    })
    try {
      const repository = await readRepositoryState(root)
      const receiptGateModule = await loadQaRuntimeModule('receiptGate')
      const operation = createOrReuseDevQualityGateOperation(store, {
        profile,
        idempotencyKey: payload.idempotencyKey,
        repository,
        operationId,
        now: now().toISOString(),
      }).operation
      return {
        schemaVersion: 'plush.dev-quality-gate-action-result/v1',
        profile,
        reused: false,
        operation: publicOperation(
          launchOperation(operation, receiptGateModule)
        ),
      }
    } catch (error) {
      try {
        releaseDevQaExecutionLock(store, {
          kind: 'quality',
          profile,
          operationId,
        })
      } catch {
        // Preserve a mismatched lock.
      }
      throw error
    }
  }

  async function requestStop(operationId, reason = 'cancel') {
    if (!['cancel', 'timeout'].includes(reason)) {
      throw new Error('quality gate stop reason is invalid')
    }
    const context = active.get(operationId)
    const operation = readDevQualityGateOperation(store, operationId)
    if (
      !context ||
      !['running', 'cancelling'].includes(operation.status) ||
      (context.stopReason && context.stopReason !== reason)
    ) {
      const error = new Error('quality gate operation is not cancellable')
      error.code = 'DEV_QUALITY_GATE_NOT_CANCELLABLE'
      throw error
    }
    if (context.stopReason) return publicOperation(operation)
    context.stopReason = reason
    clearTimer(context.timeoutTimer)
    const cancelling = transitionDevQualityGateOperation(store, operationId, {
      status: 'cancelling',
      stage: operation.stage,
      message:
        reason === 'timeout'
          ? '运行已超时，正在停止测试并等待清理'
          : '正在停止测试并等待一次性数据库和进程清理',
      cancelRequestedAt: now().toISOString(),
      now: now().toISOString(),
    })
    try {
      context.handle.killGroup('SIGTERM')
      context.forceTimer = setTimer(() => {
        if (!processGroupAlive(context.handle.pid)) return
        try {
          context.handle.killGroup('SIGKILL')
        } catch {
          // finishOperation will report incomplete cleanup.
        }
      }, TERMINATION_GRACE_MS)
    } catch {
      // finishOperation will fail closed on the process-group readback.
    }
    return publicOperation(cancelling)
  }

  async function commonSummary() {
    recoverInterruptedOperation()
    const repository = await readRepositoryState(root)
    const operations = listDevQualityGateOperations(store, { limit: 40 })
    const receipts = Object.fromEntries(
      DEV_QUALITY_GATE_PROFILES.map((profile) => {
        try {
          return [profile, loadReceipt(profile)]
        } catch {
          return [profile, null]
        }
      })
    )
    const proofs = Object.fromEntries(
      DEV_QUALITY_GATE_PROFILES.map((profile) => [
        profile,
        proofProjection(profile, receipts[profile], repository, operations),
      ])
    )
    const currentOperation =
      operations.find((operation) =>
        DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)
      ) || null
    const [environment, receiptGateModule] = await Promise.all([
      readEnvironmentReadiness(env),
      loadQaRuntimeModule('receiptGate'),
    ])
    return {
      schemaVersion: 'plush.dev-quality-gates-summary/v1',
      generatedAt: now().toISOString(),
      repository,
      environment,
      busy: busyProjection(readDevQaExecutionLock(store)),
      profiles: Object.fromEntries(
        DEV_QUALITY_GATE_PROFILES.map((profile) => [
          profile,
          {
            timeoutMs: timeoutMs[profile],
            stages: receiptGateModule.RECEIPT_GATE_STAGE_IDS[profile].map(
              (id) => ({
                id,
                label: receiptGateModule.RECEIPT_GATE_STAGE_LABELS[id] || id,
              })
            ),
          },
        ])
      ),
      currentOperation: publicOperation(currentOperation),
      operations: operations.map(publicOperation),
      proofs,
      status: statusProjection({
        repository,
        environment,
        currentOperation,
        strictProof: proofs.strict,
      }),
    }
  }

  return {
    summary: commonSummary,
    readOperation(operationId) {
      recoverInterruptedOperation()
      return publicOperation(readDevQualityGateOperation(store, operationId))
    },
    async governance({ filter = 'relevant', q = '' } = {}) {
      const [summary, changedFiles, qualityCatalog] = await Promise.all([
        commonSummary(),
        loadChangedFiles({ root }),
        loadQaRuntimeModule('qualityCatalog'),
      ])
      const receipts = Object.fromEntries(
        DEV_QUALITY_GATE_PROFILES.map((profile) => [
          profile,
          summary.proofs[profile].receipt,
        ])
      )
      const operations = listDevQualityGateOperations(store, { limit: 40 })
      return qualityCatalog.buildQualityGateGovernance({
        changedFiles,
        operations,
        receipts,
        repository: summary.repository,
        filter,
        q,
        root,
      })
    },
    async gaps({ range = 'current', risk = 'all' } = {}) {
      const [summary, changedFiles, qualityCatalog] = await Promise.all([
        commonSummary(),
        loadChangedFiles({ root, staged: range === 'staged' }),
        loadQaRuntimeModule('qualityCatalog'),
      ])
      const operations = listDevQualityGateOperations(store, { limit: 40 })
      const receipts = Object.fromEntries(
        DEV_QUALITY_GATE_PROFILES.map((profile) => [
          profile,
          summary.proofs[profile].receipt,
        ])
      )
      return qualityCatalog.buildQualityGateGapAnalysis({
        changedFiles,
        repository: summary.repository,
        receipts,
        operations,
        range,
        risk,
        root,
      })
    },
    async act(value) {
      const action = validateDevQualityGateAction(value)
      return start(action.payload.profile, action.payload)
    },
    async cancel(operationId, value) {
      validateDevQualityGateCancel(value)
      return {
        schemaVersion: 'plush.dev-quality-gate-cancel-result/v1',
        operation: await requestStop(operationId, 'cancel'),
      }
    },
  }
}

function isSameOriginRequest(request) {
  const host = request.headers?.host
  const origin = request.headers?.origin
  if (
    Array.isArray(host) ||
    Array.isArray(origin) ||
    !isLoopbackHostHeader(host) ||
    typeof origin !== 'string'
  ) {
    return false
  }
  try {
    const parsed = new URL(origin)
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      parsed.host.toLowerCase() === String(host).toLowerCase() &&
      isLoopbackHostHeader(parsed.host) &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === '/' &&
      !parsed.search &&
      !parsed.hash &&
      request.headers?.['sec-fetch-site'] === 'same-origin'
    )
  } catch {
    return false
  }
}

async function readJsonBody(request) {
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > MAX_QUALITY_GATE_REQUEST_BYTES) {
      throw new Error('quality gate request body is too large')
    }
    chunks.push(bytes)
  }
  if (size === 0) throw new Error('quality gate request body is required')
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value)
  }
  response.end(`${JSON.stringify(payload)}\n`)
}

function validateReadQuery(requestUrl, kind) {
  const allowed =
    kind === 'governance'
      ? new Set(['filter', 'q'])
      : new Set(['range', 'risk'])
  for (const key of requestUrl.searchParams.keys()) {
    if (!allowed.has(key) || requestUrl.searchParams.getAll(key).length !== 1) {
      throw new Error('quality gate read query is invalid')
    }
  }
  if (kind === 'governance') {
    const filter = requestUrl.searchParams.get('filter') || 'relevant'
    const q = requestUrl.searchParams.get('q') || ''
    if (
      !['relevant', 'all', 'attention'].includes(filter) ||
      q.length > 80 ||
      /[\u0000-\u001f\u007f]/u.test(q)
    ) {
      throw new Error('quality gate governance query is invalid')
    }
    return { filter, q }
  }
  const range = requestUrl.searchParams.get('range') || 'current'
  const risk = requestUrl.searchParams.get('risk') || 'all'
  if (
    !['current', 'staged'].includes(range) ||
    !['all', 'high'].includes(risk)
  ) {
    throw new Error('quality gate gap query is invalid')
  }
  return { range, risk }
}

export function createDevQualityGateMiddleware({
  projectRoot,
  service,
  csrfToken = randomBytes(32).toString('base64url'),
} = {}) {
  const qualityService = service || createDevQualityGateService({ projectRoot })
  return async (request, response, next) => {
    let requestUrl
    try {
      requestUrl = new URL(request.url || '/', 'http://localhost')
    } catch {
      next()
      return
    }
    const requestPath = requestUrl.pathname
    if (
      requestPath !== DEV_QUALITY_GATE_API_PATH &&
      !requestPath.startsWith(`${DEV_QUALITY_GATE_API_PATH}/`)
    ) {
      next()
      return
    }
    if (
      !isLoopbackRemoteAddress(request.socket?.remoteAddress) ||
      !isLoopbackHostHeader(request.headers?.host)
    ) {
      sendJson(response, 403, {
        status: 'failed',
        message: '该开发接口仅允许本机访问',
      })
      return
    }
    try {
      if (
        request.method === 'GET' &&
        requestPath === DEV_QUALITY_GATE_SESSION_API_PATH
      ) {
        if (requestUrl.search) throw new Error('session query is unsupported')
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-quality-gate-session/v1',
          apiPath: DEV_QUALITY_GATE_API_PATH,
          csrfToken,
        })
        return
      }
      if (
        request.method === 'GET' &&
        requestPath === DEV_QUALITY_GATE_GOVERNANCE_API_PATH
      ) {
        sendJson(
          response,
          200,
          await qualityService.governance(
            validateReadQuery(requestUrl, 'governance')
          )
        )
        return
      }
      if (
        request.method === 'GET' &&
        requestPath === DEV_QUALITY_GATE_GAPS_API_PATH
      ) {
        sendJson(
          response,
          200,
          await qualityService.gaps(validateReadQuery(requestUrl, 'gaps'))
        )
        return
      }
      const operationMatch = OPERATION_PATH_PATTERN.exec(requestPath)
      if (request.method === 'GET' && operationMatch) {
        if (requestUrl.search) throw new Error('operation query is unsupported')
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-quality-gate-operation-result/v1',
          operation: qualityService.readOperation(operationMatch[1]),
        })
        return
      }
      const cancelMatch = CANCEL_PATH_PATTERN.exec(requestPath)
      if (request.method === 'POST' && cancelMatch) {
        if (
          !isSameOriginRequest(request) ||
          request.headers?.['x-csrf-token'] !== csrfToken ||
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
            String(request.headers?.['content-type'] || '')
          ) ||
          requestUrl.search
        ) {
          sendJson(response, 403, {
            status: 'failed',
            message: '请求来源或会话校验失败',
          })
          return
        }
        sendJson(
          response,
          202,
          await qualityService.cancel(
            cancelMatch[1],
            validateDevQualityGateCancel(await readJsonBody(request))
          )
        )
        return
      }
      if (
        request.method === 'POST' &&
        requestPath === DEV_QUALITY_GATE_ACTION_API_PATH
      ) {
        if (
          !isSameOriginRequest(request) ||
          request.headers?.['x-csrf-token'] !== csrfToken ||
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
            String(request.headers?.['content-type'] || '')
          ) ||
          requestUrl.search
        ) {
          sendJson(response, 403, {
            status: 'failed',
            message: '请求来源或会话校验失败',
          })
          return
        }
        sendJson(
          response,
          202,
          await qualityService.act(
            validateDevQualityGateAction(await readJsonBody(request))
          )
        )
        return
      }
      if (
        request.method === 'GET' &&
        requestPath === DEV_QUALITY_GATE_API_PATH
      ) {
        if (requestUrl.search) throw new Error('summary query is unsupported')
        sendJson(response, 200, await qualityService.summary())
        return
      }
      sendJson(
        response,
        405,
        { status: 'failed', message: '该开发接口不支持当前请求方法' },
        {
          Allow:
            requestPath === DEV_QUALITY_GATE_ACTION_API_PATH ? 'POST' : 'GET',
        }
      )
    } catch (error) {
      if (error?.code === 'DEV_QA_EXECUTION_LOCKED') {
        sendJson(response, 409, {
          status: 'blocked',
          message: '已有本地验证或覆盖采集正在运行',
        })
        return
      }
      if (error?.code === 'DEV_QUALITY_GATE_ENVIRONMENT_BLOCKED') {
        sendJson(response, 409, {
          status: 'blocked',
          message: '一次性数据库环境尚未就绪',
        })
        return
      }
      if (error?.code === 'DEV_QUALITY_GATE_NOT_CANCELLABLE') {
        sendJson(response, 409, {
          status: 'blocked',
          message: '当前运行已经结束或不属于本开发服务',
        })
        return
      }
      sendJson(response, 400, {
        status: 'failed',
        message: '固定质量门禁请求无效或当前无法执行',
      })
    }
  }
}

export function createDevQualityGatePlugin(options = {}) {
  return {
    name: 'plush-dev-quality-gates',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createDevQualityGateMiddleware(options))
    },
  }
}
