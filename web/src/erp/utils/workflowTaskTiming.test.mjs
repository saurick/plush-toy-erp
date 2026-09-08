import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatWorkflowTaskTime,
  getWorkflowTaskBlockedAt,
  getWorkflowTaskTiming,
} from './workflowTaskTiming.mjs'

const seconds = (year, month, day, hour = 9, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime() / 1000
const nowMs = seconds(2026, 9, 8, 10) * 1000
const task = {
  id: 7,
  version: 10,
  owner_role_key: 'engineering',
  task_status_key: 'ready',
  created_at: seconds(2026, 9, 7, 15, 20),
  due_at: seconds(2026, 9, 8, 15),
}
const timing = (value, options = {}) =>
  getWorkflowTaskTiming(value, { nowMs, ...options })

test('pending tasks separate role arrival from deadline without adding other timestamps', () => {
  const rows = timing(task)
  assert.deepEqual(
    rows.map(({ key, label, value, tone }) => ({ key, label, value, tone })),
    [
      {
        key: 'arrived',
        label: '进入本岗',
        value: '昨天 15:20',
        tone: 'neutral',
      },
      {
        key: 'due',
        label: '截止',
        value: '今天 15:00 · 即将到期',
        tone: 'warning',
      },
    ]
  )
  assert.equal(rows[0].dateTime, new Date(task.created_at * 1000).toISOString())
  assert.equal(rows[0].title, '进入本岗 2026年9月7日 15:20')
})

test('urge, attachment refresh, same-role assignment and resume never reset arrival', () => {
  const initial = timing(task)[0]
  for (const change of [
    { updated_at: nowMs / 1000, last_urged_at: nowMs / 1000, urge_count: 3 },
    { updated_at: nowMs / 1000, attachment_count: 2 },
    { updated_at: nowMs / 1000, assignee_id: 8 },
    { updated_at: nowMs / 1000, assignee_id: null },
    { updated_at: nowMs / 1000, task_status_key: 'blocked' },
    { updated_at: nowMs / 1000, task_status_key: 'ready', blocked_reason: '' },
  ]) {
    assert.deepEqual(timing({ ...task, ...change })[0], initial)
  }
  assert.equal(
    timing({
      ...task,
      id: 8,
      owner_role_key: 'purchase',
      created_at: nowMs / 1000,
    })[0].value,
    '今天 10:00'
  )
})

test('absent or invalid timestamps never borrow updated_at, payload dates or the current time', () => {
  for (const missing of [
    undefined,
    null,
    0,
    -1,
    '',
    'unknown',
    Infinity,
    NaN,
    true,
    {},
    9e99,
  ]) {
    const value = {
      ...task,
      created_at: missing,
      due_at: missing,
      updated_at: nowMs / 1000,
      payload: { created_at: task.created_at, due_at: task.due_at },
    }
    assert.deepEqual(timing(value), [])
    assert.deepEqual(
      timing(value, { detail: true }).map(({ value }) => value),
      ['未记录', '未设置截止']
    )
  }
  assert.deepEqual(
    timing({ ...task, due_at: null }).map(({ key }) => key),
    ['arrived']
  )
})

test('terminal task lists show actual end time and never flag the previous deadline as overdue', () => {
  for (const [status, label] of [
    ['done', '完成'],
    ['rejected', '退回'],
    ['withdrawn', '撤回'],
  ]) {
    const ended = {
      ...task,
      task_status_key: status,
      due_at: seconds(2026, 9, 7),
      completed_at: seconds(2026, 9, 8, 9, 30),
    }
    const rows = timing(ended)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].label, label)
    assert.equal(rows[0].value, '今天 09:30')
    assert.equal(rows[0].tone, 'neutral')
    const detail = timing(ended, { detail: true })
    assert.deepEqual(
      detail.map(({ key }) => key),
      ['arrived', 'due', 'ended']
    )
    assert.equal(detail.at(-1).label, `${label}时间`)
    assert.equal(detail.at(-1).value, '2026年9月8日 09:30')
    assert(detail.every(({ tone }) => tone === 'neutral'))
    assert.deepEqual(timing({ ...ended, completed_at: null }), [])
    assert.equal(
      timing({ ...ended, completed_at: null }, { detail: true }).at(-1).value,
      '未记录'
    )
  }
})

test('date labels stay explicit across midnight and year boundaries', () => {
  assert.equal(
    formatWorkflowTaskTime(seconds(2026, 9, 8), { nowMs }),
    '今天 09:00'
  )
  assert.equal(
    formatWorkflowTaskTime(seconds(2026, 9, 6), { nowMs }),
    '9月6日 09:00'
  )
  assert.equal(
    formatWorkflowTaskTime(seconds(2025, 9, 6), { nowMs }),
    '2025年9月6日 09:00'
  )
  assert.equal(
    formatWorkflowTaskTime(seconds(2025, 12, 31, 23, 50), {
      nowMs: seconds(2026, 1, 1, 0, 10) * 1000,
    }),
    '昨天 23:50'
  )
  assert.equal(
    formatWorkflowTaskTime(String(task.created_at), { exact: true }),
    '2026年9月7日 15:20'
  )
  const overdue = timing({ ...task, due_at: seconds(2026, 9, 8, 9, 59) })[1]
  assert.equal(overdue.tone, 'danger')
  assert.match(overdue.value, /已超时$/u)
  assert.equal(
    timing({ ...task, due_at: seconds(2026, 9, 10) })[1].tone,
    'neutral'
  )
})

const transition = (version, from, to, extra = {}) => ({
  task_id: task.id,
  task_version: version,
  from_status_key: from,
  to_status_key: to,
  created_at: task.created_at + version * 60,
  ...extra,
})

test('current blockage starts at the latest real transition, ignoring later urges and assignments', () => {
  const blocked = { ...task, task_status_key: 'blocked' }
  const events = [
    transition(10, 'blocked', 'blocked', { event_type: 'urge_task' }),
    transition(9, 'blocked', 'blocked', { event_type: 'assigned' }),
    transition(8, 'ready', 'blocked'),
    transition(7, 'blocked', 'ready'),
    transition(5, 'ready', 'blocked'),
    transition(1, '', 'ready', { event_type: 'created' }),
  ]
  assert.equal(
    getWorkflowTaskBlockedAt(blocked, events),
    task.created_at + 8 * 60
  )
  assert.equal(
    getWorkflowTaskBlockedAt(blocked, [...events].reverse()),
    task.created_at + 8 * 60
  )
  assert.equal(timing(blocked, { events }).length, 2)
  assert.equal(timing(blocked, { events, detail: true }).at(-1).key, 'blocked')
  assert.equal(getWorkflowTaskBlockedAt(task, events), null)
})

test('truncated, missing, mismatched and stale events do not fabricate a blockage date', () => {
  const blocked = { ...task, task_status_key: 'blocked' }
  for (const events of [
    [],
    [transition(8, 'ready', 'blocked')],
    [transition(10, 'blocked', 'blocked')],
    [transition(8, 'ready', 'blocked', { task_id: 77 })],
    [transition(11, 'ready', 'blocked')],
    [transition(10, 'blocked', 'ready'), transition(8, 'ready', 'blocked')],
    [
      transition(8, 'ready', 'blocked', { created_at: 0 }),
      transition(5, 'ready', 'blocked'),
    ],
  ]) {
    assert.equal(getWorkflowTaskBlockedAt(blocked, events), null)
  }
  const createdBlocked = transition(1, '', 'blocked', { event_type: 'created' })
  assert.equal(
    getWorkflowTaskBlockedAt({ ...blocked, version: 1 }, [createdBlocked]),
    createdBlocked.created_at
  )
})
