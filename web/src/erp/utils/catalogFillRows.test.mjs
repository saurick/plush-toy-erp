import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  CATALOG_FILL_DUPLICATE_POLICIES,
  CATALOG_FILL_MODES,
  buildCatalogFillRowsPlan,
} from './catalogFillRows.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))

const baseOptions = {
  getCurrentSourceKey: (row) => row.source_id,
  getSelectedSourceKey: (row) => row.id,
  mapSelectedRow: (row, context) => ({
    source_id: row.id,
    line_no: context.targetIndex + 1,
  }),
}

test('catalog fill rows: append and allow-duplicate are explicit draft-only semantics', () => {
  const currentRows = [{ source_id: 7, line_no: 1 }]
  const plan = buildCatalogFillRowsPlan({
    ...baseOptions,
    currentRows,
    selectedRows: [{ id: 7 }, { id: 8 }],
    mode: CATALOG_FILL_MODES.APPEND,
    duplicatePolicy: CATALOG_FILL_DUPLICATE_POLICIES.ALLOW,
  })

  assert.deepEqual(plan.rowsToAdd, [
    { source_id: 7, line_no: 2 },
    { source_id: 8, line_no: 3 },
  ])
  assert.deepEqual(plan.nextRows, [...currentRows, ...plan.rowsToAdd])
  assert.deepEqual(plan.skippedRows, [])
  assert.deepEqual(currentRows, [{ source_id: 7, line_no: 1 }])
})

test('catalog fill rows: skip policy deduplicates against retained and selected rows', () => {
  const duplicate = { id: 7, name: '重复来源' }
  const repeatedSelection = { id: 8, name: '本次重复选择' }
  const plan = buildCatalogFillRowsPlan({
    ...baseOptions,
    currentRows: [{ source_id: 7 }],
    selectedRows: [duplicate, repeatedSelection, repeatedSelection],
    duplicatePolicy: CATALOG_FILL_DUPLICATE_POLICIES.SKIP,
  })

  assert.deepEqual(plan.rowsToAdd, [{ source_id: 8, line_no: 2 }])
  assert.deepEqual(plan.skippedRows, [duplicate, repeatedSelection])
})

test('catalog fill rows: replace drops old rows and rejects ambiguous duplicate sources', () => {
  assert.throws(
    () =>
      buildCatalogFillRowsPlan({
        ...baseOptions,
        currentRows: [{ source_id: 1, stale_snapshot: '旧值' }],
        selectedRows: [{ id: 2 }, { id: 2 }],
        mode: CATALOG_FILL_MODES.REPLACE,
        duplicatePolicy: CATALOG_FILL_DUPLICATE_POLICIES.REJECT,
      }),
    /duplicate source key: 2/u
  )

  const replaced = buildCatalogFillRowsPlan({
    ...baseOptions,
    currentRows: [{ source_id: 1, stale_snapshot: '旧值' }],
    selectedRows: [{ id: 2 }],
    mode: CATALOG_FILL_MODES.REPLACE,
    duplicatePolicy: CATALOG_FILL_DUPLICATE_POLICIES.REJECT,
  })
  assert.deepEqual(replaced.nextRows, [{ source_id: 2, line_no: 1 }])
  assert.equal(JSON.stringify(replaced.nextRows).includes('旧值'), false)
})

test('catalog fill rows: unstable sources and incomplete controlled policies fail closed', () => {
  assert.throws(
    () =>
      buildCatalogFillRowsPlan({
        ...baseOptions,
        selectedRows: [{}],
      }),
    /stable source key/u
  )
  assert.throws(
    () =>
      buildCatalogFillRowsPlan({
        getSelectedSourceKey: (row) => row.id,
        mapSelectedRow: (row) => row,
        duplicatePolicy: CATALOG_FILL_DUPLICATE_POLICIES.SKIP,
      }),
    /current-row key/u
  )
})

test('catalog fill rows: sales and purchase batch pickers declare their business policies', () => {
  const salesForm = readFileSync(
    resolve(testDir, '../components/sales-orders/SalesOrderForm.jsx'),
    'utf8'
  )
  const purchaseForm = readFileSync(
    resolve(testDir, '../components/purchase-orders/PurchaseOrderForm.jsx'),
    'utf8'
  )

  for (const [label, source] of [
    ['sales order SKU fill', salesForm],
    ['purchase order material fill', purchaseForm],
  ]) {
    assert.match(
      source,
      /buildCatalogFillRowsPlan\(\{/u,
      `${label} must use the shared planner`
    )
    assert.match(
      source,
      /mode:\s*CATALOG_FILL_MODES\.APPEND[\s\S]*?duplicatePolicy:\s*CATALOG_FILL_DUPLICATE_POLICIES\.ALLOW/u,
      `${label} must explicitly allow append duplicates`
    )
  }

  assert.match(
    purchaseForm,
    /\.\.\.buildPurchaseOrderItemSourceValuesFromMaterial\(material\)/u,
    'purchase batch fill must reuse the same material snapshot mapping as single-row selection'
  )
})
