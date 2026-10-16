import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calendarMonthDays,
  readTaskCalendarState,
  shiftCalendarMonth,
  requireTaskCalendarResponse,
} from './workflowTaskCalendar.mjs'

test('calendar restores a valid selection and rejects impossible dates', () => {
  assert.deepEqual(
    readTaskCalendarState(
      'layout=calendar&month=2026-02&day=2026-02-29',
      '2026-10-14'
    ),
    { layout: 'calendar', month: '2026-02', selection: '2026-02-01' }
  )
  assert.equal(
    readTaskCalendarState('month=2026-10&day=overdue').selection,
    'overdue'
  )
  assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01')
  assert.equal(shiftCalendarMonth('2026-01', -1), '2025-12')
  const days = calendarMonthDays('2024-02')
  assert.equal(days.length, 42)
  assert.equal(days.filter(Boolean).length, 29)
  assert.equal(days[3], '2024-02-01')
})

test('calendar contract rejects stale dates, partial counts, terminal and mismatched tasks', () => {
  const query = {
    calendar_month: '2026-10',
    calendar_selection: '2026-10-14',
    limit: 30,
  }
  const task = {
    id: 1,
    version: 1,
    task_status_key: 'ready',
    due_at: Date.parse('2026-10-13T16:00:00Z') / 1000,
  }
  const calendar = {
    month: '2026-10',
    selection: '2026-10-14',
    days: { '2026-10-14': 1 },
    total: 1,
    overdue: 0,
    undated: 0,
    offset: 0,
    limit: 30,
    snapshot_at: task.due_at,
    revision: 'a'.repeat(64),
    items: [task],
  }
  assert.equal(requireTaskCalendarResponse({ calendar }, query), calendar)
  for (const patch of [
    { month: '2026-11' },
    { total: 2 },
    { items: [] },
    { days: { '2026-09-30': 1 } },
    { items: [{ ...task, task_status_key: 'done' }] },
    { items: [{ ...task, due_at: null }] },
  ]) {
    assert.throws(() =>
      requireTaskCalendarResponse(
        { calendar: { ...calendar, ...patch } },
        query
      )
    )
  }
})
