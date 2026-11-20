import { act, createElement as h, useEffect, useState } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { businessFormHarness, deferredFormRequest } from '../../../../scripts/test/businessFormHarness.mjs'

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 220)))

async function warehouseExample(t, { count = 3, failRead = () => false, update = null } = {}) {
  const records = Array.from({ length: count }, (_, index) => ({ id: index + 1, code: `WH-${index + 1}`, name: `模拟仓库${index + 1}`, type: 'MAIN_MATERIAL', is_active: true }))
  const calls = []
  let saved = 0
  const ui = await businessFormHarness(t, { rpc: async (method, params) => {
    calls.push({ method, params })
    if (method === 'list_warehouses') {
      if (failRead()) throw new Error('internal warehouse read detail')
      return { data: { warehouses: records.slice(params.offset, params.offset + params.limit), total: records.length, limit: params.limit, offset: params.offset } }
    }
    if (method === 'update_warehouse') {
      if (update) await update(params)
      const index = records.findIndex((row) => row.id === params.id)
      records[index] = { ...records[index], ...params }
      return { data: { warehouse: { ...records[index] } } }
    }
    if (method === 'create_warehouse') {
      const row = { ...params, id: records.length + 1 }
      records.unshift(row)
      return { data: { warehouse: { ...row } } }
    }
    assert.fail(`unexpected RPC ${method}`)
  } })
  const { default: WarehouseSettingsModal } = await import('./WarehouseSettingsModal.jsx')
  const { App } = await import('antd')
  const { registerAntdAppApis } = await import('../../../common/utils/antdApp.js')
  function Feedback() {
    const api = App.useApp()
    useEffect(() => { registerAntdAppApis(api); return () => registerAntdAppApis({}) }, [api])
    return null
  }
  function Example() {
    const [open, setOpen] = useState(true)
    return h(WarehouseSettingsModal, { open, onCancel: () => setOpen(false), onSaved: () => { saved += 1 } })
  }
  await ui.render(h(App, null, h(Feedback), h(Example)))
  await settle()
  const choose = async (name) => {
    const radio = [...document.querySelectorAll('.erp-warehouse-settings-modal input[type="radio"]')].find((node) => node.getAttribute('aria-label').endsWith(` · ${name}`))
    assert.equal(Boolean(radio), true)
    await ui.click(radio.closest('tr').querySelector('td:last-child'))
  }
  return { ui, records, calls, choose, saved: () => saved }
}

test('warehouse directory has one top action, an empty selection header and whole-row selection', async (t) => {
  const { ui, choose, calls } = await warehouseExample(t)
  const dialog = document.querySelector('.erp-warehouse-settings-modal')
  assert.equal(dialog.querySelector('th.ant-table-selection-column').textContent.trim(), '')
  assert.equal([...dialog.querySelectorAll('th')].some((cell) => cell.textContent === '操作'), false)
  assert.equal(dialog.querySelectorAll('tbody button').length, 0)
  assert.equal(ui.button('编辑').disabled, true)
  assert.equal(Boolean(document.querySelector('input[id="code"]')), false)
  await choose('模拟仓库1')
  assert.equal(document.querySelector('input[aria-label="选择仓库 WH-1 · 模拟仓库1"]').checked, true)
  assert.equal(ui.button('编辑').disabled, false)
  await ui.click(ui.button('取消选择'))
  assert.equal(ui.button('编辑').disabled, true)
  assert.equal(calls.every((call) => call.method === 'list_warehouses'), true)
})

test('warehouse editor locks row changes and confirms before discarding a modified name', async (t) => {
  const { ui, choose, calls } = await warehouseExample(t)
  await choose('模拟仓库1')
  await ui.click(ui.button('编辑'))
  assert.equal(ui.field('仓库编号').value, 'WH-1')
  assert.equal(document.querySelector('input[aria-label="选择仓库 WH-2 · 模拟仓库2"]').disabled, true)
  await ui.fill('仓库名称', '尚未保存的名字')
  await ui.click(ui.button('取消'))
  await ui.click(ui.button('继续编辑'))
  await settle()
  assert.equal(ui.field('仓库名称').value, '尚未保存的名字')
  await ui.click(ui.button('取消'))
  await ui.click(ui.button('放弃修改'))
  await settle()
  assert.equal(Boolean(document.querySelector('input[id="code"]')), false)
  await ui.click(ui.button('新增仓库'))
  assert.equal(ui.field('仓库编号').value, '')
  assert.equal(ui.field('仓库名称').value, '')
  assert.equal(calls.some((call) => call.method !== 'list_warehouses'), false)
})

test('warehouse save preserves its identity and type and returns to the selected directory row', async (t) => {
  const { ui, choose, records, calls, saved } = await warehouseExample(t)
  await choose('模拟仓库2')
  await ui.click(ui.button('编辑'))
  await ui.fill('仓库名称', '模拟仓库2改名')
  await ui.click(ui.button('保存修改'))
  await settle()
  assert.equal(saved(), 1)
  const mutation = calls.find((call) => call.method === 'update_warehouse').params
  assert.equal(mutation.id, 2)
  assert.equal(mutation.type, 'MAIN_MATERIAL')
  assert.equal(records[1].name, '模拟仓库2改名')
  assert.equal(Boolean(document.querySelector('input[id="code"]')), false)
  assert.equal(document.querySelector('input[aria-label="选择仓库 WH-2 · 模拟仓库2改名"]').checked, true)
})

test('warehouse paging clears the old target and returns without restoring a hidden selection', async (t) => {
  const { ui, choose } = await warehouseExample(t, { count: 8 })
  await choose('模拟仓库1')
  await ui.click(document.querySelector('.erp-warehouse-settings-modal .ant-pagination-next button'))
  await settle()
  assert.equal(ui.button('编辑').disabled, true)
  assert.equal(Boolean(document.querySelector('input[aria-label="选择仓库 WH-1 · 模拟仓库1"]')), false)
  await choose('模拟仓库6')
  await ui.click(document.querySelector('.erp-warehouse-settings-modal .ant-pagination-prev button'))
  await settle()
  assert.equal(ui.button('编辑').disabled, true)
})

test('warehouse search clears selection and saving a filtered record reveals its original page', async (t) => {
  const { ui, choose } = await warehouseExample(t, { count: 8 })
  await choose('模拟仓库1')
  await ui.fill(document.querySelector('input[aria-label="搜索仓库"]'), 'WH-8')
  await ui.click(ui.button('搜索'))
  await settle()
  assert.equal(ui.button('编辑').disabled, true)
  assert.equal(document.querySelectorAll('.erp-warehouse-settings-modal tbody .ant-table-row').length, 1)
  await choose('模拟仓库8')
  await ui.click(ui.button('编辑'))
  await ui.fill('仓库名称', '模拟仓库8改名')
  await ui.click(ui.button('保存修改'))
  await settle()
  assert.equal(document.querySelector('input[aria-label="搜索仓库"]').value, '')
  assert.equal(document.querySelector('input[aria-label="选择仓库 WH-8 · 模拟仓库8改名"]').checked, true)
})

test('warehouse new form validates before submitting and creates only the entered record', async (t) => {
  const { ui, records, calls } = await warehouseExample(t)
  await ui.click(ui.button('新增仓库'))
  await ui.click(ui.button('保存仓库'))
  assert.equal(calls.some((call) => call.method === 'create_warehouse'), false)
  await ui.fill('仓库编号', 'WH-NEW')
  await ui.fill('仓库名称', '模拟新增仓库')
  await ui.select('仓库用途', '辅料仓')
  await ui.click(ui.button('保存仓库'))
  await settle()
  assert.equal(calls.filter((call) => call.method === 'create_warehouse').length, 1)
  assert.equal(records[0].code, 'WH-NEW')
  assert.equal(records[0].type, 'AUXILIARY_MATERIAL')
  assert.equal(Boolean(document.querySelector('input[id="code"]')), false)
})

test('warehouse failed reads block editing and recover through the existing retry action', async (t) => {
  let fail = true
  const { ui, choose } = await warehouseExample(t, { failRead: () => fail })
  assert.equal(ui.button('编辑').disabled, true)
  assert.equal(ui.button('新增仓库').disabled, true)
  assert.equal(document.body.textContent.includes('internal warehouse read detail'), false)
  fail = false
  await ui.click(ui.button('重试'))
  await settle()
  await choose('模拟仓库1')
  assert.equal(ui.button('编辑').disabled, false)
})

test('warehouse submission prevents duplicates and holds the draft after a failed write', async (t) => {
  const pending = deferredFormRequest()
  const { ui, choose, calls, records } = await warehouseExample(t, { update: () => pending.promise })
  await choose('模拟仓库1')
  await ui.click(ui.button('编辑'))
  await ui.fill('仓库名称', '模拟失败草稿')
  const save = ui.button('保存修改')
  await act(async () => { save.click(); save.click() })
  await settle()
  assert.equal(calls.filter((call) => call.method === 'update_warehouse').length, 1)
  assert.equal(ui.button('取消').disabled, true)
  await act(async () => pending.reject(new Error('warehouse write failed')))
  await settle()
  assert.equal(ui.field('仓库名称').value, '模拟失败草稿')
  assert.equal(records[0].name, '模拟仓库1')
  assert.equal(ui.button('取消').disabled, false)
})
