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
import { projectCiJobGuides } from '../../scripts/qa/ci-job-guide.mjs'
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
  managedDatabase: pathToFileURL(
    path.join(
      QA_RUNTIME_ROOT,
      'scripts',
      'qa',
      'run-gate-with-managed-database.mjs'
    )
  ).href,
  gitlabDelivery: pathToFileURL(
    path.join(
      QA_RUNTIME_ROOT,
      'scripts',
      'deploy',
      'gitlab-delivery-provider.mjs'
    )
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
  resource_sensitive_node: '正在运行资源敏感发布合同',
  critical_postgres: '正在运行关键 PostgreSQL 合同',
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
  environmentMode = 'explicit',
  nodeRuntime,
  operationId,
  profile,
  projectRoot,
}) {
  if (!DEV_QUALITY_GATE_PROFILES.includes(profile)) {
    throw new Error('quality gate profile is not allowlisted')
  }
  const args =
    environmentMode === 'managed'
      ? [
          'scripts/qa/run-gate-with-managed-database.mjs',
          '--gate',
          profile,
          '--operation-id',
          operationId,
        ]
      : ['scripts/qa/run-gate-with-receipt.mjs', '--gate', profile]
  if (!['explicit', 'managed'].includes(environmentMode)) {
    throw new Error('quality gate environment mode is invalid')
  }
  if (
    environmentMode === 'managed' &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      String(operationId || '')
    )
  ) {
    throw new Error('managed quality gate operation id is invalid')
  }
  const childEnvironment = {
    ...environment,
    PATH: [path.dirname(nodeRuntime), String(environment.PATH || '')]
      .filter(Boolean)
      .join(path.delimiter),
  }
  if (environmentMode === 'managed') {
    delete childEnvironment.DISPOSABLE_DATABASE_BASE_URL
  }
  delete childEnvironment.PLUSH_GITLAB_TOKEN
  delete childEnvironment.PLUSH_GITLAB_READ_TOKEN
  delete childEnvironment.PLUSH_GITLAB_TARGET_FETCH_TOKEN
  return {
    command: nodeRuntime,
    args,
    cwd: projectRoot,
    env: childEnvironment,
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

function boundedEnvironmentMessage(value, fallback) {
  const message = typeof value === 'string' ? value : ''
  const hasControlCharacter = [...message].some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint <= 31 || codePoint === 127
  })
  return message && message.length <= 200 && !hasControlCharacter
    ? message
    : fallback
}

export async function resolveDevQualityGateEnvironment({
  env = process.env,
  probeManagedDatabase,
  projectRoot = QA_RUNTIME_ROOT,
} = {}) {
  const value = String(env.DISPOSABLE_DATABASE_BASE_URL || '')
  if (value) {
    try {
      const { parseLoopbackDatabaseURL } =
        await loadQaRuntimeModule('databaseTarget')
      parseLoopbackDatabaseURL(value)
      return Object.freeze({
        mode: 'explicit',
        disposableDatabaseReady: true,
        message: '已使用显式登记的本机一次性数据库环境',
      })
    } catch {
      return Object.freeze({
        mode: 'blocked',
        disposableDatabaseReady: false,
        message: '显式登记的一次性数据库环境不符合本机隔离要求',
      })
    }
  }
  try {
    const probe =
      probeManagedDatabase ||
      (await loadQaRuntimeModule('managedDatabase')).probeManagedDatabaseRuntime
    const readiness = await probe({ repoRoot: projectRoot })
    if (readiness?.ready === true) {
      return Object.freeze({
        mode: 'managed',
        disposableDatabaseReady: true,
        message: boundedEnvironmentMessage(
          readiness.message,
          '本机托管一次性数据库环境已就绪'
        ),
      })
    }
    return Object.freeze({
      mode: 'blocked',
      disposableDatabaseReady: false,
      message: boundedEnvironmentMessage(
        readiness?.message,
        '本机一次性数据库运行环境尚未就绪'
      ),
    })
  } catch {
    return Object.freeze({
      mode: 'blocked',
      disposableDatabaseReady: false,
      message: '本机一次性数据库运行环境检查失败',
    })
  }
}

function publicEnvironment(environment) {
  return {
    disposableDatabaseReady: environment.disposableDatabaseReady,
    message: environment.message,
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
  serverEvidence,
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
  if (
    serverEvidence?.status === 'passed' &&
    serverEvidence.current === true &&
    serverEvidence.coversWorkingTree === true
  ) {
    return {
      tone: 'success',
      title: '当前版本已通过 R640 严格门禁',
      description:
        '普通 push CI、七个固定分片、聚合回执与 CI Gate 均绑定当前干净 exact SHA，可以进入版本发布。',
      releaseEligible: true,
      recommendation: '前往版本发布，继续核对制品、目标环境和回滚证据。',
      notProven: ['目标环境发布', '客户 UAT'],
    }
  }
  if (serverEvidence?.status === 'running') {
    return {
      tone: 'info',
      title: 'R640 正在验证当前版本',
      description: '服务器普通 push CI 尚未形成终态，当前不能进入版本发布。',
      releaseEligible: false,
      recommendation: '等待 R640 exact-SHA CI Gate 形成终态。',
      notProven: ['当前版本 R640 严格门禁', '目标环境发布', '客户 UAT'],
    }
  }
  if (serverEvidence?.status === 'failed') {
    return {
      tone: 'error',
      title: '当前版本 R640 严格门禁未通过',
      description: '服务器普通 push CI 未形成完整通过证据，不能进入版本发布。',
      releaseEligible: false,
      recommendation: '先修复 R640 第一失败阶段，再由新 exact SHA 重新运行。',
      notProven: ['当前版本 R640 严格门禁', '目标环境发布', '客户 UAT'],
    }
  }
  if (strictProof.current) {
    if (strictProof.receipt?.status === 'passed') {
      return {
        tone: 'warning',
        title: '本地严格门禁已通过，仍缺 R640 证据',
        description:
          '本地回执属于当前干净版本，但不能替代 protected main 的服务器 exact-SHA CI。',
        releaseEligible: false,
        recommendation: '等待或运行当前 SHA 的 R640 普通 push CI。',
        notProven: ['当前版本 R640 严格门禁', '目标环境发布', '客户 UAT'],
      }
    }
    return {
      tone: 'error',
      title: '当前版本本地严格门禁未通过',
      description:
        '最近本地失败结果属于当前干净版本，且没有可复用的 R640 通过证据。',
      releaseEligible: false,
      recommendation: '先修复第一失败阶段，再重新运行严格门禁。',
      notProven: [
        '当前版本本地严格门禁',
        '当前版本 R640 严格门禁',
        '目标环境发布',
        '客户 UAT',
      ],
    }
  }
  if (!environment.disposableDatabaseReady) {
    return {
      tone: 'warning',
      title: '当前运行环境尚未就绪',
      description: environment.message,
      releaseEligible: false,
      recommendation:
        '启动本机 Docker 并准备 postgres:18.1 镜像，或显式登记合规的本机一次性数据库环境。',
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

export const DEV_QUALITY_GATE_SERVER_EVIDENCE_SCHEMA =
  'plush.dev-quality-gate-server-evidence/v5'

const SERVER_CI_HISTORY_LIMIT = 20
const SERVER_JOB_FAN_IN_GROUPS = Object.freeze({
  quality_browser: 'browser',
  quality_node: 'node',
  quality_resource: 'resource',
  quality_server: 'server',
  quality_web: 'web',
})
const SERVER_JOB_GROUP_PREFIXES = Object.freeze([
  Object.freeze(['quality_browser_', 'browser']),
  Object.freeze(['quality_node_', 'node']),
  Object.freeze(['quality_resource_', 'resource']),
  Object.freeze(['quality_security_', 'security']),
  Object.freeze(['quality_server_', 'server']),
  Object.freeze(['quality_static_', 'static']),
  Object.freeze(['quality_web_', 'web']),
])

function serverJobClassification(name) {
  if (['plan', 'prepare'].includes(name)) {
    return { role: 'orchestration', group: 'pipeline' }
  }
  if (name === 'CI Gate') {
    return { role: 'terminal', group: 'pipeline' }
  }
  if (name === 'quality_aggregate') {
    return { role: 'aggregate', group: 'pipeline' }
  }
  if (Object.hasOwn(SERVER_JOB_FAN_IN_GROUPS, name)) {
    return { role: 'aggregate', group: SERVER_JOB_FAN_IN_GROUPS[name] }
  }
  if (name === 'quality_static') {
    return { role: 'execution', group: 'static' }
  }
  if (name === 'quality_security') {
    return { role: 'execution', group: 'security' }
  }
  const matched = SERVER_JOB_GROUP_PREFIXES.find(([prefix]) =>
    name.startsWith(prefix)
  )
  if (matched) return { role: 'execution', group: matched[1] }
  return { role: 'execution', group: 'other' }
}

function projectServerJob(job, attemptCount) {
  const { role, group } = serverJobClassification(String(job.name || ''))
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    durationMs: Number.isSafeInteger(job.durationMs) ? job.durationMs : null,
    queueMs: Number.isSafeInteger(job.queueMs) ? job.queueMs : null,
    attemptCount,
    role,
    group,
    url:
      job.url ||
      `https://gitlab.saurick.me/saurick/plush-toy-erp/-/jobs/${String(job.id)}`,
  }
}

export function captureDevQualityGateServerEnvironment(env = process.env) {
  return Object.freeze({
    PLUSH_GITLAB_TOKEN: String(
      env.PLUSH_GITLAB_READ_TOKEN || env.PLUSH_GITLAB_TOKEN || ''
    ),
  })
}

function unavailableServerEvidence(message) {
  return {
    schemaVersion: DEV_QUALITY_GATE_SERVER_EVIDENCE_SCHEMA,
    status: 'unavailable',
    current: false,
    coversWorkingTree: false,
    gitSha: '',
    pipeline: null,
    jobs: [],
    jobGuides: [],
    topology: {
      status: 'unavailable',
      gitSha: '',
      jobs: [],
      message: '当前 exact SHA 的 GitLab CI 依赖暂不可读。',
    },
    history: [],
    message,
    notProven: ['当前 exact SHA 的 R640 普通 CI'],
  }
}

function projectServerTopology(topology, repository, jobs) {
  if (jobs.length === 0) {
    return {
      status: 'missing',
      gitSha: repository.commit,
      jobs: [],
      message: '当前提交尚未形成实际 Pipeline Job，配置依赖不冒充运行证据。',
    }
  }
  if (
    topology?.schemaVersion !== 'plush.delivery-pipeline-topology/v1' ||
    topology.gitSha !== repository.commit ||
    !Array.isArray(topology.jobs)
  ) {
    return {
      status: 'unavailable',
      gitSha: repository.commit,
      jobs: [],
      message: '当前 Pipeline 可读，但同一 SHA 的 GitLab CI 依赖暂不可读。',
    }
  }
  const actualNames = new Set(jobs.map((job) => job.name))
  const definitions = new Map(topology.jobs.map((job) => [job.name, job]))
  if (
    definitions.size !== topology.jobs.length ||
    jobs.some((job) => !definitions.has(job.name))
  ) {
    return {
      status: 'unavailable',
      gitSha: repository.commit,
      jobs: [],
      message: 'GitLab CI 配置与本次实际 Job 不一致，依赖图已失败关闭。',
    }
  }
  return {
    status: 'available',
    gitSha: repository.commit,
    jobs: topology.jobs
      .filter((job) => actualNames.has(job.name))
      .map((job) => ({
        name: job.name,
        stage: job.stage,
        needs: job.needs.filter((name) => actualNames.has(name)),
      })),
    message:
      '依赖来自当前 exact SHA 的 GitLab CI Lint，状态来自本次实际 Pipeline。',
  }
}

export function projectDevQualityGateServerEvidence(
  timings,
  repository,
  topology = null
) {
  if (
    timings?.schemaVersion !== 'plush.delivery-pipeline-timings/v1' ||
    !Array.isArray(timings?.runs) ||
    !/^[0-9a-f]{40}$/u.test(String(repository?.commit || '')) ||
    typeof repository?.dirty !== 'boolean'
  ) {
    throw new Error('server CI timing evidence is invalid')
  }
  const projectRun = (run) => {
    const jobAttempts = new Map()
    for (const job of run.jobs || []) {
      const attempts = jobAttempts.get(job.name) || []
      attempts.push(job)
      jobAttempts.set(job.name, attempts)
    }
    const jobs = [...jobAttempts.values()]
      .map((attempts) => {
        const sorted = [...attempts].sort((left, right) => left.id - right.id)
        return projectServerJob(sorted.at(-1), sorted.length)
      })
      .sort((left, right) => left.id - right.id)
    const passed =
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      jobs.length > 0 &&
      jobs.every(
        (job) => job.status === 'completed' && job.conclusion === 'success'
      )
    return { run, jobs, passed }
  }
  const candidates = timings.runs
    .filter(
      (run) =>
        run?.workflow === 'ci' &&
        run?.event === 'push' &&
        /^[0-9a-f]{40}$/u.test(String(run?.gitSha || ''))
    )
    .map(projectRun)
    .sort((left, right) => right.run.id - left.run.id)
  const history = candidates
    .slice(0, SERVER_CI_HISTORY_LIMIT)
    .map(({ run, jobs, passed }) => {
      const active = run.status !== 'completed'
      const result = passed
        ? 'passed'
        : active
          ? run.status === 'in_progress'
            ? 'running'
            : 'queued'
          : run.conclusion === 'cancelled'
            ? 'cancelled'
            : run.conclusion === 'skipped'
              ? 'skipped'
              : 'failed'
      return {
        id: run.id,
        result,
        gitSha: run.gitSha,
        url: run.url,
        createdAt: run.createdAt,
        finishedAt: run.finishedAt,
        durationMs: run.durationMs,
        queueMs: run.queueMs,
        failureJob:
          jobs.find((job) => job.conclusion === 'failure')?.name || '',
        jobs,
      }
    })
  const exactRuns = candidates.filter(
    (candidate) => candidate.run.gitSha === repository.commit
  )
  if (exactRuns.length === 0) {
    return {
      schemaVersion: DEV_QUALITY_GATE_SERVER_EVIDENCE_SCHEMA,
      status: 'missing',
      current: false,
      coversWorkingTree: false,
      gitSha: repository.commit,
      pipeline: null,
      jobs: [],
      jobGuides: [],
      topology: projectServerTopology(topology, repository, []),
      history,
      message:
        'GitLab 凭据与 API 读取正常；R640 尚无绑定当前已提交 SHA 的普通 push CI 记录。',
      notProven: ['当前 exact SHA 的 R640 普通 CI'],
    }
  }
  const selected =
    exactRuns.find((candidate) => candidate.passed) || exactRuns[0]
  const active = selected.run.status !== 'completed'
  const status = selected.passed ? 'passed' : active ? 'running' : 'failed'
  return {
    schemaVersion: DEV_QUALITY_GATE_SERVER_EVIDENCE_SCHEMA,
    status,
    current: true,
    coversWorkingTree: selected.passed && !repository.dirty,
    gitSha: repository.commit,
    pipeline: {
      id: selected.run.id,
      attempt: selected.run.attempt,
      url: selected.run.url,
      status: selected.run.status,
      conclusion: selected.run.conclusion,
      queueMs: selected.run.queueMs,
      durationMs: selected.run.durationMs,
      finishedAt: selected.run.finishedAt,
    },
    jobs: selected.jobs,
    jobGuides: projectCiJobGuides(selected.jobs.map((job) => job.name)),
    topology: projectServerTopology(topology, repository, selected.jobs),
    history,
    message: selected.passed
      ? repository.dirty
        ? 'R640 已证明当前提交 SHA；该证据不覆盖本机未提交改动。'
        : 'R640 已通过当前 exact SHA 的完整分片、聚合与 CI Gate。'
      : active
        ? 'R640 正在验证当前 exact SHA。'
        : 'R640 当前 exact SHA 的普通 CI 未形成完整通过证据。',
    notProven: repository.dirty
      ? ['本机未提交改动', '不可变 Release', '目标部署', '客户 UAT']
      : ['不可变 Release', '目标部署', '客户 UAT'],
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
  probeManagedDatabase,
  killOrphanedProcessGroup = (pid, signal) => process.kill(-pid, signal),
  attachExecutionChild = attachDevQaExecutionChild,
  randomOperationId = randomUUID,
  readRepositoryState = readRepositoryIdentity,
  readReceipt,
  loadServerEvidence,
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
  const serverEvidenceEnvironment = captureDevQualityGateServerEnvironment(env)
  const store = operationStore || resolveDevQualityGateOperationStore(root)
  const active = new Map()
  const orphanStopTimers = new Map()
  let environmentReadinessCache = null
  let serverEvidenceCache = null
  const loadReceipt =
    readReceipt || ((profile) => readFixedQualityGateReceipt(root, profile))
  const loadChangedFiles =
    collectChanges ||
    (async (options) => {
      const { collectChangedFiles } = await loadQaRuntimeModule('affected')
      return collectChangedFiles(options)
    })

  async function loadEnvironmentReadiness({ fresh = false } = {}) {
    const timestamp = Date.now()
    if (
      !fresh &&
      environmentReadinessCache &&
      environmentReadinessCache.expiresAt > timestamp
    ) {
      return environmentReadinessCache.value
    }
    const value = await resolveDevQualityGateEnvironment({
      env,
      probeManagedDatabase,
      projectRoot: root,
    })
    environmentReadinessCache = {
      expiresAt: timestamp + 8_000,
      value,
    }
    return value
  }

  async function loadServerCiEvidence(repository) {
    const timestamp = Date.now()
    const cacheKey = `${repository.commit}:${repository.dirty ? 'dirty' : 'clean'}`
    if (
      serverEvidenceCache?.key === cacheKey &&
      serverEvidenceCache.expiresAt > timestamp
    ) {
      return serverEvidenceCache.value
    }
    let value
    try {
      if (loadServerEvidence) {
        value = await loadServerEvidence({ repository, root })
      } else if (!serverEvidenceEnvironment.PLUSH_GITLAB_TOKEN) {
        value = unavailableServerEvidence(
          '未登记只读 GitLab 凭据，当前仅显示本机回执。'
        )
      } else {
        const { createGitlabDeliveryProvider } =
          await loadQaRuntimeModule('gitlabDelivery')
        const provider = createGitlabDeliveryProvider({
          projectRoot: root,
          env: serverEvidenceEnvironment,
        })
        let timings = await provider.listPipelineTimings({
          limit: SERVER_CI_HISTORY_LIMIT,
          source: 'push',
        })
        if (!timings.runs.some((run) => run.gitSha === repository.commit)) {
          const exactTimings = await provider.listPipelineTimings({
            limit: SERVER_CI_HISTORY_LIMIT,
            sha: repository.commit,
            source: 'push',
          })
          const knownRunIds = new Set(timings.runs.map((run) => run.id))
          timings = {
            ...timings,
            runs: [
              ...timings.runs,
              ...exactTimings.runs.filter((run) => !knownRunIds.has(run.id)),
            ],
          }
        }
        let topology = null
        try {
          topology = await provider.readPipelineTopology({
            sha: repository.commit,
          })
        } catch {
          // Job timing remains useful when GitLab cannot expose the exact-SHA needs graph.
        }
        value = projectDevQualityGateServerEvidence(
          timings,
          repository,
          topology
        )
      }
      if (value?.schemaVersion !== DEV_QUALITY_GATE_SERVER_EVIDENCE_SCHEMA) {
        throw new Error('server CI evidence projection is invalid')
      }
    } catch {
      value = unavailableServerEvidence(
        'R640 CI 证据暂时不可读取，本机回执不受影响。'
      )
    }
    serverEvidenceCache = {
      key: cacheKey,
      expiresAt: timestamp + 15_000,
      value,
    }
    return value
  }

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

  function handleLine(operationId, line, parseStageEvent, parseSubstepEvent) {
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
    if (line === '[qa:managed-database] status=cleanup-complete') {
      context.managedDatabaseCleanup = 'complete'
      return
    }
    if (line === '[qa:managed-database] status=cleanup-failed') {
      context.managedDatabaseCleanup = 'failed'
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
      (!context.serverStarted || context.databaseCleanup === 'complete') &&
      context.managedDatabaseCleanup !== 'pending' &&
      context.managedDatabaseCleanup !== 'failed'
    const cleanup = cleanupComplete
      ? {
          status: 'complete',
          message:
            context.environmentMode === 'managed'
              ? context.serverStarted
                ? '一次性数据库、托管容器、进程组和运行锁已完成清理读回'
                : '托管容器、进程组和运行锁已完成清理读回'
              : context.serverStarted
                ? '一次性数据库、进程组和运行锁已完成清理读回'
                : '运行未进入数据库阶段，进程组和运行锁已完成清理读回',
        }
      : {
          status: 'failed',
          message:
            context.environmentMode === 'managed'
              ? '未取得一次性数据库、托管容器或进程组的完整清理读回'
              : '未取得一次性数据库或进程组的完整清理读回',
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

  function launchOperation(operation, receiptGateModule, environmentReadiness) {
    let processHandle
    try {
      const nodeRuntime = resolveNodeRuntime(root)
      const spec = buildDevQualityGateCommand({
        environment: env,
        environmentMode: environmentReadiness.mode,
        nodeRuntime,
        operationId: operation.id,
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
      environmentMode: environmentReadiness.mode,
      handle: processHandle,
      stopReason: '',
      serverStarted: false,
      databaseCleanup: '',
      managedDatabaseCleanup:
        environmentReadiness.mode === 'managed' ? 'pending' : 'not_required',
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
    const environmentReadiness = await loadEnvironmentReadiness({ fresh: true })
    if (!environmentReadiness.disposableDatabaseReady) {
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
      const { operation } = createOrReuseDevQualityGateOperation(store, {
        profile,
        idempotencyKey: payload.idempotencyKey,
        repository,
        operationId,
        now: now().toISOString(),
      })
      return {
        schemaVersion: 'plush.dev-quality-gate-action-result/v1',
        profile,
        reused: false,
        operation: publicOperation(
          launchOperation(operation, receiptGateModule, environmentReadiness)
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
    const [environment, receiptGateModule, serverEvidence] = await Promise.all([
      loadEnvironmentReadiness(),
      loadQaRuntimeModule('receiptGate'),
      loadServerCiEvidence(repository),
    ])
    proofs.strict = {
      ...proofs.strict,
      releaseEligible:
        serverEvidence.status === 'passed' &&
        serverEvidence.current === true &&
        serverEvidence.coversWorkingTree === true,
    }
    const parallelStageIds = new Set(
      receiptGateModule.RECEIPT_GATE_PARALLEL_STAGE_IDS
    )
    const registeredSubsteps = {
      shared: receiptGateModule.RECEIPT_GATE_SHARED_SUBSTEP_LABELS,
      web: receiptGateModule.RECEIPT_GATE_WEB_SUBSTEP_LABELS,
    }
    return {
      schemaVersion: 'plush.dev-quality-gates-summary/v1',
      generatedAt: now().toISOString(),
      repository,
      environment: publicEnvironment(environment),
      serverEvidence,
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
                parallel: parallelStageIds.has(id),
              })
            ),
            substeps: Object.fromEntries(
              Object.entries(registeredSubsteps)
                .filter(([stageId]) =>
                  receiptGateModule.RECEIPT_GATE_STAGE_IDS[profile].includes(
                    stageId
                  )
                )
                .map(([stageId, labels]) => [
                  stageId,
                  Object.entries(labels).map(([id, label]) => ({ id, label })),
                ])
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
        serverEvidence,
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
