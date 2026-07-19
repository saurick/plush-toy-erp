import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./SourceImportPickerModal.jsx', import.meta.url),
  'utf8'
)

test('source import picker keeps client mode and adds opt-in remote pagination', () => {
  assert.match(source, /serverPagination = false/u)
  assert.match(
    source,
    /serverPagination \? serverTotal : filteredRows\.length/u
  )
  assert.match(source, /onPageChange\?\.\(page, pageSize, keyword\)/u)
  assert.match(source, /onSearchChange\(keyword\)/u)
  assert.match(source, /searchDebounceMs = 250/u)
  assert.match(source, /\[\.\.\.rawKeyword\]\.slice\(0, searchMaxLength\)/u)
})

test('source import picker fails closed while a remote page is loading or invalid', () => {
  assert.match(
    source,
    /disabled=\{loading \|\| importDisabled \|\| selectedRows\.length === 0\}/u
  )
  assert.match(source, /onPageChange\?\.\(totalPages, pageSize, keyword\)/u)
  assert.match(source, /onPageChange\?\.\(1, pageSize, keyword\)/u)
  assert.match(source, /onReload\(keyword, effectiveCurrentPage\)/u)
  assert.match(source, />\s*重新加载\s*</u)
})
