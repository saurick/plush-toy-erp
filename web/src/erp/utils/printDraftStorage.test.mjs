import assert from 'node:assert/strict'
import test from 'node:test'
import { IDBFactory } from 'fake-indexeddb'
import { readPrintWorkspaceDraftSnapshot } from './printWorkspace.js'
import {
  createPrintDraftWriter,
  preparePrintDraftStorage,
  readPreparedPrintDraft,
  writePrintDraft,
  isCurrentPrintDraftRecord,
  PRINT_DRAFT_TTL_MS,
} from './printDraftStorage.mjs'

test('FL_print_workspace_window_draft__restores_current_structured_draft 草稿事务提交后恢复本窗口字段和图片', async () => {
  const removed = []
  const windowLike = {
    indexedDB: new IDBFactory(),
    localStorage: { removeItem: (key) => removed.push(key) },
  }
  assert.equal(
    await writePrintDraft(
      'account:a:window:1',
      {
        value: '甲',
        appendixImages: [{ dataURL: 'data:image/png;base64,AAAA' }],
      },
      windowLike
    ),
    true
  )
  assert.equal(
    await writePrintDraft('account:b:window:2', { value: '乙' }, windowLike),
    true
  )
  await preparePrintDraftStorage('account:a:window:1', windowLike)
  assert.deepEqual(readPreparedPrintDraft('account:a:window:1'), {
    value: '甲',
    appendixImages: [{ dataURL: 'data:image/png;base64,AAAA' }],
  })
  await preparePrintDraftStorage('account:b:window:2', windowLike)
  assert.deepEqual(readPreparedPrintDraft('account:b:window:2'), {
    value: '乙',
  })
  assert.deepEqual(removed, [], '没有旧草稿时无需清理本地存储')
})

test('存储不可用时保留旧草稿且不冒充保存成功', async () => {
  const windowLike = {
    get indexedDB() {
      throw new Error('denied')
    },
    localStorage: {
      removeItem() {
        assert.fail('不能删除旧草稿')
      },
    },
  }
  assert.equal(await writePrintDraft('disabled', {}, windowLike), false)
  assert.equal(await preparePrintDraftStorage('disabled', windowLike), 'unavailable')
  assert.equal(readPreparedPrintDraft('disabled'), undefined)
})

test('IndexedDB 暂时不可读时可恢复可验证的旧草稿，恢复连接后不覆盖原记录', async () => {
  const key = 'primary-unavailable-with-readable-local'
  const indexedDB = new IDBFactory()
  assert.equal(await writePrintDraft(key, { text: '主存储中的新内容' }, { indexedDB }), true)
  const legacy = JSON.stringify({ version: 1, updatedAt: Date.now(), draft: { text: '旧存储内容' } })
  let available = false
  const runtime = {
    get indexedDB() {
      if (!available) throw new DOMException('denied', 'SecurityError')
      return indexedDB
    },
    localStorage: {
      getItem: (name) => name === key ? legacy : null,
      removeItem() { assert.fail('未保存时不得删除旧草稿') },
    },
  }
  assert.equal(await preparePrintDraftStorage(key, runtime), 'restored')
  assert.deepEqual(readPreparedPrintDraft(key), { text: '旧存储内容' })
  const newKey = 'primary-unavailable-with-new-window'
  assert.equal(await preparePrintDraftStorage(newKey, runtime), 'unavailable')
  available = true
  assert.equal(await writePrintDraft(key, { text: '不能覆盖' }, runtime), false)
  assert.equal(await preparePrintDraftStorage(key, runtime), 'restored')
  assert.deepEqual(readPreparedPrintDraft(key), { text: '主存储中的新内容' })
  assert.equal(await writePrintDraft(newKey, { text: '新窗口' }, runtime), true)
})

test('主存储缺少记录且旧存储不可访问时报告读取受限', async () => {
  assert.equal(await preparePrintDraftStorage('blocked-local', {
    indexedDB: new IDBFactory(),
    localStorage: { getItem() { throw new DOMException('denied', 'SecurityError') } },
  }), 'unavailable')
})

test('恢复草稿区分缺失和不可读，清理只删除可识别的过期草稿', async () => {
  const indexedDB = new IDBFactory()
  const local = new Map([['legacy-corrupt', '{"version":']])
  const runtime = {
    indexedDB,
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      removeItem: (key) => local.delete(key),
    },
  }
  assert.equal(await preparePrintDraftStorage('missing', runtime), 'missing')
  assert.equal(await preparePrintDraftStorage('legacy-corrupt', runtime), 'unreadable')
  assert.equal(local.get('legacy-corrupt'), '{"version":')
  assert.equal(await writePrintDraft('legacy-corrupt', { text: '结构化草稿' }, runtime), true)
  assert.equal(local.get('legacy-corrupt'), '{"version":', '保存有效草稿也不能清除不可读原件')
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('__plush_erp_print_drafts__')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    const old = { updatedAt: Date.now() - PRINT_DRAFT_TTL_MS - 1, draft: { text: '旧草稿' } }
    await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite')
      tx.objectStore('drafts').put({ ...old, version: 99 }, 'unsupported')
      tx.objectStore('drafts').put({ ...old, version: 1 }, 'expired')
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    assert.equal(await preparePrintDraftStorage('unsupported', runtime), 'unreadable')
    assert.equal(await preparePrintDraftStorage('missing', runtime), 'missing')
    const read = (key) => new Promise((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    assert.equal((await read('unsupported')).version, 99)
    assert.equal(await read('expired'), undefined)
  } finally {
    db.close()
  }
})

test('put 请求成功后事务中止，必须报告未保存并保留原草稿', async () => {
  const factory = new IDBFactory()
  const originalOpen = factory.open.bind(factory)
  factory.open = (...args) => {
    const request = originalOpen(...args)
    request.addEventListener('success', () => {
      const db = request.result
      const transaction = db.transaction.bind(db)
      db.transaction = (...txArgs) => {
        const tx = transaction(...txArgs)
        const objectStore = tx.objectStore.bind(tx)
        tx.objectStore = (name) => {
          const store = objectStore(name)
          const put = store.put.bind(store)
          store.put = (...putArgs) => {
            const writing = put(...putArgs)
            writing.addEventListener('success', () => tx.abort())
            return writing
          }
          return store
        }
        return tx
      }
    })
    return request
  }
  let removed = false
  const runtime = {
    indexedDB: factory,
    localStorage: {
      removeItem() {
        removed = true
      },
    },
  }
  assert.equal(
    await writePrintDraft('abort-after-put', { text: '新内容' }, runtime),
    false
  )
  assert.equal(removed, false)
  await preparePrintDraftStorage('abort-after-put', runtime)
  assert.equal(readPreparedPrintDraft('abort-after-put'), undefined)
})

test('新草稿提交 IndexedDB 后刷新恢复新版本，旧 localStorage 草稿不遮挡', async () => {
  const key = 'account:a:current-draft'
  const store = new Map([
    [
      key,
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        draft: { text: '旧内容' },
      }),
    ],
  ])
  const runtime = {
    indexedDB: new IDBFactory(),
    localStorage: {
      getItem: (storageKey) => store.get(storageKey) || null,
      setItem() {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      },
      removeItem: (storageKey) => store.delete(storageKey),
    },
  }
  assert.equal(await writePrintDraft(key, { text: '新内容' }, runtime), true)
  assert.equal(store.has(key), false)
  await preparePrintDraftStorage(key, runtime)
  assert.deepEqual(readPrintWorkspaceDraftSnapshot(key), { text: '新内容' })
})

test('临时拒绝打开数据库后可重试，不缓存失败连接', async () => {
  const factory = new IDBFactory()
  const open = factory.open.bind(factory)
  factory.open = () => {
    throw new Error('temporary denial')
  }
  const runtime = { indexedDB: factory }
  assert.equal(
    await writePrintDraft('retry-open', { text: 'preserved' }, runtime),
    false
  )
  factory.open = open
  assert.equal(
    await writePrintDraft('retry-open', { text: 'preserved' }, runtime),
    true
  )
  await preparePrintDraftStorage('retry-open', runtime)
  assert.equal(readPreparedPrintDraft('retry-open').text, 'preserved')
})

test('连续输入合并排队写入，运行中的旧事务不能覆盖新输入', async () => {
  const calls = []
  const statuses = []
  let release
  const writer = createPrintDraftWriter({
    delayMs: 10000,
    onStatus: (status) => statuses.push(status),
    write: async (draft) => {
      calls.push(draft)
      if (calls.length === 1) {
        await new Promise((resolve) => {
          release = resolve
        })
      }
      return true
    },
  })
  const first = writer.save('first')
  writer.save('merged')
  const flushing = writer.flush()
  await Promise.resolve()
  assert.deepEqual(calls, ['merged'])
  const last = writer.save('latest')
  assert.equal(writer.unsaved, true)
  release()
  assert.equal(await flushing, true)
  assert.equal(await first, true)
  assert.equal(await last, true)
  assert.deepEqual(calls, ['merged', 'latest'])
  assert.equal(writer.unsaved, false)
  assert.equal(statuses.at(-1), 'saved')
})

test('失败的写入保持未保存状态，用户再次修改后可恢复', async () => {
  let succeed = false
  const writer = createPrintDraftWriter({
    write: async () => succeed,
    delayMs: 10000,
  })
  writer.save('draft')
  assert.equal(await writer.flush(), false)
  assert.equal(writer.unsaved, true)
  succeed = true
  writer.save('retry')
  assert.equal(await writer.flush(), true)
  assert.equal(writer.unsaved, false)
})

test('过期、未来时间和错误版本的草稿不恢复', () => {
  const now = Date.now()
  const record = { version: 1, draft: {}, updatedAt: now }
  assert.equal(isCurrentPrintDraftRecord(record, now), true)
  for (const invalid of [
    { ...record, version: 0 },
    { ...record, updatedAt: now + 1 },
    { ...record, updatedAt: now - PRINT_DRAFT_TTL_MS - 1 },
    { ...record, draft: null },
  ]) {
    assert.equal(isCurrentPrintDraftRecord(invalid, now), false)
  }
})
