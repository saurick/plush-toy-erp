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
    /const canImport =[\s\S]*?!loading[\s\S]*?!importDisabled[\s\S]*?selectedRows\.length > 0[\s\S]*?!hasInvalidSelectedRows/u
  )
  assert.match(source, /if \(!canImport\) return/u)
  assert.match(source, /disabled=\{!canImport\}/u)
  assert.match(source, /onPageChange\?\.\(totalPages, pageSize, keyword\)/u)
  assert.match(source, /onPageChange\?\.\(1, pageSize, keyword\)/u)
  assert.match(source, /onReload\(keyword, effectiveCurrentPage\)/u)
  assert.match(source, />\s*重新加载\s*</u)
})

test('source import picker resets filters and selections independently', () => {
  assert.match(
    source,
    /const clearFilters = \(\) => \{\s*setKeyword\(''\)\s*setCurrentPage\(1\)\s*\}/u
  )
  assert.match(
    source,
    /const clearSelection = \(\) => \{\s*setSelectedRowKeys\(\[\]\)\s*setSelectedRowSnapshotsByKey\(new Map\(\)\)\s*\}/u
  )
  assert.match(source, />\s*清空筛选\s*</u)
  assert.match(source, /disabled=\{keyword\.length === 0\}/u)
  assert.match(source, />\s*清空已选\s*</u)
  assert.match(source, /aria-live="polite"/u)
})

test('source import picker preserves and refreshes selected row snapshots', () => {
  assert.match(source, /preserveSelectedRowKeys: true/u)
  assert.match(
    source,
    /selectedRowKeys\.forEach\(\(key\) => \{[\s\S]*?rowsByKey\.get\(normalizedKey\)[\s\S]*?next\.set\(normalizedKey, currentRow\)/u
  )
  assert.match(source, /return changed \? next : current/u)
})

test('source import picker row click ignores nested interactive controls', () => {
  assert.match(source, /INTERACTIVE_ROW_TARGET_SELECTOR/u)
  assert.match(source, /target\?\.closest\?\./u)
  assert.match(source, /if \(isInteractiveRowTarget\(event\.target\)\) return/u)
})
