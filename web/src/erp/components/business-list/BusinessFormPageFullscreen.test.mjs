import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h, useContext, useEffect, useState } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('fullscreen retains the mounted draft, pending attachments and clamped scroll positions', async (t) => {
  const nativeAbortController = globalThis.AbortController
  const dom = installTestDOM()
  // The router's Request constructor comes from the host runtime.
  globalThis.AbortController = nativeAbortController
  registerJSXTestLoader()
  const [
    { createRoot },
    { createMemoryRouter, RouterProvider },
    { Form, Input },
    { default: Page },
    { BusinessFormPendingAttachmentsContext },
  ] = await Promise.all([
    import('react-dom/client'),
    import('react-router-dom'),
    import('antd'),
    import('./BusinessFormPage.jsx'),
    import('./BusinessFormPageContext.js'),
  ])
  let setProps
  let form
  function Attachment() {
    const report = useContext(BusinessFormPendingAttachmentsContext)
    const [pending, setPending] = useState(false)
    useEffect(() => report(pending ? 1 : 0), [pending, report])
    return h('button', { onClick: () => setPending(!pending), 'data-attachment': true }, pending ? 'pending.txt' : '添加模拟附件')
  }
  function Harness() {
    const [props, update] = useState({ open: true })
    setProps = update
    ;[form] = Form.useForm()
    return h(
      'div',
      { className: 'erp-admin-shell' },
      h(
        Page,
        { title: '测试单据', form, ...props },
        h(
          Form,
          { form, initialValues: { note: '' } },
          h(Form.Item, { name: 'note' }, h(Input, { 'aria-label': '单据备注' })),
          h('div', { 'data-lines': true }, '宽明细'),
          h(Attachment)
        )
      )
    )
  }
  const router = createMemoryRouter([{ path: '*', element: h(Harness) }], { initialEntries: ['/erp/production/orders'] })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    router.dispose()
    container.remove()
    dom.restore()
  })
  await act(async () => root.render(h(RouterProvider, { router, future: { v7_startTransition: true } })))
  await act(async () => new Promise((resolve) => window.requestAnimationFrame(resolve)))
  const shell = container.querySelector('.erp-admin-shell')
  const editor = container.querySelector('.erp-business-form-page')
  const body = editor.querySelector('.erp-business-form-page__body')
  const lines = editor.querySelector('[data-lines]')
  const input = editor.querySelector('input')
  const attachment = editor.querySelector('[data-attachment]')
  const toggle = () => editor.querySelector('.erp-business-form-page__header button')
  const click = async (button) => act(async () => button.click())
  const render = async (props) => act(async () => setProps({ open: true, ...props }))
  const escape = async () => act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  assert.equal(toggle().textContent, '全屏编辑')
  assert.equal(editor.dataset.fullscreen, undefined)
  await act(async () => form.setFieldsValue({ note: '切换前的单据备注' }))
  await click(attachment)
  assert.equal(editor.dataset.unsaved, 'true')

  // Model the browser's smaller scroll range after the editor grows.
  let top = 280
  let left = 180
  Object.defineProperty(body, 'scrollTop', {
    get: () => Math.min(top, shell.dataset.businessFormFullscreen ? 40 : 300),
    set: (value) => { top = Math.min(value, shell.dataset.businessFormFullscreen ? 40 : 300) },
  })
  Object.defineProperty(lines, 'scrollLeft', {
    get: () => Math.min(left, shell.dataset.businessFormFullscreen ? 20 : 200),
    set: (value) => { left = Math.min(value, shell.dataset.businessFormFullscreen ? 20 : 200) },
  })
  await click(toggle())
  assert.equal(editor.dataset.fullscreen, 'true')
  assert.equal(shell.dataset.businessFormFullscreen, 'true')
  assert.equal(editor.querySelector('input'), input)
  assert.equal(editor.querySelector('[data-attachment]'), attachment)
  assert.equal(form.getFieldValue('note'), '切换前的单据备注')
  assert.equal(input.value, '切换前的单据备注')
  assert.equal(attachment.textContent, 'pending.txt')
  assert.equal(editor.dataset.unsaved, 'true')
  assert.equal(body.scrollTop, 40)
  assert.equal(lines.scrollLeft, 20)
  await click(toggle())
  assert.equal(body.scrollTop, 280, 'returning restores the position clipped by the larger viewport')
  assert.equal(lines.scrollLeft, 180)
  assert.equal(shell.dataset.businessFormFullscreen, undefined)

  await click(toggle())
  body.scrollTop = 30
  lines.scrollLeft = 10
  await click(toggle())
  assert.equal(body.scrollTop, 30, 'scrolling in fullscreen becomes the current reading position')
  assert.equal(lines.scrollLeft, 10)

  await click(toggle())
  input.setAttribute('aria-expanded', 'true')
  await escape()
  assert.equal(editor.dataset.fullscreen, 'true', 'Escape belongs to an open field popup first')
  input.removeAttribute('aria-expanded')
  const calendar = document.createElement('div')
  calendar.className = 'ant-picker-dropdown'
  calendar.getClientRects = () => [{ width: 200, height: 200 }]
  document.body.append(calendar)
  const closeCalendar = () => calendar.remove()
  input.addEventListener('keydown', closeCalendar, { once: true })
  await escape()
  assert.equal(calendar.isConnected, false)
  assert.equal(editor.dataset.fullscreen, 'true', 'closing a calendar must not exit fullscreen on the same keypress')
  await render({ confirmLoading: true })
  assert.equal(toggle().disabled, true)
  await escape()
  assert.equal(editor.dataset.fullscreen, 'true', 'saving keeps the current view stable')
  await render({ confirmLoading: false })
  await escape()
  assert.equal(editor.dataset.fullscreen, undefined)
  assert.equal(form.getFieldValue('note'), '切换前的单据备注')

  await click(toggle())
  await render({ open: false })
  assert.equal(shell.dataset.businessFormFullscreen, undefined)
  await render({ open: true })
  assert.equal(editor.dataset.fullscreen, undefined, 'each fresh editor starts in the normal layout')
  await render({ open: false })
  await act(async () => router.navigate('/m/boss/handle/production/orders'))
  await render({ open: true })
  assert.equal(toggle(), null, 'mobile business pages have no fullscreen entry even in a wide viewport')
})
