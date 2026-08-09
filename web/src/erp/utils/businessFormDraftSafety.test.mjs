import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bomPage = readFileSync(
  new URL('../pages/BOMVersionsPage.jsx', import.meta.url),
  'utf8'
)
const bomForm = readFileSync(
  new URL('../components/bom/BOMVersionForms.jsx', import.meta.url),
  'utf8'
)
const masterDataPage = readFileSync(
  new URL('../pages/V1MasterDataPage.jsx', import.meta.url),
  'utf8'
)
const purchaseOrderPage = readFileSync(
  new URL('../pages/V1PurchaseOrdersPage.jsx', import.meta.url),
  'utf8'
)

function sourceSlice(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.ok(startIndex >= 0, `missing source anchor: ${start}`)
  assert.ok(endIndex > startIndex, `missing source anchor: ${end}`)
  return source.slice(startIndex, endIndex)
}

test('BOM edit fails closed until complete line details are loaded', () => {
  const openEdit = sourceSlice(
    bomPage,
    'const openEdit = async',
    'const openCopy ='
  )

  assert.match(openEdit, /const detail = await loadDetail\(record\.id\)/u)
  assert.match(openEdit, /!Array\.isArray\(detail\.items\)[\s\S]*?return/u)
  assert.doesNotMatch(openEdit, /\|\| record/u)
  assert.ok(
    openEdit.indexOf('setHeaderModalOpen(true)') >
      openEdit.indexOf('!Array.isArray(detail.items)'),
    'the editable modal must only open after the complete detail guard'
  )
})

test('BOM create edit and view share visible fields while immutable identity stays locked', () => {
  assert.match(bomPage, /<BOMHeaderFormFields[\s\S]*?includeProduct/u)
  assert.match(bomPage, /productDisabled=\{headerMode === 'edit'\}/u)
  assert.match(bomForm, /disabled=\{disabled \|\| productDisabled\}/u)
  assert.match(
    bomPage,
    /canWithdraw=\{[\s\S]*?headerMode !== 'view'[\s\S]*?modalActionCanEdit/u
  )
})

test('master-data edit fails closed when dependent contacts cannot be read', () => {
  const loadContacts = sourceSlice(
    masterDataPage,
    'const loadContacts = useCallback',
    'const loadUnits = useCallback'
  )
  const openEdit = sourceSlice(
    masterDataPage,
    'const openEditRecord = async',
    'const openMasterDataRecord ='
  )

  assert.match(loadContacts, /加载联系人[\s\S]*?return null/u)
  assert.match(
    openEdit,
    /!Array\.isArray\(recordContacts\)[\s\S]*?return[\s\S]*?setEditingRecord\(record\)/u
  )
  assert.ok(
    openEdit.indexOf('setRecordModalOpen(true)') >
      openEdit.indexOf('!Array.isArray(recordContacts)'),
    'the editable modal must remain closed after a contact read failure'
  )
})

test('purchase-order edit binds its persisted supplier snapshot before saving', () => {
  const openEdit = sourceSlice(
    purchaseOrderPage,
    'const openEditModal = async',
    'const openPurchaseOrderDetails ='
  )

  assert.match(
    openEdit,
    /supplier_snapshot:[\s\S]*?record\.supplier_snapshot[\s\S]*?: \{\}/u
  )
})
