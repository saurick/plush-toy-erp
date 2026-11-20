import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('non-searchable choices do not bind a search handler; searchable choices retain the caller query', async (t) => {
  const ui = await businessFormHarness(t)
  const { default: AppSelect } = await import('./AppSelect.jsx')
  const errors = []
  t.mock.method(console, 'error', (...args) => errors.push(args.map(String).join(' ')))
  await ui.render(h(AppSelect, { options: [{ value: 1, label: '示例材料' }], showSearch: false, 'aria-label': '物料' }))
  assert.deepEqual(errors, [])
  const queries = []
  await ui.render(h(AppSelect, { options: [], showSearch: true, onSearch: (value) => queries.push(value), 'aria-label': '物料' }))
  await ui.fill(document.querySelector('input[role="combobox"]'), '面料')
  assert.deepEqual(queries, ['面料'])
  assert.deepEqual(errors, [])
})
