import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./V1InventoryLedgerPage.jsx', import.meta.url),
  'utf8'
)

test('inventory operation drafts load complete detail before edit and fail closed', () => {
  assert.match(source, /openInventoryOperationEdit/u)
  assert.match(source, /getInventoryOperation\(/u)
  assert.match(source, /\{ signal: request\.signal \}/u)
  assert.match(source, /detail\?\.status !== 'DRAFT'/u)
  assert.match(source, /Number\(detail\?\.version \|\| 0\) <= 0/u)
  assert.match(
    source,
    /Number\(detail\?\.created_by \|\| 0\) !== currentAdminID/u
  )
  assert.match(source, /detail\.items\.every/u)
  assert.match(source, /setEditingOperation\(detail\)/u)
  assert.doesNotMatch(source, /detail\s*\|\|\s*record/u)
})

test('inventory operation draft save uses CAS and verifies the returned aggregate', () => {
  assert.match(source, /saveInventoryOperationDraft\(payload\)/u)
  assert.match(source, /expected_version: editingOperation\.version/u)
  assert.match(source, /id: item\.id/u)
  assert.match(source, /Number\(editingOperation\.version \|\| 0\) \+ 1/u)
  assert.match(source, /saved\.items\.length !== items\.length/u)
  assert.match(source, /setEditingOperation\(null\)/u)
  assert.match(source, /库存作业草稿已保存/u)
})

test('inventory page exposes persistent records while keeping recent recovery supplemental', () => {
  assert.match(source, /InventoryOperationRecordsModal/u)
  assert.match(source, /operationRecordsOpen/u)
  assert.match(source, /库存作业/u)
  assert.match(source, /recoverInventoryOperation\(record\?\.id\)/u)
  assert.match(source, /window\.sessionStorage/u)
  assert.match(source, /mode=\{editingOperation \? 'edit' : 'create'\}/u)
  assert.match(source, /operation=\{editingOperation\}/u)
  assert.match(
    source,
    /resolveSourceLabels=\{resolveOperationItemSourceLabels\}/u
  )
})
