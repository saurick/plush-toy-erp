import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_FLOW_STATE_TASK_LOOKUP_LIMIT,
  DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION,
  buildDevFlowStateTaskLookupQuery,
  getDevFlowStateTaskRuntimeAssociation,
  isDevFlowStateTaskUnlinkedRuntimeError,
  parseDevFlowStateTaskIDReference,
  resolveDevFlowStateTaskLookupPage,
} from './devFlowStateTaskLookup.mjs'

function task(overrides = {}) {
  return {
    id: 18,
    task_code: 'TRIAL-BOSS-18',
    task_name: '看本周哪些订单可能延期（18）',
    source_no: '样例-老板-18',
    task_status_key: 'ready',
    owner_role_key: 'boss',
    ...overrides,
  }
}

function page(tasks, overrides = {}) {
  return {
    tasks,
    total: tasks.length,
    limit: DEV_FLOW_STATE_TASK_LOOKUP_LIMIT,
    offset: 0,
    ...overrides,
  }
}

test('dev flow task lookup keeps positive numeric input as task_id compatibility', () => {
  assert.equal(parseDevFlowStateTaskIDReference(' 18 '), 18)
  assert.equal(parseDevFlowStateTaskIDReference('0018'), 18)
  assert.equal(parseDevFlowStateTaskIDReference('任务 18'), null)
  assert.equal(parseDevFlowStateTaskIDReference('0'), null)
  assert.equal(parseDevFlowStateTaskIDReference('9007199254740992'), null)
})

test('dev flow task lookup classifies linked, unlinked, unknown, and invalid runtime anchors', () => {
  assert.equal(
    getDevFlowStateTaskRuntimeAssociation(
      task({ process_instance_id: 7018, process_node_instance_id: 8018 })
    ),
    DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.LINKED
  )
  for (const unlinkedTask of [
    task(),
    task({ process_instance_id: null, process_node_instance_id: null }),
    task({ process_instance_id: '', process_node_instance_id: '' }),
  ]) {
    assert.equal(
      getDevFlowStateTaskRuntimeAssociation(unlinkedTask),
      DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.UNLINKED
    )
  }
  for (const invalidTask of [
    task({ process_instance_id: 7018 }),
    task({ process_instance_id: 0, process_node_instance_id: 8018 }),
    task({ process_instance_id: '7018', process_node_instance_id: 8018 }),
  ]) {
    assert.equal(
      getDevFlowStateTaskRuntimeAssociation(invalidTask),
      DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.INVALID
    )
  }
  assert.equal(
    getDevFlowStateTaskRuntimeAssociation(null),
    DEV_FLOW_STATE_TASK_RUNTIME_ASSOCIATION.UNKNOWN
  )
})

test('dev flow task lookup recognizes only the formal unlinked ProcessRuntime RPC boundary', () => {
  assert.equal(
    isDevFlowStateTaskUnlinkedRuntimeError(new Error('当前任务未关联正式流程')),
    true
  )
  assert.equal(
    isDevFlowStateTaskUnlinkedRuntimeError(
      new Error('当前任务未关联正式流程，请重试')
    ),
    false
  )
  assert.equal(
    isDevFlowStateTaskUnlinkedRuntimeError(new Error('任务不可见')),
    false
  )
})

test('dev flow task lookup builds the existing visible keyword query contract', () => {
  assert.deepEqual(
    buildDevFlowStateTaskLookupQuery(' 看本周哪些订单可能延期（18） '),
    {
      keyword: '看本周哪些订单可能延期（18）',
      limit: DEV_FLOW_STATE_TASK_LOOKUP_LIMIT,
      offset: 0,
    }
  )
  assert.throws(() => buildDevFlowStateTaskLookupQuery(''), /请输入任务名称/u)
  assert.throws(
    () => buildDevFlowStateTaskLookupQuery('任'.repeat(201)),
    /不能超过 200 个字符/u
  )
})

test('dev flow task lookup auto-selects one exact visible task name', () => {
  const exactTask = task()
  const partialTask = task({
    id: 19,
    task_code: 'TRIAL-BOSS-19',
    task_name: '看本周哪些订单可能延期（18）补充核对',
    source_no: '样例-老板-19',
  })
  const result = resolveDevFlowStateTaskLookupPage(
    page([exactTask, partialTask]),
    exactTask.task_name
  )
  assert.equal(result.autoSelectedTask.id, exactTask.id)
  assert.deepEqual(
    result.candidates.map((item) => item.id),
    [exactTask.id]
  )
  assert.equal(result.complete, true)
})

test('dev flow task lookup resolves task code and source number without exposing database lookup', () => {
  const sourceTask = task()
  for (const reference of [sourceTask.task_code, sourceTask.source_no]) {
    const result = resolveDevFlowStateTaskLookupPage(
      page([sourceTask]),
      reference
    )
    assert.equal(result.autoSelectedTask.id, sourceTask.id)
  }
})

test('dev flow task lookup requires an explicit choice for duplicate names', () => {
  const first = task()
  const second = task({
    id: 118,
    task_code: 'TRIAL-BOSS-118',
    source_no: '样例-老板-118',
  })
  const result = resolveDevFlowStateTaskLookupPage(
    page([second, first]),
    first.task_name
  )
  assert.equal(result.autoSelectedTask, null)
  assert.deepEqual(
    result.candidates.map((item) => item.id),
    [second.id, first.id]
  )
})

test('dev flow task lookup never auto-selects from an incomplete server page', () => {
  const result = resolveDevFlowStateTaskLookupPage(
    page([task()], { total: DEV_FLOW_STATE_TASK_LOOKUP_LIMIT + 1 }),
    '看本周哪些订单可能延期（18）'
  )
  assert.equal(result.autoSelectedTask, null)
  assert.equal(result.complete, false)
  assert.equal(result.serverMatchCount, DEV_FLOW_STATE_TASK_LOOKUP_LIMIT + 1)
})

test('dev flow task lookup hides keyword hits that only match technical fields', () => {
  const result = resolveDevFlowStateTaskLookupPage(
    page([
      task({
        task_group: 'technical-only-match',
      }),
    ]),
    'technical-only-match'
  )
  assert.equal(result.autoSelectedTask, null)
  assert.deepEqual(result.candidates, [])
})

test('dev flow task lookup fails closed on malformed or duplicate task rows', () => {
  assert.throws(
    () =>
      resolveDevFlowStateTaskLookupPage(
        page([task({ id: 0 })]),
        '看本周哪些订单可能延期（18）'
      ),
    /查询结果格式无效/u
  )
  assert.throws(
    () =>
      resolveDevFlowStateTaskLookupPage(
        page([task(), task({ task_code: 'OTHER' })]),
        '看本周哪些订单可能延期（18）'
      ),
    /查询结果格式无效/u
  )
})
