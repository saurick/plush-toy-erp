import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useState } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('dialog sections select one region, preserve drafts and isolate their parent form', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ default: Scope }, { default: Section }, { createPortal }] = await Promise.all([
    import('./BusinessFormSectionScope.jsx'), import('./BusinessFormSection.jsx'), import('react-dom'),
  ])
  const portal = document.createElement('div')
  document.body.append(portal)
  t.after(async () => { await ui.unmount(); portal.remove() })
  let update
  function Harness() {
    const [options, setOptions] = useState({ open: true })
    update = setOptions
    return h(Scope, { open: true }, h(Section, { title: '外层单据' }, h('input', { 'aria-label': '外层字段' })), h('div', { 'data-dialog-scope': true }, h(Scope, options, h(Section, { title: '仓库与批次' }, h('input', { 'aria-label': '批次', defaultValue: 'LOT-1' })), h(Section, { title: '数量与时间' }, h('input', { 'aria-label': '数量', defaultValue: '3' }), createPortal(h('input', { 'aria-label': '浮层选项' }), portal))
      ))
    )
  }
  await ui.render(h(Harness))
  const dialog = ui.container.querySelector('[data-dialog-scope]')
  const current = (root) => [...root.querySelectorAll('[data-current-form-section="true"]')].map((node) => node.dataset.formSection)
  const field = (label) => ui.container.querySelector(`[aria-label="${label}"]`)
  await ui.act(async () => field('外层字段').focus())
  const batch = field('批次')
  await ui.act(async () => { batch.focus(); batch.value = 'LOT-2' })
  assert.deepEqual(current(dialog), ['仓库与批次'])
  await ui.act(async () => field('数量').focus())
  assert.deepEqual(current(dialog), ['数量与时间'])
  await ui.act(async () => portal.querySelector('input').focus())
  assert.deepEqual(current(dialog), ['数量与时间'])
  assert.deepEqual(current(ui.container), ['外层单据', '数量与时间'])
  assert.equal(field('批次') === batch, true)
  assert.equal(batch.value, 'LOT-2')
  await ui.act(async () => update({ open: false }))
  assert.deepEqual(current(dialog), [])
  await ui.act(async () => update({ open: true }))
  assert.deepEqual(current(dialog), [])
  await ui.act(async () => batch.focus())
  assert.deepEqual(current(dialog), ['仓库与批次'])
  assert.equal(batch.value, 'LOT-2')
})
