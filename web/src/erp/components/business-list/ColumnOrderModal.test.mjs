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
  assert.match(
    source,
    /const label = getColumnDisplayLabel\(column\) \|\| '当前列'/u
  )
  assert.match(source, /const label = getColumnDisplayLabel\(column\)/u)
  assert.match(
    source,
    /column\.exportTitle \|\| column\.title \|\| column\.key/u
  )
})
