import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'
import { formatWorkflowTaskEventTime } from '../../utils/workflowTaskEventPresentation.mjs'

async function mount(t, name, props) {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Component }] = await Promise.all([
    import('react-dom/client'),
    import(`./${name}.jsx`),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = (next, key) => act(async () => root.render(createElement(Component, { ...next, key })))
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  await render(props)
  return { container, render }
}

const stageModel = {
  processLabel: '销售订单受理',
  summaryLabel: '已结束步骤 2 · 当前步骤 2',
  handoffKind: 'blocked',
  handoffLabel: '工程资料受阻，财务正在核对用料。',
  items: [
    { key: 'submitted', label: '提交销售订单', tone: 'completed', statusLabel: '已完成' },
    { key: 'approved', label: '订单审批', tone: 'completed', statusLabel: '已完成' },
    { key: 'engineering', label: '工程资料', tone: 'blocked', statusLabel: '受阻', linked: true, current: true },
    { key: 'finance', label: '财务核对用料', tone: 'active', statusLabel: '办理中', current: true },
  ],
}

test('current task and parallel active work stay ahead of default-expanded completed steps', async (t) => {
  const { container, render } = await mount(t, 'WorkflowProcessStageTrack', { model: stageModel, focusCurrent: true })
  const track = container.firstElementChild
  const visible = track.querySelector(':scope > ol')
  assert.equal(visible.children.length, 2)
  assert.match(visible.textContent, /工程资料.*财务核对用料/u)
  assert.doesNotMatch(visible.textContent, /订单审批/u)
  assert.equal(visible.querySelectorAll('[aria-current="step"]').length, 2)
  const history = track.querySelector('details')
  assert.equal(history.open, true)
  assert.match(history.querySelector('summary').textContent, /前序 2 步已完成/u)
  assert.equal(history.querySelectorAll('li').length, 2)
  history.open = false
  await render({ model: { ...stageModel, handoffLabel: '等待工程补齐规格。' }, focusCurrent: true })
  assert.equal(container.querySelector('details'), history)
  assert.equal(history.open, false, 'same task refresh preserves the reader’s manual collapse')
  await render({ model: stageModel, focusCurrent: false })
  assert.equal(container.querySelector('details'), null)
  assert.equal(container.querySelectorAll('li').length, 4, 'full tracking retains the chronological execution trace')
  await render({ model: stageModel, focusCurrent: true, compact: true, hideLinkedCurrent: true })
  assert.match(container.querySelector(':scope > div > ol').textContent, /财务核对用料/u)
  assert.doesNotMatch(container.querySelector(':scope > div > ol').textContent, /工程资料/u)
  assert.equal(container.querySelectorAll('[aria-current="step"]').length, 1, 'parallel work stays visible when this task is already summarized above')
})

test('ended selected tasks retain their result and do not hide active or unconfirmed nodes', async (t) => {
  const model = { ...stageModel, items: stageModel.items.map((item) => item.linked ? { ...item, current: false, tone: 'completed', statusLabel: '已完成' } : item).concat({ key: 'checking', label: '责任尚在确认的节点', tone: 'active', statusLabel: '待确认' }) }
  const { container } = await mount(t, 'WorkflowProcessStageTrack', { model, focusCurrent: true })
  const visible = container.querySelector(':scope > div > ol')
  assert.match(visible.textContent, /工程资料.*已完成.*财务核对用料.*责任尚在确认/u)
  assert.equal(visible.querySelector('[data-linked-task="true"]').hasAttribute('aria-current'), false)
  assert.doesNotMatch(container.querySelector('details').textContent, /责任尚在确认/u)
})

test('processing records expand after a successful read, retain manual collapse and reset for another task', async (t) => {
  const task = { id: 1, owner_role_key: 'engineering', task_status_key: 'ready' }
  const props = { task, state: 'ready', events: [{ id: 9, event_type: 'created', created_at: 1800000000 }], showResponsibility: false, collapsible: true, truncated: true }
  const { container, render } = await mount(t, 'WorkflowTaskEventTrail', props)
  const history = container.querySelector('details')
  assert.equal(history.open, true)
  history.open = false
  await render({ ...props, events: [...props.events] })
  assert.equal(container.querySelector('details').open, false)
  assert.match(history.textContent, /更早记录未加载/u)
  await render({ ...props, task: { ...task, id: 2 } })
  assert.equal(container.querySelector('details').open, true)
  await render({ ...props, state: 'error', errorMessage: '记录暂时无法读取，请刷新。' })
  assert.equal(container.querySelector('details'), null)
  assert.match(container.querySelector('[role="alert"]').textContent, /暂时无法读取/u)
  await render({ ...props, state: 'loading' })
  assert.equal(container.querySelector('details'), null)
  assert.match(container.querySelector('[role="status"]').textContent, /正在加载/u)
})

test('processing record details retain exact audit evidence on desktop and mobile', async (t) => {
  const event = {
    id: 9,
    event_type: 'created',
    created_at: 1800000000,
    task_version: 4,
    actor_display_name: '林工',
    actor_role_key: 'engineering',
  }
  const props = {
    task: { id: 1 },
    events: [event],
    showResponsibility: false,
  }
  const { container, render } = await mount(t, 'WorkflowTaskEventTrail', props)
  for (const variant of ['desktop', 'mobile']) {
    await render({ ...props, variant }, variant)
    const record = container.querySelector('.workflow-task-event-trail__item')
    assert.match(record.textContent, /任务已创建.*林工.*工程/u)
    assert.doesNotMatch(record.textContent, /版本 4/u)
    assert.equal(document.querySelector('.workflow-task-event-trail__audit'), null)
    const detail = record.querySelector(
      'button[aria-label="查看任务已创建记录详情"]'
    )
    assert.ok(detail)
    await act(async () => detail.click())
    const evidence = document.querySelector('.workflow-task-event-trail__audit')
    assert.ok(evidence)
    assert.deepEqual(
      [...evidence.querySelectorAll('dt')].map((item) => item.textContent),
      ['记录分类', '精确时间', '任务版本']
    )
    assert.deepEqual(
      [...evidence.querySelectorAll('dd')].map((item) => item.textContent),
      ['进度', formatWorkflowTaskEventTime(event.created_at), '版本 4']
    )
  }
})

test('processing record details keep missing audit evidence explicit without inventing a version', async (t) => {
  const { container } = await mount(t, 'WorkflowTaskEventTrail', {
    task: { id: 1 },
    events: [{ id: 9, event_type: 'created' }],
    showResponsibility: false,
  })
  assert.match(
    container.querySelector('.workflow-task-event-trail__meta-time').textContent,
    /时间未记录/u
  )
  await act(async () =>
    container
      .querySelector('button[aria-label="查看任务已创建记录详情"]')
      .click()
  )
  const evidence = document.querySelector('.workflow-task-event-trail__audit')
  assert.ok(evidence)
  assert.deepEqual(
    [...evidence.querySelectorAll('dt')].map((item) => item.textContent),
    ['记录分类', '精确时间']
  )
  assert.deepEqual(
    [...evidence.querySelectorAll('dd')].map((item) => item.textContent),
    ['进度', '时间未记录']
  )
})

test('shared current summary keeps cause, responsibility and lifecycle time without pending labels for ended tasks', async (t) => {
  const task = { id: 1, task_status_key: 'blocked', owner_role_key: 'engineering', created_at: 1800000000 }
  const props = { task, roleLabel: '工程', assigneeLabel: '由岗位人员处理', reason: '物料规格待补齐', guidance: '当前账号仅可查看。' }
  const { container, render } = await mount(t, 'WorkflowTaskCurrentSummary', props)
  assert.match(container.textContent, /当前卡点.*工程.*物料规格待补齐.*仅可查看/u)
  assert.ok(container.querySelector('.erp-task-timing--compact'))
  await render({ ...props, task: { ...task, task_status_key: 'done', completed_at: 1800000100 }, reason: '', guidance: '' })
  assert.match(container.textContent, /本任务处理结果/u)
  assert.doesNotMatch(container.textContent, /由岗位人员处理|物料规格待补齐|当前卡点/u)
})

test('numbered previous steps expose one detail at a time and preserve it across a node version refresh', async (t) => {
  const model = {
    ...stageModel,
    items: stageModel.items.map((item, index) => ({
      ...item,
id: index + 1,
key: `${index + 1}:1`,
      ...(index === 0 ? { startedAtLabel: '2026/09/28 02:12:44', completedAtLabel: '2026/09/28 02:12:45' } : {}),
    })),
  }
  const props = { model, focusCurrent: true, compact: true, hideLinkedCurrent: true }
  const { container, render } = await mount(t, 'WorkflowProcessStageTrack', props)
  const history = container.querySelector('.workflow-process-stage__history')
  assert.match(history.querySelector('summary').textContent, /前序 2 步已完成/u)
  assert.doesNotMatch(history.querySelector('summary').textContent, /从早到晚|最近在前/u)
  assert.deepEqual([...history.querySelectorAll('.workflow-process-stage__marker')].map((node) => node.textContent), ['2', '1'])
  const details = [...history.querySelectorAll('.workflow-process-stage__step')]
  assert.ok(details.every((node) => !node.open))
  assert.match(details[1].querySelector('summary').textContent, /已完成.*2026\/09\/28 02:12:45/u)
  await act(async () => details[1].querySelector('summary').click())
  assert.equal(details[1].open, true)
  assert.match(details[1].querySelector('dl').textContent, /处理结果已完成开始时间2026\/09\/28 02:12:44结束时间2026\/09\/28 02:12:45/u)
  await render({ ...props, model: { ...model, items: model.items.map((item) => ({ ...item, key: `${item.id}:2` })) } })
  assert.equal(container.querySelectorAll('.workflow-process-stage__step')[1], details[1])
  assert.equal(details[1].open, true)
  await act(async () => details[0].querySelector('summary').click())
  assert.equal(details[1].open, false)
  assert.equal(details[0].open, true)
  assert.match(details[0].querySelector('dl').textContent, /处理时间时间未记录/u)
  await render(props, 'another-task')
  assert.ok([...container.querySelectorAll('.workflow-process-stage__step')].every((node) => !node.open))
  assert.equal(container.querySelector('.workflow-process-stage__history').open, true)
})

test('previous steps use recorded end times, retain step numbers and leave the full execution trace unchanged', async (t) => {
  const model = {
    ...stageModel,
    items: [
      { id: 11, key: '11:1', label: '先创建后结束', tone: 'completed', completedAt: 1800000200 },
      { id: 12, key: '12:1', label: '同刻撤回', tone: 'withdrawn', completedAt: 1800000300 },
      { id: 13, key: '13:1', label: '后创建先结束', tone: 'completed', completedAt: 1800000100 },
      { id: 14, key: '14:1', label: '同刻退回', tone: 'rejected', completedAt: 1800000300 },
      { id: 15, key: '15:1', label: '结束时间未记录', tone: 'completed' },
      { id: 16, key: '16:1', label: '当前办理', tone: 'active', linked: true, current: true },
    ],
  }
  const originalKeys = model.items.map((item) => item.key)
  const { container, render } = await mount(t, 'WorkflowProcessStageTrack', { model, focusCurrent: true, compact: true, hideLinkedCurrent: true })
  const history = container.querySelector('.workflow-process-stage__history')
  assert.deepEqual([...history.querySelectorAll('.workflow-process-stage__label')].map((node) => node.textContent), ['同刻退回', '同刻撤回', '先创建后结束', '后创建先结束', '结束时间未记录'])
  assert.deepEqual([...history.querySelectorAll('.workflow-process-stage__marker')].map((node) => node.textContent), ['4', '2', '1', '3', '5'])
  assert.deepEqual(model.items.map((item) => item.key), originalKeys)
  assert.equal(history.querySelectorAll('.workflow-process-stage__history-toggle').length, 1)
  await render({ model })
  assert.deepEqual([...container.querySelectorAll('.workflow-process-stage__label')].map((node) => node.textContent), model.items.map((item) => item.label))
})

test('records keep the newest event first with only a count in the heading', async (t) => {
  const props = {
    task: { id: 8 },
state: 'ready',
showResponsibility: false,
collapsible: true,
    events: [
      { id: 52, event_type: 'updated', created_at: 1800000100, reason: '保留原任务办理记录' },
      { id: 51, event_type: 'created', created_at: 1800000000 },
    ],
  }
  const { container, render } = await mount(t, 'WorkflowTaskEventTrail', props)
  assert.match(container.querySelector('summary').textContent, /本任务处理记录2 条/u)
  assert.doesNotMatch(container.querySelector('summary').textContent, /最近在前|从早到晚/u)
  assert.equal(container.querySelectorAll('select, [role="combobox"]').length, 0)
  const rows = [...container.querySelectorAll('.workflow-task-event-trail__item')]
  assert.match(rows[0].textContent, /任务记录已更新.*保留原任务办理记录/u)
  assert.equal(container.querySelectorAll('.workflow-task-event-trail__latest').length, 0)
  assert.match(rows[1].textContent, /任务已创建/u)
  assert.equal(rows[1].querySelector('.workflow-task-event-trail__latest'), null)
  await render({ ...props, events: [] })
  assert.match(container.querySelector('summary').textContent, /暂无记录/u)
  assert.equal(container.querySelector('.workflow-task-event-trail__latest'), null)
  await render({ ...props, state: 'error' })
  assert.match(container.querySelector('.workflow-task-event-trail__head').textContent, /读取失败/u)
  assert.doesNotMatch(container.querySelector('.workflow-task-event-trail__head').textContent, /2 条|最近在前/u)
  await render({ ...props, state: 'loading' })
  assert.match(container.querySelector('.workflow-task-event-trail__head').textContent, /读取中/u)
  assert.doesNotMatch(container.querySelector('.workflow-task-event-trail__head').textContent, /2 条|最近在前/u)
})

test('current step number uses only this task’s linked active node and clears on a source change or terminal result', async (t) => {
  const completed = { id: 11, process_instance_id: 10, node_key: 'submit_sales_order', node_type: 'domain_command', status: 'completed', attempt: 1, version: 1 }
  const current = { id: 12, process_instance_id: 10, node_key: 'order_approval', node_type: 'approval', status: 'active', attempt: 1, version: 1 }
  const processContext = {
    source: { type: 'sales_order', id: 42, no: 'SO-42' },
    process_instance: { id: 10, process_key: 'sales_order_acceptance', process_version: 'v1', status: 'active', started_at: 1800000000 },
    nodes: [completed, current],
current_nodes: [current],
completed_nodes: [completed],
linked_node: current,
    current_responsibilities: [{ node_instance_id: current.id, owner_role_key: 'boss' }],
approval_form: null,
  }
  const task = { id: 1, process_node_instance_id: 12, task_status_key: 'ready', owner_role_key: 'boss', created_at: 1800000000 }
  const props = { task, processContext, roleLabel: '老板' }
  const { container, render } = await mount(t, 'WorkflowTaskCurrentSummary', props)
  assert.equal(container.querySelector('.workflow-task-current__step-number').textContent, '2')
  await render({ ...props, task: { ...task, process_node_instance_id: 99 } })
  assert.equal(container.querySelector('.workflow-task-current__step-number'), null)
  await render({ ...props, task: { ...task, task_status_key: 'done' } })
  assert.equal(container.querySelector('.workflow-task-current__step-number'), null)
  assert.match(container.textContent, /本任务处理结果/u)
})

test('fused task information preserves role and deadline rows, cause and lifecycle truth', async (t) => {
  const props = { task: { id: 33, task_status_key: 'blocked', owner_role_key: 'sales', created_at: 1800000000 }, roleLabel: '业务', assigneeLabel: '由岗位人员处理', appearance: 'facts', reason: '等待客户确认' }
  const { container, render } = await mount(t, 'WorkflowTaskCurrentSummary', props)
  assert.deepEqual([...container.querySelectorAll('dt')].map((el) => el.textContent), ['负责岗位', '处理截止'])
  assert.match(container.querySelector('.workflow-task-info-cause').textContent, /阻塞原因：等待客户确认/u)
  assert.match(container.textContent, /业务.*未设置截止/u)
  await render({ ...props, task: { ...props.task, id: 34, task_status_key: 'done' }, assigneeLabel: '由岗位人员处理', reason: '' })
  assert.equal(container.querySelector('.workflow-task-info-cause'), null)
  assert.doesNotMatch(container.textContent, /等待客户确认|由岗位人员处理/u)
})

test('fused information card uses the same identity and recorded lifecycle on both surfaces', async (t) => {
  const props = { task: { id: 8, task_status_key: 'ready', created_at: 1800000000, owner_role_key: 'engineering', display_context: { available: true, items: [{ kind: 'product', name: '海盐企鹅', code: '27007#' }] } }, title: '核对资料', source: createElement('span', {}, '销售订单 SO-8'), status: '可执行' }
  const { container, render } = await mount(t, 'WorkflowTaskInfoCard', props)
  assert.match(container.querySelector('.erp-task-identity__item').textContent, /销售订单 SO-8.*海盐企鹅/u)
  assert.equal(container.querySelectorAll('[aria-label="复制任务信息"]').length, 0)
  assert.equal(container.querySelectorAll('[aria-label="复制产品信息"]').length, 0)
  assert.equal(container.querySelectorAll('[aria-label="复制产品编号"]').length, 1)
  assert.equal(container.querySelectorAll('.workflow-task-info-card__actions').length, 0, '没有材料入口时不保留空操作行')
  assert.equal(container.querySelectorAll('[data-task-time="arrived"]').length, 1)
  assert.equal(container.querySelector('[data-task-time="due"]'), null)
  await render({ ...props, task: { ...props.task, id: 9, display_context: { available: false, items: [] } }, source: '关联单据已不可用' })
  assert.doesNotMatch(container.textContent, /海盐企鹅|27007#/u)
  assert.equal(container.querySelectorAll('.erp-task-copy').length, 0)
})
