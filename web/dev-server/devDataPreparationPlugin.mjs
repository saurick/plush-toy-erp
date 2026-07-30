import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import {
  acquireDataPreparationIdempotencyLock,
  acquireDataPreparationExecutionLock,
  createOrReuseDataPreparationOperation,
  DATA_PREPARATION_PROFILE_KEYS,
  DATA_PREPARATION_TERMINAL_STATUSES,
  hashDataPreparationPlan,
  listDataPreparationOperations,
  readDataPreparationOperation,
  readDataPreparationOperationByIdempotencyKey,
  readDataPreparationIdempotencyLock,
  readDataPreparationExecutionLock,
  recoverInterruptedDataPreparationOperations,
  releaseDataPreparationIdempotencyLock,
  releaseDataPreparationExecutionLock,
  resolveDataPreparationOperationStore,
  transitionDataPreparationOperation,
} from '../../scripts/qa/dev-data-preparation-operation-store.mjs'
import { readRepositoryIdentity } from '../../scripts/qa/lib/repository-identity.mjs'
import {
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'

export const DEV_DATA_PREPARATION_API_PREFIX = '/__dev/api/data-preparation'
export const DEV_DATA_PREPARATION_SESSION_API_PATH = `${DEV_DATA_PREPARATION_API_PREFIX}/session`
export const DEV_DATA_PREPARATION_SUMMARY_API_PATH = `${DEV_DATA_PREPARATION_API_PREFIX}/summary`
export const DEV_DATA_PREPARATION_ACTION_API_PATH = `${DEV_DATA_PREPARATION_API_PREFIX}/actions`
export const MAX_DEV_DATA_PREPARATION_REQUEST_BYTES = 16 * 1024

const execFileAsync = promisify(execFile)
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const OPERATION_PATH_PATTERN = new RegExp(
  `^${DEV_DATA_PREPARATION_API_PREFIX}/operations/([0-9a-f-]{36})$`,
  'u'
)
const REGISTERED_DEVELOPMENT_HOST = '192.168.0.106'
const REGISTERED_DEVELOPMENT_PORT = 5432
const CORE_DEMO_PREFIX = 'SIM-PLUSH-CORE'
const SCENARIO_DEMO_DATA_VERSION = '2026.07.16-v5'
const SCENARIO_DEMO_RUN_ID = '20260716-V5'
const INTERRUPTED_OPERATION_RECOVERY_GRACE_MS = 30_000
const LOCAL_ACCEPTANCE_DATABASE_BASE_URL_ENV =
  'LOCAL_ACCEPTANCE_DATABASE_BASE_URL'
const DATABASE_TARGET_MODULE_URL = pathToFileURL(
  path.join(
    path.resolve(import.meta.dirname, '..', '..'),
    'scripts',
    'qa',
    'database-target.mjs'
  )
).href
let databaseTargetModulePromise

function loadDatabaseTargetModule() {
  databaseTargetModulePromise ||= import(DATABASE_TARGET_MODULE_URL)
  return databaseTargetModulePromise
}

export const DEV_DATA_PREPARATION_PROFILES = Object.freeze([
  Object.freeze({
    key: 'core-demo',
    title: 'Product Core 基础测试数据',
    purpose: '稳定 upsert 现有角色账号与 Product Core 基础资料',
    writesDatabase: true,
    dataRetention: 'long-lived',
    cleanupMode: 'not-supported',
    exactCleanCommitRequired: false,
    requiredEnvironment: Object.freeze([]),
  }),
  Object.freeze({
    key: 'scenario-demo',
    title: '长期共享库场景数据',
    purpose:
      '先对齐当前跟踪的本地客户配置，再按固定 V5 批次精确创建或读回 Source、ProcessRuntime 与 Fact 场景',
    writesDatabase: true,
    dataRetention: 'long-lived',
    cleanupMode: 'forward-only',
    exactCleanCommitRequired: false,
    requiredEnvironment: Object.freeze(['登记本地开发库', '本机 8300 后端']),
  }),
  Object.freeze({
    key: 'full-acceptance',
    title: '本地完整技术验收',
    purpose: '在专用数据库运行现有完整验收生命周期并自动清理',
    writesDatabase: true,
    dataRetention: 'ephemeral',
    cleanupMode: 'automatic',
    exactCleanCommitRequired: true,
    requiredEnvironment: Object.freeze([
      LOCAL_ACCEPTANCE_DATABASE_BASE_URL_ENV,
    ]),
  }),
])

function assertExactKeys(value, expected, field) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${field} must be an object`)
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

export function validateDevDataPreparationAction(value) {
  assertExactKeys(value, ['action', 'payload'], 'data preparation action')
  if (value.action === 'prepare') {
    assertExactKeys(
      value.payload,
      ['idempotencyKey', 'profileKey'],
      'prepare payload'
    )
    if (
      !DATA_PREPARATION_PROFILE_KEYS.includes(value.payload.profileKey) ||
      !IDEMPOTENCY_PATTERN.test(String(value.payload.idempotencyKey || ''))
    ) {
      throw new Error('prepare payload is invalid')
    }
  } else if (value.action === 'execute') {
    assertExactKeys(
      value.payload,
      ['confirmation', 'operationId'],
      'execute payload'
    )
    if (
      !UUID_PATTERN.test(String(value.payload.operationId || '')) ||
      typeof value.payload.confirmation !== 'string' ||
      value.payload.confirmation.length < 32 ||
      value.payload.confirmation.length > 240
    ) {
      throw new Error('execute payload is invalid')
    }
  } else {
    throw new Error('data preparation action is not allowlisted')
  }
  return value
}

function targetSummary(
  parsed,
  { disposable, automaticCleanup, preflightFingerprint = '0'.repeat(64) }
) {
  return Object.freeze({
    safeTarget: parsed.safeTarget,
    targetFingerprint: parsed.targetFingerprint,
    preflightFingerprint,
    disposable,
    automaticCleanup,
  })
}

function isRegisteredDevelopmentDatabaseName(databaseName) {
  if (databaseName === 'plush_erp') return true
  if (
    !databaseName.startsWith('plush_erp_') ||
    !databaseName.endsWith('_dev')
  ) {
    return false
  }
  const middle = databaseName.slice('plush_erp_'.length, -'_dev'.length)
  return /^[a-z0-9_]+$/u.test(middle) && /[a-z0-9]/u.test(middle)
}

function assertRegisteredDevelopmentTarget(parsed, { coreDemo = false } = {}) {
  if (
    parsed.host !== REGISTERED_DEVELOPMENT_HOST ||
    parsed.port !== REGISTERED_DEVELOPMENT_PORT ||
    (coreDemo && !isRegisteredDevelopmentDatabaseName(parsed.databaseName))
  ) {
    throw new Error('registered development database target is required')
  }
  return parsed
}

async function defaultCommandRunner(command, args, options) {
  return execFileAsync(command, args, {
    ...options,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
  })
}

export function coreDemoTargetCommand(projectRoot) {
  return Object.freeze({
    command: 'go',
    args: Object.freeze([
      'run',
      './cmd/dburl',
      '-conf',
      './configs/dev/config.yaml',
    ]),
    options: Object.freeze({
      cwd: path.join(path.resolve(projectRoot), 'server'),
    }),
  })
}

export function coreDemoExecutionCommands(projectRoot) {
  const root = path.resolve(projectRoot)
  return Object.freeze([
    Object.freeze({
      key: 'role-seed',
      command: 'bash',
      args: Object.freeze([
        path.join(root, 'scripts', 'seed-role-demo-admins.sh'),
      ]),
      options: Object.freeze({ cwd: root }),
    }),
    Object.freeze({
      key: 'core-seed',
      command: 'bash',
      args: Object.freeze([
        path.join(root, 'scripts', 'seed-core-demo-data.sh'),
      ]),
      options: Object.freeze({ cwd: root }),
    }),
  ])
}

export function coreDemoPreflightCommand(projectRoot) {
  const root = path.resolve(projectRoot)
  return Object.freeze({
    command: process.execPath,
    args: Object.freeze([
      path.join(root, 'scripts', 'local-runtime-preflight.mjs'),
      '--mode',
      'database',
    ]),
    options: Object.freeze({ cwd: root }),
  })
}

export function scenarioDemoPlanCommand(projectRoot) {
  const root = path.resolve(projectRoot)
  return Object.freeze({
    command: process.execPath,
    args: Object.freeze([
      path.join(root, 'scripts', 'qa', 'scenario-demo-data.mjs'),
    ]),
    options: Object.freeze({ cwd: root }),
  })
}

export function scenarioDemoExecutionCommand(projectRoot, operation) {
  const root = path.resolve(projectRoot)
  return Object.freeze({
    command: process.execPath,
    args: Object.freeze([
      path.join(root, 'scripts', 'qa', 'scenario-demo-data.mjs'),
      '--apply',
      '--expected-plan-digest',
      operation.targetSummary.preflightFingerprint,
    ]),
    options: Object.freeze({ cwd: root }),
  })
}

export function fullAcceptancePlanCommand(projectRoot, repository, runId) {
  const root = path.resolve(projectRoot)
  return Object.freeze({
    command: process.execPath,
    args: Object.freeze([
      path.join(root, 'scripts', 'qa', 'local-acceptance-lifecycle.mjs'),
      '--commit',
      repository.commit,
      '--run-id',
      runId,
    ]),
    options: Object.freeze({ cwd: root }),
  })
}

export async function fullAcceptanceExecutionCommand(projectRoot, operation) {
  const { databaseNameForRun } = await loadDatabaseTargetModule()
  const root = path.resolve(projectRoot)
  const acceptanceDatabase = databaseNameForRun('acceptance', operation.runId)
  const browserActionsDatabase = databaseNameForRun(
    'browser-actions',
    operation.runId
  )
  const lifecycleConfirmation = [
    'RUN_LOCAL_ACCEPTANCE_LIFECYCLE',
    acceptanceDatabase,
    browserActionsDatabase,
    operation.repository.commit,
  ].join(':')
  return Object.freeze({
    command: process.execPath,
    args: Object.freeze([
      path.join(root, 'scripts', 'qa', 'local-acceptance-lifecycle.mjs'),
      '--execute',
      '--commit',
      operation.repository.commit,
      '--run-id',
      operation.runId,
      '--confirm',
      lifecycleConfirmation,
    ]),
    options: Object.freeze({ cwd: root }),
  })
}

function redactError(error) {
  const message = String(error?.message || error || 'unknown failure')
    .replace(
      /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      'postgres://<redacted>@'
    )
    .replace(
      /\b(?:password|token|secret|dsn)=([^\s&]+)/giu,
      'credential=<redacted>'
    )
    .replace(
      /\b(?:password|token|secret|authorization|cookie|dsn)\b/giu,
      'credential'
    )
    .replace(/\/(?:Users|home|private|var|tmp)\/[^\s:]+/gu, '<local-path>')
    .replace(/[\u0000-\u001f\u007f]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 400)
  return message || 'unknown failure'
}

function validateRepositoryIdentity(repository) {
  if (
    !repository ||
    typeof repository !== 'object' ||
    Array.isArray(repository) ||
    !/^[0-9a-f]{40}$/u.test(String(repository.commit || '')) ||
    typeof repository.dirty !== 'boolean' ||
    !/^[0-9a-f]{64}$/u.test(String(repository.fingerprint || ''))
  ) {
    throw new Error('repository identity is invalid')
  }
  return repository
}

function parseRoleSeedReadback(stdout) {
  const match = String(stdout || '').match(
    /role demo admin seed completed accounts=(\d+)\b/u
  )
  const accounts = Number(match?.[1])
  if (!Number.isSafeInteger(accounts) || accounts < 1) {
    throw new Error('role seed readback contract did not match')
  }
  return accounts
}

function parseCoreSeedReadback(stdout) {
  const match = String(stdout || '').match(
    /core demo seed completed prefix=(\S+) units=(\d+) materials=(\d+) products=(\d+) warehouses=(\d+) processes=(\d+) bom_headers=(\d+)\b/u
  )
  if (!match || match[1] !== CORE_DEMO_PREFIX) {
    throw new Error('core seed readback contract did not match')
  }
  const values = match.slice(2).map(Number)
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('core seed readback counts are invalid')
  }
  return {
    units: values[0],
    materials: values[1],
    products: values[2],
    warehouses: values[3],
    processes: values[4],
    bomHeaders: values[5],
  }
}

function corePreflightFingerprint(stdout) {
  const output = String(stdout || '').trim()
  const migration = output.match(
    /migration 已是最新版本（([^，\r\n]+)，(\d+)\/(\d+)）/u
  )
  if (
    !/schema\/migration 守卫通过/u.test(output) ||
    !migration ||
    migration[2] !== migration[3] ||
    !/non-system-schema function=0 procedure=0 non-internal-trigger=0/u.test(
      output
    )
  ) {
    throw new Error('core demo migration preflight contract did not match')
  }
  return hashDataPreparationPlan({
    schemaVersion: 'plush.dev-data-preparation-core-preflight/v1',
    migrationVersion: migration[1],
    appliedFiles: Number(migration[2]),
    availableFiles: Number(migration[3]),
    pendingFiles: 0,
    programmableObjects: {
      functions: 0,
      procedures: 0,
      nonInternalTriggers: 0,
    },
  })
}

async function fullAcceptancePlanFingerprint(stdout, repository, runId) {
  const { databaseNameForRun } = await loadDatabaseTargetModule()
  let plan
  try {
    plan = JSON.parse(String(stdout || ''))
  } catch {
    throw new Error('full acceptance lifecycle plan is invalid')
  }
  const acceptanceDatabase = databaseNameForRun('acceptance', runId)
  const browserActionsDatabase = databaseNameForRun('browser-actions', runId)
  const expectedConfirmation = [
    'RUN_LOCAL_ACCEPTANCE_LIFECYCLE',
    acceptanceDatabase,
    browserActionsDatabase,
    repository.commit,
  ].join(':')
  if (
    plan.mode !== 'plan' ||
    plan.writesDatabase !== false ||
    plan.startsServices !== false ||
    plan.commit !== repository.commit ||
    plan.runID !== runId ||
    plan.acceptanceDatabase !== acceptanceDatabase ||
    plan.browserActionsDatabase !== browserActionsDatabase ||
    plan.confirmation !== expectedConfirmation ||
    plan.boundary?.registeredDevelopmentPostgresOnly !== true ||
    plan.boundary?.automaticCleanup !== true ||
    plan.boundary?.customerUAT !== false
  ) {
    throw new Error('full acceptance lifecycle plan identity is invalid')
  }
  return hashDataPreparationPlan({
    schemaVersion: 'plush.dev-data-preparation-full-plan/v1',
    plan,
  })
}

function scenarioDemoPlanFingerprint(stdout, repository, target) {
  let plan
  try {
    plan = JSON.parse(String(stdout || ''))
  } catch {
    throw new Error('scenario demo plan is invalid')
  }
  if (
    plan.schemaVersion !== 'plush.scenario-demo-plan/v1' ||
    plan.profileKey !== 'scenario-demo' ||
    plan.datasetKey !== 'yoyoosun-manual-acceptance' ||
    plan.dataVersion !== SCENARIO_DEMO_DATA_VERSION ||
    plan.runId !== SCENARIO_DEMO_RUN_ID ||
    plan.backendURL !== 'http://127.0.0.1:8300' ||
    plan.databaseName !== target.databaseName ||
    plan.repository?.commit !== repository.commit ||
    plan.repository?.dirty !== repository.dirty ||
    plan.repository?.fingerprint !== repository.fingerprint ||
    plan.target?.targetFingerprint !== target.targetFingerprint ||
    plan.target?.disposable !== false ||
    plan.target?.registeredDevelopmentPostgresOnly !== true ||
    plan.target?.loopbackBackendOnly !== true ||
    plan.execution?.replayMode !== 'exact-create-or-readback' ||
    plan.execution?.dataRetention !== 'long-lived' ||
    plan.execution?.cleanupSupported !== false ||
    plan.execution?.cleanupMode !== 'forward-only' ||
    plan.execution?.directBusinessSQL !== false ||
    plan.execution?.auditMinimum !== 30 ||
    plan.execution?.manualAcceptanceCompleted !== false ||
    !/^[0-9a-f]{64}$/u.test(String(plan.planDigest || ''))
  ) {
    throw new Error('scenario demo plan identity is invalid')
  }
  return plan.planDigest
}

function parseScenarioDemoReadback(stdout, operation) {
  let readback
  try {
    readback = JSON.parse(String(stdout || ''))
  } catch {
    throw new Error('scenario demo readback is invalid')
  }
  if (
    readback?.schemaVersion !== 'plush.dev-data-preparation-readback/v1' ||
    readback?.profileKey !== 'scenario-demo' ||
    readback?.targetFingerprint !== operation.targetSummary.targetFingerprint ||
    readback?.datasetKey !== 'yoyoosun-manual-acceptance' ||
    readback?.dataVersion !== SCENARIO_DEMO_DATA_VERSION ||
    readback?.runId !== SCENARIO_DEMO_RUN_ID ||
    !Number.isSafeInteger(readback?.sourceDocumentCount) ||
    readback.sourceDocumentCount < 1 ||
    !Number.isSafeInteger(readback?.processRuntimeCount) ||
    readback.processRuntimeCount < 1 ||
    !Number.isSafeInteger(readback?.factCount) ||
    readback.factCount < 1 ||
    readback?.catalogReadyCount !== 40 ||
    readback?.catalogTargetCount !== 50 ||
    readback?.browserChecksPending !== 10 ||
    readback?.manualAcceptanceCompleted !== false ||
    readback?.cleanupSupported !== false ||
    readback?.replayMode !== 'exact-create-or-readback'
  ) {
    throw new Error('scenario demo readback contract did not match')
  }
  return readback
}

async function readPrivateReceipt(file, maxBytes = 256 * 1024) {
  const stats = await lstat(file)
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > maxBytes) {
    throw new Error('acceptance receipt is invalid')
  }
  const handle = await open(
    file,
    constants.O_RDONLY + (constants.O_NOFOLLOW || 0)
  )
  try {
    const content = await handle.readFile()
    if (content.byteLength > maxBytes) {
      throw new Error('acceptance receipt is too large')
    }
    return JSON.parse(content.toString('utf8'))
  } finally {
    await handle.close()
  }
}

function validateAcceptanceReceipt(receipt, operation) {
  if (
    !receipt ||
    receipt.schemaVersion !== 'plush-local-acceptance-lifecycle/v1' ||
    receipt.commit !== operation.repository.commit ||
    receipt.runID !== operation.runId ||
    !['passed', 'failed'].includes(receipt.status) ||
    typeof receipt.cleanup?.complete !== 'boolean' ||
    !Array.isArray(receipt.cleanup?.residualDatabases)
  ) {
    throw new Error('acceptance receipt identity is invalid')
  }
  return {
    schemaVersion: 'plush.dev-data-preparation-readback/v1',
    profileKey: 'full-acceptance',
    targetFingerprint: operation.targetSummary.targetFingerprint,
    reportStatus: receipt.status,
    cleanupComplete: receipt.cleanup.complete,
    residualDatabaseCount: receipt.cleanup.residualDatabases.length,
  }
}

function publicOperation(operation) {
  const confirmation =
    operation.status === 'ready'
      ? [
          'DATA_PREPARATION',
          operation.profileKey,
          operation.runId,
          operation.planHash,
          operation.id,
        ].join(':')
      : ''
  return {
    id: operation.id,
    profileKey: operation.profileKey,
    status: operation.status,
    planHash: operation.planHash,
    runId: operation.runId,
    targetSummary: operation.targetSummary,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    events: operation.events,
    issues: operation.issues,
    readback: operation.readback,
    confirmationRequired: confirmation,
    terminal: DATA_PREPARATION_TERMINAL_STATUSES.includes(operation.status),
  }
}

function laterScenarioReadbackResolves(operation, operations) {
  if (
    operation.profileKey !== 'scenario-demo' ||
    operation.status !== 'not_proven'
  ) {
    return false
  }
  return operations.some(
    (candidate) =>
      candidate.profileKey === 'scenario-demo' &&
      candidate.status === 'passed' &&
      candidate.targetSummary.targetFingerprint ===
        operation.targetSummary.targetFingerprint &&
      candidate.readback?.dataVersion === SCENARIO_DEMO_DATA_VERSION &&
      candidate.readback?.runId === SCENARIO_DEMO_RUN_ID &&
      Date.parse(candidate.updatedAt) > Date.parse(operation.updatedAt)
  )
}

export function unresolvedDataPreparationOutcomeBlocksExecution(
  operation,
  operations
) {
  return operations.some((candidate) => {
    if (
      !['not_proven', 'launching', 'running'].includes(candidate.status) ||
      candidate.id === operation.id
    ) {
      return false
    }
    if (['launching', 'running'].includes(candidate.status)) {
      return true
    }
    return !(
      operation.profileKey === 'scenario-demo' &&
      candidate.profileKey === 'scenario-demo' &&
      candidate.targetSummary.targetFingerprint ===
        operation.targetSummary.targetFingerprint &&
      Date.parse(candidate.updatedAt) < Date.parse(operation.createdAt)
    )
  })
}

function createRunId(now = new Date(), random = randomBytes) {
  const timestamp = now
    .toISOString()
    .slice(2, 19)
    .replace(/[-:T]/gu, '')
    .toLowerCase()
  return `d${timestamp}_${random(4).toString('hex')}`
}

export function createDevDataPreparationService({
  projectRoot,
  operationStore,
  commandRunner = defaultCommandRunner,
  readRepositoryState = readRepositoryIdentity,
  environment = process.env,
  now = () => new Date(),
  random = randomBytes,
  processId = process.pid,
  isProcessAlive = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  },
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  prepareLockTimeoutMs = 180_000,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd())
  const store = operationStore || resolveDataPreparationOperationStore(root)
  const active = new Set()

  function recoverOrphanedOperations() {
    const executionLock = readDataPreparationExecutionLock(store)
    if (executionLock && isProcessAlive(executionLock.pid)) {
      return
    }
    if (executionLock) {
      releaseDataPreparationExecutionLock(store, executionLock.operationId)
    }
    recoverInterruptedDataPreparationOperations(store, now().toISOString(), {
      minimumAgeMs: INTERRUPTED_OPERATION_RECOVERY_GRACE_MS,
    })
  }
  recoverOrphanedOperations()

  async function readCoreTarget() {
    const { parseDatabaseURL } = await loadDatabaseTargetModule()
    const command = coreDemoTargetCommand(root)
    const result = await commandRunner(command.command, command.args, {
      ...command.options,
      env: environment,
    })
    const parsed = assertRegisteredDevelopmentTarget(
      parseDatabaseURL(String(result.stdout || '').trim(), {
        allowRegisteredDevelopment: true,
      }),
      { coreDemo: true }
    )
    return targetSummary(parsed, {
      disposable: false,
      automaticCleanup: false,
    })
  }

  async function readFullAcceptanceTarget() {
    const { parseDatabaseURL } = await loadDatabaseTargetModule()
    const value = String(
      environment[LOCAL_ACCEPTANCE_DATABASE_BASE_URL_ENV] || ''
    ).trim()
    if (!value) {
      throw new Error('full acceptance database environment is required')
    }
    const parsed = assertRegisteredDevelopmentTarget(
      parseDatabaseURL(value, { allowRegisteredDevelopment: true })
    )
    return targetSummary(parsed, {
      disposable: true,
      automaticCleanup: true,
    })
  }

  async function readScenarioTargetIdentity() {
    const { classifyDatabaseName, parseDatabaseURL } =
      await loadDatabaseTargetModule()
    const command = coreDemoTargetCommand(root)
    const result = await commandRunner(command.command, command.args, {
      ...command.options,
      env: environment,
    })
    const parsed = assertRegisteredDevelopmentTarget(
      parseDatabaseURL(String(result.stdout || '').trim(), {
        allowRegisteredDevelopment: true,
      })
    )
    const classification = classifyDatabaseName(parsed.databaseName)
    if (
      !['plush_erp', 'plush_erp_simon_dev'].includes(parsed.databaseName) ||
      classification.disposable ||
      !['development', 'legacy-development'].includes(classification.profile)
    ) {
      throw new Error(
        'scenario demo requires a registered non-disposable development database'
      )
    }
    return Object.freeze({
      databaseName: parsed.databaseName,
      summary: targetSummary(parsed, {
        disposable: false,
        automaticCleanup: false,
      }),
    })
  }

  async function readScenarioTarget() {
    return (await readScenarioTargetIdentity()).summary
  }

  async function resolveTarget(profileKey) {
    if (profileKey === 'core-demo') return readCoreTarget()
    if (profileKey === 'scenario-demo') return readScenarioTarget()
    return readFullAcceptanceTarget()
  }

  async function resolvePreparedTarget(profileKey, repository, runId) {
    if (profileKey === 'core-demo') {
      const before = await readCoreTarget()
      const command = coreDemoPreflightCommand(root)
      const result = await commandRunner(command.command, command.args, {
        ...command.options,
        env: environment,
      })
      const after = await readCoreTarget()
      if (after.targetFingerprint !== before.targetFingerprint) {
        throw new Error('core demo target changed during migration preflight')
      }
      return Object.freeze({
        ...after,
        preflightFingerprint: corePreflightFingerprint(result.stdout),
      })
    }
    if (profileKey === 'scenario-demo') {
      const before = await readScenarioTargetIdentity()
      const command = scenarioDemoPlanCommand(root)
      const result = await commandRunner(command.command, command.args, {
        ...command.options,
        env: environment,
        maxBuffer: 4 * 1024 * 1024,
      })
      const after = await readScenarioTargetIdentity()
      if (
        after.summary.targetFingerprint !== before.summary.targetFingerprint ||
        after.databaseName !== before.databaseName
      ) {
        throw new Error('scenario demo target changed during preflight')
      }
      return Object.freeze({
        ...after.summary,
        preflightFingerprint: scenarioDemoPlanFingerprint(
          result.stdout,
          repository,
          {
            databaseName: after.databaseName,
            targetFingerprint: after.summary.targetFingerprint,
          }
        ),
      })
    }
    const target = await readFullAcceptanceTarget()
    const command = fullAcceptancePlanCommand(root, repository, runId)
    const result = await commandRunner(command.command, command.args, {
      ...command.options,
      env: environment,
    })
    return Object.freeze({
      ...target,
      preflightFingerprint: await fullAcceptancePlanFingerprint(
        result.stdout,
        repository,
        runId
      ),
    })
  }

  async function getSummary() {
    recoverOrphanedOperations()
    const issues = []
    const repositoryResult = await Promise.resolve(readRepositoryState(root))
      .then(validateRepositoryIdentity)
      .catch(() => null)
    if (!repositoryResult) {
      issues.push({
        code: 'repository_identity_unavailable',
        severity: 'blocked',
        message: '当前仓库身份不可用，禁止准备数据操作',
      })
    } else if (repositoryResult.dirty) {
      issues.push({
        code: 'full_acceptance_requires_clean_repository',
        severity: 'warning',
        message: '完整验收要求 exact clean commit；核心演示资料仍可单独准备',
      })
    }
    const target = {}
    for (const [key, profileKey] of [
      ['coreDemo', 'core-demo'],
      ['scenarioDemo', 'scenario-demo'],
      ['fullAcceptance', 'full-acceptance'],
    ]) {
      try {
        const resolved = ['core-demo', 'scenario-demo'].includes(profileKey)
          ? await resolvePreparedTarget(profileKey, repositoryResult, 'summary')
          : await resolveTarget(profileKey)
        target[key] = {
          status: 'available',
          safeTarget: resolved.safeTarget,
          targetFingerprint: resolved.targetFingerprint,
        }
      } catch {
        target[key] = {
          status: 'blocked',
          safeTarget: 'not-proven',
          targetFingerprint: '0'.repeat(64),
        }
        issues.push({
          code: `${profileKey.replace(/-/gu, '_')}_target_unavailable`,
          severity: 'blocked',
          message:
            profileKey === 'core-demo'
              ? '核心演示数据库目标或 migration 前置未通过'
              : profileKey === 'scenario-demo'
                ? '长期场景数据的共享库、migration、运行态或客户配置前置未通过'
                : '完整验收数据库环境未配置或不属于登记开发目标',
        })
      }
    }
    const operations = listDataPreparationOperations(store, { limit: 100 })
    const unresolvedOperations = operations.filter(
      (operation) =>
        operation.status === 'not_proven' &&
        !laterScenarioReadbackResolves(operation, operations)
    )
    if (unresolvedOperations.length > 0) {
      const scenarioReplayAvailable = unresolvedOperations.every(
        (operation) => operation.profileKey === 'scenario-demo'
      )
      issues.push({
        code: scenarioReplayAvailable
          ? 'scenario_demo_explicit_resume_available'
          : 'unresolved_operation_outcome',
        severity: scenarioReplayAvailable ? 'warning' : 'blocked',
        message: scenarioReplayAvailable
          ? '存在重启后结果未知的场景数据操作；可重新准备同目标计划并确认补齐，不会自动重试'
          : '存在重启后结果未知的数据操作，核对前禁止再次执行',
      })
    }
    return {
      schemaVersion: 'plush.dev-data-preparation-summary/v1',
      status: issues.some((issue) => issue.severity === 'blocked')
        ? 'blocked'
        : issues.length
          ? 'partial'
          : 'success',
      generatedAt: now().toISOString(),
      repository: repositoryResult,
      target,
      profiles: DEV_DATA_PREPARATION_PROFILES,
      operations: listDataPreparationOperations(store, { limit: 50 }).map(
        publicOperation
      ),
      issues,
      boundaries: {
        developmentOnly: true,
        browserTargetInputAllowed: false,
        browserShellAccess: false,
        arbitraryPathInputAllowed: false,
        fullAcceptanceAutomaticCleanup: true,
        customerUAT: false,
      },
    }
  }

  async function prepare(payload) {
    const existing = readDataPreparationOperationByIdempotencyKey(
      store,
      payload.idempotencyKey,
      payload.profileKey
    )
    if (existing) {
      return {
        schemaVersion: 'plush.dev-data-preparation-action-result/v1',
        action: 'prepare',
        operation: publicOperation(existing),
        reused: true,
      }
    }
    const deadline = Date.now() + prepareLockTimeoutMs
    let claim
    while (!claim) {
      try {
        claim = acquireDataPreparationIdempotencyLock(
          store,
          payload.idempotencyKey,
          {
            pid: processId,
            now: now().toISOString(),
          }
        )
      } catch (error) {
        if (error?.code !== 'DATA_PREPARATION_IDEMPOTENCY_LOCKED') throw error
        const completed = readDataPreparationOperationByIdempotencyKey(
          store,
          payload.idempotencyKey,
          payload.profileKey
        )
        if (completed) {
          return {
            schemaVersion: 'plush.dev-data-preparation-action-result/v1',
            action: 'prepare',
            operation: publicOperation(completed),
            reused: true,
          }
        }
        const currentLock = readDataPreparationIdempotencyLock(
          store,
          payload.idempotencyKey
        )
        if (currentLock && !isProcessAlive(currentLock.pid)) {
          releaseDataPreparationIdempotencyLock(
            store,
            payload.idempotencyKey,
            currentLock.lockId
          )
          continue
        }
        if (Date.now() >= deadline) {
          throw new Error('data preparation idempotency claim timed out')
        }
        await sleep(10)
      }
    }
    try {
      const completed = readDataPreparationOperationByIdempotencyKey(
        store,
        payload.idempotencyKey,
        payload.profileKey
      )
      if (completed) {
        return {
          schemaVersion: 'plush.dev-data-preparation-action-result/v1',
          action: 'prepare',
          operation: publicOperation(completed),
          reused: true,
        }
      }
      const repository = validateRepositoryIdentity(
        await readRepositoryState(root)
      )
      if (payload.profileKey === 'full-acceptance' && repository.dirty) {
        throw new Error(
          'full acceptance requires the exact clean current commit'
        )
      }
      const runId = createRunId(now(), random)
      const target = await resolvePreparedTarget(
        payload.profileKey,
        repository,
        runId
      )
      const planHash = hashDataPreparationPlan({
        profileKey: payload.profileKey,
        repository,
        runId,
        targetSummary: target,
      })
      const created = createOrReuseDataPreparationOperation(store, {
        idempotencyKey: payload.idempotencyKey,
        profileKey: payload.profileKey,
        repository,
        runId,
        targetSummary: target,
        planHash,
        now: now().toISOString(),
      })
      return {
        schemaVersion: 'plush.dev-data-preparation-action-result/v1',
        action: 'prepare',
        operation: publicOperation(created.operation),
        reused: created.reused,
      }
    } finally {
      releaseDataPreparationIdempotencyLock(
        store,
        payload.idempotencyKey,
        claim.lockId
      )
    }
  }

  async function verifyExecutionIdentity(operation) {
    const repository = validateRepositoryIdentity(
      await readRepositoryState(root)
    )
    const expectedPlanHash = hashDataPreparationPlan({
      profileKey: operation.profileKey,
      repository: operation.repository,
      runId: operation.runId,
      targetSummary: operation.targetSummary,
    })
    if (
      repository.commit !== operation.repository.commit ||
      repository.dirty !== operation.repository.dirty ||
      repository.fingerprint !== operation.repository.fingerprint ||
      expectedPlanHash !== operation.planHash
    ) {
      throw new Error('repository identity changed after preparation')
    }
    const currentTarget = await resolvePreparedTarget(
      operation.profileKey,
      repository,
      operation.runId
    )
    if (
      currentTarget.targetFingerprint !==
        operation.targetSummary.targetFingerprint ||
      currentTarget.preflightFingerprint !==
        operation.targetSummary.preflightFingerprint
    ) {
      throw new Error('database target changed after preparation')
    }
    if (operation.profileKey === 'full-acceptance' && repository.dirty) {
      throw new Error('full acceptance requires the exact clean current commit')
    }
  }

  async function runCoreDemo(operation) {
    const outputs = new Map()
    const completed = []
    for (const command of coreDemoExecutionCommands(root)) {
      try {
        const result = await commandRunner(command.command, command.args, {
          ...command.options,
          env: environment,
        })
        outputs.set(command.key, String(result.stdout || ''))
        completed.push(command.key)
      } catch (error) {
        const stage =
          command.key === 'role-seed' ? '角色账号' : 'Product Core 基础资料'
        const partial =
          completed.length > 0
            ? `；已完成 ${completed.join('、')}，目标可能已部分更新，禁止按全量成功使用`
            : ''
        throw new Error(`${stage}固定步骤失败${partial}；${redactError(error)}`)
      }
    }
    const targetReadback = await readCoreTarget()
    if (
      targetReadback.targetFingerprint !==
      operation.targetSummary.targetFingerprint
    ) {
      throw new Error('core demo target readback changed')
    }
    return {
      schemaVersion: 'plush.dev-data-preparation-readback/v1',
      profileKey: 'core-demo',
      targetFingerprint: targetReadback.targetFingerprint,
      preflight: 'passed',
      roleAccounts: parseRoleSeedReadback(outputs.get('role-seed')),
      core: parseCoreSeedReadback(outputs.get('core-seed')),
      stableUpsert: true,
      cleanupSupported: false,
    }
  }

  async function runFullAcceptance(operation) {
    const command = await fullAcceptanceExecutionCommand(root, operation)
    let commandError = null
    try {
      await commandRunner(command.command, command.args, {
        ...command.options,
        env: environment,
        maxBuffer: 4 * 1024 * 1024,
      })
    } catch (error) {
      commandError = error
    }
    const receiptPath = path.join(
      root,
      'output',
      'qa',
      'local-acceptance-lifecycle',
      operation.runId,
      'receipt.json'
    )
    let readback
    try {
      readback = validateAcceptanceReceipt(
        await readPrivateReceipt(receiptPath),
        operation
      )
    } catch (receiptError) {
      if (commandError) throw commandError
      throw receiptError
    }
    if (
      commandError ||
      readback.reportStatus !== 'passed' ||
      !readback.cleanupComplete ||
      readback.residualDatabaseCount !== 0
    ) {
      const error = new Error(
        'full acceptance did not produce a clean passed receipt'
      )
      error.readback = readback
      throw error
    }
    return readback
  }

  async function runScenarioDemo(operation) {
    const target = await readScenarioTargetIdentity()
    if (
      target.summary.targetFingerprint !==
      operation.targetSummary.targetFingerprint
    ) {
      throw new Error('scenario demo target readback changed')
    }
    const command = scenarioDemoExecutionCommand(root, operation)
    const scenarioConfirmation = [
      'APPLY_SCENARIO_DEMO',
      target.databaseName,
      SCENARIO_DEMO_DATA_VERSION,
      SCENARIO_DEMO_RUN_ID,
      operation.targetSummary.preflightFingerprint,
    ].join(':')
    const result = await commandRunner(command.command, command.args, {
      ...command.options,
      env: {
        ...environment,
        SCENARIO_DEMO_CONFIRM: scenarioConfirmation,
      },
      maxBuffer: 4 * 1024 * 1024,
    })
    return parseScenarioDemoReadback(result.stdout, operation)
  }

  function execute(payload) {
    if (active.size > 0) {
      throw new Error('another data preparation operation is running')
    }
    let operation = readDataPreparationOperation(store, payload.operationId)
    const persistedOperations = listDataPreparationOperations(store, {
      limit: 200,
    })
    if (
      unresolvedDataPreparationOutcomeBlocksExecution(
        operation,
        persistedOperations
      )
    ) {
      throw new Error('an unresolved data preparation outcome blocks execution')
    }
    if (operation.status === 'not_proven') {
      throw new Error('an unresolved data preparation outcome blocks execution')
    }
    if (operation.status !== 'ready') {
      throw new Error('data preparation operation is not ready')
    }
    const expected = publicOperation(operation).confirmationRequired
    if (payload.confirmation !== expected) {
      throw new Error('explicit data preparation confirmation does not match')
    }
    acquireDataPreparationExecutionLock(store, operation.id, {
      pid: processId,
      now: now().toISOString(),
    })
    try {
      if (
        listDataPreparationOperations(store, { limit: 200 }).some(
          (item) =>
            item.id !== operation.id &&
            (item.status === 'launching' || item.status === 'running')
        )
      ) {
        throw new Error(
          'another persisted data preparation operation is active'
        )
      }
      operation = transitionDataPreparationOperation(store, operation.id, {
        status: 'launching',
        message: 'fixed profile executor is launching',
        now: now().toISOString(),
      })
    } catch (error) {
      releaseDataPreparationExecutionLock(store, operation.id)
      throw error
    }
    active.add(operation.id)
    ;(async () => {
      try {
        await verifyExecutionIdentity(operation)
        transitionDataPreparationOperation(store, operation.id, {
          status: 'running',
          message: 'fixed profile execution started',
          now: now().toISOString(),
        })
        const readback =
          operation.profileKey === 'core-demo'
            ? await runCoreDemo(operation)
            : operation.profileKey === 'scenario-demo'
              ? await runScenarioDemo(operation)
              : await runFullAcceptance(operation)
        transitionDataPreparationOperation(store, operation.id, {
          status: 'passed',
          message: 'fixed profile execution and readback passed',
          readback,
          now: now().toISOString(),
        })
      } catch (error) {
        const readback = error?.readback
        transitionDataPreparationOperation(store, operation.id, {
          status: 'failed',
          message: 'fixed profile execution failed',
          issues: [
            {
              code: 'profile_execution_failed',
              severity: 'blocked',
              message: `数据准备未完成：${redactError(error)}`,
            },
          ],
          ...(readback ? { readback } : {}),
          now: now().toISOString(),
        })
      } finally {
        active.delete(operation.id)
        releaseDataPreparationExecutionLock(store, operation.id)
      }
    })().catch(() => {
      active.delete(operation.id)
      try {
        releaseDataPreparationExecutionLock(store, operation.id)
      } catch {
        // A mismatched persistent lock must remain fail-closed.
      }
    })
    return {
      schemaVersion: 'plush.dev-data-preparation-action-result/v1',
      action: 'execute',
      operation: publicOperation(operation),
    }
  }

  return {
    summary: getSummary,
    readOperation(operationId) {
      recoverOrphanedOperations()
      return publicOperation(readDataPreparationOperation(store, operationId))
    },
    async act(value) {
      const request = validateDevDataPreparationAction(value)
      return request.action === 'prepare'
        ? prepare(request.payload)
        : execute(request.payload)
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
    if (size > MAX_DEV_DATA_PREPARATION_REQUEST_BYTES) {
      throw new Error('request body is too large')
    }
    chunks.push(bytes)
  }
  if (size === 0) throw new Error('request body is required')
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createDevDataPreparationMiddleware({
  projectRoot,
  service,
  csrfToken = randomBytes(32).toString('base64url'),
} = {}) {
  const dataService =
    service || createDevDataPreparationService({ projectRoot })
  return async (request, response, next) => {
    let requestPath
    try {
      requestPath = new URL(request.url || '/', 'http://localhost').pathname
    } catch {
      next()
      return
    }
    if (!requestPath.startsWith(`${DEV_DATA_PREPARATION_API_PREFIX}/`)) {
      next()
      return
    }
    if (
      !isLoopbackRemoteAddress(request.socket?.remoteAddress) ||
      !isLoopbackHostHeader(request.headers?.host)
    ) {
      sendJson(response, 403, {
        status: 'failed',
        message: '该数据准备接口仅允许本机访问',
      })
      return
    }
    try {
      if (
        request.method === 'GET' &&
        requestPath === DEV_DATA_PREPARATION_SESSION_API_PATH
      ) {
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-data-preparation-session/v1',
          csrfToken,
          apiPrefix: DEV_DATA_PREPARATION_API_PREFIX,
        })
        return
      }
      if (
        request.method === 'GET' &&
        requestPath === DEV_DATA_PREPARATION_SUMMARY_API_PATH
      ) {
        sendJson(response, 200, await dataService.summary())
        return
      }
      const operationMatch = OPERATION_PATH_PATTERN.exec(requestPath)
      if (request.method === 'GET' && operationMatch) {
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-data-preparation-operation-result/v1',
          operation: dataService.readOperation(operationMatch[1]),
        })
        return
      }
      if (
        request.method === 'POST' &&
        requestPath === DEV_DATA_PREPARATION_ACTION_API_PATH
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
        const result = await dataService.act(
          validateDevDataPreparationAction(await readJsonBody(request))
        )
        sendJson(response, result.action === 'execute' ? 202 : 200, result)
        return
      }
      sendJson(
        response,
        405,
        { status: 'failed', message: '该数据准备接口不支持此方法或路径' },
        { allow: 'GET, POST' }
      )
    } catch (error) {
      const inputError =
        /invalid|unsupported|allowlisted|confirmation|fields|body|JSON|profile/iu.test(
          String(error?.message || '')
        )
      sendJson(response, inputError ? 400 : 409, {
        status: 'failed',
        message: inputError
          ? '请求参数不符合固定数据准备合同'
          : '操作未完成；请刷新测试数据中心查看持久回执',
      })
    }
  }
}

export function createDevDataPreparationPlugin(options = {}) {
  return {
    name: 'plush-dev-data-preparation',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createDevDataPreparationMiddleware(options))
    },
  }
}
