import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getBusinessStatusTransitionOptions,
  requiresBusinessStatusReason,
} from './workflowStatus.mjs'

test('workflowStatus: 立项待确认可流转到放行、阻塞或取消', () => {
  assert.deepEqual(
    getBusinessStatusTransitionOptions('project_pending').map(
      (option) => option.value
    ),
    ['project_approved', 'blocked', 'cancelled']
  )
})

test('workflowStatus: 已出货进入对账或归档，不回退生产链路', () => {
  assert.deepEqual(
    getBusinessStatusTransitionOptions('shipped').map((option) => option.value),
    ['reconciling', 'closed']
  )
})

test('workflowStatus: 未知状态不返回误导性流转项', () => {
  assert.deepEqual(getBusinessStatusTransitionOptions('missing'), [])
})

test('workflowStatus: 阻塞和取消需要填写原因', () => {
  assert.equal(requiresBusinessStatusReason('blocked'), true)
  assert.equal(requiresBusinessStatusReason('cancelled'), true)
  assert.equal(requiresBusinessStatusReason('project_approved'), false)
})
