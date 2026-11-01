import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../scripts/test/rpcApiTestHarness.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'

function materialPage(params, prefix = '材料') {
  return {
    materials: Array.from({ length: 50 }, (_, index) => ({
      id: params.offset + index + 1,
      name: `${prefix}${params.offset + index + 1}`,
    })),
    total: 5001,
    limit: params.limit,
    offset: params.offset,
  }
}

async function harness(t, handler) {
  const view = await createReactTestHarness(t)
  const install = installRpcCallHarness((cleanup) => t.after(cleanup))
  const calls = []
  const accepted = []
  install(async (method, params, request) => {
    calls.push({ method, params, request })
    return { code: 0, data: await handler(params, request) }
  })
  const { default: Picker } = await import('./RemoteReferencePicker.jsx')
  const { ReferenceRecordsContext } = await import('./RemoteReferenceSelect.jsx')
  const columns = [{ title: '材料名称', dataIndex: 'name' }]
  const button = (text) => [...document.querySelectorAll('button')]
    .find((node) => node.getAttribute('aria-label') === text || node.textContent.replace(/\s+/gu, '') === text)
  return {
    ...view,
    calls,
    accepted,
    button,
    hint: () => document.querySelector('.erp-source-import-picker__footer [role="status"]')?.textContent || '',
    renderPicker: (props, profile) => view.render(createElement(
      ReferenceRecordsContext.Provider,
      { value: { adminProfile: profile, materials: (rows) => accepted.push(...rows) } },
      createElement(Picker, {
        referenceType: 'materials',
        open: true,
        title: '选择材料',
        importText: '加入明细',
        columns,
        ...props,
      })
    )),
    nextPage: () => view.act(async () => document.querySelector('.ant-pagination-next button').click()),
    select: (id) => view.act(async () => document.querySelector(`tr[data-row-key="${id}"] .ant-checkbox-input`).click()),
  }
}

test('failed pages keep the displayed page and selections, block import, and retry only on request', async (t) => {
  let failNextPage = true
  const imported = []
  const view = await harness(t, (params) => {
    if (params.offset === 50 && failNextPage) throw new Error('模拟分页读取失败')
    return materialPage(params)
  })
  await view.renderPicker({ onImport: (rows) => imported.push(rows) })
  assert.equal(view.hint(), '请先选择来源')
  await view.select(1)
  assert.equal(view.button('加入明细').disabled, false)
  assert.equal(view.hint(), '')
  await view.nextPage()
  await view.flush()
  assert.deepEqual(view.calls.map(({ params }) => params.offset), [0, 50], 'failure must not silently fetch the first page')
  assert.equal(document.querySelector('.ant-pagination-item-active').textContent, '1')
  assert.ok(document.querySelector('tr[data-row-key="1"]'))
  assert.equal(view.button('加入明细').disabled, true)
  assert.equal(view.hint(), '资料加载失败，请重新加载')
  await view.act(async () => view.button('加入明细').click())
  assert.deepEqual(imported, [])

  failNextPage = false
  await view.act(async () => view.button('重新加载').click())
  assert.deepEqual(view.calls.map(({ params }) => params.offset), [0, 50, 50])
  assert.equal(document.querySelector('.ant-pagination-item-active').textContent, '2')
  assert.equal(view.hint(), '')
  await view.select(51)
  await view.act(async () => view.button('加入明细').click())
  assert.deepEqual(imported.map((rows) => rows.map((row) => row.id)), [[1, 51]])
  await view.act(async () => view.button('清空已选').click())
  assert.equal(view.hint(), '请先选择来源')
  assert.equal(view.button('加入明细').disabled, true)
})

test('a changed account scope starts from the first page and clears earlier selections', async (t) => {
  let prefix = '原账号材料'
  const view = await harness(t, (params) => materialPage(params, prefix))
  const profile = (id) => ({ id, is_super_admin: true, effective_session: { actions: [PermissionCode.MATERIAL_READ] } })
  await view.renderPicker({}, profile(1))
  await view.select(1)
  await view.nextPage()
  assert.equal(view.calls.at(-1).params.offset, 50)
  prefix = '新账号材料'
  await view.renderPicker({}, profile(2))
  assert.equal(view.calls.at(-1).params.offset, 0)
  assert.equal(document.querySelector('.ant-pagination-item-active').textContent, '1')
  assert.equal(view.button('加入明细').disabled, true)
  assert.doesNotMatch(document.body.textContent, /原账号材料/u)
  assert.equal(view.hint(), '请先选择来源')
})

test('candidate filters reset pagination and selections without refetching on equivalent renders', async (t) => {
  const view = await harness(t, (params) => materialPage(params, params.category))
  await view.renderPicker({ params: { category: '面料' } })
  await view.select(1)
  await view.renderPicker({ params: { category: '面料' } })
  assert.equal(view.calls.length, 1)
  assert.equal(view.button('加入明细').disabled, false)
  await view.nextPage()
  await view.renderPicker({ params: { category: '辅料' } })
  assert.deepEqual(view.calls.map(({ params }) => [params.category, params.offset]), [
    ['面料', 0], ['面料', 50], ['辅料', 0],
  ])
  assert.equal(view.button('加入明细').disabled, true)
  assert.doesNotMatch(document.body.textContent, /面料/u)
  assert.equal(view.hint(), '请先选择来源')
})

test('revoking read access cancels an in-flight page and rejects its late response', async (t) => {
  let complete
  const view = await harness(t, (params) => new Promise((resolve) => {
    complete = () => resolve(materialPage(params, '旧权限材料'))
  }))
  await view.renderPicker()
  assert.equal(view.calls.length, 1)
  assert.equal(view.hint(), '正在加载，请稍候')
  await view.renderPicker({}, { id: 1, permissions: [], effective_session: { actions: [] } })
  assert.equal(view.calls[0].request.init.signal.aborted, true)
  assert.equal(view.hint(), '当前账号无权查看可选资料')
  await view.act(async () => complete())
  assert.deepEqual(view.accepted, [])
  assert.doesNotMatch(document.body.textContent, /旧权限材料/u)
  assert.equal(view.button('加入明细').disabled, true)
  assert.equal(view.calls.length, 1)
})

test('clearing a candidate filter restores the prompt and removes the query condition', async (t) => {
  const view = await harness(t, (params) => materialPage(params))
  await view.renderPicker({ filters: [{ key: 'stock_category', label: '库存分类', options: [{ value: 'MAIN', label: '主料' }] }] })
  const input = document.querySelector('input[aria-label="库存分类"]')
  const control = input.closest('.ant-select')
  assert.equal(control.querySelector('.ant-select-selection-placeholder').textContent, '按库存分类筛选')
  await view.act(async () => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await view.flush()
  await view.act(async () => document.querySelector('.ant-select-item-option').click())
  await view.flush()
  assert.equal(view.calls.at(-1).params.stock_category, 'MAIN')
  assert.equal(view.button('清空筛选').disabled, false)
  await view.act(async () => control.querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await view.flush()
  assert.equal(Object.hasOwn(view.calls.at(-1).params, 'stock_category'), false)
  assert.equal(view.button('清空筛选').disabled, true)
  assert.equal(control.querySelector('.ant-select-selection-placeholder').textContent, '按库存分类筛选')
})

test('an empty failed material page exposes failure rather than claiming that no material exists', async (t) => {
  let failed = true
  const view = await harness(t, () => {
    if (failed) throw new Error('模拟读取失败')
    return { materials: [], total: 0, limit: 50, offset: 0 }
  })
  await view.renderPicker({ emptyDescription: '暂无可选材料' })
  assert.equal(document.querySelector('.ant-empty-description').textContent, '资料加载失败，请重新加载')
  assert.equal(view.button('加入明细').disabled, true)
  failed = false
  await view.act(async () => view.button('重新加载').click())
  assert.equal(document.querySelector('.ant-empty-description').textContent, '暂无可选材料')
})

function completeMaterialPage(params, count = 251) {
  return {
    materials: Array.from({ length: Math.min(params.limit, Math.max(0, count - params.offset)) }, (_, index) => ({
      id: params.offset + index + 1, name: `完整材料${params.offset + index + 1}`,
    })),
    total: count,
    limit: params.limit,
    offset: params.offset,
  }
}

const allFilteredButton = () => [...document.querySelectorAll('button')].find((node) => node.textContent.includes('全选筛选结果'))

test('filtered selection reads every page in the supplier scope and imports all selected snapshots', async (t) => {
  let imported
  const view = await harness(t, (params) => completeMaterialPage(params))
  await view.renderPicker({ params: { purchase_supplier_id: 9, stock_category: 'MAIN' }, onImport: (rows) => { imported = rows } })
  await view.select(1)
  await view.nextPage()
  await view.act(async () => document.querySelector('input[aria-label="全选本页"]').click())
  assert.match(document.body.textContent, /已选 51 条/u)
  await view.act(async () => allFilteredButton().click())
  assert.deepEqual(view.calls.map(({ params }) => [params.offset, params.limit]), [[0, 50], [50, 50], [0, 200], [200, 200]])
  assert.equal(view.calls.every(({ params }) => params.purchase_supplier_id === 9 && params.stock_category === 'MAIN' && params.active_only === true), true)
  assert.match(document.body.textContent, /已选 251 条/u)
  assert.equal(allFilteredButton().disabled, true)
  assert.match(view.button('加入明细').textContent, /（251 条）/u)
  assert.equal(document.querySelectorAll('.erp-source-import-picker__selection-tag').length, 3, 'the closed summary renders only two labels and the overflow trigger')
  await view.act(async () => view.button('加入明细').click())
  assert.equal(imported.length, 251)
  assert.equal(new Set(imported.map((row) => row.id)).size, 251)
  assert.equal(imported.some((row) => row.id === 251 && row.name === '完整材料251'), true)
  await view.select(51)
  assert.match(document.body.textContent, /已选 250 条/u)
  assert.equal(allFilteredButton().disabled, false)
})

test('a failed or inconsistent filtered batch preserves selections and can be retried explicitly', async (t) => {
  let failure = 'network'
  const view = await harness(t, (params) => {
    if (params.limit === 200 && failure === 'initial-total') return completeMaterialPage(params, 252)
    if (params.limit === 200 && params.offset === 200) {
      if (failure === 'network') throw new Error('模拟读取失败')
      if (failure === 'duplicate') return { ...completeMaterialPage(params), materials: [{ id: 1, name: '重复材料' }] }
      if (failure === 'total') return completeMaterialPage(params, 252)
    }
    return completeMaterialPage(params)
  })
  await view.renderPicker({})
  await view.select(1)
  for (const scenario of ['network', 'duplicate', 'total', 'initial-total']) {
    failure = scenario
    await view.act(async () => allFilteredButton().click())
    assert.match(document.body.textContent, /已选 1 条/u)
    assert.equal(view.hint(), '未能全选筛选结果，请重试；原有选择已保留')
    assert.equal(view.button('加入明细').disabled, false)
  }
  failure = ''
  await view.act(async () => allFilteredButton().click())
  assert.match(document.body.textContent, /已选 251 条/u)
  assert.equal(view.hint(), '')
})

test('clearing or closing during filtered selection aborts the batch and ignores late records', async (t) => {
  const pending = []
  const view = await harness(t, (params, request) => params.limit === 200
    ? new Promise((resolve) => pending.push({ request, resolve: () => resolve(completeMaterialPage(params, 100)) }))
    : completeMaterialPage(params, 100))
  await view.renderPicker({})
  await view.select(1)
  await view.act(async () => allFilteredButton().click())
  assert.equal(view.button('加入明细').disabled, true)
  assert.equal(view.hint(), '正在选择筛选结果，请稍候')
  assert.equal(document.querySelector('input[aria-label="全选本页"]').disabled, true)
  await view.act(async () => view.button('清空已选').click())
  assert.equal(pending[0].request.init.signal.aborted, true)
  await view.act(async () => pending[0].resolve())
  assert.match(document.body.textContent, /已选 0 条/u)
  assert.equal(view.accepted.length, 50, 'late batches cannot enter the shared reference cache')
  await view.act(async () => allFilteredButton().click())
  await view.renderPicker({ open: false })
  assert.equal(pending[1].request.init.signal.aborted, true)
  await view.act(async () => pending[1].resolve())
  await view.renderPicker({ open: true })
  assert.match(document.body.textContent, /已选 0 条/u)
})

test('changing category during filtered selection aborts the old query while retaining earlier selections', async (t) => {
  let finish
  let signal
  const view = await harness(t, (params, request) => params.limit === 200
    ? new Promise((resolve) => { signal = request.init.signal; finish = () => resolve(completeMaterialPage(params, 100)) })
    : completeMaterialPage(params, 100))
  await view.renderPicker({ filters: [{ key: 'stock_category', label: '库存分类', options: [{ value: 'MAIN', label: '主料' }] }] })
  await view.select(1)
  await view.act(async () => allFilteredButton().click())
  const input = document.querySelector('input[aria-label="库存分类"]')
  await view.act(async () => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await view.act(async () => document.querySelector('.ant-select-item-option').click())
  assert.equal(signal.aborted, true)
  assert.equal(view.calls.at(-1).params.stock_category, 'MAIN')
  await view.act(async () => finish())
  assert.match(document.body.textContent, /已选 1 条/u)
  assert.equal(view.accepted.length, 100, 'only the two displayed pages enter the cache')
  assert.equal(view.hint(), '')
})

test('revoking permission during filtered selection discards the batch and its cache updates', async (t) => {
  let finish
  let signal
  const view = await harness(t, (params, request) => params.limit === 200
    ? new Promise((resolve) => { signal = request.init.signal; finish = () => resolve(completeMaterialPage(params, 100)) })
    : completeMaterialPage(params, 100))
  await view.renderPicker({})
  await view.act(async () => allFilteredButton().click())
  await view.renderPicker({}, { id: 1, effective_session: { actions: [] } })
  assert.equal(signal.aborted, true)
  await view.act(async () => finish())
  assert.equal(view.accepted.length, 50)
  assert.equal(view.button('加入明细').disabled, true)
  assert.equal(Boolean(allFilteredButton()), false)
  assert.equal(view.hint(), '当前账号无权查看可选资料')
})
