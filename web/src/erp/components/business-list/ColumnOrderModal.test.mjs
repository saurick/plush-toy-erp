import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

const source = readFileSync(
  new URL('./ColumnOrderModal.jsx', import.meta.url),
  'utf8'
)

test('column headers use the visible title without changing export labels', () => {
  assert.match(source, /export function getColumnDisplayLabel/u)
  assert.match(source, /typeof column\.title === 'string'/u)
  assert.match(source, /return getColumnLabel\(column\)/u)
  assert.match(source, /const label = getColumnDisplayLabel\(column\)/u)
  assert.match(
    source,
    /column\.exportTitle \|\| column\.title \|\| column\.key/u
  )
})

test('column settings move focus inside after the opening transition', () => {
  assert.match(source, /afterOpenChange=\{\(visible\) => \{/u)
  assert.match(source, /window\.requestAnimationFrame/u)
  assert.match(
    source,
    /querySelector\('input:not\(:disabled\)'\)/u
  )
  assert.match(source, /querySelector\('button:not\(:disabled\)'\)/u)
  assert.match(source, /focus\(\{ preventScroll: true \}\)/u)
})

test('表头保留字段问号等 React 标题，列设置和导出仍使用纯文字名称', async (t) => {
  const toolbar = readFileSync(
    new URL('./BusinessListToolbarActions.jsx', import.meta.url),
    'utf8'
  )
  assert.match(
    toolbar,
    /React\.isValidElement\(column.title\)\s*\? column.title\s*: getColumnDisplayLabel\(column\)/u
  )
  assert.match(
    toolbar,
    /exportColumns.map\(\(column\) => getColumnLabel\(column\)\)/u
  )
  const ui = await createReactTestHarness(t)
  const { BusinessHelpLabel } = await import('../help/BusinessContextHelp.jsx')
  const headerActions = []
  await ui.render(h('div', {
    onClick: () => headerActions.push('sort'),
    onKeyDown: (event) => headerActions.push(event.key),
  }, h(BusinessHelpLabel, { label: '金额', description: '报价使用的金额' })))
  const trigger = ui.container.querySelector('button[aria-label="查看金额说明"]')
  assert.equal(Boolean(trigger), true)
  await ui.act(async () => trigger.click())
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  for (const key of ['Enter', ' ']) {
    await ui.act(async () => trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true })))
  }
  assert.deepEqual(headerActions, [], '打开或键盘操作字段说明不能触发表头排序')
})
