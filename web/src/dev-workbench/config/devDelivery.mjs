import { DEV_VERSION_CENTER_ROUTE } from './devRoutes.mjs'

export { DEV_VERSION_CENTER_ROUTE }

export const DEV_DELIVERY_SESSION_API_PATH =
  '/__dev/api/delivery/session'
export const DEV_DELIVERY_SUMMARY_API_PATH =
  '/__dev/api/delivery/summary'
export const DEV_DELIVERY_ACTION_API_PATH =
  '/__dev/api/delivery/actions'
export const DEV_DELIVERY_OPERATION_API_PREFIX =
  '/__dev/api/delivery/operations'
export const DEV_DELIVERY_SOURCE_PATH =
  'docs/engineering/研发效能工作台与CI-CD设计.md'

const SHA_PATTERN = /^[0-9a-f]{40}$/u
const VERSION_PATTERN =
  /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u
const OPERATION_STATUSES = new Set([
  'queued',
  'running',
  'ready',
  'launching',
  'waiting',
  'passed',
  'failed',
  'blocked',
  'not_proven',
])
const OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const PIPELINE_STATUSES = new Set([
  'queued',
  'in_progress',
  'completed',
  'waiting',
  'requested',
  'pending',
])

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} is invalid`)
  }
  return value
}

function validateOperation(operation) {
  assertObject(operation, 'delivery operation')
  if (
    typeof operation.id !== 'string' ||
    !['release', 'promote', 'rollback'].includes(operation.action) ||
    !SHA_PATTERN.test(String(operation.gitSha || '')) ||
    !VERSION_PATTERN.test(String(operation.version || '')) ||
    !OPERATION_STATUSES.has(operation.status) ||
    !Number.isSafeInteger(operation.durationMs) ||
    operation.durationMs < 0 ||
    !Array.isArray(operation.stages) ||
    operation.stages.some(
      (stage) =>
        !stage ||
        typeof stage.id !== 'string' ||
        typeof stage.label !== 'string' ||
        !['passed', 'failed', ...OPERATION_STATUSES].includes(stage.status) ||
        !Number.isSafeInteger(stage.durationMs) ||
        stage.durationMs < 0
    ) ||
    !Array.isArray(operation.issues) ||
    !Array.isArray(operation.events)
  ) {
    throw new Error('delivery operation is invalid')
  }
  return operation
}

function validateDuration(value, field, { optional = false } = {}) {
  if (value === null && optional) return value
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} duration is invalid`)
  }
  return value
}

function validatePipelineTimestamp(value, field, { optional = false } = {}) {
  if (value === null && optional) return value
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} timestamp is invalid`)
  }
  return value
}

function validatePipelineStep(step) {
  assertObject(step, 'pipeline step')
  if (
    !Number.isSafeInteger(step.number) ||
    step.number < 1 ||
    typeof step.name !== 'string' ||
    !PIPELINE_STATUSES.has(step.status)
  ) {
    throw new Error('pipeline step is invalid')
  }
  validatePipelineTimestamp(step.startedAt, 'pipeline step start', {
    optional: true,
  })
  validatePipelineTimestamp(step.finishedAt, 'pipeline step finish', {
    optional: true,
  })
  validateDuration(step.durationMs, 'pipeline step', { optional: true })
  return step
}

function validatePipelineJob(job) {
  assertObject(job, 'pipeline job')
  if (
    !Number.isSafeInteger(job.id) ||
    job.id < 1 ||
    typeof job.name !== 'string' ||
    !PIPELINE_STATUSES.has(job.status) ||
    !Array.isArray(job.steps) ||
    job.steps.length > 100
  ) {
    throw new Error('pipeline job is invalid')
  }
  validatePipelineTimestamp(job.startedAt, 'pipeline job start', {
    optional: true,
  })
  validatePipelineTimestamp(job.finishedAt, 'pipeline job finish', {
    optional: true,
  })
  validateDuration(job.durationMs, 'pipeline job', { optional: true })
  job.steps.forEach(validatePipelineStep)
  return job
}

function validatePipelineRun(run) {
  assertObject(run, 'pipeline run')
  if (
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    !Number.isSafeInteger(run.attempt) ||
    run.attempt < 1 ||
    !['ci', 'release'].includes(run.workflow) ||
    typeof run.event !== 'string' ||
    !PIPELINE_STATUSES.has(run.status) ||
    !SHA_PATTERN.test(String(run.gitSha || '')) ||
    !Array.isArray(run.jobs) ||
    run.jobs.length > 100 ||
    run.url !==
      `https://github.com/saurick/plush-toy-erp/actions/runs/${String(run.id)}`
  ) {
    throw new Error('pipeline run is invalid')
  }
  validatePipelineTimestamp(run.createdAt, 'pipeline run creation')
  validatePipelineTimestamp(run.startedAt, 'pipeline run start', {
    optional: true,
  })
  validatePipelineTimestamp(run.finishedAt, 'pipeline run finish', {
    optional: true,
  })
  validateDuration(run.queueMs, 'pipeline queue', { optional: true })
  validateDuration(run.durationMs, 'pipeline run', { optional: true })
  run.jobs.forEach(validatePipelineJob)
  return run
}

export function validatePipelineTimings(timings) {
  assertObject(timings, 'pipeline timings')
  if (
    timings.schemaVersion !== 'plush.delivery-pipeline-timings/v1' ||
    !Array.isArray(timings.runs) ||
    timings.runs.length > 20
  ) {
    throw new Error('pipeline timing contract is invalid')
  }
  validatePipelineTimestamp(timings.generatedAt, 'pipeline timing generation')
  timings.runs.forEach(validatePipelineRun)
  return timings
}

function validateVersion(version) {
  assertObject(version, 'delivery version')
  if (
    !SHA_PATTERN.test(String(version.gitSha || '')) ||
    !VERSION_PATTERN.test(String(version.version || '')) ||
    version.tag !== `artifact-${version.gitSha}` ||
    !['published', 'draft', 'prerelease'].includes(version.status) ||
    typeof version.completeAssets !== 'boolean' ||
    !Array.isArray(version.assets)
  ) {
    throw new Error('delivery version is invalid')
  }
  return version
}

export function validateDevDeliverySummary(summary) {
  assertObject(summary, 'delivery summary')
  if (
    summary.schemaVersion !== 'plush.dev-delivery-summary/v1' ||
    !['success', 'partial'].includes(summary.status) ||
    !Array.isArray(summary.versions) ||
    !Array.isArray(summary.operations) ||
    !Array.isArray(summary.issues) ||
    !Object.hasOwn(summary, 'timings') ||
    summary.boundaries?.provider !== 'github' ||
    summary.boundaries?.target !== 'test-133' ||
    summary.boundaries?.browserShellAccess !== false ||
    summary.boundaries?.targetBuildAllowed !== false ||
    summary.boundaries?.automaticRetryAllowed !== false
  ) {
    throw new Error('delivery summary contract is invalid')
  }
  if (
    summary.repository !== null &&
    (!SHA_PATTERN.test(String(summary.repository?.commit || '')) ||
      typeof summary.repository?.dirty !== 'boolean' ||
      !/^[0-9a-f]{64}$/u.test(
        String(summary.repository?.fingerprint || '')
      ))
  ) {
    throw new Error('delivery repository identity is invalid')
  }
  summary.versions.forEach(validateVersion)
  summary.operations.forEach(validateOperation)
  if (summary.timings !== null) validatePipelineTimings(summary.timings)
  return summary
}

async function readJson(response) {
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('版本中心返回了无效响应')
  }
  if (!response.ok) {
    throw new Error(
      typeof payload?.message === 'string'
        ? payload.message
        : '版本中心操作失败'
    )
  }
  return payload
}

export function createDevDeliveryClient({
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is unavailable')
  }
  let csrfToken = ''

  async function session() {
    if (csrfToken) return csrfToken
    const payload = await readJson(
      await fetchImpl(DEV_DELIVERY_SESSION_API_PATH, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
    )
    if (
      payload?.schemaVersion !== 'plush.dev-delivery-session/v1' ||
      typeof payload.csrfToken !== 'string' ||
      payload.csrfToken.length < 32 ||
      payload.target !== 'test-133'
    ) {
      throw new Error('版本中心会话校验失败')
    }
    csrfToken = payload.csrfToken
    return csrfToken
  }

  return {
    async summary() {
      return validateDevDeliverySummary(
        await readJson(
          await fetchImpl(DEV_DELIVERY_SUMMARY_API_PATH, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          })
        )
      )
    },
    async operation(operationId) {
      if (!OPERATION_ID_PATTERN.test(String(operationId || ''))) {
        throw new Error('版本中心 operation ID 无效')
      }
      const payload = await readJson(
        await fetchImpl(
          `${DEV_DELIVERY_OPERATION_API_PREFIX}/${operationId}`,
          {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          }
        )
      )
      if (
        payload?.schemaVersion !==
        'plush.dev-delivery-operation-result/v1'
      ) {
        throw new Error('版本中心 operation 响应无效')
      }
      return validateOperation(payload.operation)
    },
    async action(action, payload) {
      const token = await session()
      return readJson(
        await fetchImpl(DEV_DELIVERY_ACTION_API_PATH, {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-csrf-token': token,
          },
          body: JSON.stringify({ action, payload }),
        })
      )
    },
    clearSession() {
      csrfToken = ''
    },
  }
}

export function createDeliveryIdempotencyKey(
  action,
  randomUuid = () => globalThis.crypto.randomUUID()
) {
  if (!['release', 'promote', 'rollback'].includes(action)) {
    throw new Error('delivery idempotency action is invalid')
  }
  const uuid = String(randomUuid())
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      uuid
    )
  ) {
    throw new Error('delivery idempotency UUID is invalid')
  }
  return `version-center:${action}:${uuid}`
}

export function defaultReleaseVersion(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}-1`
}

export function shortGitSha(value) {
  return SHA_PATTERN.test(String(value || ''))
    ? String(value).slice(0, 12)
    : '未证明'
}

export function formatDeliveryBytes(value) {
  if (!Number.isSafeInteger(value) || value < 0) return '未证明'
  const gib = value / 1024 ** 3
  return `${gib.toFixed(gib >= 10 ? 1 : 2)} GiB`
}

export function formatDeliveryDuration(value) {
  if (!Number.isSafeInteger(value) || value < 0) return '未证明'
  if (value < 1000) return `${String(value)} ms`
  if (value < 60_000) return `${(value / 1000).toFixed(1)} 秒`
  const roundedSeconds = Math.round(value / 1000)
  const minutes = Math.floor(roundedSeconds / 60)
  const seconds = roundedSeconds % 60
  if (minutes < 60) return `${String(minutes)} 分 ${String(seconds)} 秒`
  const hours = Math.floor(minutes / 60)
  return `${String(hours)} 小时 ${String(minutes % 60)} 分`
}

export function summarizePipelineTimings(timings) {
  const runs = timings?.runs || []
  const completed = runs.filter(
    (run) => run.status === 'completed' && Number.isSafeInteger(run.durationMs)
  )
  const latest = completed[0] || null
  const sortedDurations = completed
    .map((run) => run.durationMs)
    .sort((left, right) => left - right)
  const middle = Math.floor(sortedDurations.length / 2)
  const medianDurationMs =
    sortedDurations.length === 0
      ? null
      : sortedDurations.length % 2 === 1
        ? sortedDurations[middle]
        : Math.round(
            (sortedDurations[middle - 1] + sortedDurations[middle]) / 2
          )
  const candidates = (latest?.jobs || []).flatMap((job) => {
    const steps = job.steps.filter((step) => Number.isSafeInteger(step.durationMs))
    return steps.length > 0
      ? steps.map((step) => ({
          id: `${String(job.id)}:${String(step.number)}`,
          name: step.name,
          group: job.name,
          durationMs: step.durationMs,
          status: step.status,
          conclusion: step.conclusion,
        }))
      : Number.isSafeInteger(job.durationMs)
        ? [
            {
              id: String(job.id),
              name: job.name,
              group: latest.workflow,
              durationMs: job.durationMs,
              status: job.status,
              conclusion: job.conclusion,
            },
          ]
        : []
  })
  const stages = candidates.sort(
    (left, right) => right.durationMs - left.durationMs
  )
  const bottleneck = stages[0] || null
  return {
    latest,
    sampleCount: completed.length,
    medianDurationMs,
    bottleneck,
    stages,
    optimizationHint: bottleneck
      ? `先复核“${bottleneck.name}”：它是最近一次完整流水线中耗时最长的可见环节。`
      : '等待至少一次完整流水线后再决定优化点，避免凭感觉增加并发或缓存。',
  }
}

export function deliveryStatusPresentation(status) {
  const presentations = {
    queued: ['已排队', 'default'],
    running: ['执行中', 'processing'],
    ready: ['待确认', 'blue'],
    launching: ['正在启动', 'processing'],
    waiting: ['等待 GitHub', 'processing'],
    passed: ['已通过', 'success'],
    failed: ['失败', 'error'],
    blocked: ['已阻断', 'warning'],
    not_proven: ['结果未证明', 'error'],
    published: ['已发布', 'success'],
    draft: ['草稿', 'default'],
    prerelease: ['预发布', 'warning'],
  }
  const [label, color] = presentations[status] || ['未知', 'default']
  return { label, color }
}

export function deliveryVersionActionKind(version, currentVersion) {
  if (!version || !SHA_PATTERN.test(String(version.gitSha || ''))) {
    return 'blocked'
  }
  if (!currentVersion) return 'promote'
  if (version.gitSha === currentVersion.gitSha) return 'current'
  const versionPublishedAt = Date.parse(String(version.publishedAt || ''))
  const currentPublishedAt = Date.parse(
    String(currentVersion.publishedAt || '')
  )
  if (
    !Number.isFinite(versionPublishedAt) ||
    !Number.isFinite(currentPublishedAt) ||
    versionPublishedAt === currentPublishedAt
  ) {
    return 'blocked'
  }
  return versionPublishedAt < currentPublishedAt ? 'rollback' : 'promote'
}
