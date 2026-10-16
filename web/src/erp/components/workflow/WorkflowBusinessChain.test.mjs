import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { registerJSXTestLoader, installTestDOM } from '../../../../scripts/test/reactRuntime.mjs'

test('explicit order overview groups parallel tasks and highlights the selected task', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Chain }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowBusinessChain.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  JsonRpc.prototype.call = async () => ({ data: {
    truncated: false,
    items: Array.from({ length: 6 }, (_, index) => ({
    id: index + 1, task_name: '采购到货点数', task_status_key: index === 5 ? 'blocked' : 'ready', owner_role_key: 'warehouse', discovery: { stage_key: 'purchase_count' }, source_type: 'purchase_order', source_no: `PO-${index + 1}`,
    })),
  } })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); JsonRpc.prototype.call = original; dom.restore() })
  await act(async () => root.render(createElement(Chain, { view: 'order', task: { id: 1, version: 1, source_type: 'purchase_order' }, profile: { id: 12, permissions: ['workflow.task.read'], effective_session: { actions: ['workflow.task.read'] } } })))
  const group = container.querySelector('.workflow-business-chain__group[data-current]')
  assert.equal(group.tagName, 'SECTION')
  assert.equal(container.querySelectorAll('.workflow-business-chain__node').length, 7)
  assert.equal(container.querySelectorAll('.workflow-business-chain__node[aria-expanded="true"]').length, 1)
  assert.equal(group.querySelectorAll('.workflow-business-chain__stage-content > ul > li').length, 2)
  assert.match(group.querySelector('li[aria-current]').textContent, /PO-1/u)
  const related = group.querySelector('.workflow-business-chain__related')
  assert.equal(related.open, false)
  assert.equal(related.querySelectorAll('li').length, 4)
  assert.match(related.querySelector('summary').textContent, /其他任务 4 项/u)
  assert.equal(container.querySelector('h4'), null)
  const shipping = [...container.querySelectorAll('.workflow-business-chain__node')].find((node) => node.textContent.includes('放行与发货'))
  await act(async () => shipping.click())
  assert.equal(group.querySelector('.workflow-business-chain__stage-content'), null)
  assert.match(container.textContent, /当前账号暂无本阶段可见任务/u)
  assert.doesNotMatch(container.textContent, /PO-1/u)
  await act(async () => shipping.click())
  assert.equal(container.querySelectorAll('.workflow-business-chain__stage-content').length, 0)
})

test('many blocked exceptions remain visible as a summary without expanding every task', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Chain }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowBusinessChain.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  JsonRpc.prototype.call = async () => ({ data: { truncated: false,
items: [...Array.from({ length: 67 }, (_, index) => ({
    id: index + 1,
task_name: `异常任务 ${index + 1}`,
task_status_key: index === 0 ? 'ready' : 'blocked',
    owner_role_key: 'production',
source_type: 'production_exception_decision',
exception_id: 8,
  })), { id: 68, task_name: '待核对任务', owner_role_key: 'production', task_status_key: 'ready', source_type: 'production_order', discovery: { stage_key: 'unclassified' } }] } })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); JsonRpc.prototype.call = original; dom.restore() })
  await act(async () => root.render(createElement(Chain, { view: 'order', task: { id: 1, version: 1, source_type: 'production_exception_decision' }, profile: { id: 12, permissions: ['workflow.task.read'], effective_session: { actions: ['workflow.task.read'] } } })))
  const branch = container.querySelector('[aria-label="异常分支"]')
  assert.equal(branch.querySelector('button').getAttribute('aria-expanded'), 'true')
  assert.match(branch.querySelector('button').textContent, /66 项受阻/u)
  assert.equal(branch.querySelectorAll('.workflow-business-chain__stage-content > ul > li').length, 2)
  assert.match(branch.querySelector('summary').textContent, /其他任务 65 项 · 65 项受阻/u)
  assert.equal(branch.querySelector('details').open, false)
  assert.equal(container.querySelectorAll('.workflow-business-chain__stage-content').length, 1)
  const main = container.querySelector('[aria-label="订单阶段"]')
  assert.deepEqual([...main.querySelectorAll('.workflow-process-stage__marker')].map((marker) => marker.textContent), ['1', '2', '3', '4', '5', '6', '7'])
  const unknown = container.querySelector('[aria-label="待核对环节"]')
  assert.equal(main.contains(unknown), false)
  assert.equal(unknown.querySelector('.workflow-process-stage__marker').textContent, '?')
  assert.equal(branch.dataset.pending, 'true')
  assert.ok(branch.querySelector('[aria-label="branches"]'))
  JsonRpc.prototype.call = async () => ({ data: { truncated: false, items: [{ id: 1, task_name: '已结束的异常任务', owner_role_key: 'production', task_status_key: 'done', source_type: 'production_exception_decision', exception_id: 8 }] } })
  await act(async () => root.render(createElement(Chain, { view: 'order', task: { id: 1, version: 2, source_type: 'production_exception_decision' }, profile: { id: 12, permissions: ['workflow.task.read'], effective_session: { actions: ['workflow.task.read'] } } })))
  assert.equal(container.querySelector('[aria-label="异常分支"]').hasAttribute('data-pending'), false)
  assert.match(container.querySelector('[aria-label="异常分支"]').textContent, /可见任务已结束/u)
})

test('business chain retries failed reads and aborts stale reads on task or permission changes', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Chain }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowBusinessChain.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  let fail = true
  let pending
  const calls = []
  JsonRpc.prototype.call = async function call(method, params, options) {
    calls.push({ method, params, options })
    assert.equal(method, 'get_task_handling_chain')
    if (pending) return pending
    if (fail) throw new Error('read failed')
    return { data: { truncated: false, items: [{ id: params.task_id, task_name: '本订单包装', task_status_key: 'ready', task_group: 'handoff_production_packaging', owner_role_key: 'warehouse', source_type: 'production_wip_batch' }] } }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const profile = { id: 12, permissions: ['workflow.task.read'], effective_session: { actions: ['workflow.task.read'] } }
  const render = (id = 1, user = profile) => act(async () => root.render(createElement(Chain, { task: { id, version: 1, source_type: 'production_wip_batch' }, profile: user })))
  t.after(async () => { await act(async () => root.unmount()); container.remove(); JsonRpc.prototype.call = original; dom.restore() })
  await render()
  assert.match(container.textContent, /读取失败/u)
  fail = false
  await act(async () => container.querySelector('button').click())
  assert.match(container.textContent, /本订单包装/u)
  let resolve
  pending = new Promise((done) => { resolve = done })
  await render(2)
  assert.doesNotMatch(container.textContent, /本订单包装/u)
  const reading = calls.at(-1)
  await render(2, { id: 12, permissions: [], effective_session: { actions: [] } })
  assert.equal(reading.options.signal.aborted, true)
  await act(async () => resolve({ data: { items: [], truncated: false } }))
  assert.equal(container.textContent, '')
})

test('failed continuation keeps earlier tasks and retries the same page without losing the selected task', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Chain }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowBusinessChain.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  let failContinuation = true
  const offsets = []
  JsonRpc.prototype.call = async function call(method, params) {
    offsets.push(params.offset || 0)
    if (params.offset && failContinuation) throw new Error('temporary read failure')
    return { data: { truncated: !params.offset, items: [{ id: params.offset ? 101 : 1, task_name: params.offset ? '后续复检' : '本批次清点', task_status_key: 'ready', owner_role_key: 'warehouse', source_type: 'production_wip_batch' }] } }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); JsonRpc.prototype.call = original; dom.restore() })
  await act(async () => root.render(createElement(Chain, { task: { id: 1, version: 1, source_type: 'production_wip_batch' }, profile: { id: 12, permissions: ['workflow.task.read'], effective_session: { actions: ['workflow.task.read'] } } })))
  await act(async () => container.querySelector('button').click())
  assert.match(container.textContent, /读取失败/u)
  assert.match(container.querySelector('li[aria-current]').textContent, /本批次清点/u)
  failContinuation = false
  await act(async () => container.querySelector('button').click())
  assert.deepEqual(offsets, [0, 100, 100])
  assert.match(container.textContent, /本批次清点/u)
  assert.match(container.textContent, /后续复检/u)
  assert.equal(container.querySelectorAll('li').length, 2)
  assert.equal(container.querySelector('[role="alert"]'), null)
})
