import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkflowAssignmentSelectOptions,
  flattenWorkflowAssignmentSelectOptions,
} from './workflowAssignmentSelectOptions.mjs'

test('workflow assignment select separates the role pool from named employees', () => {
  const groups = buildWorkflowAssignmentSelectOptions({
    canReturnToPool: true,
    ownerRoleLabel: '生产经理',
    candidates: [
      {
        admin_id: 21,
        username: 'production01',
        display_name: '王主管',
        role_label: '生产经理',
      },
      {
        admin_id: 22,
        username: 'sales02',
        display_name: '李跟单',
        role_label: '跟单员',
      },
    ],
  })

  assert.deepEqual(
    groups.map((group) => group.label),
    ['岗位共同待办', '指定员工']
  )
  assert.deepEqual(
    flattenWorkflowAssignmentSelectOptions(groups).map(
      (option) => option.value
    ),
    ['pool', 21, 22]
  )
  assert.match(
    flattenWorkflowAssignmentSelectOptions(groups)[1].label,
    /王主管（production01）/u
  )
})

test('workflow assignment select omits empty groups', () => {
  assert.deepEqual(
    buildWorkflowAssignmentSelectOptions({
      candidates: [{ admin_id: 9, username: '张三', role_label: '仓管员' }],
    }).map((group) => group.label),
    ['指定员工']
  )
})
