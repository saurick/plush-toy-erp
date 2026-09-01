import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

import {
  consumeDeliveryOperationStore,
  createOrReuseDeliveryOperation,
  DELIVERY_OPERATION_STORE_REPO_ROOT_ENV,
  deliveryOperationRequestCounts,
  listDeliveryOperations,
  readDeliveryOperation,
  recoverInterruptedDeliveryOperations,
  resolveDeliveryOperationStore,
  transitionDeliveryOperation,
} from '../../scripts/deploy/delivery-operation-store.mjs'
import { createGithubDeliveryProvider } from '../../scripts/deploy/github-delivery-provider.mjs'
import { createGitlabDeliveryProvider } from '../../scripts/deploy/gitlab-delivery-provider.mjs'
import { prepareDatabaseRebuild } from '../../scripts/deploy/database-rebuild-controller.mjs'
import { preparePromotion } from '../../scripts/deploy/promotion-controller.mjs'
import { prepareRollback } from '../../scripts/deploy/rollback-controller.mjs'
import {
  buildTargetReleaseCacheIdentity,
  probeTargetReleaseCache,
  targetReleaseCacheEvidenceFingerprint,
} from '../../scripts/deploy/target-release-cache.mjs'
import {
  assertOfficialReleaseVersion,
  buildReleaseVersionCatalog,
} from '../../scripts/deploy/release-version-catalog.mjs'
import { runTargetPreflightAsync } from '../../scripts/deploy/target-preflight.mjs'
import { runTargetInitializationPreflightAsync } from '../../scripts/deploy/target-initialization-preflight.mjs'
import { classifyGitAncestryRelation } from '../../scripts/deploy/git-ancestry-relation.mjs'
import {
  SUPPORTED_DEPLOYMENT_TARGET_KEYS,
  getDeploymentTarget,
} from '../../scripts/deploy/deployment-targets.mjs'
import { readRepositoryIdentity } from '../../scripts/qa/lib/repository-identity.mjs'
import {
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'
import { readLatestBackupRestoreEvidence } from './devRecoveryEvidence.mjs'

export const DEV_DELIVERY_API_PREFIX = '/__dev/api/delivery'
export const DEV_DELIVERY_SESSION_API_PATH = `${DEV_DELIVERY_API_PREFIX}/session`
export const DEV_DELIVERY_SUMMARY_API_PATH = `${DEV_DELIVERY_API_PREFIX}/summary`
export const DEV_DELIVERY_ACTION_API_PATH = `${DEV_DELIVERY_API_PREFIX}/actions`
export const MAX_DEV_DELIVERY_REQUEST_BYTES = 32 * 1024

const SHA_PATTERN = /^[0-9a-f]{40}$/u
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const OPERATION_PATH_PATTERN = new RegExp(
  `^${DEV_DELIVERY_API_PREFIX}/operations/([0-9a-f-]{36})$`,
  'u'
)
const TERMINAL_STATUSES = new Set(['passed', 'failed', 'blocked', 'not_proven'])
const DELIVERY_TARGET_KEYS = Object.freeze([
  ...SUPPORTED_DEPLOYMENT_TARGET_KEYS,
])
const REMOTE_STAGE_LABELS = Object.freeze({
  artifact_fetch: 'GitLab 内部取件',
  package_verification: '制品包校验',
  capacity_recheck: '容量复核',
  release_materialization: '版本目录落盘',
  image_load_and_readback: '镜像载入与身份读回',
  fresh_backup_and_restore_check: '新备份与恢复演练',
  env_and_static_preflight: '配置与静态预检',
  migration_plan: '迁移计划',
  maintenance_window: '维护窗口',
  migration_apply_started: '数据库迁移',
  migration_applied: '迁移后读回',
  compose_start: '服务启动',
  runtime_verified: '运行态与冒烟',
  public_entry_switch: '公网入口切换与回读',
  current_source_switch: '当前版本指针切换',
  target_identity_recheck: '目标身份复核',
  static_preflight: '静态预检',
  service_switch: '服务切换',
})

function isDeliveryTarget(value) {
  return DELIVERY_TARGET_KEYS.includes(String(value || ''))
}

function bindVersionActions({
  classifyRelation,
  projectRoot,
  targetEvidence,
  versions,
}) {
  return versions.map((version) => {
    const actionsByTarget = Object.fromEntries(
      DELIVERY_TARGET_KEYS.map((targetKey) => {
        const evidence = targetEvidence.get(targetKey)
        const target = evidence?.preflight
        const initialization = evidence?.initializationPreflight
        const serverSha = target?.remote?.runtime?.serverSha
        const webSha = target?.remote?.runtime?.webSha
        if (
          !SHA_PATTERN.test(String(serverSha || '')) ||
          serverSha !== webSha
        ) {
          if (
            initialization?.status === 'eligible' &&
            initialization?.target === targetKey &&
            initialization?.remote?.rootState === 'absent' &&
            initialization?.blockers?.length === 0
          ) {
            return [
              targetKey,
              {
                actionClass: 'initialize',
                actionReason: 'pristine_target_initialization_available',
              },
            ]
          }
          return [
            targetKey,
            {
              actionClass: 'blocked',
              actionReason: 'target_identity_unavailable',
            },
          ]
        }
        try {
          const relation = classifyRelation({
            repoRoot: projectRoot,
            currentGitSha: serverSha,
            candidateGitSha: version.gitSha,
          })
          return [
            targetKey,
            {
              actionClass: relation.actionClass,
              actionReason: relation.actionReason,
            },
          ]
        } catch {
          return [
            targetKey,
            {
              actionClass: 'blocked',
              actionReason: 'git_ancestry_unavailable',
            },
          ]
        }
      })
    )
    return {
      ...version,
      ...actionsByTarget['demo-133'],
      actionsByTarget,
    }
  })
}

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
      !isDeliveryTarget(value.payload.target) ||
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
  } else if (action === 'prepare-database-rebuild') {
    assertExactKeys(
      value.payload,
      ['gitSha', 'idempotencyKey', 'target', 'version'],
      'database rebuild preparation payload'
    )
    if (
      !SHA_PATTERN.test(String(value.payload.gitSha || '')) ||
      !VERSION_PATTERN.test(String(value.payload.version || '')) ||
      !isDeliveryTarget(value.payload.target) ||
      !IDEMPOTENCY_PATTERN.test(String(value.payload.idempotencyKey || ''))
    ) {
      throw new Error('database rebuild preparation payload is invalid')
    }
  } else if (action === 'execute-database-rebuild') {
    assertExactKeys(
      value.payload,
      ['confirmation', 'operationId'],
      'database rebuild execution payload'
    )
    if (
      !UUID_V4_PATTERN.test(String(value.payload.operationId || '')) ||
      typeof value.payload.confirmation !== 'string' ||
      value.payload.confirmation.length > 240
    ) {
      throw new Error('database rebuild execution payload is invalid')
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
      !isDeliveryTarget(value.payload.target) ||
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
  } else if (action === 'retry-operation') {
    assertExactKeys(
      value.payload,
      ['idempotencyKey', 'operationId'],
      'retry payload'
    )
    if (
      !UUID_V4_PATTERN.test(String(value.payload.operationId || '')) ||
      !IDEMPOTENCY_PATTERN.test(String(value.payload.idempotencyKey || ''))
    ) {
      throw new Error('retry payload is invalid')
    }
  } else {
    throw new Error('delivery action is not allowlisted')
  }
  return value
}

function publicOperation(
  operation,
  { eventLimit = 20, requestCount = 1 } = {}
) {
  const retryableAction = ['release', 'promote', 'rollback'].includes(
    operation.action
  )
  const retryAllowed =
    retryableAction && ['failed', 'blocked'].includes(operation.status)
  const readyConfirmation =
    operation.status !== 'ready'
      ? ''
      : operation.action === 'promote'
        ? `PROMOTE:${operation.target}:${operation.gitSha}:${operation.id}`
        : operation.action === 'rollback'
          ? `ROLLBACK:${operation.target}:${operation.metadata.currentGitSha}:${operation.gitSha}:${operation.id}`
          : operation.action === 'rebuild-database'
            ? `REBUILD_DATABASE:${operation.target}:${operation.gitSha}:${operation.id}`
            : ''
  const durationMs = Math.max(
    0,
    Date.parse(operation.updatedAt) - Date.parse(operation.createdAt)
  )
  const metadata = operation.metadata || {}
  const promotionMode =
    operation.action === 'promote' &&
    ['initialize', 'upgrade'].includes(metadata.promotionMode)
      ? metadata.promotionMode
      : null
  const remoteStages = Array.isArray(operation.metadata?.remoteStageTimings)
    ? operation.metadata.remoteStageTimings
        .filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            ['passed', 'failed'].includes(item.status) &&
            Number.isSafeInteger(item.durationMs) &&
            item.durationMs >= 0
        )
        .map((item) => ({
          id: item.id,
          label: REMOTE_STAGE_LABELS[item.id] || item.id,
          status: item.status,
          durationMs: item.durationMs,
        }))
    : []
  const controlTransferStage =
    Number.isSafeInteger(metadata.controlTransferDurationMs) &&
    metadata.controlTransferDurationMs >= 0
      ? [
          {
            id: 'control_transfer',
            label: '控制包传输',
            status:
              remoteStages.length > 0 ||
              ['passed', 'not_proven'].includes(operation.status)
                ? 'passed'
                : operation.status,
            durationMs: metadata.controlTransferDurationMs,
          },
        ]
      : []
  const targetAcquisitionStage =
    remoteStages.some((stage) => stage.id === 'artifact_fetch') ||
    !Number.isSafeInteger(metadata.targetAcquisitionDurationMs) ||
    metadata.targetAcquisitionDurationMs < 0
      ? []
      : [
          {
            id: 'artifact_fetch',
            label: REMOTE_STAGE_LABELS.artifact_fetch,
            status: operation.status === 'passed' ? 'passed' : 'failed',
            durationMs: metadata.targetAcquisitionDurationMs,
          },
        ]
  const historicalTransferStage =
    controlTransferStage.length === 0 &&
    Number.isSafeInteger(metadata.transferDurationMs) &&
    metadata.transferDurationMs >= 0
      ? [
          {
            id: 'artifact_transfer',
            label: '历史制品中转',
            status:
              remoteStages.length > 0 ||
              ['passed', 'not_proven'].includes(operation.status)
                ? 'passed'
                : operation.status,
            durationMs: metadata.transferDurationMs,
          },
        ]
      : []
  const lifecycleStages = operation.events.slice(0, -1).map((event, index) => {
    const next = operation.events[index + 1]
    return {
      id: `lifecycle_${String(index + 1)}`,
      label: event.message,
      status: next.status,
      durationMs: Math.max(0, Date.parse(next.at) - Date.parse(event.at)),
    }
  })
  const measuredStages = [
    ...controlTransferStage,
    ...historicalTransferStage,
    ...targetAcquisitionStage,
    ...remoteStages,
  ]
  const metricInteger = (key) =>
    Number.isSafeInteger(metadata[key]) && metadata[key] >= 0
      ? metadata[key]
      : null
  const digest = (key) =>
    /^sha256:[0-9a-f]{64}$/u.test(String(metadata[key] || ''))
      ? metadata[key]
      : null
  const serverDigest = digest('serverDigest')
  const webDigest = digest('webDigest')
  const completeDigests = Boolean(serverDigest && webDigest)
  const buildPerformance =
    metadata.buildPerformance?.schemaVersion ===
      'plush.release-build-performance/v1' &&
    Number.isSafeInteger(metadata.buildPerformance.durationMs) &&
    metadata.buildPerformance.durationMs >= 0 &&
    ['builder', 'gha'].includes(metadata.buildPerformance.cacheMode) &&
    Number.isSafeInteger(metadata.buildPerformance.completedVertexCount) &&
    metadata.buildPerformance.completedVertexCount >= 0 &&
    Number.isSafeInteger(metadata.buildPerformance.cacheHitCount) &&
    metadata.buildPerformance.cacheHitCount >= 0 &&
    Number.isSafeInteger(metadata.buildPerformance.cacheMissCount) &&
    metadata.buildPerformance.cacheMissCount >= 0 &&
    metadata.buildPerformance.cacheHitCount +
      metadata.buildPerformance.cacheMissCount ===
      metadata.buildPerformance.completedVertexCount &&
    Number.isSafeInteger(metadata.buildPerformance.cacheHitRateBasisPoints) &&
    metadata.buildPerformance.cacheHitRateBasisPoints >= 0 &&
    metadata.buildPerformance.cacheHitRateBasisPoints <= 10_000
      ? metadata.buildPerformance
      : null
  const targetCacheHit =
    typeof metadata.targetCacheHit === 'boolean'
      ? metadata.targetCacheHit
      : null
  const targetImageCacheHit =
    typeof metadata.targetImageCacheHit === 'boolean'
      ? metadata.targetImageCacheHit
      : null
  const targetCacheSource = ['none', 'formal', 'retained_operation'].includes(
    metadata.targetCacheSource
  )
    ? metadata.targetCacheSource
    : null
  const cacheBasisValues = [
    'release_manifest_sha256',
    'archive_sha256',
    'registry_digest',
    'docker_content_id',
    'embedded_git_sha',
  ]
  const cacheBasis = Array.isArray(metadata.cacheBasis)
    ? metadata.cacheBasis.every((item) => cacheBasisValues.includes(item))
      ? [...metadata.cacheBasis]
      : null
    : []
  const stillExecutedValues = [
    'migration',
    'migration_status',
    'health',
    'ready',
    'public_entry',
  ]
  const stillExecutedChecks = Array.isArray(metadata.stillExecutedChecks)
    ? metadata.stillExecutedChecks.every((item) =>
        stillExecutedValues.includes(item)
      )
      ? [...metadata.stillExecutedChecks]
      : null
    : []
  const targetAcquisitionBytes = metricInteger('targetAcquisitionBytes')
  const targetAcquisitionDurationMs =
    metricInteger('targetAcquisitionDurationMs') ??
    remoteStages.find((stage) => stage.id === 'artifact_fetch')?.durationMs
  const controlTransferBytes = metricInteger('controlTransferBytes')
  const controlTransferDurationMs = metricInteger('controlTransferDurationMs')
  const publicTransferBytes =
    targetAcquisitionBytes ??
    controlTransferBytes ??
    metricInteger('transferBytes')
  const publicTransferDurationMs =
    (targetAcquisitionBytes !== null &&
    Number.isSafeInteger(targetAcquisitionDurationMs)
      ? targetAcquisitionDurationMs
      : null) ??
    controlTransferDurationMs ??
    metricInteger('transferDurationMs')
  const publicTransferBytesPerSecond =
    publicTransferBytes !== null && publicTransferDurationMs > 0
      ? Math.round((publicTransferBytes * 1000) / publicTransferDurationMs)
      : publicTransferBytes === 0 && publicTransferDurationMs !== null
        ? 0
        : (metricInteger('controlTransferBytesPerSecond') ??
          metricInteger('transferBytesPerSecond'))
  return {
    id: operation.id,
    action: operation.action,
    promotionMode,
    target: operation.target,
    gitSha: operation.gitSha,
    version: operation.version,
    status: operation.status,
    revision: operation.revision,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    durationMs,
    stages: measuredStages.length > 0 ? measuredStages : lifecycleStages,
    metrics: {
      transferBytes: publicTransferBytes,
      transferDurationMs: publicTransferDurationMs,
      transferBytesPerSecond: publicTransferBytesPerSecond,
      serverArchiveBytes: metricInteger('serverArchiveBytes'),
      webArchiveBytes: metricInteger('webArchiveBytes'),
      backupSizeBytes: metricInteger('backupSizeBytes'),
      serverDigest: completeDigests ? serverDigest : null,
      webDigest: completeDigests ? webDigest : null,
      buildPerformance,
      targetCacheHit,
      targetImageCacheHit,
      targetCacheSource,
      avoidedTransferBytes: metricInteger('avoidedTransferBytes'),
      avoidedTransferDurationMs: metricInteger('avoidedTransferDurationMs'),
      avoidedTransferBaselineOperationId: UUID_V4_PATTERN.test(
        String(metadata.avoidedTransferBaselineOperationId || '')
      )
        ? metadata.avoidedTransferBaselineOperationId
        : null,
      dockerLoadSkipped:
        typeof metadata.dockerLoadSkipped === 'boolean'
          ? metadata.dockerLoadSkipped
          : null,
      cacheBasis,
      stillExecutedChecks,
    },
    issues: operation.issues,
    events: operation.events.slice(-eventLimit),
    idempotency: {
      attempt: Number.isSafeInteger(operation.attempt) ? operation.attempt : 1,
      retryOfOperationId: operation.retryOfOperationId || null,
      rootOperationId: operation.rootOperationId || operation.id,
      requestCount,
      reuseCount: Math.max(0, requestCount - 1),
      basis: ['action', 'target', 'git_sha', 'version', 'delivery_inputs'],
    },
    retry: {
      allowed: retryAllowed,
      reason: retryAllowed
        ? 'explicit_retry_available'
        : operation.status === 'not_proven'
          ? 'target_readback_required'
          : ['failed', 'blocked'].includes(operation.status)
            ? 'action_not_retryable'
            : TERMINAL_STATUSES.has(operation.status)
              ? 'terminal_no_retry_needed'
              : 'operation_in_progress',
    },
    confirmationRequired: readyConfirmation,
    terminal: TERMINAL_STATUSES.has(operation.status),
  }
}

function releaseControlDirectory(root, gitSha) {
  if (!SHA_PATTERN.test(String(gitSha || ''))) {
    throw new Error('release SHA is invalid')
  }
  return path.join(root, 'output', 'dev-workbench', 'release-controls', gitSha)
}

function providerIssue(message, provider = 'gitlab') {
  return {
    code: `${provider}_provider_unavailable`,
    level: 'error',
    message,
  }
}

export function createConfiguredDeliveryProvider({
  projectRoot,
  env = process.env,
} = {}) {
  const selected = String(env.PLUSH_DELIVERY_PROVIDER || 'gitlab')
  if (selected === 'gitlab') {
    return createGitlabDeliveryProvider({ projectRoot, env })
  }
  if (selected === 'github') {
    return createGithubDeliveryProvider({ projectRoot })
  }
  throw new Error('delivery provider must be gitlab or github')
}

function normalizePrivateProviderToken(value) {
  const token = String(value || '')
  return token && token.length <= 512 && !/[\r\n]/u.test(token) ? token : ''
}

export function captureDevDeliveryProviderEnvironments(env = process.env) {
  const selected = String(env.PLUSH_DELIVERY_PROVIDER || 'gitlab')
  const writeToken = normalizePrivateProviderToken(env.PLUSH_GITLAB_TOKEN)
  const readToken =
    normalizePrivateProviderToken(env.PLUSH_GITLAB_READ_TOKEN) || writeToken
  const baseEnvironment = { ...env }
  delete baseEnvironment.PLUSH_GITLAB_TOKEN
  delete baseEnvironment.PLUSH_GITLAB_READ_TOKEN
  delete baseEnvironment.PLUSH_GITLAB_TARGET_FETCH_TOKEN
  delete baseEnvironment[DELIVERY_OPERATION_STORE_REPO_ROOT_ENV]

  const readEnvironment = { ...baseEnvironment }
  if (readToken) readEnvironment.PLUSH_GITLAB_TOKEN = readToken
  const writeEnvironment = { ...baseEnvironment }
  if (writeToken) writeEnvironment.PLUSH_GITLAB_TOKEN = writeToken

  return Object.freeze({
    readEnvironment: Object.freeze(readEnvironment),
    writeEnvironment: Object.freeze(writeEnvironment),
    releaseDispatchAllowed: selected !== 'gitlab' || Boolean(writeToken),
  })
}

function createReadOnlyDeliveryProvider(provider) {
  const readOnlyProvider = { provider: provider.provider }
  for (const method of [
    'listVersions',
    'listPipelineTimings',
    'getReleaseStatus',
    'downloadReleaseControl',
  ]) {
    if (typeof provider[method] === 'function') {
      readOnlyProvider[method] = provider[method].bind(provider)
    }
  }
  return Object.freeze(readOnlyProvider)
}

export function createDevDeliveryService({
  projectRoot,
  provider,
  readProvider,
  operationStore,
  operationStoreRepoRoot,
  readRepositoryState = readRepositoryIdentity,
  runPreflight = runTargetPreflightAsync,
  runInitializationPreflight = runTargetInitializationPreflightAsync,
  classifyRelation = classifyGitAncestryRelation,
  preparePromotionAction = preparePromotion,
  prepareDatabaseRebuildAction = prepareDatabaseRebuild,
  prepareRollbackAction = prepareRollback,
  buildCacheIdentity = buildTargetReleaseCacheIdentity,
  probeCache = probeTargetReleaseCache,
  readRecoveryEvidence = readLatestBackupRestoreEvidence,
  spawnProcess = spawn,
  now = () => new Date().toISOString(),
  preflightTtlMs = 30_000,
  pipelineTimingTtlMs = 60_000,
  env = process.env,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd())
  const defaultStore = resolveDeliveryOperationStore(root)
  const inheritedStore = consumeDeliveryOperationStore(root, env)
  if (operationStoreRepoRoot && inheritedStore !== defaultStore) {
    throw new Error('delivery operation store repository root is ambiguous')
  }
  const expectedStore = operationStoreRepoRoot
    ? resolveDeliveryOperationStore(operationStoreRepoRoot)
    : inheritedStore
  const store = operationStore ? path.resolve(operationStore) : expectedStore
  if (store !== expectedStore) {
    throw new Error(
      'delivery operation store does not match its declared repository root'
    )
  }
  const resolvedProjectRepoRoot = path.resolve(defaultStore, '../../..')
  const resolvedStoreRepoRoot = path.resolve(expectedStore, '../../..')
  const targetFetchToken =
    env.PLUSH_GITLAB_TARGET_FETCH_TOKEN ||
    (env === process.env
      ? undefined
      : process.env.PLUSH_GITLAB_TARGET_FETCH_TOKEN)
  delete env.PLUSH_GITLAB_TARGET_FETCH_TOKEN
  delete process.env.PLUSH_GITLAB_TARGET_FETCH_TOKEN
  delete process.env[DELIVERY_OPERATION_STORE_REPO_ROOT_ENV]
  const providerEnvironments = captureDevDeliveryProviderEnvironments(env)
  const deliveryProvider =
    provider ||
    createConfiguredDeliveryProvider({
      projectRoot: root,
      env: providerEnvironments.writeEnvironment,
    })
  const readDeliveryProviderSource =
    readProvider ||
    provider ||
    createConfiguredDeliveryProvider({
      projectRoot: root,
      env: providerEnvironments.readEnvironment,
    })
  if (readDeliveryProviderSource.provider !== deliveryProvider.provider) {
    throw new Error('delivery read and write providers must match')
  }
  const readDeliveryProvider = createReadOnlyDeliveryProvider(
    readDeliveryProviderSource
  )
  const releaseDispatchAllowed = provider
    ? typeof provider.dispatchRelease === 'function'
    : providerEnvironments.releaseDispatchAllowed
  delete env.PLUSH_GITLAB_TOKEN
  delete env.PLUSH_GITLAB_READ_TOKEN
  delete process.env.PLUSH_GITLAB_TOKEN
  delete process.env.PLUSH_GITLAB_READ_TOKEN
  const providerKey =
    deliveryProvider.provider === 'github' ? 'github' : 'gitlab'
  const providerName = providerKey === 'gitlab' ? 'GitLab' : 'GitHub'
  const children = new Map()
  const preflightCache = new Map()
  const initializationPreflightCache = new Map()
  let pipelineTimingCache = null

  function executorEnvironment({ targetFetch = false } = {}) {
    const childEnv = { ...process.env }
    delete childEnv.PLUSH_GITLAB_TOKEN
    delete childEnv.PLUSH_GITLAB_READ_TOKEN
    delete childEnv.PLUSH_GITLAB_TARGET_FETCH_TOKEN
    delete childEnv[DELIVERY_OPERATION_STORE_REPO_ROOT_ENV]
    if (resolvedStoreRepoRoot !== resolvedProjectRepoRoot) {
      childEnv[DELIVERY_OPERATION_STORE_REPO_ROOT_ENV] = resolvedStoreRepoRoot
    }
    if (targetFetch && targetFetchToken) {
      childEnv.PLUSH_GITLAB_TARGET_FETCH_TOKEN = targetFetchToken
    }
    return childEnv
  }

  function presentOperation(operation, options = {}) {
    const requestCount =
      deliveryOperationRequestCounts(store).get(operation.id) || 1
    return publicOperation(operation, { ...options, requestCount })
  }

  recoverInterruptedDeliveryOperations(store, now())

  function releaseControlIdentity(download) {
    if (download?.transportMode === 'v2_direct') {
      const manifest = download.fetch?.formal?.files?.find(
        (file) => file.name === 'release-manifest.json'
      )
      if (!/^[0-9a-f]{64}$/u.test(String(manifest?.sha256 || ''))) {
        throw new Error('v2 target-direct release transport is invalid')
      }
      return Object.freeze({
        mode: 'gitlab_internal_or_target_cache',
        manifestSha256: manifest.sha256,
        identity: null,
      })
    }
    if (download?.transportMode !== 'legacy_v1_cache_only') {
      throw new Error('release transport mode is unsupported')
    }
    const identity = buildCacheIdentity({
      bundleDir: download.directory,
      releaseManifestPath: path.join(
        download.directory,
        'release-manifest.json'
      ),
    })
    return Object.freeze({
      mode: 'legacy_target_cache',
      manifestSha256: identity.releaseManifestSha256,
      identity,
    })
  }

  async function qualifyReleaseTransport(download, targetKey) {
    const control = releaseControlIdentity(download)
    if (control.mode === 'gitlab_internal_or_target_cache') {
      return Object.freeze({ ...control, cacheFingerprint: null })
    }
    const probe = await Promise.resolve(
      probeCache(control.identity, { targetKey })
    )
    if (
      control.identity.cacheMode !== 'legacy_v1_existing_only' ||
      probe.packageHit !== true ||
      probe.cacheSource !== 'formal'
    ) {
      throw new Error('legacy target rollback cache is unavailable')
    }
    return Object.freeze({
      ...control,
      cacheFingerprint: targetReleaseCacheEvidenceFingerprint({
        targetKey,
        identity: control.identity,
        probe,
      }),
    })
  }

  async function reconcileWaitingOperations() {
    for (const operation of listDeliveryOperations(store, { limit: 100 })) {
      if (operation.action !== 'release' || operation.status !== 'waiting') {
        continue
      }
      try {
        const status = await Promise.resolve(
          readDeliveryProvider.getReleaseStatus(operation.gitSha)
        )
        if (
          status.status === 'published' &&
          status.release?.version === operation.version &&
          status.release?.completeAssets === true &&
          status.release?.promotionEligible === true
        ) {
          transitionDeliveryOperation(store, operation.id, {
            status: 'passed',
            message: `immutable ${providerName} release and complete assets are published`,
            now: now(),
          })
        } else if (status.status === 'failed') {
          transitionDeliveryOperation(store, operation.id, {
            status: 'failed',
            message: `${providerName} release pipeline reached a failed terminal state`,
            issues: [
              providerIssue(
                `${providerName} 发布失败；请查看固定流水线运行记录`,
                providerKey
              ),
            ],
            now: now(),
          })
        }
      } catch {
        // A transient read failure must not mutate or redispatch a waiting run.
      }
    }
  }

  async function readTargetPreflight(targetKey, { force = false } = {}) {
    if (!isDeliveryTarget(targetKey)) {
      throw new Error('delivery target is not registered')
    }
    const currentTime = Date.now()
    const cached = preflightCache.get(targetKey)
    if (!force && cached && currentTime - cached.readAt < preflightTtlMs) {
      return cached.value
    }
    const value = await Promise.resolve(runPreflight(targetKey))
    if (value?.target !== targetKey) {
      throw new Error('target preflight identity does not match the request')
    }
    preflightCache.set(targetKey, { readAt: currentTime, value })
    return value
  }

  async function readPipelineTimings({ force = false } = {}) {
    if (typeof readDeliveryProvider.listPipelineTimings !== 'function') {
      return null
    }
    const currentTime = Date.now()
    if (
      !force &&
      pipelineTimingCache &&
      currentTime - pipelineTimingCache.readAt < pipelineTimingTtlMs
    ) {
      return pipelineTimingCache.value
    }
    const value = await Promise.resolve(
      readDeliveryProvider.listPipelineTimings({ limit: 8 })
    )
    pipelineTimingCache = { readAt: currentTime, value }
    return value
  }

  async function readTargetInitializationPreflight(
    targetKey,
    { force = false } = {}
  ) {
    if (!isDeliveryTarget(targetKey)) {
      throw new Error('delivery target is not registered')
    }
    const currentTime = Date.now()
    const cached = initializationPreflightCache.get(targetKey)
    if (!force && cached && currentTime - cached.readAt < preflightTtlMs) {
      return cached.value
    }
    const value = await Promise.resolve(runInitializationPreflight(targetKey))
    if (value?.target !== targetKey) {
      throw new Error(
        'target initialization preflight identity does not match the request'
      )
    }
    initializationPreflightCache.set(targetKey, {
      readAt: currentTime,
      value,
    })
    return value
  }

  async function getSummary({ forcePreflight = false } = {}) {
    await reconcileWaitingOperations()
    const [repositoryResult, versionsResult, timingsResult, ...targetResults] =
      await Promise.allSettled([
        readRepositoryState(root),
        Promise.resolve(readDeliveryProvider.listVersions({ limit: 100 })),
        readPipelineTimings(),
        ...DELIVERY_TARGET_KEYS.map((targetKey) =>
          readTargetPreflight(targetKey, { force: forcePreflight })
        ),
      ])
    const initializationResults = await Promise.allSettled(
      DELIVERY_TARGET_KEYS.map((targetKey, index) => {
        const preflight =
          targetResults[index]?.status === 'fulfilled'
            ? targetResults[index].value
            : null
        const serverSha = preflight?.remote?.runtime?.serverSha
        const webSha = preflight?.remote?.runtime?.webSha
        const existingRuntimeIdentity =
          SHA_PATTERN.test(String(serverSha || '')) && serverSha === webSha
        return preflight?.status === 'passed' || existingRuntimeIdentity
          ? Promise.resolve(null)
          : readTargetInitializationPreflight(targetKey, {
              force: forcePreflight,
            })
      })
    )
    const issues = []
    const generatedAt = now()
    let releaseVersionPolicy = null
    if (repositoryResult.status === 'rejected') {
      issues.push({
        code: 'repository_identity_unavailable',
        level: 'error',
        message: '当前仓库身份不可用，禁止创建发布',
      })
    }
    if (versionsResult.status === 'rejected') {
      issues.push(
        providerIssue(
          `${providerName} 版本列表不可用；请检查服务端凭据和网络`,
          providerKey
        )
      )
    } else {
      try {
        releaseVersionPolicy = buildReleaseVersionCatalog({
          versions: versionsResult.value,
          reference: generatedAt,
        })
      } catch {
        issues.push({
          code: 'release_version_catalog_invalid',
          level: 'error',
          message: '正式版本目录不一致，禁止创建新发布',
        })
      }
    }
    const targetEvidence = new Map()
    const targets = DELIVERY_TARGET_KEYS.map((targetKey, index) => {
      const definition = getDeploymentTarget(targetKey)
      const result = targetResults[index]
      const preflight = result?.status === 'fulfilled' ? result.value : null
      const initializationResult = initializationResults[index]
      const initializationPreflight =
        initializationResult?.status === 'fulfilled'
          ? initializationResult.value
          : null
      targetEvidence.set(targetKey, {
        preflight,
        initializationPreflight,
      })
      if (!preflight) {
        issues.push({
          code: `target_preflight_unavailable_${targetKey.replaceAll('-', '_')}`,
          level: 'error',
          message: `${targetKey} 只读预检不可用；未启动任何目标写操作`,
        })
      }
      return {
        key: targetKey,
        purpose: definition.purpose,
        endpoint: definition.publicEntry.endpoint,
        preflight,
        initializationPreflight,
      }
    })
    if (timingsResult.status === 'rejected') {
      issues.push({
        code: 'pipeline_timings_unavailable',
        level: 'warning',
        message: `${providerName} 流水线耗时暂不可用；发布与部署状态仍可独立核对`,
      })
    }
    if (!releaseDispatchAllowed) {
      issues.push({
        code: 'release_dispatch_credential_unavailable',
        level: 'warning',
        message:
          'GitLab 只读证据可继续查看；未加载短期发布凭据，发布当前版本制品已停用',
      })
    }
    let backupRestoreEvidence = null
    const customerTestPreflight =
      targetEvidence.get('customer-test-133')?.preflight
    if (customerTestPreflight?.target && customerTestPreflight?.customer) {
      try {
        backupRestoreEvidence = await Promise.resolve(
          readRecoveryEvidence({
            projectRoot: root,
            target: customerTestPreflight.target,
            customer: customerTestPreflight.customer,
            environment: 'customer-clean-acceptance',
          })
        )
      } catch {
        issues.push({
          code: 'recovery_evidence_unavailable',
          level: 'warning',
          message: '隔离恢复回执暂不可用；不会把未校验文件显示为最近证据',
        })
      }
    }
    return {
      schemaVersion: 'plush.dev-delivery-summary/v1',
      status: issues.length === 0 ? 'success' : 'partial',
      generatedAt,
      repository:
        repositoryResult.status === 'fulfilled' ? repositoryResult.value : null,
      versions:
        versionsResult.status === 'fulfilled'
          ? bindVersionActions({
              classifyRelation,
              projectRoot: root,
              targetEvidence,
              versions: versionsResult.value,
            })
          : [],
      releaseVersionPolicy,
      target: targetEvidence.get('demo-133')?.preflight || null,
      targets,
      timings:
        timingsResult.status === 'fulfilled' ? timingsResult.value : null,
      operations: (() => {
        const requestCounts = deliveryOperationRequestCounts(store)
        return listDeliveryOperations(store, { limit: 200 }).map((operation) =>
          publicOperation(operation, {
            requestCount: requestCounts.get(operation.id) || 1,
          })
        )
      })(),
      recovery: {
        schemaVersion: 'plush.dev-recovery-summary/v1',
        backupRestore: backupRestoreEvidence,
      },
      issues,
      boundaries: {
        provider: providerKey,
        releaseDispatchAllowed,
        target: 'demo-133',
        targets: DELIVERY_TARGET_KEYS,
        browserShellAccess: false,
        targetBuildAllowed: false,
        automaticRetryAllowed: false,
        automaticDatabaseDownMigration: false,
      },
    }
  }

  async function dispatchRelease(payload, { retryOfOperationId = null } = {}) {
    if (!releaseDispatchAllowed) {
      throw new Error('release dispatch credential is unavailable')
    }
    const repository = await readRepositoryState(root)
    if (repository.dirty || repository.commit !== payload.gitSha) {
      throw new Error(
        'release requires the exact clean current repository identity'
      )
    }
    const created = createOrReuseDeliveryOperation(store, {
      action: 'release',
      target: `${providerKey}-release`,
      gitSha: payload.gitSha,
      version: payload.version,
      idempotencyKey: payload.idempotencyKey,
      retryOfOperationId,
      metadata: { source: 'version-center' },
      now: now(),
    })
    if (created.reused) return presentOperation(created.operation)

    let operation = transitionDeliveryOperation(store, created.operation.id, {
      status: 'running',
      message: `${providerName} immutable release dispatch started`,
      now: now(),
    })
    try {
      const versionReference = now()
      const existing = await Promise.resolve(
        readDeliveryProvider.getReleaseStatus(operation.gitSha)
      )
      if (existing.status === 'published') {
        if (
          existing.release?.version !== operation.version ||
          existing.release?.completeAssets !== true ||
          existing.release?.promotionEligible !== true
        ) {
          throw new Error('published release identity is inconsistent')
        }
        operation = transitionDeliveryOperation(store, operation.id, {
          status: 'passed',
          message: 'immutable release already exists with complete assets',
          now: now(),
        })
        return presentOperation(operation)
      }
      if (retryOfOperationId === null) {
        const policy = assertOfficialReleaseVersion({
          versions: await Promise.resolve(
            readDeliveryProvider.listVersions({ limit: 100 })
          ),
          reference: versionReference,
          requested: operation.version,
        })
        if (policy.nextVersion !== operation.version) {
          throw new Error('release version catalog changed before dispatch')
        }
      }
      await Promise.resolve(
        deliveryProvider.dispatchRelease({
          gitSha: operation.gitSha,
          version: operation.version,
          customer: 'yoyoosun',
          versionReference,
        })
      )
      operation = transitionDeliveryOperation(store, operation.id, {
        status: 'waiting',
        message: `${providerName} release pipeline accepted; waiting for terminal assets`,
        now: now(),
      })
      return presentOperation(operation)
    } catch (error) {
      transitionDeliveryOperation(store, operation.id, {
        status: 'failed',
        message: `${providerName} release dispatch failed without starting a target write`,
        issues: [
          providerIssue(
            `${providerName} 发布未启动或身份不一致；未写入任何 demo/test 部署目标`,
            providerKey
          ),
        ],
        now: now(),
      })
      throw error
    }
  }

  async function prepareFixedPromotion(
    payload,
    { retryOfOperationId = null } = {}
  ) {
    const versions = await Promise.resolve(
      readDeliveryProvider.listVersions({ limit: 50 })
    )
    const release = versions.find((item) => item.gitSha === payload.gitSha)
    if (
      !release ||
      release.version !== payload.version ||
      release.status !== 'published' ||
      release.completeAssets !== true ||
      release.promotionEligible !== true
    ) {
      throw new Error('published v2 seven-asset release is not ready')
    }
    if (
      readDeliveryProvider.provider !== 'gitlab' ||
      typeof readDeliveryProvider.downloadReleaseControl !== 'function'
    ) {
      throw new Error(
        'promotion requires the GitLab target-direct release transport'
      )
    }
    const destination = releaseControlDirectory(root, payload.gitSha)
    const downloaded = await Promise.resolve(
      readDeliveryProvider.downloadReleaseControl(payload.gitSha, destination)
    )
    const candidateTransport = await qualifyReleaseTransport(
      downloaded,
      payload.target
    )
    if (candidateTransport.mode !== 'gitlab_internal_or_target_cache') {
      throw new Error('promotion candidate requires the v2 target transport')
    }
    const result = await Promise.resolve(
      preparePromotionAction(
        {
          repoRoot: root,
          releaseManifestPath: path.join(
            downloaded.directory,
            'release-manifest.json'
          ),
          targetKey: payload.target,
          idempotencyKey: payload.idempotencyKey,
          operationStore: store,
          retryOfOperationId,
        },
        { runPreflight, runInitializationPreflight, now }
      )
    )
    let preparedOperation = result.operation
    if (
      preparedOperation.status === 'ready' &&
      preparedOperation.metadata?.promotionMode === 'upgrade'
    ) {
      const currentGitSha = result.plan?.ancestry?.currentGitSha
      if (!SHA_PATTERN.test(String(currentGitSha || ''))) {
        preparedOperation = transitionDeliveryOperation(
          store,
          preparedOperation.id,
          {
            status: 'blocked',
            message:
              'promotion is blocked because the current release transport identity is unavailable',
            issues: [
              {
                code: 'promotion_current_release_transport_unavailable',
                level: 'error',
                message:
                  '当前运行版本缺少可验证的目标直取回滚身份；未启动目标写操作',
              },
            ],
            now: now(),
          }
        )
      } else {
        preparedOperation = transitionDeliveryOperation(
          store,
          preparedOperation.id,
          {
            status: 'running',
            message: 'verifying the current release rollback transport',
            now: now(),
          }
        )
        try {
          const currentDownload = await Promise.resolve(
            readDeliveryProvider.downloadReleaseControl(
              currentGitSha,
              releaseControlDirectory(root, currentGitSha)
            )
          )
          const currentTransport = await qualifyReleaseTransport(
            currentDownload,
            payload.target
          )
          preparedOperation = transitionDeliveryOperation(
            store,
            preparedOperation.id,
            {
              status: 'ready',
              message:
                'promotion and current-release rollback transports are verified; explicit confirmation is required',
              metadata: {
                ...preparedOperation.metadata,
                currentGitSha,
                currentReleaseTransportVerified: true,
                currentReleaseTransportMode: currentTransport.mode,
                currentReleaseManifestSha256: currentTransport.manifestSha256,
                currentReleaseCacheFingerprint:
                  currentTransport.cacheFingerprint,
              },
              now: now(),
            }
          )
        } catch {
          preparedOperation = transitionDeliveryOperation(
            store,
            preparedOperation.id,
            {
              status: 'blocked',
              message:
                'promotion is blocked because the current release cannot be fetched for rollback',
              issues: [
                {
                  code: 'promotion_current_release_transport_unavailable',
                  level: 'error',
                  message:
                    '当前运行版本缺少完整的目标直取回滚制品；未启动目标写操作',
                },
              ],
              now: now(),
            }
          )
        }
      }
    }
    preflightCache.delete(payload.target)
    return {
      operation: presentOperation(preparedOperation),
      plan: result.plan,
      reused: result.reused,
    }
  }

  async function prepareFixedRollback(
    payload,
    { retryOfOperationId = null } = {}
  ) {
    const versions = await Promise.resolve(
      readDeliveryProvider.listVersions({ limit: 50 })
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
    const currentDirectory = releaseControlDirectory(root, payload.fromGitSha)
    const targetDirectory = releaseControlDirectory(root, payload.toGitSha)
    if (
      readDeliveryProvider.provider !== 'gitlab' ||
      typeof readDeliveryProvider.downloadReleaseControl !== 'function'
    ) {
      throw new Error(
        'rollback requires the GitLab target-direct release transport'
      )
    }
    const [currentDownload, targetDownload] = await Promise.all([
      Promise.resolve(
        readDeliveryProvider.downloadReleaseControl(
          payload.fromGitSha,
          currentDirectory
        )
      ),
      Promise.resolve(
        readDeliveryProvider.downloadReleaseControl(
          payload.toGitSha,
          targetDirectory
        )
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
          targetKey: payload.target,
          idempotencyKey: payload.idempotencyKey,
          operationStore: store,
          retryOfOperationId,
        },
        { runPreflight, buildCacheIdentity, probeCache, now }
      )
    )
    const expectedTargetTransport =
      targetDownload.transportMode === 'legacy_v1_cache_only'
        ? 'legacy_target_cache'
        : targetDownload.transportMode === 'v2_direct'
          ? 'gitlab_internal_or_target_cache'
          : 'unsupported'
    if (result.plan?.transport?.mode !== expectedTargetTransport) {
      throw new Error('rollback release transport does not match its plan')
    }
    preflightCache.delete(payload.target)
    return {
      operation: presentOperation(result.operation),
      plan: result.plan,
      reused: result.reused,
    }
  }

  async function prepareFixedDatabaseRebuild(payload) {
    const versions = await Promise.resolve(
      readDeliveryProvider.listVersions({ limit: 50 })
    )
    const release = versions.find((item) => item.gitSha === payload.gitSha)
    if (
      !release ||
      release.version !== payload.version ||
      release.status !== 'published' ||
      release.completeAssets !== true
    ) {
      throw new Error('current immutable release is not ready for data rebuild')
    }
    if (
      readDeliveryProvider.provider !== 'gitlab' ||
      typeof readDeliveryProvider.downloadReleaseControl !== 'function'
    ) {
      throw new Error(
        'database rebuild requires the GitLab target-direct release transport'
      )
    }
    const destination = releaseControlDirectory(root, payload.gitSha)
    const downloaded = await Promise.resolve(
      readDeliveryProvider.downloadReleaseControl(payload.gitSha, destination)
    )
    await qualifyReleaseTransport(downloaded, payload.target)
    const result = await Promise.resolve(
      prepareDatabaseRebuildAction(
        {
          repoRoot: root,
          releaseManifestPath: path.join(
            downloaded.directory,
            'release-manifest.json'
          ),
          targetKey: payload.target,
          idempotencyKey: payload.idempotencyKey,
          operationStore: store,
        },
        { runPreflight, classifyRelation, now }
      )
    )
    preflightCache.delete(payload.target)
    return {
      operation: presentOperation(result.operation),
      plan: result.plan,
      reused: result.reused,
    }
  }

  async function retryOperation(payload) {
    const previous = readDeliveryOperation(store, payload.operationId)
    if (!['failed', 'blocked'].includes(previous.status)) {
      if (previous.status === 'not_proven') {
        throw new Error('target outcome must be read back before retry')
      }
      throw new Error('only failed or blocked operations can be retried')
    }
    const retryOptions = { retryOfOperationId: previous.id }
    if (previous.action === 'release') {
      return {
        operation: await dispatchRelease(
          {
            gitSha: previous.gitSha,
            version: previous.version,
            idempotencyKey: payload.idempotencyKey,
          },
          retryOptions
        ),
      }
    }
    if (previous.action === 'promote') {
      return prepareFixedPromotion(
        {
          gitSha: previous.gitSha,
          version: previous.version,
          target: previous.target,
          idempotencyKey: payload.idempotencyKey,
        },
        retryOptions
      )
    }
    if (previous.action === 'rollback') {
      return prepareFixedRollback(
        {
          fromGitSha: previous.metadata.currentGitSha,
          fromVersion: previous.metadata.currentVersion,
          toGitSha: previous.gitSha,
          toVersion: previous.version,
          target: previous.target,
          idempotencyKey: payload.idempotencyKey,
        },
        retryOptions
      )
    }
    throw new Error('operation action cannot be retried from the workbench')
  }

  function finishSpawnedTargetAction(operationId, error) {
    children.delete(operationId)
    const current = readDeliveryOperation(store, operationId)
    if (TERMINAL_STATUSES.has(current.status)) return
    const executionFailure =
      current.action === 'rollback'
        ? {
            startMessage: 'rollback executor did not start a target write',
            startCode: 'rollback_executor_start_failed',
            startIssue: '回滚执行器未启动；未自动重试',
            unknownMessage:
              'rollback executor ended while target outcome was unknown',
            unknownCode: 'rollback_executor_outcome_unknown',
            unknownIssue: '回滚结果未知，必须先读回，禁止自动重试',
          }
        : current.action === 'rebuild-database'
          ? {
              startMessage:
                'database rebuild executor did not start a target write',
              startCode: 'database_rebuild_executor_start_failed',
              startIssue: '测试数据重建执行器未启动；未自动重试',
              unknownMessage:
                'database rebuild executor ended while target outcome was unknown',
              unknownCode: 'database_rebuild_executor_outcome_unknown',
              unknownIssue: '测试数据重建结果未知，必须先读回，禁止自动重试',
            }
          : {
              startMessage: 'promotion executor did not start a target write',
              startCode: 'promotion_executor_start_failed',
              startIssue: '发布执行器未启动；未自动重试',
              unknownMessage:
                'promotion executor ended while target outcome was unknown',
              unknownCode: 'promotion_executor_outcome_unknown',
              unknownIssue: '目标结果未知，必须先读回，禁止自动重试',
            }
    if (current.status === 'launching') {
      transitionDeliveryOperation(store, operationId, {
        status: 'failed',
        message: executionFailure.startMessage,
        issues: [
          {
            code: executionFailure.startCode,
            level: 'error',
            message: executionFailure.startIssue,
          },
        ],
        now: now(),
      })
      return
    }
    if (current.status === 'running') {
      transitionDeliveryOperation(store, operationId, {
        status: 'not_proven',
        message: executionFailure.unknownMessage,
        issues: [
          {
            code: executionFailure.unknownCode,
            level: 'error',
            message: executionFailure.unknownIssue,
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

  async function executeFixedPromotion(payload) {
    if (children.size > 0) {
      throw new Error('another delivery target action is already running')
    }
    let operation = readDeliveryOperation(store, payload.operationId)
    if (
      operation.action !== 'promote' ||
      !isDeliveryTarget(operation.target) ||
      operation.status !== 'ready'
    ) {
      throw new Error('promotion operation is not ready')
    }
    const expected = `PROMOTE:${operation.target}:${operation.gitSha}:${operation.id}`
    if (payload.confirmation !== expected) {
      throw new Error('explicit promotion confirmation does not match')
    }
    if (operation.metadata?.promotionMode === 'upgrade') {
      const currentGitSha = operation.metadata?.currentGitSha
      if (
        operation.metadata?.currentReleaseTransportVerified !== true ||
        !SHA_PATTERN.test(String(currentGitSha || ''))
      ) {
        transitionDeliveryOperation(store, operation.id, {
          status: 'blocked',
          message:
            'promotion is blocked because the current release rollback transport was not proven',
          issues: [
            {
              code: 'promotion_current_release_transport_unavailable',
              level: 'error',
              message: '当前运行版本的目标直取回滚资格未证明；未启动目标写操作',
            },
          ],
          now: now(),
        })
        throw new Error('current release rollback transport is unavailable')
      }
      try {
        const currentDownload = await Promise.resolve(
          readDeliveryProvider.downloadReleaseControl(
            currentGitSha,
            releaseControlDirectory(root, currentGitSha)
          )
        )
        const currentTransport = await qualifyReleaseTransport(
          currentDownload,
          operation.target
        )
        if (
          currentTransport.mode !==
            operation.metadata.currentReleaseTransportMode ||
          currentTransport.manifestSha256 !==
            operation.metadata.currentReleaseManifestSha256 ||
          currentTransport.cacheFingerprint !==
            operation.metadata.currentReleaseCacheFingerprint
        ) {
          throw new Error('current release rollback transport changed')
        }
      } catch {
        transitionDeliveryOperation(store, operation.id, {
          status: 'blocked',
          message:
            'promotion is blocked because the current release rollback transport changed',
          issues: [
            {
              code: 'promotion_current_release_transport_unavailable',
              level: 'error',
              message: '当前运行版本的目标直取回滚制品已变化；未启动目标写操作',
            },
          ],
          now: now(),
        })
        throw new Error('current release rollback transport is unavailable')
      }
    }
    operation = transitionDeliveryOperation(store, operation.id, {
      status: 'launching',
      message: 'promotion executor child is launching',
      now: now(),
    })
    const bundleDir = releaseControlDirectory(root, operation.gitSha)
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
          env: executorEnvironment({ targetFetch: true }),
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
      operation: presentOperation(operation),
    }
  }

  async function executeFixedRollback(payload) {
    if (children.size > 0) {
      throw new Error('another delivery target action is already running')
    }
    let operation = readDeliveryOperation(store, payload.operationId)
    if (
      operation.action !== 'rollback' ||
      !isDeliveryTarget(operation.target) ||
      operation.status !== 'ready' ||
      !SHA_PATTERN.test(String(operation.metadata?.currentGitSha || ''))
    ) {
      throw new Error('rollback operation is not ready')
    }
    const expected =
      `ROLLBACK:${operation.target}:${operation.metadata.currentGitSha}:` +
      `${operation.gitSha}:${operation.id}`
    if (payload.confirmation !== expected) {
      throw new Error('explicit rollback confirmation does not match')
    }
    try {
      if (
        readDeliveryProvider.provider !== 'gitlab' ||
        typeof readDeliveryProvider.downloadReleaseControl !== 'function'
      ) {
        throw new Error('rollback release transport is unavailable')
      }
      const [currentDownload, targetDownload] = await Promise.all([
        Promise.resolve(
          readDeliveryProvider.downloadReleaseControl(
            operation.metadata.currentGitSha,
            releaseControlDirectory(root, operation.metadata.currentGitSha)
          )
        ),
        Promise.resolve(
          readDeliveryProvider.downloadReleaseControl(
            operation.gitSha,
            releaseControlDirectory(root, operation.gitSha)
          )
        ),
      ])
      const currentControl = releaseControlIdentity(currentDownload)
      const targetTransport = await qualifyReleaseTransport(
        targetDownload,
        operation.target
      )
      if (
        currentControl.manifestSha256 !==
          operation.metadata.currentManifestSha256 ||
        targetTransport.manifestSha256 !==
          operation.metadata.targetManifestSha256 ||
        targetTransport.mode !== operation.metadata.rollbackTransportMode ||
        (targetTransport.mode === 'legacy_target_cache' &&
          targetTransport.cacheFingerprint !==
            operation.metadata.rollbackTargetCacheFingerprint)
      ) {
        throw new Error('rollback release transport changed')
      }
    } catch {
      transitionDeliveryOperation(store, operation.id, {
        status: 'blocked',
        message: 'rollback is blocked because its release transport changed',
        issues: [
          {
            code: 'rollback_target_transport_unavailable',
            level: 'error',
            message: '目标回滚制品或既有缓存资格不可用；未启动目标写操作',
          },
        ],
        now: now(),
      })
      throw new Error('rollback release transport is unavailable')
    }
    operation = transitionDeliveryOperation(store, operation.id, {
      status: 'launching',
      message: 'rollback executor child is launching',
      now: now(),
    })
    const currentBundleDir = releaseControlDirectory(
      root,
      operation.metadata.currentGitSha
    )
    const targetBundleDir = releaseControlDirectory(root, operation.gitSha)
    const rollbackChildEnv = executorEnvironment({
      targetFetch:
        operation.metadata.rollbackTransportMode ===
        'gitlab_internal_or_target_cache',
    })
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
          env: rollbackChildEnv,
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
      operation: presentOperation(operation),
    }
  }

  async function executeFixedDatabaseRebuild(payload) {
    if (children.size > 0) {
      throw new Error('another delivery target action is already running')
    }
    let operation = readDeliveryOperation(store, payload.operationId)
    if (
      operation.action !== 'rebuild-database' ||
      !isDeliveryTarget(operation.target) ||
      operation.status !== 'ready'
    ) {
      throw new Error('database rebuild operation is not ready')
    }
    const expected = `REBUILD_DATABASE:${operation.target}:${operation.gitSha}:${operation.id}`
    if (payload.confirmation !== expected) {
      throw new Error('explicit database rebuild confirmation does not match')
    }
    operation = transitionDeliveryOperation(store, operation.id, {
      status: 'launching',
      message: 'database rebuild executor child is launching',
      now: now(),
    })
    const bundleDir = releaseControlDirectory(root, operation.gitSha)
    let child
    try {
      child = spawnProcess(
        process.execPath,
        [
          path.join(root, 'scripts', 'deploy', 'database-rebuild-executor.mjs'),
          '--operation-id',
          operation.id,
          '--release-manifest',
          path.join(bundleDir, 'release-manifest.json'),
          '--confirmation',
          payload.confirmation,
          '--json',
        ],
        {
          cwd: root,
          env: executorEnvironment(),
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
      operation: presentOperation(operation),
    }
  }

  return {
    async summary(options) {
      return getSummary(options)
    },
    readOperation(operationId) {
      return presentOperation(readDeliveryOperation(store, operationId), {
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
      if (validated.action === 'prepare-database-rebuild') {
        return {
          schemaVersion: 'plush.dev-delivery-action-result/v1',
          action: validated.action,
          ...(await prepareFixedDatabaseRebuild(validated.payload)),
        }
      }
      if (validated.action === 'retry-operation') {
        return {
          schemaVersion: 'plush.dev-delivery-action-result/v1',
          action: validated.action,
          ...(await retryOperation(validated.payload)),
        }
      }
      if (validated.action === 'execute-rollback') {
        return {
          schemaVersion: 'plush.dev-delivery-action-result/v1',
          action: validated.action,
          ...(await executeFixedRollback(validated.payload)),
        }
      }
      if (validated.action === 'execute-database-rebuild') {
        return {
          schemaVersion: 'plush.dev-delivery-action-result/v1',
          action: validated.action,
          ...(await executeFixedDatabaseRebuild(validated.payload)),
        }
      }
      return {
        schemaVersion: 'plush.dev-delivery-action-result/v1',
        action: validated.action,
        ...(await executeFixedPromotion(validated.payload)),
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
  const deliveryService = service || createDevDeliveryService({ projectRoot })

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
          target: 'demo-133',
          targets: DELIVERY_TARGET_KEYS,
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
        sendJson(response, result.accepted === true ? 202 : 200, result)
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
