import assert from 'node:assert/strict'
import test from 'node:test'
import { getWorkflowTaskProcessingHint } from './workflowTaskProcessingHint.mjs'

test('processing hint reports access loading and failure without guessing an action', () => {
  const task = { task_status_key: 'ready' }

  assert.equal(
    getWorkflowTaskProcessingHint({ task, loading: true }),
    '正在确认当前可用的处理方式，请稍候。'
  )
  assert.equal(
    getWorkflowTaskProcessingHint({ task, failed: true }),
    '暂时无法确认可用的处理方式，请稍后重试。'
  )
})

test('terminal task hint distinguishes whether an associated entry exists', () => {
  assert.equal(
    getWorkflowTaskProcessingHint({
      task: { task_status_key: 'done' },
      canOpenEntry: true,
    }),
    '任务已结束，可查看关联记录。'
  )
  assert.equal(
    getWorkflowTaskProcessingHint({
      task: { task_status_key: 'rejected' },
      canOpenEntry: false,
    }),
    '任务已结束，当前仅支持查看任务详情。'
  )
})

test('urge-only access explains that a reminder does not handle the task', () => {
  assert.equal(
    getWorkflowTaskProcessingHint({
      task: { task_status_key: 'ready' },
      allowedActionModes: ['urge'],
    }),
    '当前仅可催办；催办只发送提醒，不代替负责人处理任务。'
  )
})

test('single workflow actions have deterministic business-readable hints', () => {
  const task = { task_status_key: 'ready' }
  const cases = [
    ['complete', '当前可确认任务处理完成；提交只更新当前协同任务。'],
    ['block', '当前可记录任务阻塞；请说明卡点、影响范围和需要谁协助。'],
    ['reject', '当前可退回任务；请说明退回依据和需要补齐的内容。'],
    ['resume', '当前可解除阻塞；请先确认卡点已经消除。'],
  ]

  for (const [actionMode, expected] of cases) {
    assert.equal(
      getWorkflowTaskProcessingHint({
        task,
        allowedActionModes: [actionMode],
      }),
      expected
    )
  }
})

test('ready task with multiple actions lists only backend-allowed operations', () => {
  assert.equal(
    getWorkflowTaskProcessingHint({
      task: { task_status_key: 'ready' },
      allowedActionModes: ['urge', 'reject', 'complete', 'block'],
      canOpenEntry: true,
    }),
    '可选择处理完成、标记阻塞、退回任务、催办；请按实际结果操作。关联业务信息可在相关单据核对。'
  )
})

test('blocked task with multiple actions prioritizes resolving the recorded blocker', () => {
  assert.equal(
    getWorkflowTaskProcessingHint({
      task: { task_status_key: 'blocked' },
      allowedActionModes: ['urge', 'resume'],
    }),
    '当前为阻塞任务，可选择解除阻塞、催办；解除前请确认卡点已消除。'
  )
})

test('no available action uses the read-only reason and safe fallbacks', () => {
  const task = { task_status_key: 'ready' }

  assert.equal(
    getWorkflowTaskProcessingHint({
      task,
      readonlyReason: '当前账号不是任务负责人。',
    }),
    '当前账号不是任务负责人。'
  )
  assert.equal(
    getWorkflowTaskProcessingHint({ task, canOpenEntry: true }),
    '当前没有可用的任务操作，可前往相关单据继续核对。'
  )
  assert.equal(
    getWorkflowTaskProcessingHint({ task }),
    '当前没有可用的处理方式，只能查看任务详情。'
  )
})

test('missing task has a stable read-only empty hint', () => {
  assert.equal(getWorkflowTaskProcessingHint(), '当前没有可查看的任务。')
})
