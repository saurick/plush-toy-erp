import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { businessFormHarness } from '../../../scripts/test/businessFormHarness.mjs'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('switching pauses content, popups and old commands while the tab strip stays usable', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ BusinessToolbarWorkspace, BusinessOperationPanel }, { default: Modal }] = await Promise.all([
    import('./business-list/BusinessListLayout.jsx'),
    import('../../common/components/modal/AppModal.jsx'),
  ])
  const render = (switching) => ui.render(h(BusinessToolbarWorkspace, {
    switching, contentSwitch: h('button', { role: 'tab', 'aria-selected': true }, '采购跟进'),
  }, h(BusinessOperationPanel, { inWorkspace: true, actions: h('button', null, '旧页导出') }), h('input', { 'aria-label': '旧页草稿', defaultValue: '保留输入' }), h(Modal, { open: true, title: '旧页弹窗', footer: null }, h('span', null, '弹窗内容'))))
  await render(false)
  const draft = document.querySelector('[aria-label="旧页草稿"]')
  const popupHost = document.querySelector('.ant-modal')?.closest('.app-overlay-scope')
  assert.equal(Boolean(popupHost), true)
  await render(true)
  assert.equal(document.querySelector('[role="tab"]').closest('[inert]') === null, true)
  assert.equal(Boolean(draft.closest('[inert][aria-hidden="true"]')), true)
  assert.equal(Boolean(document.querySelector('.erp-business-operation-panel__command-host[inert]')), true)
  assert.equal(popupHost.hidden, true)
  await render(false)
  assert.equal(document.querySelector('[aria-label="旧页草稿"]') === draft, true)
  assert.equal(draft.value, '保留输入')
  assert.equal(draft.closest('[inert]') === null, true)
  assert.equal(popupHost.hidden, false)
})

test('category switches keep navigation active and pause every old operation group', async (t) => {
  const ui = await businessFormHarness(t)
  const { BusinessOperationPanel, SearchInput, SelectionActionBar } = await import('./business-list/BusinessListLayout.jsx')
  await ui.render(h(BusinessOperationPanel, {
    switching: true,
    contentSwitch: h('button', { role: 'tab' }, '库存批次'),
    filters: h(SearchInput, { value: '', onSearch() {} }),
    actions: h('button', null, '导出'),
  }, h(SelectionActionBar, { selectedCount: 1 }, h('button', null, '办理'))))
  assert.equal(document.querySelector('[role="tab"]').closest('[inert]') === null, true)
  assert.equal(Boolean(document.querySelector('input').closest('[inert]')), true)
  const exportButton = [...document.querySelectorAll('button')].find((node) => node.textContent === '导出')
  assert.equal(Boolean(exportButton.closest('[inert]')), true)
  assert.equal(Boolean(document.querySelector('.erp-business-operation-panel__selection[inert]')), true)
})

test('returning to the editor after cancelling a confirmed queued switch rearms browser leave protection', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ ERPThemeProvider }, { createMemoryRouter, RouterProvider }, { default: Page }, { default: SwitchContent }, { BusinessPageContext }, { Form, Input, ConfigProvider }] = await Promise.all([
    import('../../common/theme/erpTheme.jsx'), import('react-router-dom'), import('./business-list/BusinessFormPage.jsx'), import('./BusinessSwitchContent.jsx'), import('../hooks/useBusinessPageContext.js'), import('antd'),
  ])
  let form
  let guard
  const context = { registerPageLeaveGuard: (value) => { guard = value; return () => { guard = null } } }
  const { useState } = await import('react')
  let setPending
  function Scene() {
    const [pending, update] = useState(false)
    setPending = update
    const [recordForm] = Form.useForm()
    form = recordForm
    return h(BusinessPageContext.Provider, { value: context }, h(SwitchContent, { pending }, h(Page, { open: true, form: recordForm, title: '编辑材料' }, h(Form, { form: recordForm, initialValues: { name: '原材料名称' } }, h(Form.Item, { name: 'name' }, h(Input))))))
  }
  const router = createMemoryRouter([{ path: '*', element: h(Scene) }])
  t.after(() => router.dispose())
  await ui.render(h(ERPThemeProvider, null, h(ConfigProvider, { theme: { token: { motion: false } } }, h(RouterProvider, { router, future: { v7_startTransition: true } }))))
  await ui.act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await ui.act(async () => form.setFieldValue('name', '仍需保护的材料输入'))
  await ui.flush()
  let confirmation
  await ui.act(async () => { confirmation = guard() })
  await ui.act(async () => [...document.querySelectorAll('button')].find((node) => node.textContent.replace(/\s/gu, '') === '放弃修改').click())
  assert.equal(await confirmation, true)
  const protectedLeave = () => {
    const event = new window.Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }
  assert.equal(protectedLeave(), false, '已确认离开时允许实际导航')
  await ui.act(async () => setPending(true))
  await ui.act(async () => setPending(false))
  assert.equal(protectedLeave(), true, '取消排队切换后重新保护仍在编辑的草稿')
  assert.equal(form.getFieldValue('name'), '仍需保护的材料输入')
})
