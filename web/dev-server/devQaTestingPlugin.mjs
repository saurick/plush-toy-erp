import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  DEV_TESTING_ACTIONS,
  DEV_TESTING_OPERATION_ACTIVE_STATUSES,
  createOrReuseDevTestingOperation,
  listDevTestingOperations,
  readDevTestingOperation,
  readDevTestingOperationByIdempotencyKey,
  resolveDevTestingOperationStore,
  transitionDevTestingOperation,
} from '../../scripts/qa/dev-testing-operation-store.mjs'
import {
  acquireDevQaExecutionLock,
  attachDevQaExecutionChild,
  readDevQaExecutionLock,
  releaseDevQaExecutionLock,
} from '../../scripts/qa/dev-qa-execution-lock.mjs'
import {
  readRepositoryIdentity,
  repositoryIdentitiesEqual,
} from '../../scripts/qa/lib/repository-identity.mjs'
import {
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'
import { resolveProjectNodeRuntime } from './devQaCoveragePlugin.mjs'

export const DEV_QA_TESTING_API_PATH = '/__dev/api/qa/testing'
export const DEV_QA_TESTING_SESSION_API_PATH = `${DEV_QA_TESTING_API_PATH}/session`
export const DEV_QA_TESTING_PLAN_API_PATH = `${DEV_QA_TESTING_API_PATH}/plan`
export const DEV_QA_TESTING_ACTION_API_PATH = `${DEV_QA_TESTING_API_PATH}/actions`
export const DEV_QA_TESTING_OPERATION_API_PREFIX = `${DEV_QA_TESTING_API_PATH}/operations`
export const DEV_QA_TESTING_PUBLIC_OPERATION_SCHEMA =
  'plush.dev-qa-testing-operation-public/v1'
export const MAX_QA_TESTING_REQUEST_BYTES = 4 * 1024

const OPERATION_PATH_PATTERN = new RegExp(
  `^${DEV_QA_TESTING_OPERATION_API_PREFIX}/([0-9a-f-]{36})$`,
  'u'
)
const IDEMPOTENCY_PATTERN =
  /^testing:(fast|role-access|field-linkage):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const ACTION_MESSAGES = Object.freeze({
  fast: Object.freeze({
    running: '正在运行开发门禁',
    passed: '开发门禁完成，回执已绑定稳定仓库身份',
    failed: '开发门禁未通过，请查看本地终端并修复后重试',
  }),
  'role-access': Object.freeze({
    running: '正在巡检九岗位权限与任务可见性',
    passed: '九岗位权限与任务可见性巡检完成，预期业务写入为零',
    failed: '岗位权限巡检未通过，请检查本地后端与角色配置',
    blocked: '本地后端或演示账号凭据尚未就绪，岗位巡检未执行',
  }),
  'field-linkage': Object.freeze({
    running: '正在运行字段联动专项',
    passed: '字段联动专项完成，新报告已原子发布',
    failed: '字段联动专项未通过，上一份报告保持不变',
  }),
})

const EXPECTED_GIT_HOOKS_PATH = '.githooks'
const GIT_HOOK_FILE_CHECKS = Object.freeze([
  Object.freeze({ key: 'pre-commit-entry', path: '.githooks/pre-commit' }),
  Object.freeze({ key: 'commit-msg-entry', path: '.githooks/commit-msg' }),
  Object.freeze({ key: 'pre-push-entry', path: '.githooks/pre-push' }),
  Object.freeze({
    key: 'pre-commit-runner',
    path: 'scripts/git-hooks/pre-commit.sh',
  }),
  Object.freeze({
    key: 'commit-msg-runner',
    path: 'scripts/git-hooks/commit-msg.sh',
  }),
  Object.freeze({
    key: 'pre-push-runner',
    path: 'scripts/git-hooks/pre-push.sh',
  }),
  Object.freeze({ key: 'prepare-push', path: 'scripts/qa/prepare-push.sh' }),
])

function readConfiguredGitHooksPath(root) {
  try {
    return execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function readExecutableFileStatus(root, sourcePath) {
  try {
    const stats = statSync(path.join(root, sourcePath))
    if (!stats.isFile()) return 'invalid'
    const permissions = stats.mode % 0o1000
    const executable = [0o100, 0o010, 0o001].some(
      (bit) => Math.floor(permissions / bit) % 2 === 1
    )
    return executable ? 'ready' : 'not_executable'
  } catch (error) {
    return error?.code === 'ENOENT' ? 'missing' : 'invalid'
  }
}

export function readDevQaGitHookGovernance(
  projectRoot,
  {
    readConfiguredPath = readConfiguredGitHooksPath,
    readFileStatus = readExecutableFileStatus,
  } = {}
) {
  const root = path.resolve(projectRoot || process.cwd())
  const configuredPath = String(readConfiguredPath(root) || '').trim()
  const pathReady = configuredPath === EXPECTED_GIT_HOOKS_PATH
  const checks = [
    {
      key: 'hooks-path',
      status: pathReady ? 'ready' : 'misconfigured',
    },
    ...GIT_HOOK_FILE_CHECKS.map((check) => ({
      key: check.key,
      status: readFileStatus(root, check.path),
    })),
  ]
  return {
    status: checks.every((check) => check.status === 'ready')
      ? 'ready'
      : 'blocked',
    expectedHooksPath: EXPECTED_GIT_HOOKS_PATH,
    configuredHooksPath: pathReady
      ? EXPECTED_GIT_HOOKS_PATH
      : configuredPath
        ? '其他路径'
        : '未配置',
    checks,
  }
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

export function validateDevQaTestingAction(value) {
  assertExactKeys(value, ['action', 'payload'], 'testing action')
  if (!DEV_TESTING_ACTIONS.includes(value.action)) {
    throw new Error('testing action is not allowlisted')
  }
  assertExactKeys(value.payload, ['idempotencyKey'], 'testing action payload')
  const match = IDEMPOTENCY_PATTERN.exec(
    String(value.payload.idempotencyKey || '')
  )
  if (match?.[1] !== value.action) {
    throw new Error('testing action payload is invalid')
  }
  return value
}

function shellQuote(value) {
  const text = String(value)
  const singleQuote = String.fromCodePoint(39)
  const escapedSingleQuote = String.fromCodePoint(39, 34, 39, 34, 39)
  return /^[A-Za-z0-9_./:=@+-]+$/u.test(text)
    ? text
    : `${singleQuote}${text.replaceAll(singleQuote, escapedSingleQuote)}${singleQuote}`
}

function publicPlanCommand(selected) {
  const body = [selected.bin, ...selected.args].map(shellQuote).join(' ')
  return {
    id: selected.id,
    level: selected.level,
    label: selected.label,
    cwd: selected.cwd,
    command: selected.cwd === '.' ? body : `(cd ${selected.cwd} && ${body})`,
  }
}

async function collectAffectedValidationPlan(root) {
  const affectedModuleUrl = pathToFileURL(
    path.join(root, 'scripts/qa/affected.mjs')
  ).href
  const { buildAffectedPlan, collectChangedFiles } = await import(
    affectedModuleUrl
  )
  return buildAffectedPlan(collectChangedFiles({ root }), { root })
}

export function buildDevQaTestingCommand({
  action,
  nodeRuntime,
  operationId,
  projectRoot,
}) {
  const commands = {
    fast: [
      'scripts/qa/run-gate-with-receipt.mjs',
      '--gate',
      'fast',
      '--out',
      `output/dev-workbench/receipts/fast-oneclick-${operationId}.json`,
    ],
    'role-access': [
      'scripts/qa/yoyoosun-role-jsonrpc-access.mjs',
      '--report',
      'output/qa/yoyoosun-role-jsonrpc-access/report.json',
    ],
    'field-linkage': ['scripts/qa/erp-field-linkage.mjs'],
  }
  if (!DEV_TESTING_ACTIONS.includes(action)) {
    throw new Error('testing command action is not allowlisted')
  }
  return {
    command: nodeRuntime,
    args: commands[action],
    cwd: projectRoot,
    env: {
      ...process.env,
      PATH: [path.dirname(nodeRuntime), String(process.env.PATH || '')]
        .filter(Boolean)
        .join(path.delimiter),
    },
  }
}

function publicOperation(operation) {
  if (!operation) return null
  return {
    schemaVersion: DEV_QA_TESTING_PUBLIC_OPERATION_SCHEMA,
    id: operation.id,
    action: operation.action,
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

function startFixedProcess(spec, spawnProcess = spawn) {
  const child = spawnProcess(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (!Number.isSafeInteger(child?.pid) || child.pid < 1) {
    throw new Error('testing child pid is unavailable')
  }
  child.stdout?.resume?.()
  child.stderr?.resume?.()
  const completion = new Promise((resolve) => {
    let settled = false
    const finish = (code) => {
      if (settled) return
      settled = true
      resolve({ code: Number.isSafeInteger(code) ? code : null })
    }
    child.once?.('error', () => finish(null))
    child.once?.('close', (code) => finish(code))
  })
  return {
    pid: child.pid,
    completion,
    kill: () => child.kill?.(),
  }
}

function busyProjection(lock) {
  if (!lock) return { active: false, kind: '', profile: '' }
  return {
    active: true,
    kind: lock.kind,
    profile: lock.profile,
  }
}

export function createDevQaTestingService({
  projectRoot,
  operationStore,
  processId = process.pid,
  processAlive = processIsAlive,
  randomOperationId = randomUUID,
  readRepositoryState = readRepositoryIdentity,
  resolveNodeRuntime = resolveProjectNodeRuntime,
  collectPlan = collectAffectedValidationPlan,
  readHookGovernance = readDevQaGitHookGovernance,
  launchProcess = (spec) => startFixedProcess(spec),
  now = () => new Date(),
} = {}) {
  const root = path.resolve(projectRoot || process.cwd())
  const store = operationStore || resolveDevTestingOperationStore(root)
  const active = new Map()

  function releaseLock(operation) {
    try {
      releaseDevQaExecutionLock(store, {
        kind: 'testing',
        profile: operation.action,
        operationId: operation.id,
      })
    } catch {
      // Preserve an unknown or foreign lock rather than deleting it.
    }
  }

  function markNotProven(operation, message) {
    if (!DEV_TESTING_OPERATION_ACTIVE_STATUSES.includes(operation.status)) {
      return operation
    }
    return transitionDevTestingOperation(store, operation.id, {
      status: 'not_proven',
      stage: 'finished',
      message,
      now: now().toISOString(),
    })
  }

  function recoverInterruptedOperation() {
    const lock = readDevQaExecutionLock(store)
    if (!lock || lock.kind !== 'testing') {
      if (!lock) {
        for (const operation of listDevTestingOperations(store, {
          limit: 1000,
        })) {
          if (
            DEV_TESTING_OPERATION_ACTIVE_STATUSES.includes(operation.status)
          ) {
            markNotProven(
              operation,
              '开发服务中断，验证结果无法证明，请重新运行'
            )
          }
        }
      }
      return null
    }
    let operation = null
    try {
      operation = readDevTestingOperation(store, lock.operationId)
    } catch {
      return null
    }
    if (!DEV_TESTING_OPERATION_ACTIVE_STATUSES.includes(operation.status)) {
      releaseLock(operation)
      return null
    }
    if (
      processAlive(lock.ownerPid) ||
      (lock.childPid !== null && processAlive(lock.childPid))
    ) {
      return operation
    }
    const interrupted = markNotProven(
      operation,
      '开发服务或验证进程中断，结果无法证明，请重新运行'
    )
    releaseLock(interrupted)
    return interrupted
  }

  async function finishOperation(operation, code) {
    if (!active.has(operation.id)) return
    active.delete(operation.id)
    let current = readDevTestingOperation(store, operation.id)
    try {
      if (current.status === 'running') {
        current = transitionDevTestingOperation(store, operation.id, {
          status: 'running',
          stage: 'identity-check',
          message: '正在核对执行前后仓库身份',
          now: now().toISOString(),
        })
      }
      const repository = await readRepositoryState(root)
      if (!repositoryIdentitiesEqual(current.repository, repository)) {
        transitionDevTestingOperation(store, operation.id, {
          status: 'not_proven',
          stage: 'finished',
          message: '执行期间代码发生变化，结果无法证明，请在代码稳定后重试',
          exitCode: Number.isSafeInteger(code) ? code : null,
          now: now().toISOString(),
        })
        return
      }
      if (code === 0) {
        transitionDevTestingOperation(store, operation.id, {
          status: 'completed',
          stage: 'finished',
          message: ACTION_MESSAGES[operation.action].passed,
          outcome: 'passed',
          exitCode: 0,
          now: now().toISOString(),
        })
        return
      }
      if (operation.action === 'role-access' && code === 2) {
        transitionDevTestingOperation(store, operation.id, {
          status: 'blocked',
          stage: 'finished',
          message: ACTION_MESSAGES['role-access'].blocked,
          outcome: 'blocked',
          exitCode: 2,
          now: now().toISOString(),
        })
        return
      }
      transitionDevTestingOperation(store, operation.id, {
        status: 'failed',
        stage: 'finished',
        message: ACTION_MESSAGES[operation.action].failed,
        exitCode: Number.isSafeInteger(code) ? code : null,
        now: now().toISOString(),
      })
    } catch {
      const persisted = readDevTestingOperation(store, operation.id)
      if (DEV_TESTING_OPERATION_ACTIVE_STATUSES.includes(persisted.status)) {
        markNotProven(persisted, '验证终态读回失败，结果无法证明，请重新运行')
      }
    } finally {
      releaseLock(operation)
    }
  }

  function launchOperation(operation) {
    let processHandle
    try {
      const nodeRuntime = resolveNodeRuntime(root)
      const spec = buildDevQaTestingCommand({
        action: operation.action,
        nodeRuntime,
        operationId: operation.id,
        projectRoot: root,
      })
      processHandle = launchProcess(spec)
      if (!Number.isSafeInteger(processHandle?.pid) || processHandle.pid < 1) {
        throw new Error('testing child pid is unavailable')
      }
      attachDevQaExecutionChild(store, {
        kind: 'testing',
        profile: operation.action,
        operationId: operation.id,
        childPid: processHandle.pid,
      })
      operation = transitionDevTestingOperation(store, operation.id, {
        status: 'running',
        stage: 'running',
        message: ACTION_MESSAGES[operation.action].running,
        now: now().toISOString(),
      })
    } catch {
      try {
        processHandle?.kill?.()
      } catch {
        // The startup failure remains terminal.
      }
      operation = transitionDevTestingOperation(store, operation.id, {
        status: 'failed',
        stage: 'finished',
        message: '固定验证任务启动失败',
        now: now().toISOString(),
      })
      releaseLock(operation)
      return operation
    }
    active.set(operation.id, processHandle)
    Promise.resolve(processHandle.completion)
      .then(({ code }) => finishOperation(operation, code))
      .catch(() => finishOperation(operation, null))
    return operation
  }

  async function start(action, payload) {
    recoverInterruptedOperation()
    const existing = readDevTestingOperationByIdempotencyKey(
      store,
      payload.idempotencyKey
    )
    if (existing) {
      return {
        schemaVersion: 'plush.dev-qa-testing-action-result/v1',
        action,
        reused: true,
        operation: publicOperation(existing),
      }
    }
    if (readDevQaExecutionLock(store)) {
      const error = new Error('another DEV QA operation is running')
      error.code = 'DEV_QA_EXECUTION_LOCKED'
      throw error
    }
    const operationId = randomOperationId()
    acquireDevQaExecutionLock(store, {
      kind: 'testing',
      profile: action,
      operationId,
      ownerPid: processId,
      now: now().toISOString(),
    })
    let operation
    try {
      const repository = await readRepositoryState(root)
      operation = createOrReuseDevTestingOperation(store, {
        action,
        idempotencyKey: payload.idempotencyKey,
        repository,
        operationId,
        now: now().toISOString(),
      }).operation
      operation = launchOperation(operation)
    } catch (error) {
      try {
        releaseDevQaExecutionLock(store, {
          kind: 'testing',
          profile: action,
          operationId,
        })
      } catch {
        // Preserve a mismatched lock.
      }
      throw error
    }
    return {
      schemaVersion: 'plush.dev-qa-testing-action-result/v1',
      action,
      reused: false,
      operation: publicOperation(operation),
    }
  }

  return {
    async plan() {
      const repository = await readRepositoryState(root)
      const affected = await collectPlan(root)
      const currentRepository = await readRepositoryState(root)
      if (!repositoryIdentitiesEqual(repository, currentRepository)) {
        const error = new Error('repository changed while planning')
        error.code = 'DEV_QA_REPOSITORY_CHANGED'
        throw error
      }
      return {
        schemaVersion: 'plush.dev-qa-testing-plan/v1',
        generatedAt: now().toISOString(),
        repository,
        changedCount: affected.changedFiles.length,
        levels: affected.levels,
        highestLevel: affected.highestLevel,
        requiresFull: affected.requiresFull,
        commands: affected.commands.map(publicPlanCommand),
        followUps: affected.followUps.map(({ level, text }) => ({
          level,
          text,
        })),
        prePushGate: affected.prePushGate,
      }
    },
    summary() {
      recoverInterruptedOperation()
      const operations = listDevTestingOperations(store, { limit: 1000 })
      return {
        schemaVersion: 'plush.dev-qa-testing-summary/v2',
        busy: busyProjection(readDevQaExecutionLock(store)),
        hooks: readHookGovernance(root),
        operations: Object.fromEntries(
          DEV_TESTING_ACTIONS.map((action) => [
            action,
            publicOperation(
              operations.find((operation) => operation.action === action) ||
                null
            ),
          ])
        ),
      }
    },
    readOperation(operationId) {
      recoverInterruptedOperation()
      return publicOperation(readDevTestingOperation(store, operationId))
    },
    async act(value) {
      const action = validateDevQaTestingAction(value)
      return start(action.action, action.payload)
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
    if (size > MAX_QA_TESTING_REQUEST_BYTES) {
      throw new Error('testing request body is too large')
    }
    chunks.push(bytes)
  }
  if (size === 0) throw new Error('testing request body is required')
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

export function createDevQaTestingMiddleware({
  projectRoot,
  service,
  csrfToken = randomBytes(32).toString('base64url'),
} = {}) {
  const testingService = service || createDevQaTestingService({ projectRoot })
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
      requestPath !== DEV_QA_TESTING_API_PATH &&
      !requestPath.startsWith(`${DEV_QA_TESTING_API_PATH}/`)
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
        requestPath === DEV_QA_TESTING_SESSION_API_PATH
      ) {
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-qa-testing-session/v1',
          apiPath: DEV_QA_TESTING_API_PATH,
          csrfToken,
        })
        return
      }
      if (
        request.method === 'GET' &&
        requestPath === DEV_QA_TESTING_PLAN_API_PATH
      ) {
        if (requestUrl.search) {
          throw new Error('testing plan query is unsupported')
        }
        sendJson(response, 200, await testingService.plan())
        return
      }
      const operationMatch = OPERATION_PATH_PATTERN.exec(requestPath)
      if (request.method === 'GET' && operationMatch) {
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-qa-testing-operation-result/v1',
          operation: testingService.readOperation(operationMatch[1]),
        })
        return
      }
      if (
        request.method === 'POST' &&
        requestPath === DEV_QA_TESTING_ACTION_API_PATH
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
          throw new Error('testing action query is unsupported')
        }
        sendJson(
          response,
          202,
          await testingService.act(
            validateDevQaTestingAction(await readJsonBody(request))
          )
        )
        return
      }
      if (request.method === 'GET' && requestPath === DEV_QA_TESTING_API_PATH) {
        if (requestUrl.search) {
          throw new Error('testing summary query is unsupported')
        }
        sendJson(response, 200, testingService.summary())
        return
      }
      const allow =
        requestPath === DEV_QA_TESTING_ACTION_API_PATH ? 'POST' : 'GET'
      sendJson(
        response,
        405,
        { status: 'failed', message: '该开发接口不支持当前请求方法' },
        { Allow: allow }
      )
    } catch (error) {
      if (error?.code === 'DEV_QA_EXECUTION_LOCKED') {
        sendJson(response, 409, {
          status: 'blocked',
          message: '已有本地验证或覆盖采集正在运行',
        })
        return
      }
      if (error?.code === 'DEV_QA_REPOSITORY_CHANGED') {
        sendJson(response, 409, {
          status: 'not_proven',
          message: '生成计划期间代码发生变化，请重新生成',
        })
        return
      }
      sendJson(response, 400, {
        status: 'failed',
        message: '固定验证请求无效或当前无法执行',
      })
    }
  }
}

export function createDevQaTestingPlugin(options = {}) {
  return {
    name: 'plush-dev-qa-testing',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createDevQaTestingMiddleware(options))
    },
  }
}
