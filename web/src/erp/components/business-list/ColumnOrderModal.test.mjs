import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

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
    /querySelector\('input:not\(:disabled\), button:not\(:disabled\)'\)/u
  )
  assert.match(source, /focus\(\{ preventScroll: true \}\)/u)
})

test('表头保留字段问号等 React 标题，列设置和导出仍使用纯文字名称', () => {
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
  const help = readFileSync(
    new URL('../help/BusinessContextHelp.jsx', import.meta.url),
    'utf8'
  )
  assert.match(help, /onClick=\{\(event\) => event.stopPropagation\(\)\}/u)
  assert.match(help, /event.key === 'Enter' \|\| event.key === ' '/u)
})
