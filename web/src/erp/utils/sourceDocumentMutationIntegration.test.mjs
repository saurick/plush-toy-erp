import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSources = [
  {
    name: 'sales order',
    source: readFileSync(
      new URL('../pages/V1SalesOrdersPage.jsx', import.meta.url),
      'utf8'
    ),
    start: 'const saveOrder = async () => {',
    end: 'const runLifecycleAction',
    saveCall: 'saveSalesOrderWithItems',
    allItemsCall: 'listAllSalesOrderItems',
    bindCall: /setEditingOrder\(savedOrder\)/u,
    openStart: 'const openEditOrder = async (order) => {',
    openEnd: 'const saveOrder = async () => {',
    editBindCall: /setEditingOrder\(order\)/u,
    editModalCall: /setOrderModalOpen\(true\)/u,
    doubleClickCall: /onDoubleClick:\s*\(\)\s*=>\s*openEditOrder\(record\)/u,
  },
  {
    name: 'purchase order',
    source: readFileSync(
      new URL('../pages/V1PurchaseOrdersPage.jsx', import.meta.url),
      'utf8'
    ),
    start: 'const handleSave = async () => {',
    end: 'const runLifecycleAction',
    saveCall: 'savePurchaseOrderWithItems',
    allItemsCall: 'listAllPurchaseOrderItems',
    bindCall: /setEditingOrder\(savedOrder\)/u,
    openStart: 'const openEditModal = async (record) => {',
    openEnd: 'const resolveSupplierSnapshot',
    editBindCall: /setEditingOrder\(record\)/u,
    editModalCall: /setModalOpen\(true\)/u,
    doubleClickCall: /onDoubleClick:\s*\(\)\s*=>\s*openEditModal\(record\)/u,
  },
  {
    name: 'outsourcing order',
    source: readFileSync(
      new URL('../pages/V1OutsourcingOrdersPage.jsx', import.meta.url),
      'utf8'
    ),
    start: 'const submitForm = async () => {',
    end: 'const runLifecycleAction',
    saveCall: 'saveOutsourcingOrderWithItems',
    allItemsCall: 'listAllOutsourcingOrderItems',
    bindCall: /setEditingRow\(savedOrder\)/u,
    openStart: 'const openEdit = async (record) => {',
    openEnd: 'const closeModal',
    editBindCall: /setEditingRow\(record\)/u,
    editModalCall: /setModalOpen\(true\)/u,
    doubleClickCall: /onDoubleClick:\s*\(\)\s*=>\s*openEdit\(record\)/u,
  },
]

const purchaseOperationPanelSource = readFileSync(
  new URL(
    '../components/purchase-orders/PurchaseOrderOperationPanel.jsx',
    import.meta.url
  ),
  'utf8'
)
const purchaseContractPrintSource = readFileSync(
  new URL(
    '../components/purchase-orders/usePurchaseOrderContractPrint.mjs',
    import.meta.url
  ),
  'utf8'
)

function functionSlice(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert(startIndex >= 0 && endIndex > startIndex)
  return source.slice(startIndex, endIndex)
}

for (const page of pageSources) {
  test(`${page.name} opens editing only after the full item read succeeds`, () => {
    const openEdit = functionSlice(page.source, page.openStart, page.openEnd)
    assert.match(openEdit, /sourceDocumentOpenEditController\.open\(/u)
    assert.match(openEdit, /openSourceDocumentEditWithAccessGate\(/u)
    assert.match(openEdit, /canUpdate(?:\s*:|\s*,)/u)
    assert.match(
      openEdit,
      /invalidatePending:[\s\S]*?sourceDocumentOpenEditController\.invalidate\(\)/u
    )
    assert.match(openEdit, /isEditable:/u)
    assert.match(openEdit, /loadItems:[\s\S]*?signal/u)
    assert.match(page.source, /expected_version/u)
    assert.match(openEdit, /enterEditing: \((?:nextItems|lines|items)\) =>/u)
    assert.match(openEdit, /selectOpenSourceDocumentItems\(/u)
    assert.match(openEdit, page.editBindCall)
    assert.match(openEdit, page.editModalCall)
    assert.match(openEdit, /status === 'load_failed'/u)
    assert.match(openEdit, /getActionErrorMessage\(\s*editResult\.error/u)
    assert.match(openEdit, /未进入编辑/u)

    const enterEditingIndex = openEdit.indexOf('enterEditing:')
    const beforeEnterEditing = openEdit.slice(0, enterEditingIndex)
    assert.doesNotMatch(beforeEnterEditing, page.editBindCall)
    assert.doesNotMatch(beforeEnterEditing, page.editModalCall)

    assert.match(page.source, /createSourceDocumentOpenEditController\(/u)
    assert.match(page.source, page.doubleClickCall)
    const invalidationCount = (
      page.source.match(/sourceDocumentOpenEditController\.invalidate\(\)/gu) ||
      []
    ).length
    assert(
      invalidationCount >= 2,
      `${page.name} must invalidate open-edit on create and close`
    )
  })

  test(`${page.name} separates save failure from accepted post-save work`, () => {
    const mutation = functionSlice(page.source, page.start, page.end)
    assert.match(page.source, new RegExp(page.allItemsCall))
    assert.match(mutation, /expected_version/u)
    assert.match(mutation, new RegExp(`${page.saveCall}\\(`))
    assert.match(
      mutation,
      /保存结果尚未确认，请先核对该单据的最新状态，不要连续重复提交。/u
    )
    assert.match(
      mutation,
      /该单据已被其他人更新，本次内容没有覆盖最新数据。请核对最新单据后再保存。/u
    )
    assert.match(mutation, /commitSourceDocumentSaveResult\(/u)
    assert.match(mutation, /settleSourceDocumentPostSaveEffect\(/u)
    assert.match(mutation, page.bindCall)
    assert.match(mutation, /saveResult\.status === 'save_failed'/u)
    assert.match(mutation, /isMutationResultUnknown\(saveError\)/u)
    assert.doesNotMatch(
      mutation,
      /isMutationResultUnknown\((?:attachmentEffect|detailEffect|refreshEffect)/u
    )

    const saveIndex = mutation.indexOf(`${page.saveCall}(`)
    const saveFailureIndex = mutation.indexOf(
      "saveResult.status === 'save_failed'"
    )
    const uploadIndex = mutation.indexOf('flushPendingAttachments', saveIndex)
    const postSaveIndex = mutation.indexOf(
      'settleSourceDocumentPostSaveEffect',
      saveFailureIndex
    )
    assert(saveIndex >= 0 && saveFailureIndex > saveIndex)
    assert(postSaveIndex > saveFailureIndex && uploadIndex > postSaveIndex)
  })
}

test('sales and purchase edit actions expose item-read loading and disable repeat clicks', () => {
  const salesPage = pageSources.find((page) => page.name === 'sales order')
  const purchasePage = pageSources.find(
    (page) => page.name === 'purchase order'
  )
  const outsourcingPage = pageSources.find(
    (page) => page.name === 'outsourcing order'
  )
  assert.match(salesPage.source, /loading=\{itemLoading\}/u)
  assert.match(
    salesPage.source,
    /disabled=\{!selectedOrderCanEdit \|\| itemLoading\}/u
  )
  assert.match(salesPage.source, /openEditOrder\(selectedOrder\)/u)
  assert.match(purchaseOperationPanelSource, /loading=\{itemsLoading\}/u)
  assert.match(
    purchaseOperationPanelSource,
    /disabled=\{!selectedOrderCanEdit \|\| itemsLoading\}/u
  )
  assert.match(
    purchaseOperationPanelSource,
    /openEditModal\(singleSelectedOrder\)/u
  )
  assert.match(
    purchasePage.source,
    /key === 'order-items'[\s\S]*?openEditModal\(singleSelectedOrder\)/u
  )
  assert.match(outsourcingPage.source, /openEdit\(selectedRow\)/u)
})

test('outsourcing order excludes canceled rows from editing and save parameters', () => {
  const { source } = pageSources.find(
    (page) => page.name === 'outsourcing order'
  )
  const openEdit = functionSlice(
    source,
    'const openEdit = async (record) => {',
    'const closeModal'
  )
  const submit = functionSlice(
    source,
    'const submitForm = async () => {',
    'const runLifecycleAction'
  )

  assert.match(openEdit, /selectOpenSourceDocumentItems\(items\)/u)
  assert.match(submit, /buildSourceDocumentItemSaveParams\(/u)
  assert.match(submit, /buildOutsourcingOrderItemParams/u)
})

test('source-document edit and print failures keep using the shared user-facing error helper', () => {
  assert.match(
    purchaseContractPrintSource,
    /getActionErrorMessage\(error, '打开采购合同打印模板失败'\)/u
  )
  const outsourcingPage = pageSources.find(
    (page) => page.name === 'outsourcing order'
  ).source
  assert.match(
    outsourcingPage,
    /getActionErrorMessage\(error, '打开加工合同打印失败'\)/u
  )
  assert.match(
    outsourcingPage,
    /getActionErrorMessage\(error, '打开作业指导书打印失败'\)/u
  )
})
