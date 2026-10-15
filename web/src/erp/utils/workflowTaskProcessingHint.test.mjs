import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWorkflowTaskActionOutcomeHint,
  getWorkflowTaskExceptionContactHint,
  getWorkflowTaskExceptionContactPresentation,
  getWorkflowTaskProcessingHint,
} from './workflowTaskProcessingHint.mjs'

test('exception contact is shown only for a blocked or escalated task', () => {
  const blockedContact = getWorkflowTaskExceptionContactPresentation({
    task_status_key: 'blocked',
    owner_role_key: 'warehouse',
    escalate_target_role_key: 'pmc',
  })
  assert.equal(
    blockedContact.text,
    '先联系 仓库岗位；仍无法解决时联系 PMC岗位。'
  )
  assert.deepEqual(blockedContact.parts, [
    { kind: 'text', text: '先联系 ' },
    { kind: 'role', text: '仓库岗位' },
    { kind: 'text', text: '；仍无法解决时联系 ' },
    { kind: 'role', text: 'PMC岗位' },
    { kind: 'text', text: '。' },
  ])
  assert.doesNotMatch(blockedContact.text, /\u00a0|&nbsp;/u)
  assert.deepEqual(
    blockedContact.parts
      .filter((part) => part.kind === 'role')
      .map((part) => part.text),
    ['仓库岗位', 'PMC岗位']
  )
  assert.equal(
    getWorkflowTaskExceptionContactHint({
      task_status_key: 'blocked',
      owner_role_key: 'warehouse',
      escalate_target_role_key: 'pmc',
    }),
    blockedContact.text
  )
  assert.equal(
    getWorkflowTaskExceptionContactHint({
      task_status_key: 'ready',
      owner_role_key: 'sales',
      escalate_target_role_key: 'finance',
      is_escalated: true,
    }),
    '请联系 财务岗位，确认处理。'
  )
  assert.equal(
    getWorkflowTaskExceptionContactHint({
      task_status_key: 'blocked',
      owner_role_key: 'pmc',
    }),
    '请联系 PMC岗位，确认卡点和恢复条件。'
  )
  assert.equal(
    getWorkflowTaskExceptionContactHint({
      task_status_key: 'ready',
      owner_role_key: 'sales',
    }),
    ''
  )
})

test('action outcome explains automatic flow without guessing a future person', () => {
  const processTask = {
    process_instance_id: 12,
    owner_role_key: 'purchase',
    escalate_target_role_key: 'boss',
  }

  assert.equal(
    getWorkflowTaskActionOutcomeHint({
      task: processTask,
      actionMode: 'done',
    }),
    '确认后系统会按本次结果自动流转；提交成功后以业务进度和对应业务单据为准。'
  )
  assert.equal(
    getWorkflowTaskActionOutcomeHint({
      task: processTask,
      actionMode: 'blocked',
    }),
    '确认后任务会标记为受阻；先联系 采购岗位，仍无法解决时联系 老板岗位，不会改变业务单据。'
  )
  assert.equal(
    getWorkflowTaskActionOutcomeHint({
      task: processTask,
      actionMode: 'assign',
    }),
    '确认后只改变处理人，负责岗位和流程保持不变。'
  )
  assert.equal(
    getWorkflowTaskActionOutcomeHint({
      task: { owner_role_key: 'quality' },
      actionMode: 'complete',
    }),
    '确认后只完成当前任务；相关业务是否办结以对应业务页面为准。'
  )
})

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

test('source access denial explains why handling and the related entry are unavailable', () => {
  const reason =
    '当前账号不能查看该任务的相关单据，因此不能办理；可催办责任人或联系管理员调整岗位权限。'
  assert.equal(
    getWorkflowTaskProcessingHint({
      task: { task_status_key: 'ready' },
      allowedActionModes: ['urge'],
      canOpenEntry: false,
      sourceAccess: {
        applicable: true,
        resolved: true,
        allowed: false,
        reason,
      },
    }),
    reason
  )
})

test('tasks without an authoritative source link explain that no related document is required', () => {
  const sourceAccess = {
    applicable: false,
    resolved: true,
    allowed: true,
    reason: '当前任务没有需要核对的相关单据。',
  }

  assert.equal(
    getWorkflowTaskProcessingHint({
      task: { task_status_key: 'ready' },
      allowedActionModes: ['urge'],
      sourceAccess,
    }),
    '当前仅可催办；催办只发送提醒，不代替负责人处理任务。当前任务没有需要核对的相关单据。'
  )
  assert.equal(
    getWorkflowTaskProcessingHint({
      task: { task_status_key: 'ready' },
      allowedActionModes: ['complete', 'block', 'reject', 'urge'],
      sourceAccess,
    }),
    '可选择处理完成、标记阻塞、退回任务、催办；请按实际结果操作。当前任务没有需要核对的相关单据。'
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
