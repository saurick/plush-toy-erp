import assert from 'node:assert/strict'
import test from 'node:test'
import { IDBFactory } from 'fake-indexeddb'
import { clearRetiredPrintWindowState } from './printWindowStorageCleanup.mjs'
import {
  preparePrintDraftStorage,
  readPreparedPrintDraft,
  writePrintDraft,
} from '../../erp/utils/printDraftStorage.mjs'

test('退出清理旧窗口 HTML 缓存，同时保留账号草稿及其他浏览器数据', async () => {
  const indexedDB = new IDBFactory()
  const stateDatabase = await new Promise((resolve) => {
    const request = indexedDB.open('__plush_erp_print_window_state_db__', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('states')
    request.onsuccess = () => resolve(request.result)
  })
  await new Promise((resolve) => {
    const tx = stateDatabase.transaction('states', 'readwrite')
    tx.objectStore('states').put({ windowHTML: '<p>旧合同</p>' }, 'old-window')
    tx.oncomplete = resolve
  })
  stateDatabase.close()
  const store = new Map([
    ['__plush_erp_print_window_state__:old-window', '<p>旧合同</p>'],
    ['__plush_erp_print_workspace_draft__:v3:account:42', '原账号草稿'],
    ['theme', 'dark'],
  ])
  const localStorage = {
    get length() {
      return store.size
    },
    key: (index) => [...store.keys()][index],
    removeItem: (key) => store.delete(key),
  }
  const windowLike = { indexedDB, localStorage }
  await writePrintDraft(
    'scoped-original-account',
    { contract: '原账号合同' },
    windowLike
  )
  clearRetiredPrintWindowState(windowLike)
  // Queueing another deletion waits for the first request to finish.
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(
      '__plush_erp_print_window_state_db__'
    )
    request.onsuccess = resolve
    request.onerror = reject
  })
  assert.equal(store.has('__plush_erp_print_window_state__:old-window'), false)
  assert.equal(
    store.get('__plush_erp_print_workspace_draft__:v3:account:42'),
    '原账号草稿'
  )
  assert.equal(store.get('theme'), 'dark')
  await preparePrintDraftStorage('scoped-original-account', windowLike)
  assert.equal(
    readPreparedPrintDraft('scoped-original-account').contract,
    '原账号合同'
  )
  assert.deepEqual(
    (await indexedDB.databases()).map((db) => db.name),
    ['__plush_erp_print_drafts__']
  )
})

test('浏览器拒绝清理时不会阻断认证', () => {
  assert.doesNotThrow(() =>
    clearRetiredPrintWindowState({
      get localStorage() {
        throw new Error('denied')
      },
      get indexedDB() {
        throw new Error('denied')
      },
    })
  )
})
