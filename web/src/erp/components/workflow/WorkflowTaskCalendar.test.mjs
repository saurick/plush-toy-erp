import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { businessFormHarness, deferredFormRequest } from '../../../../scripts/test/businessFormHarness.mjs'
import { WORKFLOW_TASKS_CHANGED } from '../../utils/workflowTaskChanges.mjs'

function calendarReply(query) {
  const items = query.calendar_selection === 'undated'
    ? [{ id: 1, version: 1, task_name: '日历跟进', task_status_key: 'ready', due_at: null }]
    : []
  return { data: { calendar: {
    month: query.calendar_month,
    selection: query.calendar_selection,
    offset: query.calendar_offset,
    limit: query.limit,
    days: {},
    overdue: 0,
    undated: 1,
    total: items.length,
    snapshot_at: 1,
    revision: 'a'.repeat(64),
    items,
  } } }
}

async function calendarHarness(t, mobile) {
  const calls = []
  const pending = []
  const notices = []
  const harness = await businessFormHarness(t, {
    rpc: (method, query, options) => {
      calls.push({ method, query, options })
      return pending.shift()?.promise ?? calendarReply(query)
    },
  })
  const [{ default: Calendar }, { registerAntdAppApis }] = await Promise.all([
    import('./WorkflowTaskCalendar.jsx'),
    import('../../../common/utils/antdApp.js'),
  ])
  registerAntdAppApis({ message: Object.fromEntries(['success', 'error'].map((type) => [
    type, (notice) => notices.push({ type, text: notice.content.props.children }),
  ])) })
  t.after(() => registerAntdAppApis())
  const render = (selection = 'undated', refreshKey = 0) => harness.render(createElement(Calendar, {
    state: { month: '2026-10', selection, change() {} },
    query: mobile ? { role_key: 'engineering' } : {},
    scopeKey: 'calendar-test',
    onOpenTask() {},
    mobile,
    refreshKey,
  }))
  await render()
  return {
    ...harness,
    calls,
    notices,
    render,
    unmount: () => harness.render(null),
    refresh: () => document.querySelector('button[aria-label="刷新待办日历"]'),
    defer() {
      const request = deferredFormRequest()
      pending.push(request)
      return request
    },
  }
}

for (const mobile of [false, true]) {
  const device = mobile ? 'mobile' : 'desktop'
  test(`${device} calendar refresh reports completion once and rejects repeated clicks`, async (t) => {
    const h = await calendarHarness(t, mobile)
    await act(async () => window.dispatchEvent(new window.Event(WORKFLOW_TASKS_CHANGED)))
    await h.render('undated', 1)
    assert.equal(h.calls.length, 3)
    assert.deepEqual(h.notices, [], 'initial and automatic reads remain quiet')
    const held = h.defer()
    await act(async () => { h.refresh().click(); h.refresh().click() })
    assert.equal(h.calls.length, 4, 'a rapid double click starts only one request')
    assert.equal(h.refresh().disabled, true)
    assert.equal(h.refresh().getAttribute('aria-busy'), 'true')
    assert.deepEqual(h.notices, [], 'success waits for the response')
    await act(async () => held.resolve(calendarReply(h.calls.at(-1).query)))
    assert.deepEqual(h.notices, [{ type: 'success', text: '待办日历已刷新' }])
    assert.equal(h.refresh().disabled, false)
  })

  test(`${device} failed calendar refresh keeps the agenda and can recover`, async (t) => {
    const h = await calendarHarness(t, mobile)
    const held = h.defer()
    await h.click(h.refresh())
    await act(async () => held.reject(new Error('Unexpected response payload')))
    assert.deepEqual(h.notices, [{ type: 'error', text: '待办日历刷新失败，请重试' }])
    assert.ok(document.querySelector('[data-task-id="1"]'), 'previously loaded tasks remain available')
    assert.ok(h.button('重新加载'), 'the error has a persistent retry action')
    assert.equal(h.refresh().disabled, false)
    await h.click(h.refresh())
    assert.equal(h.notices.at(-1).type, 'success')
    assert.equal(h.button('重新加载'), undefined)
  })

  test(`${device} cancelled calendar refresh never reports a stale result`, async (t) => {
    const h = await calendarHarness(t, mobile)
    const held = h.defer()
    await h.click(h.refresh())
    const obsolete = h.calls.at(-1)
    await h.render('2026-10-22')
    assert.equal(obsolete.options.signal.aborted, true)
    await act(async () => held.resolve(calendarReply(obsolete.query)))
    assert.deepEqual(h.notices, [])
    assert.equal(document.querySelector('[data-task-id="1"]'), null)
    const unmounted = h.defer()
    await h.click(h.refresh())
    const last = h.calls.at(-1)
    await h.unmount()
    await act(async () => unmounted.reject(new Error('Unexpected response payload')))
    assert.equal(last.options.signal.aborted, true)
    assert.deepEqual(h.notices, [], 'cancelled failures are also quiet')
  })
}
