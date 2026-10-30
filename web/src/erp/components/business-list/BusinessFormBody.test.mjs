import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useState } from 'react'
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
