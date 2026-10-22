import assert from 'node:assert/strict'

import test from 'node:test'
import { readContractSource as readFileSync } from '../../../scripts/test/publicContractSource.mjs'

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const masterDataPage = read('./MasterDataPage.jsx')
const masterDataConfig = read(
  '../components/master-data/masterDataPageConfig.mjs'
)
const masterDataForm = read('../components/master-data/MasterDataForm.jsx')
const inventoryPage = read('./InventoryLedgerPage.jsx')

test('master data main reads and optional dictionaries use separate exact permission guards', () => {
  for (const permission of [
    'customer.read',
    'supplier.read',
    'material.read',
    'process.read',
    'product.read',
    'product_sku.read',
  ]) {
    assert.match(
      masterDataConfig,
      new RegExp(`read: ['"]${permission.replaceAll('.', '\\.')}['"]`, 'u')
    )
  }

  assert.match(
    masterDataPage,
    /if \(!canReadCurrentRecord\) \{[\s\S]*setRecordPage\(\{ records: \[\], total: 0, pagination \}\)[\s\S]*setSelectedRecord\(null\)[\s\S]*return true[\s\S]*config\.list/u
  )
  assert.match(
    masterDataPage,
    /effectiveType !== 'product_skus' \|\| !canReadProducts/u
  )
  assert.match(
    masterDataPage,
    /effectiveType !== 'suppliers' \|\| !canReadProcesses/u
  )
  assert.match(
    masterDataPage,
    /canReadProductSKUs[\s\S]*key: 'product_skus'[\s\S]*\.filter\(Boolean\)/u
  )
  assert.match(masterDataForm, /disabled=\{!canEditSupplierProcesses\}/u)
})

test('inventory optional reference dictionaries cannot fail the whole page for a narrower role', () => {
  assert.match(
    inventoryPage,
    /if \(!canReadInventory\) \{[\s\S]*setRows\(\[\]\)[\s\S]*return[\s\S]*setLoading\(true\)/u
  )
  assert.match(
    inventoryPage,
    /subjectType !== 'PRODUCT' \|\| !canReadProductSKUs/u
  )
})
