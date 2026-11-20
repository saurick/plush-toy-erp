import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, createRef, useState } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('section focus follows fields and their portals without remounting draft values', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ default: Body }, { default: Section }, { createPortal }] = await Promise.all([
    import('./BusinessFormBody.jsx'),
    import('./BusinessFormSection.jsx'),
    import('react-dom'),
  ])
  const portal = document.createElement('div')
  document.body.append(portal)
  t.after(async () => { await ui.unmount(); portal.remove() })
  let update
  function Harness() {
    const [options, setOptions] = useState({ open: true, active: true, loading: false })
    update = setOptions
    return h(
      Body,
      options,
      h(Section, { title: '生产计划' }, h('input', { 'aria-label': '计划备注', defaultValue: '保留草稿' })),
      h(
        Section,
        { title: '生产明细', showHeading: false, layout: 'content' },
        h('input', { 'aria-label': '计划数量', defaultValue: '3' }),
        createPortal(h('input', { 'aria-label': '本行浮层搜索' }), portal)
      ),
      h(Section, { title: '冻结资料' }, h('input', { 'aria-label': '冻结值', disabled: true, defaultValue: 'BOM-2' }))
    )
  }
  await ui.render(h(Harness))
  const section = (title) => ui.container.querySelector(`[data-form-section="${title}"]`)
  const current = () => [...ui.container.querySelectorAll('[data-current-form-section="true"]')].map((node) => node.dataset.formSection)
  const draft = ui.container.querySelector('[aria-label="计划备注"]')
  const quantity = ui.container.querySelector('[aria-label="计划数量"]')
  await ui.act(async () => { draft.focus(); draft.value = '已经填写的草稿' })
  assert.deepEqual(current(), ['生产计划'])
  await ui.act(async () => quantity.focus())
  assert.deepEqual(current(), ['生产明细'])
  await ui.act(async () => portal.querySelector('input').focus())
  assert.deepEqual(current(), ['生产明细'], 'a portaled field belongs to its source section')
  assert.equal(ui.container.querySelector('[aria-label="计划备注"]') === draft, true)
  assert.equal(draft.value, '已经填写的草稿')
  assert.equal(quantity.value, '3')
  await ui.act(async () => section('冻结资料').querySelector('[role="heading"]').focus())
  assert.deepEqual(current(), ['冻结资料'])
  assert.equal(ui.container.querySelector('[aria-label="冻结值"]').disabled, true)
  await ui.act(async () => update({ open: true, active: false, loading: false }))
  assert.deepEqual(current(), [], 'a hidden sibling editor does not retain an active section')
  await ui.act(async () => update({ open: true, active: true, loading: true }))
  assert.deepEqual(current(), [], 'loading does not present a stale section selection')
  await ui.act(async () => update({ open: true, active: true, loading: false }))
  await ui.act(async () => quantity.focus())
  assert.deepEqual(current(), ['生产明细'])
  assert.equal(draft.value, '已经填写的草稿')
})

test('section display preserves all registered fields, reveals errors and leaves short forms expanded', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ default: Body }, { default: Section }, { Form, Input }] = await Promise.all([
    import('./BusinessFormBody.jsx'), import('./BusinessFormSection.jsx'), import('antd'),
  ])
  const bodyRef = createRef()
  let update
  let form
  function Harness() {
    const [settings, setSettings] = useState({ formDisplay: 'all', count: 3, open: true })
    update = (patch) => setSettings((current) => ({ ...current, ...patch }))
    ;[form] = Form.useForm()
    return h('section', { 'data-business-form-page': true }, h(Body, { ...settings, ref: bodyRef }, h(Form, { form }, ['基本资料', '明细内容', '备注附件'].slice(0, settings.count).map((title, index) => h(Section, { key: title, title }, h(Form.Item, { name: `field${index}`, label: title, rules: [{ required: true, message: `请填写${title}` }] }, h(Input, { 'aria-label': title })))))))
  }
  await ui.render(h(Harness))
  const frame = () => ui.act(() => new Promise((resolve) => window.requestAnimationFrame(resolve)))
  const visible = () => [...ui.container.querySelectorAll('[data-form-section]')].filter((node) => !node.hidden).map((node) => node.dataset.formSection)
  assert.deepEqual(visible(), ['基本资料', '明细内容', '备注附件'])
  const input = ui.container.querySelector('[aria-label="基本资料"]')
  await ui.act(() => form.setFieldsValue({ field0: '已填写的基本资料', field1: '已填写的明细' }))
  await ui.act(() => update({ formDisplay: 'section' }))
  await frame()
  assert.equal(visible().length, 1)
  const tabs = ui.container.querySelector('[role="tablist"]')
  assert.equal(tabs.hidden, false)
  const lastSectionButton = [...tabs.querySelectorAll('[role="tab"]')].find((node) => node.textContent === '备注附件')
  await ui.act(() => { lastSectionButton.focus(); lastSectionButton.click() })
  await frame()
  assert.deepEqual(visible(), ['备注附件'])
  assert.equal(document.activeElement === lastSectionButton, true, 'switching a tab preserves focus for arrow-key navigation')
  const panel = document.getElementById(lastSectionButton.getAttribute('aria-controls'))
  assert.equal(panel.getAttribute('role'), 'tabpanel')
  assert.equal(panel.getAttribute('aria-labelledby'), lastSectionButton.id)
  await ui.act(() => lastSectionButton.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true })))
  await frame()
  assert.deepEqual(visible(), ['基本资料'])
  await ui.act(() => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
  await frame()
  assert.deepEqual(visible(), ['明细内容'])
  await ui.act(() => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true })))
  await frame()
  assert.deepEqual(visible(), ['备注附件'])
  assert.equal(ui.container.querySelector('[role="tablist"]') === tabs, true, 'the tab strip remains mounted')
  assert.equal(ui.container.querySelector('[aria-label="基本资料"]') === input, true)
  assert.equal(form.getFieldValue('field0'), '已填写的基本资料')
  await ui.act(() => form.setFieldsValue({ field0: '', field2: '待保存的附件备注' }))
  let failure
  await ui.act(async () => { try { await form.validateFields() } catch (error) { failure = error } })
  assert.deepEqual(failure.errorFields.map(({ name }) => name), [['field0']])
  await ui.act(() => bodyRef.current.revealValidationErrors())
  await frame()
  assert.deepEqual(visible(), ['基本资料'])
  await ui.act(() => update({ formDisplay: 'all' }))
  assert.equal(visible().length, 3)
  assert.equal(tabs.hidden, true)
  assert.equal(ui.container.querySelector('[role="tabpanel"]'), null)
  assert.equal(form.getFieldValue('field2'), '待保存的附件备注')
  await ui.act(() => update({ formDisplay: 'section', count: 2 }))
  await frame()
  assert.deepEqual(visible(), ['基本资料', '明细内容'], 'short forms ignore the long-form display preference')
  assert.equal(ui.container.querySelector('nav'), null)
})
