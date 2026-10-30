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
  assert.match(source, /onSearchChange\?\.\(nextKeyword\)/u)
  assert.match(source, /onSearch=\{handleKeywordChange\}/u)
  assert.doesNotMatch(source, /searchDebounceMs|window\.setTimeout/u)
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
  assert.match(source, /onReload\(keyword, serverPagination && onlySelected \? serverCurrentPage : effectiveCurrentPage\)/u)
  assert.match(source, />\s*重新加载\s*</u)
})

test('source import picker resets filters and selections independently', () => {
  assert.match(
    source,
    /const clearFilters = \(\) => \{\s*handleKeywordChange\(''\)/u
  )
  assert.match(
    source,
    /const clearSelection = \(\) => \{\s*setSelectedRowKeys\(\[\]\)\s*setSelectedRowSnapshotsByKey\(new Map\(\)\)\s*\}/u
  )
  assert.match(source, />\s*清空筛选\s*</u)
  assert.match(source, /disabled=\{keyword\.length === 0 && !hasActiveFilters && !onlySelected\}/u)
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

test('picker retains cross-page selections, restores results, and confirms source changes', async (t) => {
  const { act, createElement } = await import('react')
  const { installTestDOM, registerJSXTestLoader } = await import('../../../../scripts/test/reactRuntime.mjs')
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Picker }, { registerAntdAppApis }] = await Promise.all([
    import('react-dom/client'), import('./SourceImportPickerModal.jsx'), import('../../../common/utils/antdApp.js'),
  ])
  let confirm
  let imported
  let reloadPage
  let pageCalls = 0
  registerAntdAppApis({ modal: { confirm: (config) => { confirm = config } } })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  const base = {
    open: true,
    title: '来源测试',
    columns: [{ dataIndex: 'name', title: '名称', width: 180 }],
    serverPagination: true,
    total: 3,
    pageSize: 1,
    getSelectionGroup: (row) => row.order,
    onPageChange: () => { pageCalls++ },
    onImport: (rows) => { imported = rows.map((row) => row.id) },
    onReload: (_, page) => { reloadPage = page },
    isRowDisabled: (row) => Boolean(row.disabled),
    getSelectedLabel: (row) => row.name,
  }
  const render = async (row, current) => { await act(async () => root.render(createElement(Picker, { ...base, rows: [row], current }))) }
  const click = async (node) => { assert.equal(Boolean(node), true); await act(async () => node.click()) }
  const button = (text) => [...document.querySelectorAll('button')].find((node) => node.textContent.replace(/\s/g, '') === text)
  const choose = () => click(document.querySelector('.ant-table-row input[type="checkbox"]'))
  await render({ id: 1, name: '订单甲第一行', order: 1 }, 1)
  await choose()
  await render({ id: 2, name: '订单甲第二行', order: 1 }, 2)
  await choose()
  assert.match(document.body.textContent, /已选 2 条/u)
  const onlySelected = [...document.querySelectorAll('label')].find((node) => node.textContent.includes('仅看已选')).querySelector('input')
  await click(onlySelected)
  assert.match(document.querySelector('.ant-table-row').textContent, /第一行/u)
  assert.equal(pageCalls, 0, 'selected-view paging does not mutate the server query')
  await click(button('重新加载'))
  assert.equal(reloadPage, 2, 'reload retains the server results page while viewing selected snapshots')
  await click(onlySelected)
  assert.match(document.querySelector('.ant-table-row').textContent, /第二行/u)
  await render({ id: 3, name: '订单乙第一行', order: 2 }, 3)
  await choose()
  assert.equal(typeof confirm?.onOk, 'function')
  assert.match(document.body.textContent, /已选 2 条/u, 'unconfirmed switch preserves selection')
  await act(async () => confirm.onOk())
  assert.match(document.body.textContent, /已选 1 条/u)
  await click(button('导入'))
  assert.deepEqual(imported, [3])
  await render({ id: 3, name: '订单乙第一行', order: 2, disabled: true }, 3)
  assert.equal(button('导入').disabled, true, 'refreshed ineligible selection cannot import')
  await click(button('清空已选'))
  assert.equal(document.querySelectorAll('.erp-source-import-picker__selection-tag').length, 0)
  assert.equal(button('导入').disabled, true, 'clearing selection leaves no importable snapshot')
})
