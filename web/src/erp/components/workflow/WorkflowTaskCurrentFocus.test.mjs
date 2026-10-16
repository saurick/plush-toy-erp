import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

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
