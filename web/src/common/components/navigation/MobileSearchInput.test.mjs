import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

for (const wrapped of [false, true]) {
  test(`mobile search restores its row after submit, cancel, scope reset and unmount (${wrapped ? 'search form' : 'direct child'})`, async (t) => {
    const ui = await createReactTestHarness(t)
    const { default: MobileSearchInput } = await import('./MobileSearchInput.jsx')
    let reset
    let close
    function Harness() {
      const [scope, setScope] = React.useState(0)
      const [open, setOpen] = React.useState(true)
      reset = () => setScope((value) => value + 1)
      close = () => setOpen(false)
      const search = open ? h(MobileSearchInput, { resetKey: scope, onSearch: () => {}, 'aria-label': '搜索任务' }) : null
      return h('div', { className: 'erp-mobile-search-row' }, wrapped ? h('form', { role: 'search', onSubmit: (event) => event.preventDefault() }, search) : search, h('button', { type: 'button' }, '筛选'))
    }
    await ui.render(h(Harness))
    const row = ui.container.querySelector('.erp-mobile-search-row')
    const input = row.querySelector('input')
    const holder = wrapped ? row.querySelector('form') : row.querySelector('.erp-mobile-search')
    const focus = () => ui.act(async () => { input.blur(); input.focus() })
    const expanded = (value) => {
      assert.equal(row.dataset.mobileSearchExpanded, String(value))
      assert.equal(holder.dataset.mobileSearchActive, String(value))
      assert.equal(row.lastElementChild.hasAttribute('data-mobile-search-active'), false)
    }
    expanded(false)
    await focus()
    expanded(true)
    await ui.act(async () => row.querySelector('.erp-search-submit').click())
    await ui.flush()
    expanded(false)
    assert.equal(document.activeElement === input, false)
    await focus()
    await ui.act(async () => row.querySelector('.erp-search-cancel').click())
    expanded(false)
    await focus()
    await ui.act(async () => reset())
    expanded(false)
    await focus()
    expanded(true)
    await ui.act(async () => close())
    assert.equal(row.hasAttribute('data-mobile-search-expanded'), false)
    assert.equal(holder.hasAttribute('data-mobile-search-active'), false)
  })
}
