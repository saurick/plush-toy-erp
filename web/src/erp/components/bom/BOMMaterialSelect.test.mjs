import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { setTimeout as delay } from 'node:timers/promises'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../../scripts/test/rpcApiTestHarness.mjs'
import { materialOption } from '../../utils/referenceSelectOptions.mjs'

const materials = [
  {
    id: 1,
    code: 'MAT-1',
    name: '黑色面料',
    supplier_item_no: 'A1',
    spec: '51"',
    color: '黑色',
    default_unit_id: 1,
    is_active: true,
  },
  {
    id: 2,
    code: 'MAT-2',
    name: '黑色面料',
    supplier_item_no: 'A2',
    spec: '58"',
    color: '黑色',
    default_unit_id: 1,
    is_active: true,
  },
  { id: 3, code: 'MAT-OFF', name: '停用面料', spec: '51"', color: '黑色', default_unit_id: 1, is_active: false }
]
const sourceItem = {
  source_snapshot: {
    material_name: '原表面料',
    material_spec: '51"',
    color: '黑色',
    unit: '码',
    row_number: 6,
  },
}

async function harness(t, extra = {}) {
  const view = await createReactTestHarness(t)
  const calls = []
  installRpcCallHarness((cleanup) => t.after(cleanup))((_method, params) => {
    calls.push(params)
    const keyword = String(params.keyword || '')
    const candidates = materials.filter((material) =>
      (!params.ids || params.ids.includes(material.id)) &&
      (params.active_only !== true || material.is_active) &&
      (!keyword || `${material.code} ${material.name}`.includes(keyword))
    )
    return { code: 0, data: { materials: candidates, total: candidates.length, offset: params.offset, limit: params.limit } }
  })
  const { default: Select } = await import('./BOMMaterialSelect.jsx')
  const changes = []
  let creates = 0
  const renderSelect = (overrides = {}) => view.render(
    createElement(Select, {
      materialByID: new Map(materials.map((m) => [m.id, m])),
      options: [],
      sourceItem,
      unitOptions: [{ value: 1, label: '码' }],
      canCreateMaterial: true,
      onCreateMaterial: () => {
        creates += 1
      },
      onChange: (id) => changes.push(id),
      'aria-label': '物料名称 1',
      ...extra,
      ...overrides,
    })
  )
  await renderSelect()
  const open = async () => {
    await view.act(async () =>
      document
        .querySelector('.ant-select-selector')
        .dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
    )
    await view.act(async () => delay(30))
  }
  return { ...view, calls, changes, open, renderSelect, creates: () => creates }
}

test('下拉直接选择且无逐项核对入口，冲突仍禁用；新建必须显式点击', async (t) => {
  const view = await harness(t)
  await view.open()
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  const choices = [...document.querySelectorAll('.ant-select-item-option')]
  assert.equal(choices.length, 2)
  assert.equal(document.querySelectorAll('button[aria-label^="核对 "]').length, 0)
  assert.equal(choices.some((choice) => choice.querySelector('button')), false)
  assert.equal(view.calls.at(-1).active_only, true)
  const conflict = choices.find((node) => node.textContent.includes('MAT-2'))
  assert.equal(conflict.classList.contains('ant-select-item-option-disabled'), true)
  await view.act(async () => conflict.click())
  assert.deepEqual(view.changes, [])
  assert.match(conflict.textContent, /规格与原表不同/u)
  const inactive = choices.find((node) => node.textContent.includes('MAT-OFF'))
  assert.equal(Boolean(inactive), false)
  await view.act(async () =>
    choices.find((node) => node.textContent.includes('MAT-1')).click()
  )
  assert.deepEqual(view.changes, [1])
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  assert.equal(view.creates(), 0)
})

test('找不到对应物料时仍可直接新建，不自动建档或关联其他候选', async (t) => {
  const view = await harness(t)
  await view.open()
  const input = document.querySelector('input[role="combobox"]')
  await view.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '不存在的物料')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await view.act(async () => delay(260))
  assert.equal(document.querySelectorAll('.ant-select-item-option').length, 0)
  assert.equal(document.querySelector('.ant-empty-description').textContent, '未找到对应物料')
  const create = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === '新建物料并使用')
  assert.equal(view.creates(), 0)
  assert.deepEqual(view.changes, [])
  await view.act(async () => create.click())
  assert.equal(view.creates(), 1)
  assert.deepEqual(view.changes, [])
})

test('行内建档入口不自动选择候选，点击只发起一次建档', async (t) => {
  const view = await harness(t)
  const trigger = document.querySelector('[data-bom-material-create-trigger]')
  assert.equal(Boolean(trigger), true)
  await view.act(async () => trigger.click())
  assert.equal(view.creates(), 1)
  assert.deepEqual(view.changes, [])
})

test('没有建档权限仍可选择现有物料，隐藏新建入口且不暴露核对按钮', async (t) => {
  const view = await harness(t, { canCreateMaterial: false })
  await view.open()
  assert.equal(document.querySelector('[data-bom-material-create-trigger]'), null)
  assert.equal(
    [...document.querySelectorAll('button')].some(
      (node) => node.textContent.trim() === '新建物料并使用'
    ),
    false
  )
  assert.equal(
    document.querySelectorAll('button[aria-label^="核对 MAT-"]').length,
    0
  )
  await view.act(async () => [...document.querySelectorAll('.ant-select-item-option')].find((node) => node.textContent.includes('MAT-1')).click())
  assert.deepEqual(view.changes, [1])
})

test('历史停用关联保留名称和提示，清空或换选后不再成为候选', async (t) => {
  const view = await harness(t, {
    value: 3,
    options: materials.map(materialOption),
  })
  assert.match(document.querySelector('.ant-select-selection-item').textContent, /停用面料（已停用）/u)
  await view.open()
  const history = [...document.querySelectorAll('.ant-select-item-option')]
    .find((node) => node.textContent.includes('MAT-OFF'))
  assert.equal(Boolean(history), true)
  assert.equal(history.classList.contains('ant-select-item-option-disabled'), true)
  assert.match(history.textContent, /物料已停用/u)
  await view.act(async () => history.click())
  assert.deepEqual(view.changes, [])
  await view.act(async () => document.querySelector('.ant-select-clear').dispatchEvent(
    new window.MouseEvent('mousedown', { bubbles: true })
  ))
  assert.deepEqual(view.changes, [undefined])
  await view.renderSelect({ value: undefined })
  assert.equal(Boolean(document.querySelector('.ant-select-selection-item')), false)
  await view.open()
  assert.equal([...document.querySelectorAll('.ant-select-item-option')]
    .some((node) => node.textContent.includes('MAT-OFF')), false)
  const active = [...document.querySelectorAll('.ant-select-item-option')]
    .find((node) => node.textContent.includes('MAT-1'))
  await view.act(async () => active.click())
  await view.renderSelect({ value: 1 })
  assert.deepEqual(view.changes, [undefined, 1])
  assert.doesNotMatch(document.querySelector('.ant-select-selection-item').textContent, /已停用/u)
})

test('未预载的历史停用档案按 ID 回显，搜索候选仍仅查询启用项', async (t) => {
  const view = await harness(t, { value: 3, materialByID: new Map() })
  await view.act(async () => delay(30))
  assert.deepEqual(view.calls[0].ids, [3])
  assert.equal(view.calls[0].active_only, undefined)
  assert.match(document.querySelector('.ant-select-selection-item').textContent, /停用面料（已停用）/u)
  await view.renderSelect({ value: undefined })
  await view.open()
  const input = document.querySelector('input[role="combobox"]')
  await view.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'MAT-OFF')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await view.act(async () => delay(260))
  assert.equal(view.calls.at(-1).keyword, 'MAT-OFF')
  assert.equal(view.calls.at(-1).active_only, true)
  assert.equal(document.querySelectorAll('.ant-select-item-option').length, 0)
  assert.deepEqual(view.changes, [])
})
