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
    /const clearSelection = \(\) => \{\s*cancelSelectAll\(\)\s*setSelectedRowKeys\(\[\]\)\s*setSelectedRowSnapshotsByKey\(new Map\(\)\)\s*\}/u
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
    /current\.forEach\(\(snapshot, normalizedKey\) => \{[\s\S]*?rowsByKey\.get\(normalizedKey\)[\s\S]*?next\.set\(normalizedKey, currentRow\)/u
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
  const button = (text) => [...document.querySelectorAll('button')].find((node) => node.getAttribute('aria-label') === text || node.textContent.replace(/\s/g, '') === text)
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

test('page selection and filtered selection keep their scopes, skip disabled rows and update the import count', async (t) => {
  const { createElement } = await import('react')
  const { createReactTestHarness } = await import('../../../../scripts/test/reactRuntime.mjs')
  const view = await createReactTestHarness(t)
  const { default: Picker } = await import('./SourceImportPickerModal.jsx')
  const rows = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, name: `材料${index + 1}` }))
  let imported
  const render = (props = {}) => view.render(createElement(Picker, {
    open: true,
    title: '选择材料',
    rows,
    pageSize: 2,
    columns: [{ title: '材料', dataIndex: 'name' }],
    isRowDisabled: (row) => row.id === 2,
    onImport: (records) => { imported = records.map((row) => row.id) },
    ...props,
  }))
  const all = () => [...document.querySelectorAll('button')].find((node) => node.textContent.includes('全选筛选结果'))
  const confirm = () => document.querySelector('button[aria-label="导入"]')
  const selectedCount = () => document.getElementById(confirm().getAttribute('aria-describedby')).textContent.replace(/\s/gu, '')
  await render()
  assert.match(confirm().textContent, /（0 条）/u)
  await view.act(async () => document.querySelector('input[aria-label="全选本页"]').click())
  assert.equal(selectedCount(), '已选1条：')
  assert.match(all().textContent, /全选筛选结果（6 条）/u)
  await view.act(async () => document.querySelector('.ant-pagination-next button').click())
  await view.act(async () => document.querySelector('input[aria-label="全选本页"]').click())
  assert.equal(selectedCount(), '已选3条：')
  await view.act(async () => all().click())
  assert.equal(selectedCount(), '已选6条：')
  assert.equal(all().disabled, true)
  assert.match(confirm().textContent, /（6 条）/u)
  await view.act(async () => document.querySelector('tr[data-row-key="3"] input').click())
  assert.equal(selectedCount(), '已选5条：')
  assert.equal(all().disabled, false)
  await view.act(async () => confirm().click())
  assert.deepEqual(imported, [1, 4, 5, 6, 7])
  await render({ filterRow: (row) => row.id > 5, hasActiveFilters: true })
  assert.equal(Boolean(all()), false, 'a single result page uses only its header checkbox')
  assert.equal(selectedCount(), '已选5条：', 'changing filters keeps earlier selections without expanding them')
})

test('filtered selection respects the single-document boundary and single-select mode', async (t) => {
  const { createElement } = await import('react')
  const { createReactTestHarness } = await import('../../../../scripts/test/reactRuntime.mjs')
  const view = await createReactTestHarness(t)
  const { default: Picker } = await import('./SourceImportPickerModal.jsx')
  const rows = [{ id: 1, order: '甲' }, { id: 2, order: '甲' }, { id: 3, order: '乙' }]
  const render = (props = {}) => view.render(createElement(Picker, {
    open: true,
    title: '选择来源',
    rows,
    pageSize: 1,
    columns: [],
    getSelectionGroup: (row) => row.order,
    ...props,
  }))
  const all = () => [...document.querySelectorAll('button')].find((node) => node.textContent.includes('全选筛选结果'))
  await render()
  assert.equal(Boolean(all()), true, 'the filtered-selection entry remains discoverable for mixed orders')
  assert.equal(all().disabled, true, 'mixed orders cannot be selected as one filtered batch')
  assert.match(document.body.textContent, /先按销售订单筛选，再全选/u)
  await render({ filterRow: (row) => row.order === '甲' })
  assert.equal(Boolean(all()), true)
  await view.act(async () => all().click())
  assert.match(document.body.textContent, /已选 2 条/u)
  await render({ multiple: false })
  assert.equal(Boolean(all()), false)
  assert.equal(Boolean(document.querySelector('input[aria-label="全选本页"]')), false)
})

test('grouped remote pickers expose disabled bulk controls until one order is scoped, then select across pages', async (t) => {
  const { createElement } = await import('react')
  const { createReactTestHarness } = await import('../../../../scripts/test/reactRuntime.mjs')
  const view = await createReactTestHarness(t)
  const { default: Picker } = await import('./SourceImportPickerModal.jsx')
  const records = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, order: 7, name: `第${index + 1}行` }))
  let imported
  let mixed = false
  const load = async () => mixed ? [...records, { id: 90, order: 8 }] : records
  const render = (props = {}) => view.render(createElement(Picker, {
    open: true,
    title: '出货来源',
    columns: [],
    serverPagination: true,
    pageSize: 20,
    total: 40,
    rows: [records[0], { id: 90, order: 8 }],
    getSelectionGroup: (row) => row.order,
    onSelectAllFiltered: load,
    onImport: (rows) => { imported = rows.map((row) => row.id) },
    ...props,
  }))
  const all = () => [...document.querySelectorAll('button')].find((node) => node.textContent.includes('全选筛选结果'))
  const header = () => document.querySelector('input[aria-label="全选本页"]')
  await render()
  assert.equal(Boolean(header()), true)
  assert.equal(header().disabled, true)
  assert.equal(all().disabled, true)
  await render({ selectionGroup: 7, rows: records.slice(0, 20), total: 25 })
  assert.equal(header().disabled, false)
  assert.equal(all().disabled, false)
  await view.act(async () => header().click())
  assert.match(document.body.textContent, /已选 20 条/u)
  mixed = true
  await view.act(async () => all().click())
  assert.match(document.body.textContent, /已选 20 条/u)
  assert.match(document.body.textContent, /筛选结果包含其他销售订单/u)
  mixed = false
  await view.act(async () => all().click())
  assert.match(document.body.textContent, /已选 25 条/u)
  await view.act(async () => document.querySelector('button[aria-label="导入"]').click())
  assert.deepEqual(imported, records.map((row) => row.id))
})

test('bulk reads replace stale visible snapshots and a later page reload refreshes them again', async (t) => {
  const { createElement } = await import('react')
  const { createReactTestHarness } = await import('../../../../scripts/test/reactRuntime.mjs')
  const view = await createReactTestHarness(t)
  const { default: Picker } = await import('./SourceImportPickerModal.jsx')
  let imported
  const visible = [{ id: 1, name: '旧材料', remaining: '20' }]
  const readAll = async () => [{ id: 1, name: '新材料', remaining: '10' }, { id: 2, name: '第二页材料', remaining: '5' }]
  const render = (rows) => view.render(createElement(Picker, {
    open: true,
    title: '核对来源快照',
    serverPagination: true,
    total: 2,
    pageSize: 1,
    rows,
    columns: [],
    onSelectAllFiltered: readAll,
    getSelectedLabel: (row) => row.name,
    onImport: (records) => { imported = records },
  }))
  const confirm = () => document.querySelector('button[aria-label="导入"]')
  await render(visible)
  await view.act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('全选筛选结果')).click())
  await view.act(async () => confirm().click())
  assert.equal(imported[0].name, '新材料')
  assert.equal(imported[0].remaining, '10', 'an older displayed page cannot overwrite the completed bulk read')
  await render([{ id: 1, name: '再次加载材料', remaining: '8' }])
  await view.act(async () => confirm().click())
  assert.equal(imported[0].remaining, '8')
  assert.equal(imported[1].remaining, '5', 'off-page selections retain their latest completed read')
})
