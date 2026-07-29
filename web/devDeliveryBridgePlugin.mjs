import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

import {
  createOrReuseDeliveryOperation,
  listDeliveryOperations,
  readDeliveryOperation,
  recoverInterruptedDeliveryOperations,
  resolveDeliveryOperationStore,
  transitionDeliveryOperation,
} from '../scripts/deploy/delivery-operation-store.mjs'
import { createGithubDeliveryProvider } from '../scripts/deploy/github-delivery-provider.mjs'
import { preparePromotion } from '../scripts/deploy/promotion-controller.mjs'
import { prepareRollback } from '../scripts/deploy/rollback-controller.mjs'
import { runTargetPreflight } from '../scripts/deploy/target-preflight.mjs'
import { readRepositoryIdentity } from '../scripts/qa/lib/repository-identity.mjs'
import {
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devQaCoveragePlugin.mjs'

export const DEV_DELIVERY_API_PREFIX = '/__dev/api/delivery'
export const DEV_DELIVERY_SESSION_API_PATH = `${DEV_DELIVERY_API_PREFIX}/session`
export const DEV_DELIVERY_SUMMARY_API_PATH = `${DEV_DELIVERY_API_PREFIX}/summary`
export const DEV_DELIVERY_ACTION_API_PATH = `${DEV_DELIVERY_API_PREFIX}/actions`
export const MAX_DEV_DELIVERY_REQUEST_BYTES = 32 * 1024

const SHA_PATTERN = /^[0-9a-f]{40}$/u
const VERSION_PATTERN =
  /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const OPERATION_PATH_PATTERN = new RegExp(
  `^${DEV_DELIVERY_API_PREFIX}/operations/([0-9a-f-]{36})$`,
  'u'
)
const TERMINAL_STATUSES = new Set([
  'passed',
  'failed',
  'blocked',
  'not_proven',
])

function assertExactKeys(value, expected, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
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

export function validateDevDeliveryAction(value) {
  assertExactKeys(value, ['action', 'payload'], 'delivery action')
  const action = String(value.action || '')
  if (action === 'dispatch-release') {
    assertExactKeys(
      value.payload,
      ['gitSha', 'idempotencyKey', 'version'],
      'dispatch payload'
    )
    if (
      !SHA_PATTERN.test(String(value.payload.gitSha || '')) ||
      !VERSION_PATTERN.test(String(value.payload.version || '')) ||
      !IDEMPOTENCY_PATTERN.test(String(value.payload.idempotencyKey || ''))
    ) {
      throw new Error('dispatch payload is invalid')
    }
  } else if (action === 'prepare-promotion') {
    assertExactKeys(
      value.payload,
      ['gitSha', 'idempotencyKey', 'target', 'version'],
      'promotion preparation payload'
    )
    if (
      !SHA_PATTERN.test(String(value.payload.gitSha || '')) ||
      !VERSION_PATTERN.test(String(value.payload.version || '')) ||
      value.payload.target !== 'test-133' ||
      !IDEMPOTENCY_PATTERN.test(String(value.payload.idempotencyKey || ''))
    ) {
      throw new Error('promotion preparation payload is invalid')
    }
  } else if (action === 'execute-promotion') {
    assertExactKeys(
      value.payload,
      ['confirmation', 'operationId'],
      'promotion execution payload'
    )
    if (
      !UUID_V4_PATTERN.test(String(value.payload.operationId || '')) ||
      typeof value.payload.confirmation !== 'string' ||
      value.payload.confirmation.length > 200
    ) {
      throw new Error('promotion execution payload is invalid')
    }
  } else if (action === 'prepare-rollback') {
    assertExactKeys(
      value.payload,
      [
        'fromGitSha',
        'fromVersion',
        'idempotencyKey',
        'target',
        'toGitSha',
        'toVersion',
      ],
      'rollback preparation payload'
    )
    if (
      !SHA_PATTERN.test(String(value.payload.fromGitSha || '')) ||
      !VERSION_PATTERN.test(String(value.payload.fromVersion || '')) ||
      !SHA_PATTERN.test(String(value.payload.toGitSha || '')) ||
      !VERSION_PATTERN.test(String(value.payload.toVersion || '')) ||
      value.payload.fromGitSha === value.payload.toGitSha ||
      value.payload.target !== 'test-133' ||
      !IDEMPOTENCY_PATTERN.test(String(value.payload.idempotencyKey || ''))
    ) {
      throw new Error('rollback preparation payload is invalid')
    }
  } else if (action === 'execute-rollback') {
    assertExactKeys(
      value.payload,
      ['confirmation', 'operationId'],
      'rollback execution payload'
    )
    if (
      !UUID_V4_PATTERN.test(String(value.payload.operationId || '')) ||
      typeof value.payload.confirmation !== 'string' ||
      value.payload.confirmation.length > 240
    ) {
      throw new Error('rollback execution payload is invalid')
    }
  } else {
    throw new Error('delivery action is not allowlisted')
  }
  return value
}

function publicOperation(operation, { eventLimit = 20 } = {}) {
  const readyConfirmation =
    operation.status !== 'ready'
      ? ''
      : operation.action === 'promote'
        ? `PROMOTE:test-133:${operation.gitSha}:${operation.id}`
        : operation.action === 'rollback'
          ? `ROLLBACK:test-133:${operation.metadata.currentGitSha}:${operation.gitSha}:${operation.id}`
          : ''
  return {
    id: operation.id,
    action: operation.action,
    target: operation.target,
    gitSha: operation.gitSha,
    version: operation.version,
    status: operation.status,
    revision: operation.revision,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    issues: operation.issues,
    events: operation.events.slice(-eventLimit),
    confirmationRequired: readyConfirmation,
    terminal: TERMINAL_STATUSES.has(operation.status),
  }
}

function releaseDirectory(root, gitSha) {
  if (!SHA_PATTERN.test(String(gitSha || ''))) {
    throw new Error('release SHA is invalid')
  }
  return path.join(
    root,
    'output',
    'dev-workbench',
    'releases',
    gitSha
  )
}

function providerIssue(message) {
  return {
    code: 'github_provider_unavailable',
    level: 'error',
    message,
  }
}

export function createDevDeliveryService({
  projectRoot,
  provider,
  operationStore,
  readRepositoryState = readRepositoryIdentity,
  runPreflight = runTargetPreflight,
  preparePromotionAction = preparePromotion,
  prepareRollbackAction = prepareRollback,
  spawnProcess = spawn,
  now = () => new Date().toISOString(),
  preflightTtlMs = 30_000,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd())
  const store =
    operationStore || resolveDeliveryOperationStore(root)
  const deliveryProvider =
    provider || createGithubDeliveryProvider({ projectRoot: root })
  const children = new Map()
  let preflightCache = null

  recoverInterruptedDeliveryOperations(store, now())

  async function reconcileWaitingOperations() {
    for (const operation of listDeliveryOperations(store, { limit: 100 })) {
      if (operation.action !== 'release' || operation.status !== 'waiting') {
        continue
      }
      try {
        const status = await Promise.resolve(
          deliveryProvider.getReleaseStatus(operation.gitSha)
        )
        if (
          status.status === 'published' &&
          status.release?.version === operation.version &&
          status.release?.completeAssets === true
        ) {
          transitionDeliveryOperation(store, operation.id, {
            status: 'passed',
            message: 'immutable GitHub release and complete assets are published',
            now: now(),
          })
        } else if (status.status === 'failed') {
          transitionDeliveryOperation(store, operation.id, {
            status: 'failed',
            message: 'GitHub release workflow reached a failed terminal state',
            issues: [
              providerIssue('GitHub 发布失败；请查看固定 workflow 运行记录'),
            ],
            now: now(),
          })
        }
      } catch {
        // A transient read failure must not mutate or redispatch a waiting run.
      }
    }
  }

  async function readTargetPreflight({ force = false } = {}) {
    const currentTime = Date.now()
    if (
      !force &&
      preflightCache &&
      currentTime - preflightCache.readAt < preflightTtlMs
    ) {
      return preflightCache.value
    }
    const value = await Promise.resolve(runPreflight('test-133'))
    preflightCache = { readAt: currentTime, value }
    return value
  }

  async function getSummary({ forcePreflight = false } = {}) {
    await reconcileWaitingOperations()
    const [repositoryResult, versionsResult, targetResult] =
      await Promise.allSettled([
        readRepositoryState(root),
        Promise.resolve(deliveryProvider.listVersions({ limit: 20 })),
        readTargetPreflight({ force: forcePreflight }),
      ])
    const issues = []
    if (repositoryResult.status === 'rejected') {
      issues.push({
        code: 'repository_identity_unavailable',
        level: 'error',
        message: '当前仓库身份不可用，禁止创建发布',
      })
    }
    if (versionsResult.status === 'rejected') {
      issues.push(
        providerIssue('GitHub 版本列表不可用；请检查 gh 登录和网络')
      )
    }
    if (targetResult.status === 'rejected') {
      issues.push({
        code: 'target_preflight_unavailable',
        level: 'error',
        message: '133 只读预检不可用；未启动任何目标写操作',
      })
    }
    return {
      schemaVersion: 'plush.dev-delivery-summary/v1',
      status: issues.length === 0 ? 'success' : 'partial',
      generatedAt: now(),
      repository:
        repositoryResult.status === 'fulfilled'
          ? repositoryResult.value
          : null,
      versions:
        versionsResult.status === 'fulfilled' ? versionsResult.value : [],
      target:
        targetResult.status === 'fulfilled' ? targetResult.value : null,
      operations: listDeliveryOperations(store, { limit: 50 }).map(
        publicOperation
      ),
      issues,
      boundaries: {
        provider: 'github',
        target: 'test-133',
        browserShellAccess: false,
        targetBuildAllowed: false,
        automaticRetryAllowed: false,
        automaticDatabaseDownMigration: false,
      },
    }
  }

  async function dispatchRelease(payload) {
    const repository = await readRepositoryState(root)
    if (repository.dirty || repository.commit !== payload.gitSha) {
      throw new Error(
        'release requires the exact clean current repository identity'
      )
    }
    const created = createOrReuseDeliveryOperation(store, {
      action: 'release',
      target: 'github-release',
      gitSha: payload.gitSha,
      version: payload.version,
      idempotencyKey: payload.idempotencyKey,
      metadata: { source: 'version-center' },
      now: now(),
    })
    if (created.reused) return publicOperation(created.operation)

    let operation = transitionDeliveryOperation(store, created.operation.id, {
      status: 'running',
      message: 'GitHub immutable release dispatch started',
      now: now(),
    })
    try {
      const existing = await Promise.resolve(
        deliveryProvider.getReleaseStatus(operation.gitSha)
      )
      if (existing.status === 'published') {
        if (
          existing.release?.version !== operation.version ||
          existing.release?.completeAssets !== true
        ) {
          throw new Error('published release identity is inconsistent')
        }
        operation = transitionDeliveryOperation(store, operation.id, {
          status: 'passed',
          message: 'immutable release already exists with complete assets',
          now: now(),
        })
        return publicOperation(operation)
      }
      await Promise.resolve(
        deliveryProvider.dispatchRelease({
          gitSha: operation.gitSha,
          version: operation.version,
          customer: 'yoyoosun',
        })
      )
      operation = transitionDeliveryOperation(store, operation.id, {
        status: 'waiting',
        message: 'GitHub release workflow accepted; waiting for terminal assets',
        now: now(),
      })
      return publicOperation(operation)
    } catch (error) {
      transitionDeliveryOperation(store, operation.id, {
        status: 'failed',
        message: 'GitHub release dispatch failed without starting a target write',
        issues: [
          providerIssue(
            'GitHub 发布未启动或身份不一致；未写入 133 测试服务器'
          ),
        ],
        now: now(),
      })
      throw error
    }
  }

  async function prepareFixedPromotion(payload) {
    const versions = await Promise.resolve(
      deliveryProvider.listVersions({ limit: 50 })
    )
    const release = versions.find((item) => item.gitSha === payload.gitSha)
    if (
      !release ||
      release.version !== payload.version ||
      release.status !== 'published' ||
      release.completeAssets !== true
    ) {
      throw new Error('published immutable release is not ready')
    }
    const destination = releaseDirectory(root, payload.gitSha)
    const downloaded = await Promise.resolve(
      deliveryProvider.downloadRelease(payload.gitSha, destination)
    )
    const result = await Promise.resolve(
      preparePromotionAction(
        {
          repoRoot: root,
          releaseManifestPath: path.join(
            downloaded.directory,
            'release-manifest.json'
          ),
          targetKey: 'test-133',
          idempotencyKey: payload.idempotencyKey,
          operationStore: store,
        },
        { runPreflight, now }
      )
    )
    preflightCache = null
    return {
      operation: publicOperation(result.operation),
      plan: result.plan,
      reused: result.reused,
    }
  }

  async function prepareFixedRollback(payload) {
    const versions = await Promise.resolve(
      deliveryProvider.listVersions({ limit: 50 })
    )
    const currentRelease = versions.find(
      (item) => item.gitSha === payload.fromGitSha
    )
    const targetRelease = versions.find(
      (item) => item.gitSha === payload.toGitSha
    )
    if (
      !currentRelease ||
      currentRelease.version !== payload.fromVersion ||
      currentRelease.status !== 'published' ||
      currentRelease.completeAssets !== true ||
      !targetRelease ||
      targetRelease.version !== payload.toVersion ||
      targetRelease.status !== 'published' ||
      targetRelease.completeAssets !== true
    ) {
      throw new Error('both immutable rollback releases must be complete')
    }
    const currentDirectory = releaseDirectory(root, payload.fromGitSha)
    const targetDirectory = releaseDirectory(root, payload.toGitSha)
    const [currentDownload, targetDownload] = await Promise.all([
      Promise.resolve(
        deliveryProvider.downloadRelease(
          payload.fromGitSha,
          currentDirectory
        )
      ),
      Promise.resolve(
        deliveryProvider.downloadRelease(payload.toGitSha, targetDirectory)
      ),
    ])
    const result = await Promise.resolve(
      prepareRollbackAction(
        {
          repoRoot: root,
          currentReleaseManifestPath: path.join(
            currentDownload.directory,
            'release-manifest.json'
          ),
          targetReleaseManifestPath: path.join(
            targetDownload.directory,
            'release-manifest.json'
          ),
          targetKey: 'test-133',
          idempotencyKey: payload.idempotencyKey,
          operationStore: store,
        },
        { runPreflight, now }
      )
    )
    preflightCache = null
    return {
      operation: publicOperation(result.operation),
      plan: result.plan,
      reused: result.reused,
    }
  }

  function finishSpawnedTargetAction(operationId, error) {
    children.delete(operationId)
    const current = readDeliveryOperation(store, operationId)
    if (TERMINAL_STATUSES.has(current.status)) return
    if (current.status === 'launching') {
      transitionDeliveryOperation(store, operationId, {
        status: 'failed',
        message: 'promotion executor did not start a target write',
        issues: [
          {
            code: 'promotion_executor_start_failed',
            level: 'error',
            message: '发布执行器未启动；未自动重试',
          },
        ],
        now: now(),
      })
      return
    }
    if (current.status === 'running') {
      transitionDeliveryOperation(store, operationId, {
        status: 'not_proven',
        message: 'promotion executor ended while target outcome was unknown',
        issues: [
          {
            code: 'promotion_executor_outcome_unknown',
            level: 'error',
            message: '目标结果未知，必须先读回，禁止自动重试',
          },
        ],
        now: now(),
      })
      return
    }
    if (error) {
      throw error
    }
  }

  function executeFixedPromotion(payload) {
    if (children.size > 0) {
      throw new Error('another test-133 target action is already running')
    }
    let operation = readDeliveryOperation(store, payload.operationId)
    if (
      operation.action !== 'promote' ||
      operation.target !== 'test-133' ||
      operation.status !== 'ready'
    ) {
      throw new Error('promotion operation is not ready')
    }
    const expected =
      `PROMOTE:test-133:${operation.gitSha}:${operation.id}`
    if (payload.confirmation !== expected) {
      throw new Error('explicit promotion confirmation does not match')
    }
    operation = transitionDeliveryOperation(store, operation.id, {
      status: 'launching',
      message: 'promotion executor child is launching',
      now: now(),
    })
    const bundleDir = releaseDirectory(root, operation.gitSha)
    let child
    try {
      child = spawnProcess(
        process.execPath,
        [
          path.join(root, 'scripts', 'deploy', 'promotion-executor.mjs'),
          '--operation-id',
          operation.id,
          '--bundle-dir',
          bundleDir,
          '--release-manifest',
          path.join(bundleDir, 'release-manifest.json'),
          '--confirmation',
          payload.confirmation,
          '--json',
        ],
        {
          cwd: root,
          env: process.env,
          detached: false,
          stdio: 'ignore',
        }
      )
    } catch (error) {
      finishSpawnedTargetAction(operation.id, error)
      throw error
    }
    children.set(operation.id, child)
    let finished = false
    const finish = (error) => {
      if (finished) return
      finished = true
      try {
        finishSpawnedTargetAction(operation.id, error)
      } catch {
        // The operation store remains the only user-visible outcome source.
      }
    }
    child.once('error', finish)
    child.once('close', () => finish())
    return {
      accepted: true,
      operation: publicOperation(operation),
    }
  }

  function executeFixedRollback(payload) {
    if (children.size > 0) {
      throw new Error('another test-133 target action is already running')
    }
    let operation = readDeliveryOperation(store, payload.operationId)
    if (
      operation.action !== 'rollback' ||
      operation.target !== 'test-133' ||
      operation.status !== 'ready' ||
      !SHA_PATTERN.test(String(operation.metadata?.currentGitSha || ''))
    ) {
      throw new Error('rollback operation is not ready')
    }
    const expected =
      `ROLLBACK:test-133:${operation.metadata.currentGitSha}:` +
      `${operation.gitSha}:${operation.id}`
    if (payload.confirmation !== expected) {
      throw new Error('explicit rollback confirmation does not match')
    }
    operation = transitionDeliveryOperation(store, operation.id, {
      status: 'launching',
      message: 'rollback executor child is launching',
      now: now(),
    })
    const currentBundleDir = releaseDirectory(
      root,
      operation.metadata.currentGitSha
    )
    const targetBundleDir = releaseDirectory(root, operation.gitSha)
    let child
    try {
      child = spawnProcess(
        process.execPath,
        [
          path.join(root, 'scripts', 'deploy', 'rollback-executor.mjs'),
          '--operation-id',
          operation.id,
          '--current-manifest',
          path.join(currentBundleDir, 'release-manifest.json'),
          '--target-bundle-dir',
          targetBundleDir,
          '--target-manifest',
          path.join(targetBundleDir, 'release-manifest.json'),
          '--confirmation',
          payload.confirmation,
          '--json',
        ],
        {
          cwd: root,
          env: process.env,
          detached: false,
          stdio: 'ignore',
        }
      )
    } catch (error) {
      finishSpawnedTargetAction(operation.id, error)
      throw error
    }
    children.set(operation.id, child)
    let finished = false
    const finish = (error) => {
      if (finished) return
      finished = true
      try {
        finishSpawnedTargetAction(operation.id, error)
      } catch {
        // The operation store remains the only user-visible outcome source.
      }
    }
    child.once('error', finish)
    child.once('close', () => finish())
    return {
      accepted: true,
      operation: publicOperation(operation),
    }
  }

  return {
    async summary(options) {
      return getSummary(options)
    },
    readOperation(operationId) {
      return publicOperation(readDeliveryOperation(store, operationId), {
        eventLimit: 100,
      })
    },
    async act(request) {
      const validated = validateDevDeliveryAction(request)
      if (validated.action === 'dispatch-release') {
        return {
          schemaVersion: 'plush.dev-delivery-action-result/v1',
          action: validated.action,
          operation: await dispatchRelease(validated.payload),
        }
      }
      if (validated.action === 'prepare-promotion') {
        return {
          schemaVersion: 'plush.dev-delivery-action-result/v1',
          action: validated.action,
          ...(await prepareFixedPromotion(validated.payload)),
        }
      }
      if (validated.action === 'prepare-rollback') {
        return {
          schemaVersion: 'plush.dev-delivery-action-result/v1',
          action: validated.action,
          ...(await prepareFixedRollback(validated.payload)),
        }
      }
      if (validated.action === 'execute-rollback') {
        return {
          schemaVersion: 'plush.dev-delivery-action-result/v1',
          action: validated.action,
          ...executeFixedRollback(validated.payload),
        }
      }
      return {
        schemaVersion: 'plush.dev-delivery-action-result/v1',
        action: validated.action,
        ...executeFixedPromotion(validated.payload),
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
  let parsed
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  return (
    ['http:', 'https:'].includes(parsed.protocol) &&
    parsed.host.toLowerCase() === String(host).toLowerCase() &&
    isLoopbackHostHeader(parsed.host) &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.pathname === '/' &&
    parsed.search === '' &&
    parsed.hash === '' &&
    request.headers?.['sec-fetch-site'] === 'same-origin'
  )
}

async function readJsonBody(request) {
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > MAX_DEV_DELIVERY_REQUEST_BYTES) {
      throw new Error('request body is too large')
    }
    chunks.push(bytes)
  }
  if (size === 0) throw new Error('request body is required')
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createDevDeliveryMiddleware({
  projectRoot,
  service,
  csrfToken = randomBytes(32).toString('base64url'),
} = {}) {
  const deliveryService =
    service || createDevDeliveryService({ projectRoot })

  return async (request, response, next) => {
    let requestPath
    try {
      requestPath = new URL(request.url || '/', 'http://localhost').pathname
    } catch {
      next()
      return
    }
    if (!requestPath.startsWith(`${DEV_DELIVERY_API_PREFIX}/`)) {
      next()
      return
    }
    if (
      !isLoopbackRemoteAddress(request.socket?.remoteAddress) ||
      !isLoopbackHostHeader(request.headers?.host)
    ) {
      sendJson(response, 403, {
        status: 'failed',
        message: '该版本控制接口仅允许本机访问',
      })
      return
    }

    try {
      if (
        request.method === 'GET' &&
        requestPath === DEV_DELIVERY_SESSION_API_PATH
      ) {
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-delivery-session/v1',
          csrfToken,
          target: 'test-133',
        })
        return
      }
      if (
        request.method === 'GET' &&
        requestPath === DEV_DELIVERY_SUMMARY_API_PATH
      ) {
        sendJson(response, 200, await deliveryService.summary())
        return
      }
      const operationMatch = OPERATION_PATH_PATTERN.exec(requestPath)
      if (request.method === 'GET' && operationMatch) {
        if (!UUID_V4_PATTERN.test(operationMatch[1])) {
          throw new Error('operation id is invalid')
        }
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-delivery-operation-result/v1',
          operation: deliveryService.readOperation(operationMatch[1]),
        })
        return
      }
      if (
        request.method === 'POST' &&
        requestPath === DEV_DELIVERY_ACTION_API_PATH
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
        const result = await deliveryService.act(
          validateDevDeliveryAction(await readJsonBody(request))
        )
        sendJson(
          response,
          result.accepted === true ? 202 : 200,
          result
        )
        return
      }
      sendJson(
        response,
        405,
        { status: 'failed', message: '该版本控制接口不支持此方法或路径' },
        { allow: 'GET, POST' }
      )
    } catch (error) {
      const isInputError =
        /invalid|unsupported|allowlisted|confirmation|fields|body|JSON/iu.test(
          String(error?.message || '')
        )
      sendJson(response, isInputError ? 400 : 409, {
        status: 'failed',
        message: isInputError
          ? '请求参数不符合固定发布合同'
          : '操作未完成；请刷新版本中心查看已记录状态',
      })
    }
  }
}

export function createDevDeliveryBridgePlugin(options = {}) {
  return {
    name: 'plush-dev-delivery-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createDevDeliveryMiddleware(options))
    },
  }
}
