import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'

test('手机复杂编制不挂载完整编辑器，待办锁定回执，已办支持来回查看', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: Screen } = await import('./MobileTaskActionScreen.jsx')
  let mounted = 0
  let back = 0
  let receipts = 0
  const task = { task_name: '准备产品资料', task_group: 'engineering_data', task_status_key: 'ready' }
  const props = { task, selectedAction: 'done', onBack: () => { back += 1 }, onViewReceipt: () => { receipts += 1 }, renderSourceAction: () => { mounted += 1; return h('form', { 'data-full-editor': true }) } }
  const render = (changes) => ui.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Screen, { ...props, ...changes })))
  await render()
  assert.equal(mounted, 0)
  assert.equal(ui.container.querySelector('form'), null)
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
  await render({ task: { ...task, required_capability_key: PermissionCode.ENGINEERING_MATERIAL_BOSS_APPROVE } })
  assert.equal(mounted, 1, '同一工程来源的审批仍保留手机办理')
  await render({ task: { task_group: 'handoff_purchase_arrival', discovery: { stage_key: 'purchasing' } } })
  assert.equal(mounted, 2, '采购来源的仓库点数仍保留手机办理')
})
