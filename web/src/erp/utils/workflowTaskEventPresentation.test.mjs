import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWorkflowTaskEventTrailModel,
  buildWorkflowTaskResponsibilityItems,
  formatWorkflowTaskEventTime,
  presentWorkflowTaskEvent,
} from './workflowTaskEventPresentation.mjs'

test('workflow task event presentation uses approval language only for approval tasks', () => {
  const event = {
    id: 11,
    event_type: 'status_changed',
    from_status_key: 'ready',
    to_status_key: 'done',
    actor_role_key: 'boss',
    actor_username: 'boss01',
    actor_display_name: '王总',
    task_version: 4,
    created_at: 1_720_000_000,
  }

  assert.deepEqual(
    {
      label: presentWorkflowTaskEvent(event).label,
      approvalLabel: presentWorkflowTaskEvent(event, {
        approvalTask: true,
      }).label,
      transitionLabel: presentWorkflowTaskEvent(event).transitionLabel,
      actorLabel: presentWorkflowTaskEvent(event).actorLabel,
      versionLabel: presentWorkflowTaskEvent(event).versionLabel,
    },
    {
      label: '任务已完成',
      approvalLabel: '审批已通过',
      transitionLabel: '待处理 → 已完成',
      actorLabel: '王总（老板）',
      versionLabel: '版本 4',
    }
  )
})

test('workflow task event presentation distinguishes exception recovery and responsibility changes', () => {
  const blocked = presentWorkflowTaskEvent({
    event_type: 'status_changed',
    from_status_key: 'ready',
    to_status_key: 'blocked',
    reason: '等待补充质检照片',
  })
  const recovered = presentWorkflowTaskEvent({
    event_type: 'status_changed',
    from_status_key: 'blocked',
    to_status_key: 'ready',
  })
  const escalated = presentWorkflowTaskEvent({
    event_type: 'escalate_to_pmc',
    actor_role_key: 'warehouse',
    actor_username: 'warehouse01',
  })
  const returnedToPool = presentWorkflowTaskEvent({
    event_type: 'unassigned',
  })

  assert.equal(blocked.categoryLabel, '异常')
  assert.equal(blocked.tone, 'danger')
  assert.equal(blocked.reason, '等待补充质检照片')
  assert.equal(recovered.categoryLabel, '恢复')
  assert.equal(recovered.label, '任务已恢复待处理')
  assert.equal(escalated.categoryLabel, '责任流转')
  assert.equal(escalated.label, '已升级至 PMC')
  assert.equal(escalated.actorLabel, 'warehouse01（仓库）')
  assert.equal(returnedToPool.label, '已退回负责岗位共同待办')
})

test('workflow task event presentation keeps unknown event keys out of user copy', () => {
  const item = presentWorkflowTaskEvent({
    event_type: 'future_internal_event_key',
    actor_role_key: 'unknown_internal_role',
  })

  assert.equal(item.label, '任务记录已更新')
  assert.equal(item.categoryLabel, '记录')
  assert.equal(item.actorLabel, '系统')
  assert.doesNotMatch(item.label, /future_internal_event_key/u)
  assert.doesNotMatch(item.actorLabel, /unknown_internal_role/u)
})

test('workflow task event presentation keeps system withdrawal distinct from rejection', () => {
  const event = presentWorkflowTaskEvent({
    event_type: 'source_cancelled_withdrawal',
    from_status_key: 'ready',
    to_status_key: 'withdrawn',
    reason: '来源单据已取消',
  })
  assert.equal(event.label, '来源取消，任务已撤回')
  assert.equal(event.transitionLabel, '待处理 → 已撤回')
  assert.equal(event.reason, '来源单据已取消')

  const items = buildWorkflowTaskResponsibilityItems({
    owner_role_key: 'sales',
    task_status_key: 'withdrawn',
    blocked_reason: '来源单据已取消',
  })
  assert.equal(
    items.find((item) => item.key === 'current-reason')?.label,
    '当前撤回原因'
  )
})

test('workflow task responsibility summary avoids exposing assignee ids', () => {
  const items = buildWorkflowTaskResponsibilityItems({
    owner_role_key: 'quality',
    assignee_id: 987,
    task_status_key: 'blocked',
    blocked_reason: '等待复检',
    urge_count: 2,
    last_urged_at: 1_720_000_000,
    escalate_target_role_key: 'boss',
    escalated_at: 1_720_000_100,
  })
  const copy = items.map((item) => `${item.label}:${item.value}`).join('|')

  assert.match(copy, /当前负责岗位:品质/u)
  assert.match(copy, /当前承接方式:已指定处理人/u)
  assert.match(copy, /催办情况:已催办 2 次/u)
  assert.match(copy, /当前升级责任:老板/u)
  assert.match(copy, /当前阻塞原因:等待复检/u)
  assert.doesNotMatch(copy, /987/u)
})

test('workflow task event trail preserves authoritative newest-first input order', () => {
  const model = buildWorkflowTaskEventTrailModel({
    task: { owner_role_key: 'warehouse', task_status_key: 'ready' },
    events: [
      { id: 3, event_type: 'urge_task' },
      { id: 2, event_type: 'created', to_status_key: 'ready' },
    ],
  })

  assert.deepEqual(
    model.items.map((item) => item.key),
    [3, 2]
  )
  assert.equal(model.summaryLabel, '最近 2 条')
  assert.equal(model.responsibilityItems[0].value, '仓库')
})

test('workflow task event time makes missing or invalid timestamps explicit', () => {
  assert.equal(formatWorkflowTaskEventTime(0), '时间未记录')
  assert.equal(formatWorkflowTaskEventTime('not-a-time'), '时间未记录')
  assert.notEqual(formatWorkflowTaskEventTime(1_720_000_000), '时间未记录')
})
