import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { accessSync, constants, readFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import {
  buildRepositoryFingerprint,
  readRepositoryIdentity,
  repositoryIdentitiesEqual,
} from '../../scripts/qa/lib/repository-identity.mjs'
import {
  COVERAGE_OPERATION_ACTIVE_STATUSES,
  COVERAGE_OPERATION_STAGES,
  acquireCoverageExecutionLock,
  attachCoverageExecutionChild,
  createOrReuseCoverageOperation,
  listCoverageOperations,
  readCoverageExecutionLock,
  readCoverageOperation,
  readCoverageOperationByIdempotencyKey,
  releaseCoverageExecutionLock,
  resolveCoverageOperationStore,
  transitionCoverageOperation,
} from '../../scripts/qa/dev-coverage-operation-store.mjs'
import {
  acquireDevQaExecutionLock,
  attachDevQaExecutionChild,
  readDevQaExecutionLock,
  releaseDevQaExecutionLock,
} from '../../scripts/qa/dev-qa-execution-lock.mjs'
import {
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'

export { buildRepositoryFingerprint }

export const DEV_QA_COVERAGE_API_PATH = '/__dev/api/qa/coverage'
export const DEV_QA_COVERAGE_SESSION_API_PATH =
  `${DEV_QA_COVERAGE_API_PATH}/session`
export const DEV_QA_COVERAGE_ACTION_API_PATH =
  `${DEV_QA_COVERAGE_API_PATH}/actions`
export const DEV_QA_COVERAGE_OPERATION_API_PREFIX =
  `${DEV_QA_COVERAGE_API_PATH}/operations`
export const QA_COVERAGE_REPORT_SCHEMA = 'plush-test-coverage-report/v1'
export const QA_COVERAGE_PUBLIC_OPERATION_SCHEMA =
  'plush.dev-qa-coverage-operation-public/v1'
export const MAX_QA_COVERAGE_REPORT_BYTES = 2 * 1024 * 1024
export const MAX_QA_COVERAGE_REQUEST_BYTES = 4 * 1024

const COVERAGE_OPERATION_PATH_PATTERN = new RegExp(
  `^${DEV_QA_COVERAGE_OPERATION_API_PREFIX}/([0-9a-f-]{36})$`,
  'u'
)
const COVERAGE_IDEMPOTENCY_PATTERN =
  /^coverage:collect:baseline:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const COVERAGE_STAGE_MESSAGES = Object.freeze({
  queued: '正在启动固定 baseline 采集器',
  't0-static': '正在执行 T0 静态检查',
  't1-docs': '正在执行 T1 文档合同',
  go: '正在采集 Go 测试与代码覆盖',
  'web-lint': '正在执行 Web ESLint',
  'web-css': '正在执行 Web Stylelint',
  'web-error-codes': '正在校验错误码生成一致性',
  web: '正在采集 Web 测试与代码覆盖',
  import: '正在执行导入合同',
  'field-linkage': '正在执行字段联动专项',
  'identity-check': '正在核对采集前后仓库身份',
  aggregate: '正在聚合覆盖报告',
  finished: '覆盖采集已结束',
})

export function resolveProjectNodeRuntime(projectRoot) {
  const root = path.resolve(projectRoot || process.cwd())
  const expected = readFileSync(path.join(root, '.node-version'), 'utf8').trim()
  if (!/^\d+\.\d+\.\d+$/u.test(expected)) {
    throw new Error('project Node version lock is invalid')
  }
  const pathCandidates = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, 'node'))
  const candidates = [
    ...new Set([
      process.execPath,
      ...pathCandidates,
      `/usr/local/n/versions/node/${expected}/bin/node`,
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
    ]),
  ]
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      const version = execFileSync(candidate, ['--version'], {
        encoding: 'utf8',
      }).trim()
      if (version === `v${expected}`) return candidate
    } catch {
      // Continue until the repository-pinned runtime is found.
    }
  }
  throw new Error('repository-pinned Node runtime is unavailable')
}

const FORBIDDEN_REPORT_KEYS = new Set([
  'accesstoken',
  'authorization',
  'cookie',
  'generatedby',
  'gitremote',
  'overallcoverage',
  'overallpercent',
  'password',
  'refreshtoken',
  'remote',
  'remoteaddress',
  'remoteurl',
  'reporoot',
  'repositoryurl',
  'token',
  'totalcoveragepercent',
  'username',
])

const normalizeKey = (value) =>
  String(value || '')
    .replace(/[^a-z0-9]/giu, '')
    .toLowerCase()

export function resolveDevQaCoverageReportPath(projectRoot) {
  return path.join(
    path.resolve(projectRoot || process.cwd()),
    'output',
    'qa',
    'coverage',
    'latest.json'
  )
}

export async function readCurrentRepositoryState(projectRoot) {
  return readRepositoryIdentity(path.resolve(projectRoot || process.cwd()))
}

export function resolveCoverageFreshness(report, currentRepository) {
  const repository = report?.repository
  return repository?.commit === currentRepository?.commit &&
    repository?.dirty === currentRepository?.dirty &&
    repository?.fingerprint === currentRepository?.fingerprint
    ? 'current'
    : 'stale'
}

const containsSensitiveString = (value) => {
  const text = String(value || '')
  if (
    /(?:^|[\s"'=])(Bearer\s+|ghp_|github_pat_|sk-[A-Za-z0-9]|xox[baprs]-)/iu.test(
      text
    )
  ) {
    return true
  }
  if (/(?:^|[\s"'=])(?:[A-Za-z]:[\\/]|\\\\)/u.test(text)) return true
  if (path.isAbsolute(text)) return true
  if (/(?:^|[\s"'=])\/(?:Users|home|private|var|tmp)(?:\/|$)/u.test(text)) {
    return true
  }

  if (/(?:^|[\s"'=])[a-z][a-z0-9+.-]*:\/\//iu.test(text)) return true
  if (/(?:^|[\s"'=])[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:.+/u.test(text)) {
    return true
  }
  return false
}

const assertSafeReportValue = (value, key = '', depth = 0) => {
  if (depth > 64) throw new Error('report nesting exceeds limit')
  if (typeof value === 'string') {
    if (containsSensitiveString(value)) {
      throw new Error('report contains restricted data')
    }
    return
  }
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeReportValue(item, key, depth + 1))
    return
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    if (FORBIDDEN_REPORT_KEYS.has(normalizeKey(childKey))) {
      throw new Error('report contains restricted data')
    }
    assertSafeReportValue(childValue, childKey, depth + 1)
  }
}

export function validateQaCoverageReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('report must be an object')
  }
  if (report.schemaVersion !== QA_COVERAGE_REPORT_SCHEMA) {
    throw new Error('report schema is unsupported')
  }
  const { repository } = report
  if (
    !repository ||
    typeof repository !== 'object' ||
    Array.isArray(repository) ||
    !/^[0-9a-f]{40,64}$/u.test(repository.commit || '') ||
    typeof repository.dirty !== 'boolean' ||
    !/^[0-9a-f]{64}$/u.test(repository.fingerprint || '')
  ) {
    throw new Error('report repository state is invalid')
  }
  assertSafeReportValue(report)
  return report
}

export async function readQaCoverageReport(
  reportPath,
  maxBytes = MAX_QA_COVERAGE_REPORT_BYTES
) {
  const noFollow = constants.O_NOFOLLOW || 0
  const handle = await open(reportPath, constants.O_RDONLY + noFollow)
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) throw new Error('coverage report is not a file')
    if (stats.size > maxBytes) throw new Error('coverage report is too large')
    const content = await handle.readFile()
    if (content.byteLength > maxBytes) {
      throw new Error('coverage report is too large')
    }
    return validateQaCoverageReport(JSON.parse(content.toString('utf8')))
  } finally {
    await handle.close()
  }
}

const sendJson = (response, statusCode, payload, extraHeaders = {}) => {
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

export function validateDevQaCoverageAction(value) {
  assertExactKeys(value, ['action', 'payload'], 'coverage action')
  if (value.action !== 'collect') {
    throw new Error('coverage action is not allowlisted')
  }
  assertExactKeys(value.payload, ['idempotencyKey'], 'coverage action payload')
  if (
    !COVERAGE_IDEMPOTENCY_PATTERN.test(
      String(value.payload.idempotencyKey || '')
    )
  ) {
    throw new Error('coverage action payload is invalid')
  }
  return value
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
    if (size > MAX_QA_COVERAGE_REQUEST_BYTES) {
      throw new Error('coverage request body is too large')
    }
    chunks.push(bytes)
  }
  if (size === 0) throw new Error('coverage request body is required')
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function publicCoverageOperation(operation) {
  if (!operation) return null
  return {
    schemaVersion: QA_COVERAGE_PUBLIC_OPERATION_SCHEMA,
    id: operation.id,
    profile: operation.profile,
    repository: operation.repository,
    status: operation.status,
    stage: operation.stage,
    outcome: operation.outcome,
    exitCode: operation.exitCode,
    revision: operation.revision,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    finishedAt: operation.finishedAt,
    message: operation.message,
    events: operation.events.map(({ at, status, stage, message }) => ({
      at,
      status,
      stage,
      message,
    })),
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

function createStageLineReader(onStage) {
  let pending = ''
  const consume = (flush = false) => {
    const lines = pending.split(/\r?\n/u)
    pending = flush ? '' : lines.pop() || ''
    for (const line of lines) {
      const match = /^\[qa:test-coverage-collect\] stage=([a-z0-9-]+)$/u.exec(
        line.trim()
      )
      if (match && COVERAGE_OPERATION_STAGES.includes(match[1])) {
        onStage(match[1])
      }
    }
    if (flush && pending) {
      const match =
        /^\[qa:test-coverage-collect\] stage=([a-z0-9-]+)$/u.exec(
          pending.trim()
        )
      if (match && COVERAGE_OPERATION_STAGES.includes(match[1])) {
        onStage(match[1])
      }
      pending = ''
    }
  }
  return {
    write(chunk) {
      pending = `${pending}${String(chunk || '')}`.slice(-8192)
      consume(false)
    },
    end() {
      consume(true)
    },
  }
}

export function createDevQaCoverageService({
  projectRoot,
  operationStore,
  processId = process.pid,
  processAlive = processIsAlive,
  randomOperationId = randomUUID,
  readReport = readQaCoverageReport,
  readRepositoryState = readCurrentRepositoryState,
  resolveNodeRuntime = resolveProjectNodeRuntime,
  spawnProcess = spawn,
  now = () => new Date(),
} = {}) {
  const root = path.resolve(projectRoot || process.cwd())
  const reportPath = resolveDevQaCoverageReportPath(root)
  const store = operationStore || resolveCoverageOperationStore(root)
  const active = new Map()

  function releaseExecutionLocks(operationId) {
    try {
      releaseCoverageExecutionLock(store, operationId)
    } catch {
      // Preserve a mismatched coverage-specific lock.
    }
    try {
      releaseDevQaExecutionLock(store, {
        kind: 'coverage',
        profile: 'baseline',
        operationId,
      })
    } catch {
      // Preserve a mismatched global QA lock.
    }
  }

  function transitionNotProven(operation, message) {
    if (!COVERAGE_OPERATION_ACTIVE_STATUSES.includes(operation.status)) {
      return operation
    }
    return transitionCoverageOperation(store, operation.id, {
      status: 'not_proven',
      stage: 'finished',
      message,
      now: now().toISOString(),
    })
  }

  function recoverInterruptedOperation() {
    const lock = readCoverageExecutionLock(store)
    const sharedLock = readDevQaExecutionLock(store)
    if (!lock) {
      if (sharedLock?.kind === 'coverage') {
        let sharedOperation = null
        try {
          sharedOperation = readCoverageOperation(
            store,
            sharedLock.operationId
          )
        } catch {
          sharedOperation = null
        }
        if (
          processAlive(sharedLock.ownerPid) ||
          (sharedLock.childPid !== null && processAlive(sharedLock.childPid))
        ) {
          return sharedOperation
        }
        if (
          sharedOperation &&
          COVERAGE_OPERATION_ACTIVE_STATUSES.includes(sharedOperation.status)
        ) {
          sharedOperation = transitionNotProven(
            sharedOperation,
            '开发服务或采集进程中断，结果无法证明，请重新采集'
          )
        }
        try {
          releaseDevQaExecutionLock(store, {
            kind: 'coverage',
            profile: 'baseline',
            operationId: sharedLock.operationId,
          })
        } catch {
          // Preserve an unknown shared lock.
        }
      }
      for (const operation of listCoverageOperations(store, { limit: 100 })) {
        if (COVERAGE_OPERATION_ACTIVE_STATUSES.includes(operation.status)) {
          transitionNotProven(
            operation,
            '开发服务中断，采集结果无法证明，请重新采集'
          )
        }
      }
      return null
    }

    let operation = null
    try {
      operation = readCoverageOperation(store, lock.operationId)
    } catch {
      operation = null
    }
    if (
      operation &&
      !COVERAGE_OPERATION_ACTIVE_STATUSES.includes(operation.status)
    ) {
      releaseExecutionLocks(lock.operationId)
      return null
    }
    if (
      processAlive(lock.ownerPid) ||
      (lock.childPid !== null && processAlive(lock.childPid))
    ) {
      return operation
    }
    if (operation) {
      operation = transitionNotProven(
        operation,
        '开发服务或采集进程中断，结果无法证明，请重新采集'
      )
    }
    releaseExecutionLocks(lock.operationId)
    return operation
  }

  function latestOperation() {
    const lockedOperation = recoverInterruptedOperation()
    if (
      lockedOperation &&
      COVERAGE_OPERATION_ACTIVE_STATUSES.includes(lockedOperation.status)
    ) {
      return publicCoverageOperation(lockedOperation)
    }
    return publicCoverageOperation(
      listCoverageOperations(store, { limit: 1 })[0] || null
    )
  }

  function updateStage(operationId, stage) {
    if (!Object.hasOwn(COVERAGE_STAGE_MESSAGES, stage)) return
    try {
      const current = readCoverageOperation(store, operationId)
      if (
        current.status !== 'running' ||
        current.stage === stage ||
        stage === 'finished'
      ) {
        return
      }
      transitionCoverageOperation(store, operationId, {
        status: 'running',
        stage,
        message: COVERAGE_STAGE_MESSAGES[stage],
        now: now().toISOString(),
      })
    } catch {
      // The persisted operation remains authoritative; raw child output is not exposed.
    }
  }

  function finishOperation(operation, child, code) {
    if (!active.has(operation.id)) return
    active.delete(operation.id)
    ;(async () => {
      let status = 'failed'
      let outcome = null
      const exitCode = Number.isSafeInteger(code) ? code : null
      let message = '覆盖采集未完成，上一份报告保持不变'
      try {
        const report = await readReport(reportPath, MAX_QA_COVERAGE_REPORT_BYTES)
        const identityMatches = repositoryIdentitiesEqual(
          operation.repository,
          report.repository
        )
        if ([0, 2].includes(exitCode) && identityMatches) {
          status = 'completed'
          outcome = exitCode === 0 ? 'passed' : 'issues'
          message =
            exitCode === 0
              ? '覆盖采集完成，报告已绑定当前仓库身份'
              : '覆盖采集完成，报告包含失败或缺失项'
        } else if (!identityMatches) {
          message = '采集期间代码发生变化，报告未更新，请在代码稳定后重试'
        }
      } catch {
        if (exitCode === 1) {
          message = '采集期间代码发生变化或证据生成失败，报告未更新'
        }
      }
      try {
        transitionCoverageOperation(store, operation.id, {
          status,
          stage: 'finished',
          message,
          outcome,
          exitCode,
          now: now().toISOString(),
        })
      } finally {
        releaseExecutionLocks(operation.id)
      }
    })().catch(() => {
      try {
        const current = readCoverageOperation(store, operation.id)
        if (COVERAGE_OPERATION_ACTIVE_STATUSES.includes(current.status)) {
          transitionCoverageOperation(store, operation.id, {
            status: 'not_proven',
            stage: 'finished',
            message: '采集终态读回失败，结果无法证明，请重新采集',
            now: now().toISOString(),
          })
        }
      } finally {
        releaseExecutionLocks(operation.id)
      }
    })
    child.stdout?.resume?.()
  }

  function launchOperation(operation) {
    let child
    try {
      const nodeRuntime = resolveNodeRuntime(root)
      child = spawnProcess(
        nodeRuntime,
        [
          'scripts/qa/test-coverage-collect.mjs',
          '--profile',
          'baseline',
          '--write',
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: [
              path.dirname(nodeRuntime),
              String(process.env.PATH || ''),
            ]
              .filter(Boolean)
              .join(path.delimiter),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
      if (!Number.isSafeInteger(child?.pid) || child.pid < 1) {
        throw new Error('coverage child pid is unavailable')
      }
      attachCoverageExecutionChild(store, operation.id, child.pid)
      attachDevQaExecutionChild(store, {
        kind: 'coverage',
        profile: 'baseline',
        operationId: operation.id,
        childPid: child.pid,
      })
      operation = transitionCoverageOperation(store, operation.id, {
        status: 'running',
        stage: 'queued',
        message: COVERAGE_STAGE_MESSAGES.queued,
        now: now().toISOString(),
      })
    } catch {
      try {
        child?.kill?.()
      } catch {
        // The failed startup remains terminal even if the child cannot be signalled.
      }
      operation = transitionCoverageOperation(store, operation.id, {
        status: 'failed',
        stage: 'finished',
        message: '固定 baseline 采集器启动失败',
        now: now().toISOString(),
      })
      releaseExecutionLocks(operation.id)
      return operation
    }

    active.set(operation.id, child)
    const stageReader = createStageLineReader((stage) =>
      updateStage(operation.id, stage)
    )
    child.stderr?.on?.('data', (chunk) => stageReader.write(chunk))
    child.stderr?.on?.('end', () => stageReader.end())
    child.stdout?.resume?.()
    child.once?.('error', () => finishOperation(operation, child, null))
    child.once?.('close', (code) => finishOperation(operation, child, code))
    return operation
  }

  async function collect(payload) {
    recoverInterruptedOperation()
    const existing = readCoverageOperationByIdempotencyKey(
      store,
      payload.idempotencyKey
    )
    if (existing) {
      return {
        schemaVersion: 'plush.dev-qa-coverage-action-result/v1',
        action: 'collect',
        reused: true,
        operation: publicCoverageOperation(existing),
      }
    }

    const liveLock = readCoverageExecutionLock(store)
    if (liveLock) {
      const running = readCoverageOperation(store, liveLock.operationId)
      return {
        schemaVersion: 'plush.dev-qa-coverage-action-result/v1',
        action: 'collect',
        reused: true,
        operation: publicCoverageOperation(running),
      }
    }

    const operationId = randomOperationId()
    acquireDevQaExecutionLock(store, {
      kind: 'coverage',
      profile: 'baseline',
      operationId,
      ownerPid: processId,
      now: now().toISOString(),
    })
    try {
      acquireCoverageExecutionLock(store, operationId, {
        ownerPid: processId,
        now: now().toISOString(),
      })
    } catch (error) {
      releaseExecutionLocks(operationId)
      throw error
    }
    let operation
    try {
      const racedExisting = readCoverageOperationByIdempotencyKey(
        store,
        payload.idempotencyKey
      )
      if (racedExisting) {
        releaseExecutionLocks(operationId)
        return {
          schemaVersion: 'plush.dev-qa-coverage-action-result/v1',
          action: 'collect',
          reused: true,
          operation: publicCoverageOperation(racedExisting),
        }
      }
      const repository = await readRepositoryState(root)
      operation = createOrReuseCoverageOperation(store, {
        idempotencyKey: payload.idempotencyKey,
        repository,
        operationId,
        now: now().toISOString(),
      }).operation
      operation = launchOperation(operation)
    } catch (error) {
      releaseExecutionLocks(operationId)
      throw error
    }
    return {
      schemaVersion: 'plush.dev-qa-coverage-action-result/v1',
      action: 'collect',
      reused: false,
      operation: publicCoverageOperation(operation),
    }
  }

  return {
    latestOperation,
    readOperation(operationId) {
      recoverInterruptedOperation()
      return publicCoverageOperation(readCoverageOperation(store, operationId))
    },
    async act(value) {
      const action = validateDevQaCoverageAction(value)
      return collect(action.payload)
    },
  }
}

export function createDevQaCoverageMiddleware({
  projectRoot,
  maxReportBytes = MAX_QA_COVERAGE_REPORT_BYTES,
  readReport = readQaCoverageReport,
  readRepositoryState = readCurrentRepositoryState,
  service,
  csrfToken = randomBytes(32).toString('base64url'),
} = {}) {
  const root = path.resolve(projectRoot || process.cwd())
  const reportPath = resolveDevQaCoverageReportPath(root)
  const coverageService =
    service ||
    createDevQaCoverageService({
      projectRoot: root,
      readReport,
      readRepositoryState,
    })

  return async (request, response, next) => {
    let requestPath = ''
    let requestUrl
    try {
      requestUrl = new URL(request.url || '/', 'http://localhost')
      requestPath = requestUrl.pathname
    } catch (_error) {
      next()
      return
    }
    if (
      requestPath !== DEV_QA_COVERAGE_API_PATH &&
      !requestPath.startsWith(`${DEV_QA_COVERAGE_API_PATH}/`)
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
        requestPath === DEV_QA_COVERAGE_SESSION_API_PATH
      ) {
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-qa-coverage-session/v1',
          apiPath: DEV_QA_COVERAGE_API_PATH,
          csrfToken,
        })
        return
      }

      const operationMatch =
        COVERAGE_OPERATION_PATH_PATTERN.exec(requestPath)
      if (request.method === 'GET' && operationMatch) {
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-qa-coverage-operation-result/v1',
          operation: coverageService.readOperation(operationMatch[1]),
        })
        return
      }

      if (
        request.method === 'POST' &&
        requestPath === DEV_QA_COVERAGE_ACTION_API_PATH
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
        if (requestUrl.search) {
          throw new Error('coverage action query is unsupported')
        }
        const result = await coverageService.act(
          validateDevQaCoverageAction(await readJsonBody(request))
        )
        sendJson(response, 202, result)
        return
      }

      if (
        request.method === 'GET' &&
        requestPath === DEV_QA_COVERAGE_API_PATH
      ) {
        const operation = coverageService.latestOperation()
        try {
          const report = await readReport(reportPath, maxReportBytes)
          const currentRepository = await readRepositoryState(root)
          sendJson(response, 200, {
            status: resolveCoverageFreshness(report, currentRepository),
            report,
            operation,
          })
        } catch (error) {
          if (error?.code === 'ENOENT') {
            sendJson(response, 404, {
              status: 'missing',
              message: '覆盖率报告尚未生成',
              operation,
            })
            return
          }
          sendJson(response, 500, {
            status: 'failed',
            message: '覆盖率报告不可用，请重新生成',
            operation,
          })
        }
        return
      }

      const allow =
        requestPath === DEV_QA_COVERAGE_ACTION_API_PATH ? 'POST' : 'GET'
      sendJson(
        response,
        405,
        { status: 'failed', message: '该开发接口不支持当前请求方法' },
        { allow }
      )
    } catch (error) {
      if (error?.code === 'DEV_QA_EXECUTION_LOCKED') {
        sendJson(response, 409, {
          status: 'blocked',
          message: '已有本地验证或覆盖采集正在运行',
        })
        return
      }
      sendJson(response, 400, {
        status: 'failed',
        message: '覆盖采集请求无效或当前无法执行',
      })
    }
  }
}

export function createDevQaCoveragePlugin(options = {}) {
  return {
    name: 'plush-dev-qa-coverage',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createDevQaCoverageMiddleware(options))
    },
  }
}
