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
    .find((node) => node.textContent.replace(/\s+/gu, '') === text)
  return {
    ...view,
    calls,
    accepted,
    button,
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
  await view.select(1)
  assert.equal(view.button('加入明细').disabled, false)
  await view.nextPage()
  await view.flush()
  assert.deepEqual(view.calls.map(({ params }) => params.offset), [0, 50], 'failure must not silently fetch the first page')
  assert.equal(document.querySelector('.ant-pagination-item-active').textContent, '1')
  assert.ok(document.querySelector('tr[data-row-key="1"]'))
  assert.equal(view.button('加入明细').disabled, true)
  await view.act(async () => view.button('加入明细').click())
  assert.deepEqual(imported, [])

  failNextPage = false
  await view.act(async () => view.button('重新加载').click())
  assert.deepEqual(view.calls.map(({ params }) => params.offset), [0, 50, 50])
  assert.equal(document.querySelector('.ant-pagination-item-active').textContent, '2')
  await view.select(51)
  await view.act(async () => view.button('加入明细').click())
  assert.deepEqual(imported.map((rows) => rows.map((row) => row.id)), [[1, 51]])
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
})

test('revoking read access cancels an in-flight page and rejects its late response', async (t) => {
  let complete
  const view = await harness(t, (params) => new Promise((resolve) => {
    complete = () => resolve(materialPage(params, '旧权限材料'))
  }))
  await view.renderPicker()
  assert.equal(view.calls.length, 1)
  await view.renderPicker({}, { id: 1, permissions: [], effective_session: { actions: [] } })
  assert.equal(view.calls[0].request.init.signal.aborted, true)
  await view.act(async () => complete())
  assert.deepEqual(view.accepted, [])
  assert.doesNotMatch(document.body.textContent, /旧权限材料/u)
  assert.equal(view.button('加入明细').disabled, true)
  assert.equal(view.calls.length, 1)
})
