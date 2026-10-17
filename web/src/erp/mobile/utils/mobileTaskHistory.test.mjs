import assert from 'node:assert/strict'
import test from 'node:test'
import { mobileTaskQueryScope } from '../../utils/mobileTaskQueries.mjs'
import {
  clearMobileTaskDraftBackup,
  persistMobileTaskDraftBackup,
  readMobileTaskDraftBackup,
  readMobileTaskHistoryState,
  readMobileTaskListLimits,
  readMobileTaskQueryPages,
} from './mobileTaskHistory.mjs'

function browser(t, state = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const storage = new Map()
  const sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { history: { state }, sessionStorage },
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else delete globalThis.window
  })
  return { storage, sessionStorage }
}

test('history reads merge return contexts without mutating browser state', (t) => {
  const state = {
    mobileRoleTasksKeyword: 'current',
    retained: true,
    usr: {
      mobileRoleTasksReturn: {
        returnListState: { mobileRoleTasksKeyword: 'older', limit: 50 },
      },
      workflowTaskReturn: {
        returnListState: { mobileRoleTasksKeyword: 'returned' },
      },
    },
  }
  browser(t, state)
  const restored = readMobileTaskHistoryState()
  assert.equal(restored.mobileRoleTasksKeyword, 'returned')
  assert.equal(restored.limit, 50)
  assert.equal(restored.retained, true)
  restored.mobileRoleTasksKeyword = 'edited'
  assert.equal(state.mobileRoleTasksKeyword, 'current')
})

test('draft backups isolate accounts, roles and tasks and preserve an explicit zero quantity', (t) => {
  const { storage } = browser(t)
  const draft = {
    taskID: 7,
    action: 'done',
    approvedQuantity: '0',
    reason: '核对后同意',
  }
  assert.equal(persistMobileTaskDraftBackup('boss|account-a', draft), true)
  assert.deepEqual(readMobileTaskDraftBackup('boss|account-a', 7), {
    action: 'done',
    approvedQuantity: '0',
    reason: '核对后同意',
  })
  assert.equal(readMobileTaskDraftBackup('boss|account-b', 7), null)
  assert.equal(readMobileTaskDraftBackup('finance|account-a', 7), null)
  assert.equal(readMobileTaskDraftBackup('boss|account-a', 8), null)
  assert.equal(
    persistMobileTaskDraftBackup('boss|account-a', { ...draft, taskID: 8 }),
    true
  )
  assert.equal(clearMobileTaskDraftBackup('boss|account-a', 7), true)
  assert.equal(readMobileTaskDraftBackup('boss|account-a', 7), null)
  assert.ok(readMobileTaskDraftBackup('boss|account-a', 8))
  assert.equal(storage.size, 1)
})

test('invalid or mismatched stored drafts cannot be restored', (t) => {
  const { storage } = browser(t)
  persistMobileTaskDraftBackup('scope-a', { taskID: 7, action: 'done' })
  const key = [...storage.keys()][0]
  for (const value of [
    '{',
    'null',
    '[]',
    JSON.stringify({ scopeKey: 'scope-b', taskID: '7', action: 'done' }),
    JSON.stringify({ scopeKey: 'scope-a', taskID: '8', action: 'done' }),
  ]) {
    storage.set(key, value)
    assert.equal(readMobileTaskDraftBackup('scope-a', 7), null)
  }
  assert.equal(
    persistMobileTaskDraftBackup('', { taskID: 7, action: 'done' }),
    false
  )
  assert.equal(
    persistMobileTaskDraftBackup('scope-a', { taskID: 7, action: '' }),
    false
  )
})

test('unavailable browser storage leaves the current draft usable', (t) => {
  const { sessionStorage } = browser(t)
  const unavailable = () => {
    throw new Error('storage unavailable')
  }
  sessionStorage.getItem = unavailable
  sessionStorage.setItem = unavailable
  sessionStorage.removeItem = unavailable
  assert.equal(
    persistMobileTaskDraftBackup('scope-a', { taskID: 7, action: 'done' }),
    false
  )
  assert.equal(readMobileTaskDraftBackup('scope-a', 7), null)
  assert.equal(clearMobileTaskDraftBackup('scope-a', 7), false)
})

test('query history restores peer filters only within the exact access and query scope', () => {
  const active = { keyword: 'ORDER-7', sortKey: 'due', statusKey: 'ready' }
  const history = {
    mobileRoleTasksScope: mobileTaskQueryScope('scope-a', active),
    mobileRoleTasksQueryPages: {
      tasks: { keyword: 'old' },
      risks: { keyword: 'QC-8', statusKey: 'blocked' },
      history: { keyword: 'DONE-9', sortKey: 'oldest' },
    },
  }
  const restored = readMobileTaskQueryPages(history, 'scope-a', 'tasks', active)
  assert.equal(restored.tasks.keyword, 'ORDER-7')
  assert.equal(restored.risks.keyword, 'QC-8')
  assert.equal(restored.history.keyword, 'DONE-9')
  assert.equal(restored.history.sortKey, 'completed')
  const foreign = readMobileTaskQueryPages(history, 'scope-b', 'tasks', active)
  assert.equal(foreign.risks.keyword, '')
  assert.equal(foreign.history.keyword, '')
  assert.equal(foreign.tasks.keyword, 'ORDER-7')
})

test('restored list limits reject invalid values and bound deep history recovery', () => {
  assert.deepEqual(
    readMobileTaskListLimits({
      todo: 50,
      history: 5000,
      negative: -1,
      fraction: 1.5,
      infinite: Infinity,
    }),
    { todo: 50, history: 1000 }
  )
  assert.deepEqual(readMobileTaskListLimits([]), {})
  assert.deepEqual(readMobileTaskListLimits(null), {})
})
