import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useEffect, useState } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('三步往返保留输入，版本更新保留当前办理并清除隐藏快照，换账号或任务重置', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: Panels } = await import('./MobileTaskStepPanels.jsx')
  const reads = { detail: 0, action: 0, receipt: 0 }
  function Step({ name, allowed = true }) {
    const [value, setValue] = useState(0)
    useEffect(() => { reads[name] += 1 }, [name])
    return h('section', null, h('h1', { tabIndex: -1 }, name), h('output', null, value), h('button', { disabled: !allowed, onClick: () => setValue(value + 1) }, '录入'))
  }
  const render = (step, scope = 'sales:31', allowed = true, version = 1) => ui.render(h(Panels, { scopeKey: scope, activeStep: step, version }, h(Step, { name: step, allowed })))
  await render('detail')
  const detail = ui.container.querySelector('[data-task-panel="detail"] section')
  await render('action')
  const action = ui.container.querySelector('[data-task-panel="action"] section')
  await ui.act(() => action.querySelector('button').click())
  await render('detail')
  await render('action')
  assert.equal(ui.container.querySelector('[data-task-panel="detail"] section') === detail, true)
  assert.equal(ui.container.querySelector('[data-task-panel="action"] section') === action, true)
  assert.equal(action.querySelector('output').textContent, '1')
  assert.equal(reads.detail, 1)
  assert.equal(reads.action, 1)
  assert.equal(ui.container.querySelector('[data-task-panel="detail"]').hidden, true)
  await render('receipt')
  await render('action', 'sales:31', false)
  assert.equal(action.querySelector('button').disabled, true, '重新进入采用最新授权')
  await render('action', 'sales:31', false, 2)
  assert.equal(ui.container.querySelector('[data-task-panel="action"] section') === action, true, '版本更新不重建当前办理页')
  assert.equal(action.querySelector('output').textContent, '1')
  assert.equal(reads.action, 1)
  assert.equal(ui.container.querySelector('[data-task-panel="detail"]').childElementCount, 0)
  assert.equal(ui.container.querySelector('[data-task-panel="receipt"]').childElementCount, 0)
  for (const scope of ['finance:31', 'finance:32']) {
    await render('detail', scope)
    assert.equal(ui.container.querySelector('[data-task-panel="action"]').childElementCount, 0)
    assert.equal(ui.container.querySelector('[data-task-panel="receipt"]').childElementCount, 0)
  }
})

test('the same source editor projects its information into step one and retains input across steps', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ default: Panels }, { TaskBusinessInformationContext }, { createPortal }, React] = await Promise.all([import('./MobileTaskStepPanels.jsx'), import('../../hooks/useBusinessPageContext.js'), import('react-dom'), import('react')])
  let mounts = 0
  function Detail() {
    const information = React.useContext(TaskBusinessInformationContext)
    return h('main', null, h('h1', null, '任务信息'), h('div', { ref: information.setHost, 'data-testid': 'source-information' }))
  }
  function Editor() {
    const information = React.useContext(TaskBusinessInformationContext)
    const [value, setValue] = useState('原值')
    useEffect(() => { mounts += 1 }, [])
    return h('main', null, h('h1', null, '任务办理'), information.host ? createPortal(h('p', null, '本次来源资料 SOURCE-7'), information.host) : null, h('input', { value, onChange: (event) => setValue(event.target.value) }))
  }
  const render = (step) => ui.render(h(Panels, { scopeKey: 'sales:7', version: 1, activeStep: step, panels: { detail: h(Detail), action: h(Editor) } }, step === 'detail' ? h(Detail) : h(Editor)))
  await render('detail')
  assert.match(ui.container.querySelector('[data-task-panel="detail"]').textContent, /SOURCE-7/u)
  assert.doesNotMatch(ui.container.querySelector('[data-task-panel="action"]').textContent, /SOURCE-7/u)
  const input = ui.container.querySelector('input')
  await render('action')
  await ui.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '保留本次输入')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await render('detail')
  await render('action')
  assert.equal(ui.container.querySelector('input') === input, true)
  assert.equal(input.value, '保留本次输入')
  assert.equal(mounts, 1)
})
