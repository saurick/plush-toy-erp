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
  { now = () => new Date().toISOString(), signal } = {}
) {
  const normalizedKey = requireSnapshotKey(key)
  if (typeof load !== 'function') {
    return Promise.reject(new Error('开发台摘要读取器无效'))
  }
  if (signal?.aborted) return Promise.reject(signal.reason)
  let entry = inFlightLoads.get(normalizedKey)
  if (!entry) {
    const controller = new AbortController()
    entry = { controller, subscribers: 0, retained: false }
    entry.request = Promise.resolve()
      .then(() => load({ signal: controller.signal }))
      .then((summary) => {
        controller.signal.throwIfAborted()
        return writeDevSummarySnapshot(normalizedKey, summary, now())
      })
      .finally(() => {
        if (inFlightLoads.get(normalizedKey) === entry) inFlightLoads.delete(normalizedKey)
      })
    inFlightLoads.set(normalizedKey, entry)
  }
  if (!signal) {
    entry.retained = true
    return entry.request
  }
  // One page leaving must not cancel another page's shared read.
  entry.subscribers += 1
  return new Promise((resolve, reject) => {
    const release = () => {
      signal.removeEventListener('abort', abort)
      entry.subscribers -= 1
    }
    const abort = () => {
      release()
      if (!entry.subscribers && !entry.retained) {
        if (inFlightLoads.get(normalizedKey) === entry) inFlightLoads.delete(normalizedKey)
        entry.controller.abort()
      }
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    entry.request.then((value) => {
      if (!signal.aborted) { release(); resolve(value) }
    }, (error) => {
      if (!signal.aborted) { release(); reject(error) }
    })
  })
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
  const normalizedKey = requireSnapshotKey(key)
  snapshots.delete(normalizedKey)
  inFlightLoads.get(normalizedKey)?.controller.abort()
  inFlightLoads.delete(normalizedKey)
}
