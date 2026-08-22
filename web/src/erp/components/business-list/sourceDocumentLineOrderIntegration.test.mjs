import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const formSources = [
  {
    name: 'sales order',
    path: new URL('../sales-orders/SalesOrderForm.jsx', import.meta.url),
    button: '产品顺序',
    title: '调整产品顺序',
  },
  {
    name: 'purchase order',
    path: new URL('../purchase-orders/PurchaseOrderForm.jsx', import.meta.url),
    button: '材料顺序',
    title: '调整材料顺序',
  },
  {
    name: 'outsourcing order',
    path: new URL(
      '../outsourcing-orders/OutsourcingOrderForm.jsx',
      import.meta.url
    ),
    button: '明细顺序',
    title: '调整加工明细顺序',
  },
]

const modalSource = readFileSync(
  new URL('./BusinessLineItemOrderModal.jsx', import.meta.url),
  'utf8'
)

test('shared line order panel applies explicitly and exposes row actions', () => {
  assert.match(modalSource, /disabled=\{!hasChanges\}/u)
  assert.match(modalSource, /onApply\?\.\(orderedBusinessLineItems/u)
  assert.match(modalSource, /aria-label=\{`\$\{label\} 上移`\}/u)
  assert.match(modalSource, /aria-label=\{`\$\{label\} 下移`\}/u)
  assert.match(modalSource, /应用顺序/u)
  assert.match(modalSource, /取消/u)
})

for (const form of formSources) {
  test(`${form.name} wires the shared line order panel into form state`, () => {
    const source = readFileSync(form.path, 'utf8')
    assert.match(source, /BusinessLineItemOrderModal/u)
    assert.ok(source.includes(form.button))
    assert.ok(source.includes(form.title))
    assert.match(source, /form\.setFieldsValue\(\{ items: orderedItems \}\)/u)
    assert.match(source, /fields\.length < 2/u)
  })
}
