import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMobileWorkflowTaskQueryPlan,
  explainMobileTaskQueryPlan,
  mergeWorkflowTaskResults,
  shouldLoadAllWorkflowTasksForRole,
} from './mobileTaskQueries.mjs'

test('mobileTaskQueries: PMC 老板 生产和业务需要全量加载任务池', () => {
  assert.equal(shouldLoadAllWorkflowTasksForRole('pmc'), true)
  assert.equal(shouldLoadAllWorkflowTasksForRole('boss'), true)
  assert.equal(shouldLoadAllWorkflowTasksForRole('production'), true)
  assert.equal(shouldLoadAllWorkflowTasksForRole('business'), true)
  assert.deepEqual(buildMobileWorkflowTaskQueryPlan('pmc'), [{ limit: 200 }])
  assert.deepEqual(buildMobileWorkflowTaskQueryPlan('boss'), [{ limit: 200 }])
  assert.deepEqual(buildMobileWorkflowTaskQueryPlan('production'), [
    { limit: 200 },
  ])
  assert.deepEqual(buildMobileWorkflowTaskQueryPlan('business'), [
    { limit: 200 },
  ])
})

test('mobileTaskQueries: 品质 仓库 财务 采购保持 owner_role_key 直查', () => {
  for (const roleKey of ['quality', 'warehouse', 'finance', 'purchasing']) {
    assert.equal(shouldLoadAllWorkflowTasksForRole(roleKey), false)
    assert.deepEqual(buildMobileWorkflowTaskQueryPlan(roleKey), [
      { owner_role_key: roleKey, limit: 200 },
    ])
  }
})

test('mobileTaskQueries: explainMobileTaskQueryPlan 返回全量和直查解释', () => {
  for (const roleKey of ['pmc', 'boss', 'production', 'business']) {
    const plan = explainMobileTaskQueryPlan(roleKey)
    assert.equal(plan.strategy, 'full_list')
    assert.equal(plan.loads_full_list, true)
    assert.deepEqual(plan.queries, [{ limit: 200 }])
    assert.match(plan.reason, /全量|最近 200|筛选/)
  }

  for (const roleKey of ['quality', 'warehouse', 'finance', 'purchasing']) {
    const plan = explainMobileTaskQueryPlan(roleKey)
    assert.equal(plan.strategy, 'owner_role_key')
    assert.equal(plan.loads_full_list, false)
    assert.deepEqual(plan.queries, [{ owner_role_key: roleKey, limit: 200 }])
    assert.match(plan.reason, /owner_role_key/)
  }
})

test('mobileTaskQueries: 合并结果按任务 id 去重并保留首次出现顺序', () => {
  const merged = mergeWorkflowTaskResults([
    { tasks: [{ id: 1, task_name: 'A' }] },
    [{ id: 2, task_name: 'B' }],
    { tasks: [{ id: 1, task_name: 'A duplicate' }, { id: 3 }] },
  ])

  assert.deepEqual(
    merged.map((task) => task.id),
    [1, 2, 3]
  )
  assert.equal(merged[0].task_name, 'A')
})

test('mobileTaskQueries: 空响应和异常形态不报错', () => {
  assert.deepEqual(mergeWorkflowTaskResults(), [])
  assert.deepEqual(mergeWorkflowTaskResults([null, {}, { tasks: null }]), [])
})
