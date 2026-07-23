import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(
  new URL('./V1PurchaseOrdersPage.jsx', import.meta.url),
  'utf8'
)
const operationPanel = readFileSync(
  new URL(
    '../components/purchase-orders/PurchaseOrderOperationPanel.jsx',
    import.meta.url
  ),
  'utf8'
)
const businessModal = readFileSync(
  new URL(
    '../components/purchase-orders/PurchaseOrderBusinessModal.jsx',
    import.meta.url
  ),
  'utf8'
)
const form = readFileSync(
  new URL(
    '../components/purchase-orders/PurchaseOrderForm.jsx',
    import.meta.url
  ),
  'utf8'
)
const inboundModal = readFileSync(
  new URL(
    '../components/purchase-orders/PurchaseOrderInboundDraftModal.jsx',
    import.meta.url
  ),
  'utf8'
)

function sourceSlice(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert(startIndex >= 0, `missing source start: ${start}`)
  assert(endIndex > startIndex, `missing source end: ${end}`)
  return source.slice(startIndex, endIndex)
}

test('purchase form references fail closed, support latest-wins, and distinguish a legal empty result', () => {
  const referenceLoader = sourceSlice(
    page,
    'const loadReferenceData = useCallback',
    'const loadInboundReferenceData = useCallback'
  )

  assert.match(page, /useState\('loading'\)/u)
  assert.match(referenceLoader, /beginLatestRequest\('reference-data'\)/u)
  for (const loader of [
    'listAllSuppliers',
    'listAllMaterials',
    'listAllUnits',
  ]) {
    assert.match(
      referenceLoader,
      new RegExp(`${loader}\\([\\s\\S]*?signal: request\\.signal`, 'u')
    )
  }
  assert.doesNotMatch(
    referenceLoader,
    /listAllWarehouses|listAllInventoryLots/u
  )
  assert.match(
    referenceLoader,
    /setMaterials\(materialData\?\.materials \|\| \[\]\)[\s\S]*setReferenceDataState\('ready'\)/u
  )
  assert.match(referenceLoader, /setReferenceDataState\('error'\)/u)
  assert.match(referenceLoader, /if \(!request\.isCurrent\(\)\) return false/u)
})

test('purchase inbound uses active warehouse master data without coupling form readiness to inventory lots', () => {
  const inboundLoader = sourceSlice(
    page,
    'const loadInboundReferenceData = useCallback',
    'const loadOrders = useCallback'
  )

  assert.match(
    inboundLoader,
    /listAllWarehouses\([\s\S]*active_only: true[\s\S]*signal: request\.signal/u
  )
  assert.match(
    inboundLoader,
    /setWarehouses\(warehouseData\?\.warehouses \|\| \[\]\)[\s\S]*setInboundReferenceDataState\('ready'\)/u
  )
  assert.doesNotMatch(page, /listAllInventoryLots|inventoryLots/u)
  assert.match(page, /if \(!inboundReferenceDataReady\)/u)
  assert.match(page, /请先维护至少一个启用的入库仓库/u)
  assert.match(operationPanel, /inboundReferenceDataState !== 'ready'/u)
  assert.match(operationPanel, /!hasInboundWarehouse/u)
  assert.match(
    inboundModal,
    /disabled: loading \|\| !referenceDataReady \|\| !hasRemaining/u
  )
  assert.match(inboundModal, /disabled=\{!referenceDataReady\}/u)
})

test('purchase refresh reports failure and open forms remain disabled until their references are ready', () => {
  const refresh = sourceSlice(
    page,
    'const refreshPageData = useCallback',
    'registerPageRefresh?.(refreshPageData)'
  )

  for (const result of [
    'ordersOK !== false',
    'referencesOK !== false',
    'inboundReferencesOK !== false',
    "workflowResult?.status !== 'error'",
  ]) {
    assert.match(refresh, new RegExp(result.replaceAll('?', '\\?'), 'u'))
  }
  assert.match(page, /referenceDataState !== 'ready'[\s\S]*openCreateModal/u)
  assert.match(page, /referenceDataState !== 'ready'[\s\S]*openEditModal/u)
  assert.match(page, /referenceDataState !== 'ready'[\s\S]*handleSave/u)
  assert.match(
    operationPanel,
    /canCreate\s*\?[\s\S]*disabled=\{!referenceDataReady\}/u
  )
  assert.match(
    operationPanel,
    /!selectedOrderCanEdit \|\| !referenceDataReady \|\| itemsLoading/u
  )
  assert.match(
    businessModal,
    /okButtonProps=\{\{ disabled: !referenceDataReady \}\}/u
  )
  assert.match(form, /disabled=\{!referenceDataReady\}/u)
  assert.match(
    form,
    /if \(!referenceDataReady\) setMaterialImportOpen\(false\)/u
  )
})
