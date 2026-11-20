import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('库存类别控制默认仓库提示，清空类别同步清空已选仓库', async (t) => {
  const ui = await businessFormHarness(t, {
    rpc(method, params) {
      assert.equal(method, 'list_material_warehouses')
      return { data: { warehouses: [{ id: 1, code: 'WH-1', name: '模拟主料仓', type: 'MAIN_MATERIAL', is_active: true }], total: 1, offset: params.offset, limit: params.limit } }
    },
  })
  const [{ Form }, { default: Fields }] = await Promise.all([import('antd'), import('./MaterialStockFields.jsx')])
  let form
  function Example() {
    [form] = Form.useForm()
    return h(Form, { form }, h(Fields, { form }))
  }
  const prompt = () => ui.field('默认入库仓').closest('.ant-select').querySelector('.ant-select-selection-placeholder')?.textContent
  await ui.render(h(Example))
  assert.equal(ui.field('默认入库仓').disabled, true)
  assert.equal(prompt(), '请先选择库存类别')
  await ui.select('库存类别', '主料')
  assert.equal(ui.field('默认入库仓').disabled, false)
  assert.equal(prompt(), '选择常用入库仓')
  await ui.click((await ui.options('默认入库仓')).find((option) => option.textContent.includes('模拟主料仓')))
  assert.equal(form.getFieldValue('default_warehouse_id'), 1)
  assert.equal(ui.field('默认入库仓').closest('.ant-select').querySelector('.ant-select-selection-item').textContent, '模拟主料仓')
  await act(() => ui.field('库存类别').closest('.ant-select').querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await ui.flush()
  assert.equal(form.getFieldValue('default_warehouse_id'), undefined)
  assert.equal(ui.field('默认入库仓').disabled, true)
  assert.equal(prompt(), '请先选择库存类别')
})
