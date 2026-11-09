const DATABASE_NAME = '__plush_erp_print_drafts__'
const STORE_NAME = 'drafts'
export const PRINT_DRAFT_VERSION = 1
export const PRINT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const preparedDrafts = new Map()
const databases = new WeakMap()

function printDraftRecordStatus(record, now = Date.now()) {
  if (
    record?.version !== PRINT_DRAFT_VERSION ||
    !Number.isFinite(record.updatedAt) ||
    record.updatedAt <= 0 ||
    record.updatedAt > now ||
    !record.draft ||
    typeof record.draft !== 'object' ||
    Array.isArray(record.draft)
  ) return 'unreadable'
  return now - record.updatedAt > PRINT_DRAFT_TTL_MS ? 'expired' : 'restored'
}

export function isCurrentPrintDraftRecord(record, now) {
  return printDraftRecordStatus(record, now) === 'restored'
}

export function readLocalPrintDraftRecord(storageKey, storage) {
  let raw
  try {
    raw = storage?.getItem(storageKey)
  } catch {
    return { status: 'unavailable' }
  }
  if (raw == null) return { status: 'missing' }
  let record
  try {
    record = JSON.parse(raw)
  } catch {
    return { status: 'unreadable' }
  }
  const status = printDraftRecordStatus(record)
  if (status === 'expired') {
    try { storage.removeItem(storageKey) } catch { /* already expired */ }
    return { status: 'missing' }
  }
  return { status, record }
}

function openDatabase(indexedDBLike) {
  if (!indexedDBLike) return Promise.resolve(null)
  if (databases.has(indexedDBLike)) return databases.get(indexedDBLike)
  const promise = new Promise((resolve) => {
    let request
    let settled = false
    const finish = (database) => {
      if (settled) {
        database?.close()
        return
      }
      settled = true
      clearTimeout(timeout)
      if (!database) databases.delete(indexedDBLike)
      resolve(database)
    }
    const timeout = setTimeout(() => finish(null), 3000)
    try {
      request = indexedDBLike.open(DATABASE_NAME, 2)
    } catch {
      finish(null)
      return
    }
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME)
      if (!store.indexNames.contains('updatedAt')) {
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    request.onerror = () => finish(null)
    request.onblocked = () => finish(null)
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        databases.delete(indexedDBLike)
      }
      finish(db)
    }
  })
  databases.set(indexedDBLike, promise)
  promise.then((database) => {
    if (!database && databases.get(indexedDBLike) === promise) {
      databases.delete(indexedDBLike)
    }
  })
  return promise
}

function indexedDBFor(windowLike) {
  try {
    return windowLike?.indexedDB
  } catch {
    return undefined
  }
}

export function readPreparedPrintDraft(storageKey) {
  const prepared = preparedDrafts.get(storageKey)
  const record = prepared?.record
  if (!isCurrentPrintDraftRecord(record)) {
    if (prepared?.checkPrimaryOnSave) prepared.record = undefined
    else preparedDrafts.delete(storageKey)
    return undefined
  }
  return record.draft
}

export async function preparePrintDraftStorage(
  storageKey,
  windowLike = globalThis.window
) {
  if (!storageKey) return 'missing'
  preparedDrafts.delete(storageKey)
  const db = await openDatabase(indexedDBFor(windowLike))
  let outcome = db ? await new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const now = Date.now()
      let inspected = 0
      let result = { status: 'missing' }
      // Only remove recognized expired drafts. A timestamp alone cannot prove that.
      const cleanup = store.index('updatedAt').openKeyCursor()
      cleanup.onsuccess = () => {
        const cursor = cleanup.result
        if (!cursor || cursor.key >= now - PRINT_DRAFT_TTL_MS || inspected >= 200) return
        if (cursor.primaryKey === storageKey) {
          cursor.continue()
          return
        }
        inspected += 1
        const candidate = store.get(cursor.primaryKey)
        candidate.onsuccess = () => {
          if (printDraftRecordStatus(candidate.result, now) === 'expired') {
            store.delete(cursor.primaryKey)
          }
          cursor.continue()
        }
      }
      const request = store.get(storageKey)
      request.onsuccess = () => {
        const record = request.result
        if (record === undefined) return
        const status = printDraftRecordStatus(record, now)
        if (status === 'expired') {
          store.delete(storageKey)
        } else {
          result = { status, record }
        }
      }
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => resolve({ status: 'unavailable' })
      transaction.onabort = () => resolve({ status: 'unavailable' })
    } catch {
      resolve({ status: 'unavailable' })
    }
  }) : { status: 'unavailable' }
  const checkPrimaryOnSave = outcome.status === 'unavailable'
  if (outcome.status === 'missing' || checkPrimaryOnSave) {
    try {
      const local = readLocalPrintDraftRecord(storageKey, windowLike?.localStorage)
      if (!checkPrimaryOnSave || local.status !== 'missing') outcome = local
    } catch {
      outcome = { status: 'unavailable' }
    }
  }
  if (outcome.status === 'restored' || checkPrimaryOnSave) {
    const record = outcome.status === 'restored' ? outcome.record : undefined
    preparedDrafts.set(storageKey, { record, checkPrimaryOnSave })
  }
  return outcome.status
}

export async function writePrintDraft(
  storageKey,
  draft,
  windowLike = globalThis.window
) {
  if (!storageKey) return false
  const db = await openDatabase(indexedDBFor(windowLike))
  if (!db) return false
  const record = { version: PRINT_DRAFT_VERSION, updatedAt: Date.now(), draft }
  const saved = await new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      if (preparedDrafts.get(storageKey)?.checkPrimaryOnSave) {
        // An inaccessible store may already contain a newer or unreadable copy.
        const existing = store.get(storageKey)
        existing.onsuccess = () => {
          if (existing.result !== undefined && printDraftRecordStatus(existing.result) !== 'expired') {
            transaction.abort()
            return
          }
          store.put(record, storageKey)
        }
      } else {
        store.put(record, storageKey)
      }
      transaction.oncomplete = () => resolve(true)
      transaction.onerror = () => resolve(false)
      transaction.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
  if (saved) {
    preparedDrafts.set(storageKey, { record })
    // 仅迁出能识别的旧草稿；无法读取的记录仍保留。
    try {
      const storage = windowLike?.localStorage
      if (readLocalPrintDraftRecord(storageKey, storage).status === 'restored') {
        storage.removeItem(storageKey)
      }
    } catch {
      /* best effort */
    }
  }
  return saved
}

// 只合并尚未开始的写入；已开始的事务串行完成，旧事务不能覆盖新输入。
export function createPrintDraftWriter({
  write,
  onStatus = () => {},
  delayMs = 160,
}) {
  let queued
  let timer
  let running
  let waiters = []
  let lastResult = true
  const flush = () => {
    clearTimeout(timer)
    if (running) {
      return running.then(() => (queued === undefined ? lastResult : flush()))
    }
    if (queued === undefined) return Promise.resolve(lastResult)
    const draft = queued
    queued = undefined
    const batch = waiters
    waiters = []
    running = Promise.resolve()
      .then(() => write(draft))
      .catch(() => false)
      .then((saved) => {
        lastResult = Boolean(saved)
        running = null
        batch.forEach((resolve) => resolve(lastResult))
        onStatus(
          queued !== undefined ? 'saving' : lastResult ? 'saved' : 'error'
        )
        return queued === undefined ? lastResult : flush()
      })
    return running
  }
  return {
    get pending() {
      return queued !== undefined || Boolean(running)
    },
    get unsaved() {
      return queued !== undefined || Boolean(running) || !lastResult
    },
    save(draft) {
      queued = draft
      onStatus('saving')
      clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
      return new Promise((resolve) => waiters.push(resolve))
    },
    flush,
  }
}
