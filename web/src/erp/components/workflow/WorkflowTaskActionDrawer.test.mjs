import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./WorkflowTaskActionDrawer.jsx', import.meta.url)),
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
  assert.match(source, /确认后只更新当前任务/u)
  assert.doesNotMatch(
    source,
    /onClick=\{\(\) => selectAction\('urge',[\s\S]{0,80}下一步/u
  )
})

test('task action drawer explains loading and readonly access before action selection', () => {
  assert.match(source, /actionAvailabilityLoading/u)
  assert.match(source, /正在确认可用的处理方式/u)
  assert.match(source, /确认完成后即可选择处理方式/u)
  assert.doesNotMatch(source, /请稍候再进入下一步/u)
  assert.match(source, /当前只能查看任务/u)
  assert.match(source, /description=\{readonlyReason/u)
})

test('task action drawer loads the canonical approval trajectory and uses approval language', () => {
  assert.match(source, /listWorkflowTaskEvents\(task\.id/u)
  assert.match(source, /审批轨迹/u)
  assert.match(source, /最近审批记录/u)
  assert.match(source, /最近 100 条/u)
  assert.match(source, /!task\?\.id \|\| !approvalTask/u)
  assert.match(source, /limit: 100/u)
  assert.match(source, /event\.event_type === 'status_changed'/u)
  assert.match(source, /event\.to_status_key === 'done'/u)
  assert.match(source, /加载审批轨迹失败/u)
  assert.match(source, /getWorkflowTaskActionMeta\(task, actionMode\)/u)
  assert.match(source, /approvalTask \? '审批办理' : '任务处理'/u)
})
