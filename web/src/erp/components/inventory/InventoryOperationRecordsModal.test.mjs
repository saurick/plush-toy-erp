import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./InventoryOperationRecordsModal.jsx', import.meta.url),
  'utf8'
)
const editorSource = readFileSync(
  new URL('./InventoryOperationModal.jsx', import.meta.url),
  'utf8'
)

test('inventory operation records are persistent, filtered and paginated', () => {
  assert.match(source, /listInventoryOperations/u)
  assert.match(
    source,
    /const \{ current: currentPage, pageSize \} = pagination/u
  )
  assert.match(source, /limit: pageSize/u)
  assert.match(source, /offset: \(currentPage - 1\) \* pageSize/u)
  assert.match(source, /currentPage,\s*pageSize,\s*status,/u)
  assert.match(source, /operation_type: operationType \|\| undefined/u)
  assert.match(source, /status: status \|\| undefined/u)
  assert.match(source, /created_by:/u)
  assert.match(source, /仅看我创建/u)
  assert.match(source, /showSizeChanger: true/u)
  assert.doesNotMatch(source, /sessionStorage/u)
})

test('inventory operation records ignore stale reads and keep business actions explicit', () => {
  assert.match(source, /useLatestRequestCoordinator/u)
  assert.match(source, /beginLatestRequest\('inventory-operation-records'\)/u)
  assert.match(source, /\{ signal: request\.signal \}/u)
  assert.match(source, /isRpcAbortError\(error\) \|\| !request\.isCurrent\(\)/u)
  assert.match(source, /record\?\.status === 'DRAFT'/u)
  assert.match(
    source,
    /Number\(record\?\.created_by \|\| 0\) === Number\(currentAdminID \|\| 0\)/u
  )
  assert.match(source, /编辑草稿/u)
  assert.match(source, />\s*核对\s*</u)
})

test('inventory operation create and edit share one business form field tree', () => {
  assert.match(editorSource, /BusinessFormModal/u)
  assert.match(editorSource, /mode = 'create'/u)
  assert.match(editorSource, /const isEdit = mode === 'edit'/u)
  assert.match(editorSource, /<Form\.List name="items">/u)
  assert.match(editorSource, /sourceRows\.map/u)
  assert.match(editorSource, /operation\?\.items/u)
  assert.match(editorSource, /resolveSourceLabels/u)
  assert.match(editorSource, /保存草稿/u)
  assert.doesNotMatch(editorSource, /<Modal\b/u)
})
