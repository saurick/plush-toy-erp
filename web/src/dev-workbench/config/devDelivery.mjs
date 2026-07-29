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
    !Array.isArray(operation.issues) ||
    !Array.isArray(operation.events)
  ) {
    throw new Error('delivery operation is invalid')
  }
  return operation
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
