import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { readMobileTaskDraftBackup } from '../utils/mobileTaskHistory.mjs'

async function mountDraft(t) {
  const ui = await createReactTestHarness(t)
  const { default: useMobileTaskDraftHistory } =
    await import('./useMobileTaskDraftHistory.js')
  window.history.replaceState(
    {
      mobileRoleTasksScreen: 'action',
      mobileRoleTasksTaskID: 7,
      mobileRoleTasksScope: 'scope-a',
      retained: true,
    },
    ''
  )
  const pending = new Map()
  let nextID = 0
  const originalTimeout = window.setTimeout
  const originalClear = window.clearTimeout
  const testWindow = window
  window.setTimeout = (callback) => {
    pending.set(++nextID, callback)
    return nextID
  }
  window.clearTimeout = (id) => pending.delete(id)
  t.after(() => {
    testWindow.setTimeout = originalTimeout
    testWindow.clearTimeout = originalClear
  })
  let state
  let props = {
    action: 'done',
    approvedQuantity: '0',
    reason: '草稿',
    receipt: null,
    scopeKey: 'scope-a',
    taskID: 7,
  }
  function Consumer(value) {
    state = useMobileTaskDraftHistory(value)
    return null
  }
  const render = async (patch = {}) => {
    props = { ...props, ...patch }
    await ui.render(createElement(Consumer, props))
  }
  await render()
  return {
    ...ui,
    render,
    pending,
    get current() {
      return state
    },
    runTimers: () =>
      ui.act(async () => {
        const callbacks = [...pending.values()]
        pending.clear()
        callbacks.forEach((callback) => callback())
      }),
  }
}

test('draft updates coalesce and preserve unrelated history without repeating identical writes', async (t) => {
  const ui = await mountDraft(t)
  const replace = window.history.replaceState.bind(window.history)
  let writes = 0
  window.history.replaceState = (...args) => {
    writes++
    return replace(...args)
  }
  await ui.render({ reason: '修改一' })
  await ui.render({ reason: '修改二' })
  assert.equal(ui.pending.size, 1)
  assert.equal(writes, 0)
  await ui.runTimers()
  assert.equal(writes, 1)
  assert.equal(window.history.state.mobileRoleTasksReason, '修改二')
  assert.equal(window.history.state.mobileRoleTasksApprovedQuantity, '0')
  assert.equal(window.history.state.retained, true)
  assert.equal(ui.current.flush(), true)
  assert.equal(writes, 1)
})

test('a delayed draft cannot overwrite another task or access scope', async (t) => {
  const ui = await mountDraft(t)
  await ui.render({ scopeKey: 'scope-b', reason: '另一个账号的内容' })
  await ui.runTimers()
  assert.equal(ui.current.flush(), false)
  assert.equal(window.history.state.mobileRoleTasksReason, undefined)
  await ui.render({ scopeKey: 'scope-a', taskID: 8 })
  await ui.runTimers()
  assert.equal(window.history.state.mobileRoleTasksReason, undefined)
})

test('pagehide and unmount persist the current action draft and remove pending work', async (t) => {
  const ui = await mountDraft(t)
  await ui.render({ reason: '离开前保留' })
  await ui.act(async () => window.dispatchEvent(new window.Event('pagehide')))
  assert.equal(window.history.state.mobileRoleTasksReason, '离开前保留')
  assert.equal(ui.pending.size, 0)
  await ui.render({ reason: '卸载前保留' })
  await ui.unmount()
  assert.equal(window.history.state.mobileRoleTasksReason, '卸载前保留')
  assert.equal(ui.pending.size, 0)
})

test('history quota errors retain a scoped backup and show one recoverable warning', async (t) => {
  const ui = await mountDraft(t)
  const { message } = await import('@/common/utils/antdApp')
  const { warning } = message
  const warnings = []
  message.warning = (value) => warnings.push(value)
  t.after(() => {
    message.warning = warning
  })
  window.history.replaceState = () => {
    throw new Error('history quota exceeded')
  }
  assert.equal(ui.current.flush(), false)
  assert.equal(ui.current.flush(), false)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /请先不要刷新/u)
  assert.equal(ui.current.backup(), true)
  assert.deepEqual(readMobileTaskDraftBackup('scope-a', 7), {
    action: 'done',
    approvedQuantity: '0',
    reason: '草稿',
  })
})

test('a result receipt stops draft persistence while history navigation settles', async (t) => {
  const ui = await mountDraft(t)
  await ui.render({ receipt: { status: 'confirmed' } })
  assert.equal(ui.pending.size, 0)
  assert.equal(ui.current.flush(), false)
  assert.equal(window.history.state.mobileRoleTasksReason, undefined)
})
