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
const apiSource = readFileSync(
  new URL('../../api/masterDataOrderApi.mjs', import.meta.url),
  'utf8'
)
const toolbarSources = [
  {
    name: 'sales order',
    page: new URL('../../pages/V1SalesOrdersPage.jsx', import.meta.url),
    action: new URL('../../pages/V1SalesOrdersPage.jsx', import.meta.url),
    button: '产品顺序',
    title: '调整产品顺序',
    apiFunction: 'reorderSalesOrderItems',
    documentType: 'sales_order',
  },
  {
    name: 'purchase order',
    page: new URL('../../pages/V1PurchaseOrdersPage.jsx', import.meta.url),
    action: new URL(
      '../purchase-orders/PurchaseOrderOperationPanel.jsx',
      import.meta.url
    ),
    button: '材料顺序',
    title: '调整材料顺序',
    apiFunction: 'reorderPurchaseOrderItems',
    documentType: 'purchase_order',
  },
  {
    name: 'outsourcing order',
    page: new URL('../../pages/V1OutsourcingOrdersPage.jsx', import.meta.url),
    action: new URL('../../pages/V1OutsourcingOrdersPage.jsx', import.meta.url),
    button: '加工明细顺序',
    title: '调整加工明细顺序',
    apiFunction: 'reorderOutsourcingOrderItems',
    documentType: 'outsourcing_order',
  },
]

test('shared line order panel applies explicitly and exposes row actions', () => {
  assert.match(modalSource, /disabled=\{!hasChanges \|\| applying\}/u)
  assert.match(modalSource, /await onApply\?\.\(orderedBusinessLineItems/u)
  assert.match(modalSource, /loading=\{applying\}/u)
  assert.match(modalSource, /applied !== false/u)
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

for (const runtime of toolbarSources) {
  test(`${runtime.name} exposes a nonterminal toolbar reorder backed by the dedicated API`, () => {
    const pageSource = readFileSync(runtime.page, 'utf8')
    const actionSource = readFileSync(runtime.action, 'utf8')
    assert.ok(actionSource.includes(runtime.button))
    assert.ok(pageSource.includes(runtime.title))
    assert.ok(pageSource.includes(runtime.apiFunction))
    assert.ok(pageSource.includes('canReorderSourceDocumentItems'))
    assert.ok(pageSource.includes(`'${runtime.documentType}'`))
    assert.ok(actionSource.includes('selectedOrderCanReorder'))
    assert.match(pageSource, /expected_version:\s*order\.version/u)
    assert.match(
      pageSource,
      /item_ids:\s*orderedItems\.map\(\(item\) => item\.id\)/u
    )
    assert.match(pageSource, /BusinessLineItemOrderModal/u)
    assert.match(apiSource, new RegExp(`export async function ${runtime.apiFunction}\\b`, 'u'))
  })
}
