import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./WorkflowTaskActionDrawer.jsx', import.meta.url)),
  'utf8'
)
const processStageSource = readFileSync(
  fileURLToPath(new URL('./WorkflowProcessStageTrack.jsx', import.meta.url)),
  'utf8'
)
const taskEventTrailSource = readFileSync(
  fileURLToPath(new URL('./WorkflowTaskEventTrail.jsx', import.meta.url)),
  'utf8'
)
const processingHintSource = readFileSync(
  fileURLToPath(
    new URL('../../utils/workflowTaskProcessingHint.mjs', import.meta.url)
  ),
  'utf8'
)

test('task action drawer exposes real clickable steps without using actions as navigation', () => {
  assert.match(source, /role="tablist"/u)
  assert.match(source, /role="tab"/u)
  assert.match(source, /aria-selected=\{active\}/u)
  assert.match(
    source,
    /onClick=\{\(\) => interactive && selectStep\(step\.key\)\}/u
  )
  assert.match(source, /handleStepKeyDown/u)
  for (const step of ['context', 'action', 'confirm']) {
    assert.match(source, new RegExp(`id="erp-task-action-step-${step}"`, 'u'))
  }
  assert.match(source, /hidden=\{activeStepKey !== 'context'\}/u)
  assert.match(source, /hidden=\{activeStepKey !== 'action'\}/u)
  assert.match(source, /hidden=\{activeStepKey !== 'confirm'\}/u)
  assert.match(
    source,
    /onClick=\{\(\) => selectStep\('action'\)\}[\s\S]{0,80}>\s*选择处理方式\s*<\/Button>/u
  )
  assert.match(
    source,
    /onClick=\{\(\) => selectStep\('confirm'\)\}[\s\S]{0,80}>\s*核对并确认\s*<\/Button>/u
  )
  assert.doesNotMatch(source, /下一步：选择处理方式|下一步：确认/u)
})

test('task actions are selectable options and confirmation is separately gated', () => {
  assert.match(source, /role="radiogroup"/u)
  assert.match(source, /role="radio"/u)
  assert.match(source, /handleActionKeyDown/u)
  assert.match(source, /actionOptionRefs/u)
  assert.match(source, /hasVisibleActionSelection/u)
  assert.match(source, /催办只是处理方式之一/u)
  assert.match(source, /disabled=\{actionSaving \|\| !canConfirm\}/u)
  assert.match(source, /activeStepKey === 'confirm'/u)
  assert.match(source, /<strong>提交后会发生什么<\/strong>/u)
  assert.match(source, /<span>\{actionOutcomeHint\}<\/span>/u)
  assert.match(source, /className="erp-task-action-drawer__outcome-note"/u)
  const outcomeNoteStart = source.indexOf(
    'className="erp-task-action-drawer__outcome-note"'
  )
  const outcomeNoteEnd = source.indexOf('</div>', outcomeNoteStart)
  assert.ok(outcomeNoteStart >= 0)
  assert.ok(outcomeNoteEnd > outcomeNoteStart)
  assert.doesNotMatch(
    source.slice(outcomeNoteStart, outcomeNoteEnd),
    /showIcon/u
  )
  assert.doesNotMatch(
    source,
    /onClick=\{\(\) => selectAction\('urge',[\s\S]{0,80}下一步/u
  )
})

test('task action drawer explains loading and readonly access before action selection', () => {
  assert.match(source, /actionAvailabilityLoading/u)
  assert.match(source, /正在确认可用的处理方式/u)
  assert.doesNotMatch(source, /确认完成后即可选择处理方式/u)
  assert.doesNotMatch(source, /请稍候再进入下一步/u)
  assert.match(source, /当前只能查看任务/u)
  assert.match(source, /description=\{readonlyReason/u)
})

test('task action drawer only renders the explicitly authorized related document entry', () => {
  assert.match(source, /canOpenEntry = false/u)
  assert.match(
    source,
    /const canOpenRelatedEntry = Boolean\(task && canOpenEntry && onOpenEntry\)/u
  )
  assert.match(source, /\{canOpenRelatedEntry \? \(/u)
  assert.match(source, />\s*查看相关单据\s*<\/Button>/u)
  assert.doesNotMatch(source, /resolveWorkflowTaskEntryPath/u)
  assert.doesNotMatch(source, />\s*去办理\s*<\/Button>/u)
})

test('task action drawer exposes the shared task attachment action as a secondary footer entry', () => {
  assert.match(source, /BusinessAttachmentModalButton/u)
  assert.match(source, /canViewAttachments = false/u)
  assert.match(source, /canManageAttachments = false/u)
  assert.match(source, /ownerType="workflow_task"/u)
  assert.match(source, /ownerId=\{task\.id\}/u)
  assert.match(source, /ownerVersion=\{task\.version\}/u)
  assert.match(source, /showAttachmentCount/u)
  assert.match(source, /canUpload=\{canManageAttachments\}/u)
  assert.match(source, /workflow-task-attachment-action/u)
  assert.match(source, /panelTitle="附件内容"/u)
  assert.match(source, /上传照片、异常截图或处理凭证/u)
  assert.match(source, /查看照片、异常截图或处理凭证/u)
  assert.doesNotMatch(source, /不会改变库存/u)
})

test('task action drawer separates business trajectory from current-task processing records', () => {
  assert.match(source, /listWorkflowTaskEvents\(task\.id/u)
  assert.match(source, /WorkflowTaskEventTrail/u)
  assert.match(taskEventTrailSource, /本任务处理记录/u)
  assert.doesNotMatch(taskEventTrailSource, /完整审批链/u)
  assert.doesNotMatch(source, /!task\?\.id \|\| !approvalTask/u)
  assert.match(source, /limit: 100/u)
  assert.match(source, /taskEventsTruncated/u)
  assert.match(source, /truncated=\{taskEventsTruncated\}/u)
  assert.match(taskEventTrailSource, /仅显示最近/u)
  assert.match(taskEventTrailSource, /更早记录未加载/u)
  assert.match(source, /加载本任务处理记录失败/u)
  assert.match(source, /approvalTask=\{approvalTask\}/u)
  assert.match(source, /activeStepKey === 'context'/u)
  assert.match(source, /getWorkflowTaskActionMeta\(task, actionMode\)/u)
  assert.match(source, /approvalTask \? '审批详情' : '任务详情'/u)
  assert.match(source, /showResponsibility=\{false\}/u)
})

test('task action drawer shows task-scoped process position without exposing QA-only copy', () => {
  assert.match(source, /getWorkflowTaskProcessContext\(task\.id/u)
  assert.match(source, /业务流程/u)
  assert.match(source, /业务进度/u)
  assert.match(source, /来源单据/u)
  assert.match(source, /流程状态/u)
  assert.match(source, /暂时无法读取业务进度/u)
  assert.match(source, /setProcessContextReloadKey/u)
  assert.match(source, />\s*重新读取\s*<\/Button>/u)
  assert.match(source, /WorkflowProcessStageTrack context=\{processContext\}/u)
  assert.match(processStageSource, /执行轨迹/u)
  assert.match(processStageSource, /aria-current=\{item\.current \? 'step'/u)
  assert.match(processStageSource, /data-linked-task=/u)
  assert.match(processStageSource, /item\.attemptLabel/u)
  assert.match(source, /task\?\.process_node_instance_id/u)
  assert.match(source, /task\?\.version/u)
  assert.doesNotMatch(source, /模拟展示数据|不计入流程闭环证据/u)
})

test('task action drawer keeps one compact business-facing task summary', () => {
  assert.match(source, /const \{ Paragraph, Text, Title \} = Typography/u)
  assert.match(source, /getWorkflowTaskDisplayName\(task\)/u)
  assert.match(
    source,
    /const taskSourceLabel = task\s+\? formatWorkflowTaskSource/u
  )
  assert.match(source, /erp-task-action-drawer__task-meta/u)
  assert.match(source, /<span>来源单据<\/span>/u)
  assert.match(source, /<span>负责人<\/span>/u)
  assert.match(source, /<span>截止时间<\/span>/u)
  assert.doesNotMatch(source, /getWorkflowTaskCodeLabel/u)
  assert.doesNotMatch(source, /erp-task-action-drawer__eyebrow">当前任务/u)
  assert.doesNotMatch(source, /<span>负责岗位<\/span>/u)
  assert.doesNotMatch(source, /<span>当前处理人<\/span>/u)
  assert.doesNotMatch(source, /<span>当前状态<\/span>/u)
  assert.doesNotMatch(source, /step\.description/u)
  assert.doesNotMatch(source, /erp-task-action-drawer__guide-note/u)
  assert.doesNotMatch(source, /核对任务信息|核对审批事项|处理范围：/u)
  assert.doesNotMatch(source, />\s*关闭\s*<\/Button>/u)
  assert.match(source, /getWorkflowTaskExceptionContactPresentation\(task\)/u)
  assert.match(
    source,
    /<span>\{taskReason \? '当前原因' : '处理建议'\}<\/span>/u
  )
  assert.match(source, /erp-task-action-drawer__responsibility-role/u)
  assert.match(source, /erp-task-action-drawer__responsibility-person/u)
  assert.match(source, /erp-task-action-drawer__reason-contact-role/u)
  assert.match(source, /part\.kind === 'role'/u)
  assert.doesNotMatch(source, /font-style:\s*italic/u)
  const taskSummaryStart = source.indexOf(
    '<section className="erp-task-action-drawer__summary erp-task-action-drawer__summary--task">'
  )
  const taskSummaryEnd = source.indexOf(
    '{task.process_instance_id ? (',
    taskSummaryStart
  )
  const taskSummarySource = source.slice(taskSummaryStart, taskSummaryEnd)
  assert.ok(taskSummaryStart >= 0)
  assert.ok(taskSummaryEnd > taskSummaryStart)
  assert.doesNotMatch(taskSummarySource, /showIcon/u)
  assert.doesNotMatch(taskSummarySource, /<Alert/u)
  assert.doesNotMatch(taskSummarySource, /模拟展示数据|仅用于检查/u)
})

test('task action drawer submits formal approvals only from the authoritative runtime form', () => {
  assert.match(source, /isWorkflowProcessDecisionTask\(task\)/u)
  assert.match(source, /getWorkflowProcessDecisionApprovalForm/u)
  assert.match(source, /buildWorkflowProcessDecision/u)
  assert.match(source, /workflowProcessDecisionAllowsApprovedQuantity/u)
  assert.match(source, /processContextState === 'ready'/u)
  assert.match(source, /onSubmit\?\.\(\{ processDecision \}\)/u)
  assert.match(source, /审批表单与当前流程节点不一致/u)
  assert.match(source, /系统不会按任务名称或页面入口猜测审批字段/u)
  assert.match(source, /id="erp-task-approved-quantity"/u)
  assert.match(source, /onClick=\{submitAction\}/u)
  assert.doesNotMatch(source, /onClick=\{onSubmit\}/u)
})

test('task transfer is an explicit scoped action with person and pool destinations', () => {
  assert.match(source, /assign:\s*\{[\s\S]*title: '转交任务'/u)
  assert.match(source, /assignmentAccess = \{\}/u)
  assert.match(source, /onAssignmentTargetChange/u)
  assert.match(source, /id="erp-task-assignment-target"/u)
  assert.match(source, /选择接收人，或退回负责岗位共同待办/u)
  assert.match(source, /暂不指定个人并退回该岗位共同待办/u)
  assert.doesNotMatch(source, /取消个人指派，回到/u)
  assert.doesNotMatch(source, /待办池（状态不变）/u)
  assert.doesNotMatch(source, /岗位待办池/u)
  assert.match(source, /assignmentTargetValid/u)
  assert.match(source, /如果暂时不确定由谁接手，可退回该岗位共同待办/u)
  assert.match(source, /assignmentAccess\.stale/u)
  assert.match(
    source,
    /formatAdminIdentity\(assignmentAccess\.current_assignee\)/u
  )
  assert.match(source, /任务信息已更新，请刷新任务列表/u)
  assert.match(source, /不会使用旧版本的转交候选人/u)
  assert.match(
    source,
    /getWorkflowTaskActionOutcomeHint\(\{ task, actionMode \}\)/u
  )
  assert.match(processingHintSource, /确认后只改变处理人/u)
})
