import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('a task keeps all business drafts protected when a sibling editor closes, saves or becomes busy', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ App, Form, Input }, { createMemoryRouter, RouterProvider }, { default: Group, useBusinessEditorGroup }, { default: Page }, { BusinessPageContext }, { default: EditorWorkspace, BusinessEditorPane }] = await Promise.all([
    import('antd'), import('react-router-dom'), import('./BusinessEditorGroup.jsx'), import('./BusinessFormPage.jsx'), import('../../hooks/useBusinessPageContext.js'), import('./BusinessEditorWorkspace.jsx'),
  ])
  const forms = {}
  const actionHost = document.createElement('div')
  document.body.appendChild(actionHost)
  t.after(() => actionHost.remove())
  let choosePane
  const { registerAntdAppApis } = await import('../../../common/utils/antdApp.js')
  function APIs() {
    const api = App.useApp()
    React.useEffect(() => { registerAntdAppApis(api); return () => registerAntdAppApis({}) }, [api])
    return null
  }
  const editing = []
  let hostGuard
  let groupAPI
  function Probe() { groupAPI = useBusinessEditorGroup(); return null }
  let update
  const context = { registerPageLeaveGuard: (guard) => { hostGuard = guard; return () => { hostGuard = null } }, taskBusiness: { actionHost, onFormEditingChange: (value) => editing.push(value) } }
  function Editor({ name, settings }) {
    const [form] = Form.useForm()
    forms[name] = form
    return h(Page, { open: settings.open, form, readOnly: settings.readOnly, baselineKey: settings.revision, confirmLoading: settings.saving, title: name, okText: `保存${name}`, onOk: () => {} }, h(Form, { form, initialValues: { value: `${name}原值` } }, h(Form.Item, { name: 'value', label: name }, h(Input))))
  }
  function Workspace() {
    const [settings, setSettings] = React.useState({ product: { open: true, revision: 1 }, sku: { open: true, revision: 1 }, bom: { open: true, revision: 1 } })
    const [view, setView] = React.useState('product')
    choosePane = setView
    update = (name, value) => setSettings((current) => ({ ...current, [name]: { ...current[name], ...value } }))
    return h(App, null, h(APIs), h(BusinessPageContext.Provider, { value: context }, h(Group, null, h(Probe), h(EditorWorkspace, { open: true }, Object.keys(settings).map((name) => h(BusinessEditorPane, { key: name, value: name, label: `${name}内容`, active: view === name }, h(Editor, { name, settings: settings[name] })))))))
  }
  const router = createMemoryRouter([{ path: '*', element: h(Workspace) }])
  t.after(() => router.dispose())
  await ui.render(h(RouterProvider, { router, future: { v7_startTransition: true } }))
  await ui.act(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))))
  assert.equal(editing.at(-1), true)
  assert.equal(ui.container.querySelectorAll('[role="tablist"]').length, 0, 'the editor host adds no cross-object tab navigation')
  assert.equal(ui.container.textContent.includes('返回办理'), false)
  assert.equal(actionHost.querySelectorAll('button').length, 1, 'only the active editor publishes a save action')
  assert.ok(actionHost.textContent.includes('保存product'))
  await ui.act(() => choosePane('bom'))
  assert.ok(actionHost.textContent.includes('保存bom'))
  assert.equal(actionHost.querySelectorAll('button').length, 1)
  await ui.act(() => forms.bom.setFieldValue('value', '尚未保存的 BOM 用量'))
  assert.equal(ui.container.querySelector('[data-business-form-page][aria-label="bom"]').dataset.unsaved, 'true')
  assert.deepEqual(groupAPI.pending(forms.product).map(({ title, dirty, saving }) => ({ title, dirty, saving })), [{ title: 'bom', dirty: true, saving: false }])
  assert.deepEqual(groupAPI.pending(forms.bom), [])
  await ui.act(() => choosePane('product'))
  await ui.act(() => update('bom', { readOnly: true }))
  assert.equal(ui.container.querySelector('[data-business-form-page][aria-label="bom"]').dataset.unsaved, 'true', 'a task becoming read-only cannot discard an existing business draft')
  assert.equal(forms.bom.getFieldValue('value'), '尚未保存的 BOM 用量', 'switching editor content keeps its draft')
  assert.ok(actionHost.textContent.includes('保存product'))
  assert.equal(actionHost.querySelectorAll('button').length, 1)
  await ui.act(() => update('sku', { open: false }))
  assert.equal(editing.at(-1), true, 'closing one editor does not release the whole task')
  let pending
  await ui.act(() => { pending = hostGuard() })
  await ui.flush()
  assert.ok(document.body.textContent.includes('放弃未保存的修改'))
  const keep = [...document.body.querySelectorAll('.ant-modal button')].find((node) => /继续/u.test(node.textContent))
  assert.ok(keep)
  await ui.act(() => keep.click())
  assert.equal(await pending, false)
  assert.equal(forms.bom.getFieldValue('value'), '尚未保存的 BOM 用量')
  assert.equal(forms.product.getFieldValue('value'), 'product原值')
  await ui.act(() => update('bom', { readOnly: false }))
  await ui.act(() => update('bom', { revision: 2 }))
  await ui.act(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))))
  let allowed
  await ui.act(async () => { allowed = await hostGuard() })
  assert.equal(allowed, true, 'a confirmed save resets only that editor baseline')
  await ui.act(() => update('product', { saving: true }))
  assert.equal(groupAPI.busy, true)
  await ui.act(async () => { allowed = await hostGuard() })
  assert.equal(allowed, false, 'a sibling business write locks task leave')
  await ui.act(() => update('product', { saving: false }))
  await ui.act(async () => { allowed = await hostGuard() })
  assert.equal(allowed, true)
})
