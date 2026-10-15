const SNAPSHOT_KEY_PATTERN = /^[a-z][a-z0-9-]{2,63}$/u

const snapshots = new Map()
const inFlightLoads = new Map()

function requireSnapshotKey(key) {
  const normalized = String(key || '').trim()
  if (!SNAPSHOT_KEY_PATTERN.test(normalized)) {
    throw new Error('开发台摘要缓存键无效')
  }
  return normalized
}

function requireSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('开发台摘要无效')
  }
  return summary
}

function normalizeCheckedAt(value) {
  const timestamp = new Date(value)
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error('开发台摘要核对时间无效')
  }
  return timestamp.toISOString()
}

export function readDevSummarySnapshot(key) {
  return snapshots.get(requireSnapshotKey(key)) || null
}

function writeDevSummarySnapshot(
  key,
  summary,
  checkedAt = new Date().toISOString()
) {
  const normalizedKey = requireSnapshotKey(key)
  const snapshot = Object.freeze({
    summary: requireSummary(summary),
    checkedAt: normalizeCheckedAt(checkedAt),
  })
  snapshots.set(normalizedKey, snapshot)
  return snapshot
}

export function updateDevSummarySnapshot(key, update) {
  const normalizedKey = requireSnapshotKey(key)
  const current = snapshots.get(normalizedKey)
  if (!current || typeof update !== 'function') return current || null
  return writeDevSummarySnapshot(
    normalizedKey,
    update(current.summary),
    current.checkedAt
  )
}

export function loadDevSummarySnapshot(
  key,
  load,
  { now = () => new Date().toISOString() } = {}
) {
  const normalizedKey = requireSnapshotKey(key)
  if (typeof load !== 'function') {
    return Promise.reject(new Error('开发台摘要读取器无效'))
  }
  const inFlight = inFlightLoads.get(normalizedKey)
  if (inFlight) return inFlight

  const request = Promise.resolve()
    .then(load)
    .then((summary) => writeDevSummarySnapshot(normalizedKey, summary, now()))
    .finally(() => {
      if (inFlightLoads.get(normalizedKey) === request) {
        inFlightLoads.delete(normalizedKey)
      }
    })
  inFlightLoads.set(normalizedKey, request)
  return request
}

export function formatDevSummaryCheckedAt(value) {
  if (!Number.isFinite(Date.parse(value))) return '尚未核对'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(value))
}

export function clearDevSummarySnapshot(key) {
  snapshots.delete(requireSnapshotKey(key))
}
