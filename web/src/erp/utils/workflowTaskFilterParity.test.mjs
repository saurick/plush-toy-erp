import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMobileRoleTaskQuery, mobileTaskQueryScope, normalizeMobileTaskQueryOptions, readMobileTaskQueryHistory } from './mobileTaskQueries.mjs'
import { buildWorkflowTaskBoardRequest, readWorkflowTaskBoardFiltersFromSearch, writeWorkflowTaskBoardFiltersToSearch, TASK_BOARD_DUE_OPTIONS } from './workflowTaskBoard.mjs'
import { WORKFLOW_TASK_DUE_OPTIONS } from './workflowTaskListFilters.mjs'

test('任务截止和来源在电脑与手机使用相同参数，改变条件使旧分页失效', () => {
  assert.equal(TASK_BOARD_DUE_OPTIONS, WORKFLOW_TASK_DUE_OPTIONS)
  for (const due of ['overdue', 'dueSoon', 'noDue']) {
    const options = { due, sourceType: 'sales_order' }
    const mobile = buildMobileRoleTaskQuery({ roleKey: 'sales', viewKey: 'todo', ...options })
    const desktop = buildWorkflowTaskBoardRequest(options)
    assert.equal(mobile.due, desktop.due)
    assert.equal(mobile.source_type, desktop.source_type)
    assert.notEqual(mobileTaskQueryScope('scope', options), mobileTaskQueryScope('scope', {}))
    const normalized = normalizeMobileTaskQueryOptions(options)
    const restored = readMobileTaskQueryHistory({ mobileRoleTasksScope: mobileTaskQueryScope('scope', normalized), mobileRoleTasksDiscovery: options }, 'scope')
    assert.equal(restored.due, due)
    assert.equal(restored.sourceType, 'sales_order')
  }
})

test('电脑已办保留精确处理日期，手机清除旧日期并拒绝隐藏范围', () => {
  const dates = { period: 'custom', dateFrom: '2026-10-16', dateTo: '2026-10-18' }
  const url = writeWorkflowTaskBoardFiltersToSearch('', { lane: 'finished', ...dates })
  const filters = readWorkflowTaskBoardFiltersFromSearch(url)
  const desktop = buildWorkflowTaskBoardRequest(filters)
  assert.equal(desktop.period, 'custom')
  assert.equal(desktop.date_from, dates.dateFrom)
  assert.equal(desktop.date_to, dates.dateTo)
  const normalized = normalizeMobileTaskQueryOptions(dates, true)
  assert.deepEqual(normalized, { keyword: '', sortKey: 'completed', statusKey: '', period: '', dateFrom: '', dateTo: '' })
  const restored = readMobileTaskQueryHistory({
    mobileRoleTasksScope: mobileTaskQueryScope('scope', normalized),
    mobileRoleTasksSort: 'completed',
    mobileRoleTasksDates: dates,
  }, 'scope')
  assert.deepEqual(restored, normalized)
  assert.deepEqual(buildMobileRoleTaskQuery({ roleKey: 'sales', viewKey: 'history', ...restored }), {
    sort_key: 'completed', view_key: 'history', role_key: 'sales', limit: 50,
  })
  assert.throws(() => buildMobileRoleTaskQuery({ roleKey: 'sales', viewKey: 'history', ...dates }), /任务筛选或排序无效/u)
  const changed = buildWorkflowTaskBoardRequest({ ...filters, lane: 'all' })
  assert.equal(changed.period, undefined)
  assert.equal(changed.date_from, undefined)
  assert.equal(changed.date_to, undefined)
  for (const period of ['today', '7d', '30d']) {
    const mobile = buildMobileRoleTaskQuery({ roleKey: 'sales', viewKey: 'history', period })
    assert.equal(mobile.period, buildWorkflowTaskBoardRequest({ lane: 'finished', period }).period)
    assert.equal(mobile.date_from, undefined)
    assert.equal(mobile.date_to, undefined)
  }
})

test('已办不恢复或发送截止时间，保留处理时间和来源条件', () => {
  const options = { due: 'noDue', sourceType: 'sales_order', period: '7d' }
  const normalized = normalizeMobileTaskQueryOptions(options, true)
  assert.equal(normalized.due, undefined)
  assert.equal(normalized.sourceType, 'sales_order')
  assert.equal(mobileTaskQueryScope('scope', { ...options, sortKey: 'completed' }), mobileTaskQueryScope('scope', { ...options, sortKey: 'completed', due: '' }))
  const mobile = buildMobileRoleTaskQuery({ roleKey: 'sales', viewKey: 'history', due: 'noDue', sourceType: 'sales_order' })
  const desktop = buildWorkflowTaskBoardRequest({ lane: 'finished', ...options })
  assert.equal(mobile.due, undefined)
  assert.equal(desktop.due, undefined)
  assert.equal(mobile.source_type, desktop.source_type)
})
