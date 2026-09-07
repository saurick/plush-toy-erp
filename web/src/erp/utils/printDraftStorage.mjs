const DATABASE_NAME = '__plush_erp_print_drafts__'
const STORE_NAME = 'drafts'
export const PRINT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const preparedDrafts = new Map()
const databases = new WeakMap()

export function isCurrentPrintDraftRecord(record, now = Date.now()) {
  return Boolean(
    record &&
      record.version === 1 &&
      Number.isFinite(record.updatedAt) &&
      record.updatedAt > 0 &&
      record.updatedAt <= now &&
      now - record.updatedAt <= PRINT_DRAFT_TTL_MS &&
      record.draft &&
      typeof record.draft === 'object'
  )
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
  const record = preparedDrafts.get(storageKey)
  if (!isCurrentPrintDraftRecord(record)) {
    preparedDrafts.delete(storageKey)
    return undefined
  }
  return record.draft
}

export async function preparePrintDraftStorage(
  storageKey,
  windowLike = globalThis.window
) {
  if (!storageKey) return
  preparedDrafts.delete(storageKey)
  const db = await openDatabase(indexedDBFor(windowLike))
  if (!db) return
  await new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      // Expire by indexed timestamps, without loading other windows' potentially large image payloads.
      let expired = 0
      const cleanup = store.index('updatedAt').openKeyCursor()
      cleanup.onsuccess = () => {
        const cursor = cleanup.result
        if (
          cursor &&
          cursor.key < Date.now() - PRINT_DRAFT_TTL_MS &&
          expired < 200
        ) {
          store.delete(cursor.primaryKey)
          expired += 1
          cursor.continue()
        }
      }
      const request = store.get(storageKey)
      request.onsuccess = () => {
        if (isCurrentPrintDraftRecord(request.result)) {
          preparedDrafts.set(storageKey, request.result)
        } else {
          preparedDrafts.delete(storageKey)
          if (request.result) store.delete(storageKey)
        }
      }
      transaction.oncomplete = resolve
      transaction.onerror = resolve
      transaction.onabort = resolve
    } catch {
      resolve()
    }
  })
}

export async function writePrintDraft(
  storageKey,
  draft,
  windowLike = globalThis.window
) {
  if (!storageKey) return false
  const db = await openDatabase(indexedDBFor(windowLike))
  if (!db) return false
  const record = { version: 1, updatedAt: Date.now(), draft }
  const saved = await new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(record, storageKey)
      transaction.oncomplete = () => resolve(true)
      transaction.onerror = () => resolve(false)
      transaction.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
  if (saved) {
    preparedDrafts.set(storageKey, record)
    // 现有窗口草稿在 IndexedDB 提交成功后迁出旧存储；失败时仍保留原件。
    try {
      windowLike?.localStorage?.removeItem(storageKey)
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
