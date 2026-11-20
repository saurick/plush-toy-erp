import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWorkflowTaskBlockReason,
  isWorkflowTaskBlockReasonReady,
  splitWorkflowTaskBlockReason,
  WORKFLOW_TASK_BLOCK_REASONS,
} from './workflowTaskBlockReason.mjs'

test('every preset accepts an empty or blank optional explanation', () => {
  for (const choice of WORKFLOW_TASK_BLOCK_REASONS) {
    assert.equal(buildWorkflowTaskBlockReason({ choice }), choice)
    assert.equal(buildWorkflowTaskBlockReason({ choice, detail: ' \n ' }), choice)
    assert.equal(isWorkflowTaskBlockReasonReady(choice), true)
  }
})

test('unclassified text is preserved and does not satisfy the choice requirement', () => {
  for (const detail of ['', '等待图纸最终版本', '等资料需要核对']) {
    assert.deepEqual(splitWorkflowTaskBlockReason(detail), { choice: '', detail })
    assert.equal(isWorkflowTaskBlockReasonReady(detail), false)
  }
})

test('changing the preset replaces its label while preserving multiline detail', () => {
  const detail = '缺少 A 款图纸\n需要工程协助'
  const first = buildWorkflowTaskBlockReason({ choice: '等资料', detail })
  assert.deepEqual(splitWorkflowTaskBlockReason(first), { choice: '等资料', detail })
  const changed = buildWorkflowTaskBlockReason({ ...splitWorkflowTaskBlockReason(first), choice: '等确认' })
  assert.equal(changed, `等确认：${detail}`)
  assert.equal(buildWorkflowTaskBlockReason({ choice: '等确认', detail: '' }), '等确认')
})

test('the full reason respects the existing length limit without discarding detail', () => {
  const detail = '材'.repeat(176)
  const reason = buildWorkflowTaskBlockReason({ choice: '等资料', detail })
  assert.equal(reason.length, 180)
  assert.equal(isWorkflowTaskBlockReasonReady(reason), true)
  const longerChoice = buildWorkflowTaskBlockReason({ choice: '人员或设备问题', detail })
  assert.equal(isWorkflowTaskBlockReasonReady(longerChoice), false)
  assert.equal(splitWorkflowTaskBlockReason(longerChoice).detail, detail)
})
