import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'

test('没有来源表单时手机复杂编制展示电脑办理提示，已办支持来回查看', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: Screen } = await import('./MobileTaskActionScreen.jsx')
  let mounted = 0
  let back = 0
  let receipts = 0
  const task = { task_name: '准备产品资料', task_group: 'engineering_data', task_status_key: 'ready' }
  const renderSourceAction = () => { mounted += 1; return h('form', { 'data-full-editor': true }) }
  const props = { task, selectedAction: 'done', onBack: () => { back += 1 }, onViewReceipt: () => { receipts += 1 } }
  const render = (changes) => ui.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Screen, { ...props, ...changes })))
  await render()
  assert.equal(mounted, 0)
  assert.equal(Boolean(ui.container.querySelector('form')), false)
  assert.match(ui.container.textContent, /请在电脑办理/)
  assert.equal(ui.container.querySelector('[data-step-key="result"]').disabled, true)
  for (const task_status_key of ['done', 'rejected', 'withdrawn']) {
    await render({ task: { ...task, task_status_key }, canViewReceipt: true })
    assert.equal(ui.container.querySelector('[data-step-key="result"]').disabled, false)
    await ui.act(() => ui.container.querySelector('[data-step-key="result"]').click())
    await ui.act(() => ui.container.querySelector('[data-step-key="detail"]').click())
    assert.doesNotMatch(ui.container.textContent, /请在电脑办理/)
  }
  assert.equal(back, 3)
  assert.equal(receipts, 3)
  assert.equal(mounted, 0)
  await render({ task: { ...task, required_capability_key: PermissionCode.ENGINEERING_MATERIAL_BOSS_APPROVE }, renderSourceAction })
  assert.equal(mounted, 1, '同一工程来源的审批仍保留手机办理')
  await render({ task: { task_group: 'handoff_purchase_arrival', discovery: { stage_key: 'purchasing' } }, renderSourceAction })
  assert.equal(mounted, 2, '采购来源的仓库点数仍保留手机办理')
})

test('手机复杂编制保留共享来源表单的只读资料和结果入口', async (t) => {
  const ui = await createReactTestHarness(t)
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body)
    assert.equal(request.method, 'list_attachments')
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { code: 0, data: { attachments: [] } } }), { headers: { 'Content-Type': 'application/json' } })
  })
  const { default: Screen } = await import('./MobileTaskActionScreen.jsx')
  let receipts = 0
  const task = { id: 1, version: 1, task_name: '准备产品资料', task_group: 'engineering_data', task_status_key: 'ready' }
  await ui.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Screen, {
    task,
    selectedAction: 'done',
    canManageAttachments: true,
    renderSourceAction: (layout) => layout({
      content: h('section', { 'aria-label': '工程资料' }, '订单产品与 BOM 明细'),
      taskForm: true,
      readOnly: true,
      canViewReceipt: true,
      onViewReceipt: () => { receipts += 1 },
    }),
  })))
  assert.match(ui.container.querySelector('[aria-label="工程资料"]').textContent, /订单产品与 BOM 明细/u)
  assert.equal(Boolean(ui.container.querySelector('form, input, textarea, select')), false)
  const footer = ui.container.querySelector('.mobile-task-action-footer')
  const notice = footer.querySelector('[role="note"][aria-label="编辑方式"]')
  assert.equal(notice?.textContent, 'BOM 仅供查看，请在电脑端编辑。')
  assert.equal(footer.firstElementChild === notice, true, '设备限制先于附件与任务操作显示')
  assert.equal(notice.querySelector('strong')?.textContent, '请在电脑端编辑。')
  assert.equal(Boolean(footer.querySelector('[data-testid="mobile-task-attachment-action"]')), true)
  assert.doesNotMatch(ui.container.textContent, /电脑编制/u)
  const result = ui.container.querySelector('[data-step-key="result"]')
  assert.equal(result.disabled, false)
  await ui.act(() => result.click())
  assert.equal(receipts, 1)
})
