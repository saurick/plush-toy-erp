import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../../scripts/test/reactRuntime.mjs'

const source = readFileSync(
  fileURLToPath(new URL('./WorkflowTaskActionDrawer.jsx', import.meta.url)),
  'utf8'
)
const handlingChainSource = readFileSync(new URL('./WorkflowTaskHandlingChain.jsx', import.meta.url), 'utf8')
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

test('task action drawer exposes the shared task attachment action with task resources', () => {
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
  assert.match(source, /hasActionReceipt/u)
  assert.match(source, /\? '办理结果'/u)
  assert.match(source, /\? '审批详情'/u)
  assert.match(source, /: '任务详情'/u)
  assert.match(source, /showResponsibility=\{false\}/u)
})

test('task action drawer shows task-scoped process position without exposing QA-only copy', () => {
  assert.match(source, /getWorkflowTaskProcessContext\(task\.id/u)
  assert.match(handlingChainSource, /业务流程/u)
  assert.match(handlingChainSource, /任务处理链/u)
  assert.match(source, /WorkflowTaskSource/u)
  assert.match(handlingChainSource, /流程状态/u)
  assert.match(handlingChainSource, /暂时无法读取任务处理链/u)
  assert.match(source, /setProcessContextReloadKey/u)
  assert.match(handlingChainSource, />\s*重新读取\s*<\/Button>/u)
  assert.match(source, /WorkflowProcessStageTrack context=\{processContext\}/u)
  assert.match(processStageSource, /执行轨迹/u)
  assert.match(processStageSource, /aria-current=\{item\.current \? 'step'/u)
  assert.match(processStageSource, /data-linked-task=/u)
  assert.match(processStageSource, /item\.attemptLabel/u)
  assert.match(source, /task\?\.process_node_instance_id/u)
  assert.match(source, /task\?\.version/u)
  assert.doesNotMatch(source, /模拟展示数据|不计入流程闭环证据/u)
})

test('an unopened task drawer does not read resources or render task details', async (t) => {
  const ui = await mountDrawer(t, { task: null })
  assert.equal(document.querySelector('.workflow-task-current'), null)
  assert.equal(document.querySelector('[aria-label="更多操作"]'), null)
  assert.deepEqual(ui.calls, [])
})

test('task detail keeps current responsibility ahead of history and groups copy actions', async (t) => {
  const ui = await mountDrawer(t, { assignmentAccess: { current_assignee: { id: 9, username: 'lin', display_name: '林工' } }, task: { id: 42, version: 1, task_name: '核对材料', task_status_key: 'ready', owner_role_key: 'purchase', assignee_id: 9, source_type: 'purchase_order', source_no: 'PO-42' } })
  const summary = document.querySelector('.erp-task-action-drawer__summary--task')
  const current = summary.querySelector('.workflow-task-current')
  assert.match(current.textContent, /采购.*林工/u)
  assert.match(summary.textContent, /PO-42/u)
  assert.ok(document.querySelector('.ant-drawer-header button[aria-label="更多操作"]'))
  assert.equal(summary.querySelector('button[aria-label="更多操作"]'), null)
  assert.equal(summary.querySelector('button[aria-label="复制任务链接"]'), null)
  assert.ok(current.querySelector('.erp-task-timing--compact'))
  assert.equal(document.querySelector('.workflow-task-event-trail__disclosure').open, true)
  await ui.update({ task: { ...ui.task, version: 2, task_status_key: 'done', assignee_id: null } })
  assert.match(document.querySelector('.workflow-task-current').textContent, /本任务处理结果/u)
  assert.doesNotMatch(document.querySelector('.workflow-task-current').textContent, /由岗位人员处理/u)
})

test('switching tasks or sources closes linked-content details and clears stale products', async (t) => {
  const task = { id: 42, version: 1, task_name: '核对材料', task_status_key: 'ready', owner_role_key: 'purchase', display_context: { available: true, items: [{ kind: 'product', name: '海盐企鹅', code: '27007#' }, { kind: 'product', name: '挂件', code: '27007-GJ' }] } }
  const ui = await mountDrawer(t, { task })
  await ui.click(ui.button('共 2 项产品'))
  assert.ok(document.querySelector('.erp-task-linked-items'))
  const trigger = document.querySelector('button[aria-label="更多操作"]')
  await ui.update({ task: { ...task, id: 43, task_name: '核对规格' } })
  const nextTrigger = document.querySelector('button[aria-label="更多操作"]')
  assert.notEqual(nextTrigger, trigger)
  assert.equal(trigger.isConnected, false)
  assert.equal(nextTrigger.classList.contains('ant-dropdown-open'), false)
  assert.equal(document.querySelector('.erp-task-identity__count').getAttribute('aria-expanded'), 'false')
  await ui.click(ui.button('共 2 项产品'))
  const sourceTrigger = document.querySelector('button[aria-label="更多操作"]')
  await ui.update({ task: { ...task, id: 43, source_type: 'sales_order', source_id: 72, version: 2, display_context: { available: true, items: [{ kind: 'product', name: '新订单产品', code: 'P72' }, { kind: 'product', name: '新订单挂件', code: 'P73' }] } } })
  assert.equal(document.querySelector('.erp-task-identity__count').getAttribute('aria-expanded'), 'false')
  assert.equal(sourceTrigger.isConnected, false, 'changing the source binding also closes copy actions')
  await ui.click(ui.button('共 2 项产品'))
  assert.match(document.querySelector('.erp-task-linked-items').textContent, /新订单产品.*P72/u)
  assert.doesNotMatch(document.querySelector('.erp-task-linked-items').textContent, /海盐企鹅/u)
  await ui.update({ task: { ...ui.task, display_context: { available: false, items: [] } } })
  assert.equal(document.querySelector('.erp-task-identity__count'), null)
  assert.equal(document.querySelector('.erp-task-linked-items'), null)
  assert.match(document.querySelector('.erp-task-identity__unavailable').textContent, /关联单据已不可用/u)
  await ui.update({ task: { ...ui.task, display_context: { available: true, items: [{ kind: 'product', name: '来源产品', code: 'P72' }, { kind: 'material', name: '配件', code: 'M72', supplier_item_no: 'S72' }] } } })
  await ui.click(ui.button('共 2 项关联内容'))
  assert.equal(document.querySelector('.erp-task-linked-items-modal .ant-modal-title').textContent, '关联内容')
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
  assert.match(source, /选择接收人，或由岗位人员处理/u)
  assert.match(source, /交回岗位，由有权限的人员处理/u)
  assert.doesNotMatch(source, /取消个人指派，回到/u)
  assert.doesNotMatch(source, /待办池（状态不变）/u)
  assert.doesNotMatch(source, /岗位待办池/u)
  assert.match(source, /assignmentTargetValid/u)
  assert.match(source, /请选择同岗位的接收人，或选择由岗位人员处理/u)
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

let drawerRuntime
async function mountDrawer(t, overrides = {}) {
  const dom = installTestDOM()
  if (!drawerRuntime) {
    registerJSXTestLoader()
    drawerRuntime = Promise.all([
      import('./WorkflowTaskActionDrawer.jsx'),
      import('../../../common/utils/jsonRpc.js'),
    ])
  }
  const [{ default: Drawer }, { JsonRpc }] = await drawerRuntime
  const calls = []
  const submissions = []
  let closed = 0
  let opened = 0
  const original = JsonRpc.prototype.call
  JsonRpc.prototype.call = async function call(method, params, options) {
    calls.push({ method, params, options })
    if (method === 'list_task_events') {
      return { data: { items: [], truncated: false } }
    }
    if (method === 'list_attachments') {
      return { data: { attachments: [] } }
    }
    throw new Error(`unexpected RPC ${method}`)
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let props = {
    task: {
      id: 42,
      version: 1,
      task_name: '核对材料',
      task_status_key: 'pending',
      owner_role_key: 'purchase',
      source_type: 'purchase_order',
      source_no: 'PO-42',
    },
    allowedActionModes: ['complete', 'block'],
    onSubmit: (value) => submissions.push(value),
    onClose: () => closed++,
    onOpenEntry: () => opened++,
    ...overrides,
  }
  const render = () =>
    root.render(
      createElement(Drawer, {
        ...props,
        onActionModeChange: (actionMode) => {
          props = { ...props, actionMode }
          render()
        },
        onActionReasonChange: (actionReason) => {
          props = { ...props, actionReason }
          render()
        },
      })
    )
  const update = async (patch) => {
    props = { ...props, ...patch }
    await act(async () => render())
  }
  t.after(async () => {
    await act(async () => {
      root.unmount()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    container.remove()
    JsonRpc.prototype.call = original
    dom.restore()
  })
  await update({})
  const tabs = () => [...document.querySelectorAll('[role="tab"]')]
  const button = (text) =>
    [...document.querySelectorAll('button')].find(
      (node) => node.textContent.trim() === text
    )
  const click = async (node) => {
    assert(node, 'expected interactive element')
    await act(async () => node.click())
  }
  return {
    update,
    tabs,
    button,
    click,
    calls,
    submissions,
    get closed() {
      return closed
    },
    get opened() {
      return opened
    },
    get task() {
      return props.task
    },
    window: dom.runtimeWindow,
  }
}

test('task resources tolerate an empty selection and stop reading attachments when the drawer closes', async (t) => {
  const ui = await mountDrawer(t, { task: null, canViewAttachments: true })
  const attachmentAction = () =>
    document.querySelector('[data-testid="workflow-task-attachment-action"]')
  assert.equal(attachmentAction(), null)
  assert.deepEqual(ui.calls, [])

  const task = { id: 42, version: 1, task_name: '核对材料', task_status_key: 'ready', owner_role_key: 'purchase' }
  await ui.update({ task })
  assert.ok(attachmentAction())
  assert.deepEqual(ui.calls.filter((call) => call.method === 'list_attachments').map((call) => call.params.owner_id), [42])

  const callsBeforeClose = ui.calls.length
  await ui.update({ task: null })
  assert.equal(attachmentAction(), null)
  assert.equal(ui.calls.length, callsBeforeClose)

  await ui.update({ task: { ...task, id: 43 } })
  assert.ok(attachmentAction())
  assert.deepEqual(ui.calls.filter((call) => call.method === 'list_attachments').map((call) => call.params.owner_id), [42, 43])
})

test('drawer uses one header return for its source and prevents leaving during submission', async (t) => {
  let returned = 0
  const ui = await mountDrawer(t, { onReturnToTracking: () => returned++ })
  const back = () => document.querySelector('.ant-drawer-header button[aria-label="返回流程"]')
  assert(back())
  assert.equal([...document.querySelectorAll('.ant-drawer-footer button')].some((button) => button.textContent.includes('返回流程')), false)
  await ui.click(back())
  assert.equal(returned, 1)
  assert.equal(ui.closed, 0)
  await ui.update({ actionSaving: true })
  assert.equal(back(), null)
  assert.equal(returned, 1)
  await ui.update({ actionSaving: false, onReturnToTracking: null })
  await ui.click(document.querySelector('.ant-drawer-header button[aria-label="返回列表"]'))
  assert.equal(ui.closed, 1)
  await ui.update({ closeLabel: '返回异常跟踪' })
  await ui.click(document.querySelector('.ant-drawer-header button[aria-label="返回异常跟踪"]'))
  assert.equal(ui.closed, 2)
})

test('drawer step navigation and keyboard selection never submit an action', async (t) => {
  const ui = await mountDrawer(t)
  assert.equal(ui.tabs()[0].getAttribute('aria-selected'), 'true')
  assert.equal(ui.tabs()[2].disabled, true)
  assert.equal(document.querySelector('.erp-task-action-drawer__navigation').hidden, true)
  await ui.click(ui.button('选择处理方式'))
  assert.equal(document.querySelector('.erp-task-action-drawer__navigation').hidden, false)
  assert.equal(ui.tabs()[1].getAttribute('aria-selected'), 'true')
  await act(async () =>
    ui.tabs()[1].dispatchEvent(
      new ui.window.KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        bubbles: true,
      })
    )
  )
  assert.equal(ui.tabs()[0].getAttribute('aria-selected'), 'true')
  await ui.click(ui.button('选择处理方式'))
  const complete = [...document.querySelectorAll('[role="radio"]')].find(
    (node) => node.textContent.includes('处理完成')
  )
  await ui.click(complete)
  assert.equal(complete.getAttribute('aria-checked'), 'true')
  assert.equal(ui.submissions.length, 0)
  await ui.click(ui.button('核对并确认'))
  assert.equal(ui.tabs()[2].getAttribute('aria-selected'), 'true')
  assert.match(
    document.querySelector('.erp-task-action-drawer__outcome-note').textContent,
    /提交后会发生什么/
  )
  assert.equal(ui.submissions.length, 0)
  await ui.click(ui.button('确认完成'))
  assert.deepEqual(ui.submissions, [{ processDecision: null }])
})

test('all task types keep document viewing and the processing chain in the context step', async (t) => {
  const ui = await mountDrawer(t, { canOpenEntry: true })
  assert.ok(ui.button('进入单据办理'))
  assert.ok(document.querySelector('[aria-label="任务处理链"]'))
  await ui.click(ui.button('选择处理方式'))
  assert.equal(ui.button('进入单据办理'), undefined)
  assert.equal(document.querySelector('[aria-label="任务处理链"]'), null)
  assert.equal(document.querySelector('.erp-task-action-drawer__task-meta'), null)
  await ui.click(ui.tabs()[0])
  assert.ok(ui.button('进入单据办理'))
  assert.ok(document.querySelector('[aria-label="任务处理链"]'))
  assert.equal(ui.submissions.length, 0)
})

test('drawer requires a reason and disables submission while saving or access is withdrawn', async (t) => {
  const ui = await mountDrawer(t, { actionMode: 'block' })
  assert.equal(ui.tabs()[2].disabled, true)
  await ui.update({ actionReason: '等待补齐材料' })
  assert.equal(ui.tabs()[2].disabled, false)
  await ui.click(ui.tabs()[2])
  await ui.update({ actionSaving: true })
  assert.equal(ui.button('提交阻塞').disabled, true)
  await ui.click(ui.button('提交阻塞'))
  assert.equal(ui.submissions.length, 0)
  await ui.update({
    actionSaving: false,
    allowedActionModes: [],
    readonlyReason: '当前岗位只能查看',
  })
  assert.equal(ui.tabs()[1].disabled, true)
  assert.match(document.body.textContent, /当前岗位只能查看/)
  assert.equal(ui.button('提交阻塞'), undefined)
})

test('all allowed actions stay directly visible and still require a valid reason and permission', async (t) => {
  const ui = await mountDrawer(t, {
    allowedActionModes: ['complete', 'block', 'reject', 'urge', 'assign'],
    actionMode: 'urge',
  })
  await ui.click(ui.tabs()[1])
  const actionLabels = () => [...document.querySelectorAll('[role="radio"]')]
    .map((node) => node.querySelector('strong').textContent)
  assert.deepEqual(actionLabels(), [
    '处理完成',
    '标记阻塞',
    '退回任务',
    '催办',
    '转交任务',
  ])
  assert.equal(ui.button('更多处理方式：催办'), undefined)
  assert.equal(
    [...document.querySelectorAll('[role="radio"]')].find((node) =>
      node.textContent.includes('催办')
    ).tabIndex,
    0
  )
  assert.equal(ui.tabs()[2].disabled, true)
  assert.equal(ui.submissions.length, 0)
  await ui.update({ actionReason: '等待责任人确认交期' })
  assert.equal(ui.tabs()[2].disabled, false)
  await ui.update({ allowedActionModes: ['complete', 'block'] })
  assert.deepEqual(actionLabels(), ['处理完成', '标记阻塞'])
  assert.equal(ui.tabs()[2].disabled, true)
})

test('approval, resume and urge actions all stay directly visible in their stable order', async (t) => {
  const ui = await mountDrawer(t, {
    task: { id: 51, required_capability_key: 'workflow.task.approve', task_status_key: 'ready' },
    allowedActionModes: ['complete', 'reject', 'urge'],
  })
  await ui.click(ui.tabs()[1])
  const actionLabels = () => [...document.querySelectorAll('[role="radio"]')]
    .map((node) => node.querySelector('strong').textContent)
  assert.deepEqual(actionLabels(), ['审批通过', '审批退回', '催办'])
  await ui.update({ allowedActionModes: ['resume', 'urge'] })
  assert.deepEqual(actionLabels(), ['解除阻塞', '催办'])
  await ui.update({ allowedActionModes: ['urge'] })
  assert.deepEqual(actionLabels(), ['催办'])
  assert.equal(ui.button('更多处理方式'), undefined)
})

test('drawer keeps a confirmed receipt visible and finishes without resubmitting', async (t) => {
  const ui = await mountDrawer(t, { actionMode: 'complete' })
  await ui.update({
    task: { ...ui.task, task_status_key: 'done', version: 2 },
    actionReceipt: {
      actionTitle: '处理完成',
      successMessage: '任务已处理完成',
    },
  })
  assert.equal(ui.tabs()[2].getAttribute('aria-selected'), 'true')
  assert.equal(ui.tabs()[0].disabled, true)
  assert.equal(ui.tabs()[1].disabled, true)
  const receipt = document.querySelector(
    '[data-testid="workflow-task-action-receipt"]'
  )
  assert.match(receipt.textContent, /办理结果已确认/)
  assert.match(
    document.body.textContent,
    /本任务已结束，没有关联的后续业务流程/
  )
  assert.equal(ui.button('确认完成'), undefined)
  await ui.click(ui.button('完成并关闭'))
  assert.equal(ui.closed, 1)
  assert.equal(ui.submissions.length, 0)
})

test('drawer renders authorized related-document entry and explains access loading', async (t) => {
  const ui = await mountDrawer(t, {
    allowedActionModes: [],
    actionAvailabilityLoading: true,
  })
  assert.match(document.body.textContent, /正在确认可用的处理方式/)
  assert.equal(ui.button('进入单据办理'), undefined)
  await ui.update({ canOpenEntry: true })
  await ui.click(ui.button('进入单据办理'))
  assert.equal(ui.opened, 1)
  await ui.update({
    canOpenEntry: false,
    actionAvailabilityLoading: false,
    readonlyReason: '只能查看任务',
  })
  assert.equal(ui.button('进入单据办理'), undefined)
  assert.match(document.body.textContent, /当前只能查看任务/)
  assert.equal(ui.button('选择处理方式'), undefined)
  assert.equal(ui.button('确认完成'), undefined)
})

test('drawer reads events for the selected task and cancels the previous request on task switch', async (t) => {
  const ui = await mountDrawer(t)
  assert.equal(ui.calls.length, 1)
  assert.deepEqual(ui.calls[0].params, { task_id: 42, limit: 100 })
  const previous = ui.calls[0]
  await ui.update({ task: { ...ui.task, id: 43, version: 2 } })
  assert.equal(previous.options.signal.aborted, true)
  assert.deepEqual(ui.calls[1].params, { task_id: 43, limit: 100 })
  assert.match(document.body.textContent, /本任务处理记录/)
})
