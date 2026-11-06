import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement, useState } from 'react'
import {
  registerJSXTestLoader,
  installTestDOM,
  createReactTestHarness,
} from '../../../../scripts/test/reactRuntime.mjs'

test('task form owns its footer without duplicate page actions or focus jumps, and closed sibling forms do not clear editing', async (t) => {
  const ui = await createReactTestHarness(t)
  const { ERPThemeProvider } = await import('../../../common/theme/erpTheme.jsx')
  const [{ createMemoryRouter, RouterProvider }, { default: Page }, { BusinessPageContext }] = await Promise.all([
    import('react-router-dom'), import('./BusinessFormPage.jsx'), import('../../hooks/useBusinessPageContext.js'),
  ])
  const changes = []
  const context = { taskBusiness: { onFormEditingChange: (value) => changes.push(value) } }
  const trigger = document.createElement('button')
  document.body.append(trigger)
  t.after(() => trigger.remove())
  trigger.focus()
  let setOpen
  function Forms() {
    const [open, update] = useState(true)
    setOpen = update
    return createElement(BusinessPageContext.Provider, { value: context }, createElement(Page, { open, title: '核对本次出货', showCancel: false, okText: '保存并提交审批', secondaryAction: createElement('button', null, '保存草稿'), onOk: () => {} }, createElement('input', { 'aria-label': '数量' })), createElement(Page, { open: false, title: '其他业务表单' }))
  }
  const router = createMemoryRouter([{ path: '*', element: createElement(Forms) }])
  t.after(() => router.dispose())
  await ui.render(createElement(ERPThemeProvider, null, createElement(RouterProvider, { router, future: { v7_startTransition: true } })))
  await ui.flush()
  assert.deepEqual(changes, [true])
  assert.equal(document.activeElement === trigger, true)
  assert.equal(ui.container.querySelector('.erp-business-form-page:not([hidden]) .erp-business-form-page__header h2')?.textContent, '核对本次出货')
  assert.deepEqual([...ui.container.querySelectorAll('button')].filter((node) => !node.closest('[hidden]')).map((node) => node.textContent.trim()), ['保存草稿', '保存并提交审批'])
  await act(async () => setOpen(false))
  assert.deepEqual(changes, [true, false])
})

test('a retained editor only takes initial focus when its pane is active and visible', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ ERPThemeProvider }, { createMemoryRouter, RouterProvider }, { default: Page }, { BusinessEditorPane }, { BusinessSplitContext }, { Form, Input }] = await Promise.all([
    import('../../../common/theme/erpTheme.jsx'), import('react-router-dom'), import('./BusinessFormPage.jsx'), import('./BusinessEditorWorkspace.jsx'), import('./BusinessSplitContext.jsx'), import('antd'),
  ])
  let updateVisibility
  let form
  const trigger = document.createElement('button')
  document.body.append(trigger)
  t.after(() => trigger.remove())
  trigger.focus()
  function Harness() {
    const [visible, setVisible] = useState(false)
    updateVisibility = setVisible
    const [recordForm] = Form.useForm()
    form = recordForm
    return createElement(BusinessSplitContext.Provider, { value: { open: true, visible, handlingNavigation: true } }, createElement(BusinessEditorPane, { value: 'record', label: '保留的材料编辑区', active: visible, autoFocus: true }, createElement(Page, { open: true, form: recordForm, title: '新建材料档案' }, createElement(Form, { form: recordForm, initialValues: { name: '保留的材料输入' } }, createElement(Form.Item, { name: 'name' }, createElement(Input))))))
  }
  const router = createMemoryRouter([{ path: '*', element: createElement(Harness) }])
  t.after(() => router.dispose())
  await ui.render(createElement(ERPThemeProvider, null, createElement(RouterProvider, { router, future: { v7_startTransition: true } })))
  const frames = () => ui.act(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))))
  await frames()
  assert.equal(document.activeElement === trigger, true, 'hidden retained forms do not take focus')
  await ui.act(async () => updateVisibility(true))
  await frames()
  assert.equal(ui.container.querySelector('.erp-business-form-page').contains(document.activeElement), true, 'the receiving editor can focus when revealed')
  await ui.act(async () => updateVisibility(false))
  trigger.focus()
  await frames()
  assert.equal(document.activeElement === trigger, true)
  assert.equal(form.getFieldValue('name'), '保留的材料输入')
})

test('an explicit return receives the current dirty state without dropping leave protection', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ ERPThemeProvider }, { createMemoryRouter, RouterProvider }, { default: Page }, { Form, Input }] = await Promise.all([
    import('../../../common/theme/erpTheme.jsx'), import('react-router-dom'), import('./BusinessFormPage.jsx'), import('antd'),
  ])
  const returns = []
  let form
  let discarded = 0
  function Harness() {
    const [recordForm] = Form.useForm()
    form = recordForm
    return createElement(Page, { open: true, form: recordForm, title: '材料输入', onReturn: ({ dirty }) => returns.push(dirty), onCancel: () => { discarded += 1 } }, createElement(Form, { form: recordForm, initialValues: { name: '原材料名' } }, createElement(Form.Item, { name: 'name' }, createElement(Input))))
  }
  const router = createMemoryRouter([{ path: '*', element: createElement(Harness) }])
  t.after(() => router.dispose())
  await ui.render(createElement(ERPThemeProvider, null, createElement(RouterProvider, { router, future: { v7_startTransition: true } })))
  const frames = () => ui.act(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))))
  await frames()
  const back = () => [...ui.container.querySelectorAll('button')].find((node) => node.textContent === '返回列表')
  await ui.act(async () => back().click())
  assert.deepEqual(returns, [false])
  await ui.act(async () => form.setFieldValue('name', '修改后的材料名'))
  await frames()
  await ui.act(async () => back().click())
  assert.deepEqual(returns, [false, true])
  assert.equal(discarded, 0)
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  const unload = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  assert.equal(unload.defaultPrevented, true, 'the retained dirty form still protects browser leave')
})

test('batch save can validate another draft before the current invalid form and still focus its error', async (t) => {
  const ui = await createReactTestHarness(t)
  const { ERPThemeProvider } = await import('../../../common/theme/erpTheme.jsx')
  const [{ createMemoryRouter, RouterProvider }, { default: Page }, { Form, Input }] = await Promise.all([
    import('react-router-dom'), import('./BusinessFormPage.jsx'), import('antd'),
  ])
  let delegate
  let calls = 0
  const focusRequests = []
  function Harness() {
    const [form] = Form.useForm()
    // DOM 单测记录焦点委派；原生滚动的几何与定位由浏览器回归核对。
    form.scrollToField = (name, options) => {
      focusRequests.push({ name, focus: options.focus })
      if (options.focus) document.getElementById(name.join('_'))?.focus()
    }
    const [batch, setBatch] = useState(false)
    delegate = () => setBatch(true)
    const current = createElement(Form.Item, { name: 'current', rules: [{ required: true, message: '当前单缺客户' }] }, createElement(Input))
    const previous = createElement(Form.Item, { name: 'previous' }, createElement(Input))
    return createElement(Page, {
      open: true,
      title: '批量复核',
      form,
      validateOnSave: !batch,
      onOk: async () => {
        calls += 1
        const errorFields = [{ name: ['previous'], errors: ['请核对前一单邮箱'] }]
        form.setFields(errorFields)
        throw Object.assign(new Error('前一单有误'), { errorFields })
      },
    }, createElement(Form, { form }, current, previous))
  }
  const router = createMemoryRouter([{ path: '*', element: createElement(Harness) }])
  t.after(() => router.dispose())
  await ui.render(createElement(ERPThemeProvider, null, createElement(RouterProvider, { router, future: { v7_startTransition: true } })))
  const frames = () => ui.act(() => new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))))
  await frames()
  const save = () => ui.container.querySelector('button[aria-label="保存"]')
  await ui.act(async () => save().click())
  await frames()
  assert.equal(calls, 0, 'ordinary forms still block saving their invalid current fields')
  await ui.act(async () => delegate())
  await ui.act(async () => save().click())
  await frames()
  assert.equal(calls, 1, 'the batch controller receives the save action before current-form validation')
  assert.deepEqual(focusRequests.at(-1), { name: ['previous'], focus: true })
  assert.equal(document.activeElement?.id, 'previous', 'delegated validation keeps shared error focus')
  assert.equal(ui.container.querySelector('#current').value, '')
})

test('deferred form autofocus preserves a field chosen before initialization finishes', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const { ERPThemeProvider } = await import('../../../common/theme/erpTheme.jsx')
  const [
    { createRoot },
    { createMemoryRouter, RouterProvider },
    { default: Page },
  ] = await Promise.all([
    import('react-dom/client'),
    import('react-router-dom'),
    import('./BusinessFormPage.jsx'),
  ])
  const frames = new Map()
  let frameID = 0
  window.requestAnimationFrame = (callback) => {
    frames.set(++frameID, callback)
    return frameID
  }
  window.cancelAnimationFrame = (id) => frames.delete(id)
  const flushFrames = async () => {
    for (let iteration = 0; frames.size && iteration < 10; iteration++) {
      const batch = [...frames.values()]
      frames.clear()
      await act(async () => batch.forEach((callback) => callback(0)))
    }
    assert.equal(frames.size, 0, 'initialization must settle')
  }
  let setProps
  function Harness() {
    const [props, update] = useState({ open: false })
    setProps = update
    return createElement(
      Page,
      { title: '退款表单', ...props },
      createElement('label', { htmlFor: 'refund-reason' }, '退款原因'),
      createElement('input', { id: 'refund-reason' }),
      createElement('label', { htmlFor: 'payment-number' }, '收付款单号'),
      createElement('input', { id: 'payment-number' })
    )
  }
  const router = createMemoryRouter([
    { path: '*', element: createElement(Harness) },
  ])
  const container = document.createElement('div')
  const trigger = document.createElement('button')
  document.body.append(trigger, container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    router.dispose()
    container.remove()
    trigger.remove()
    dom.restore()
  })
  await act(async () =>
    root.render(
      createElement(ERPThemeProvider, null, createElement(RouterProvider, {
        router,
        future: { v7_startTransition: true },
      }))
    )
  )
  for (const input of container.querySelectorAll('input')) {
    input.getClientRects = () => [{ width: 100, height: 40 }]
  }
  const reason = container.querySelector('#refund-reason')
  const number = container.querySelector('#payment-number')
  const render = async (props) => act(async () => setProps(props))

  trigger.focus()
  await render({ open: true })
  assert.ok(frames.size > 0)
  number.focus()
  number.value = 'SIM-REFUND-001'
  await flushFrames()
  assert.equal(
    document.activeElement.id,
    'payment-number',
    'initial autofocus must not replace the user-selected field'
  )
  assert.equal(reason.value, '')
  assert.equal(number.value, 'SIM-REFUND-001')

  await render({ open: false })
  await flushFrames()
  assert.equal(document.activeElement === trigger, true)
  await render({ open: true })
  await flushFrames()
  assert.equal(
    document.activeElement,
    reason,
    'a fresh untouched form still focuses its first editable field'
  )

  await render({ open: false })
  await flushFrames()
  await render({ open: true, loading: true })
  await flushFrames()
  assert.equal(document.activeElement === trigger, true)
  await render({ open: true, loading: false })
  number.focus()
  await flushFrames()
  assert.equal(
    document.activeElement.id,
    'payment-number',
    'finishing a reference load must preserve the active input'
  )

  await render({ open: false })
  await flushFrames()
  await render({ open: true, readOnly: true })
  await flushFrames()
  assert.equal(document.activeElement === container.querySelector('h1'), true)
})
