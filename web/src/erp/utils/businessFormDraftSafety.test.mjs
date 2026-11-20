import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bomPage = readFileSync(
  new URL('../pages/BOMVersionsPage.jsx', import.meta.url),
  'utf8'
)
const bomEditor = readFileSync(new URL('../components/bom/BOMEditor.jsx', import.meta.url), 'utf8')
const bomForm = readFileSync(
  new URL('../components/bom/BOMVersionForms.jsx', import.meta.url),
  'utf8'
)
const masterDataPage = readFileSync(
  new URL('../pages/MasterDataPage.jsx', import.meta.url),
  'utf8'
)
const purchaseOrderPage = readFileSync(
  new URL('../pages/PurchaseOrdersPage.jsx', import.meta.url),
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
  assert.match(bomPage, /<BOMEditor/u)
  assert.ok(/recordID && \(!next \|\| !Array\.isArray\(next\.items\)\)\) throw/u.test(bomEditor), 'an incomplete aggregate cannot initialize editable values')
  assert.ok(bomEditor.indexOf('!Array.isArray(next.items)') < bomEditor.indexOf('const values ='), 'validate complete detail before mapping form fields')
  assert.match(bomEditor, /disabled:[^\n]*!referencesReady/u)
})

test('BOM create edit copy and view share fields while immutable identity stays locked', () => {
  assert.match(bomEditor, /<BOMHeaderFormFields/u)
  assert.match(bomForm, /includeProduct = true/u)
  assert.ok(
    /productDisabled=\{\['edit', 'copy'\]\.includes\(editorMode\) \|\| \(inWorkspace && Boolean\(initialValues\?\.product_id\)\)\}/u.test(bomEditor),
    'editing, copying and a product-bound workspace must lock the BOM product'
  )
  assert.ok(
    /<BOMHeaderFormFields[^>]*disabled=\{!writable\}/u.test(bomEditor),
    'read-only BOMs must keep all header fields locked'
  )
  assert.match(bomForm, /disabled=\{disabled \|\| productDisabled\}/u)
  assert.match(bomEditor, /canWithdraw=\{writable && canUpdate\}/u)
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

  const suspendedBranch = sourceSlice(openEdit, 'if (recordSuspended)', 'setRelatedCreateID(null)')
  assert.match(suspendedBranch, /setRecordSuspended\(false\)[\s\S]*setRecordModalOpen\(true\)[\s\S]*return/u)
  assert.doesNotMatch(suspendedBranch, /loadContacts|setEditingRecord|resetFields/u)
  const freshEdit = openEdit.slice(openEdit.indexOf('setRelatedCreateID(null)'))

  assert.match(loadContacts, /加载联系人[\s\S]*?return null/u)
  assert.doesNotMatch(
    loadContacts,
    /if \(!request\.isCurrent\(\)\) \{\s*return \[\]/u
  )
  assert.match(
    freshEdit,
    /!Array\.isArray\(recordContacts\)[\s\S]*?return[\s\S]*?setEditingRecord\(record\)/u
  )
  assert.ok(
    freshEdit.indexOf('setRecordModalOpen(true)') >
      freshEdit.indexOf('!Array.isArray(recordContacts)'),
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
