import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const pageSource = readFileSync(
  fileURLToPath(new URL('../pages/BOMVersionsPage.jsx', import.meta.url)),
  'utf8'
)
const apiSource = readFileSync(
  fileURLToPath(new URL('../api/bomApi.mjs', import.meta.url)),
  'utf8'
)
const formSource = readFileSync(
  fileURLToPath(
    new URL('../components/bom/BOMVersionForms.jsx', import.meta.url)
  ),
  'utf8'
)

test('BOM form saves header and authoritative items through one aggregate RPC', () => {
  assert.match(apiSource, /call\(\s*'save_bom_with_items'/u)
  assert.match(pageSource, /saveBOMWithItems\(\{/u)
  assert.match(
    pageSource,
    /expected_version:\s*modalActionVersion\?\.edit_version/u
  )
  assert.match(pageSource, /items:\s*\(Array\.isArray\(values\.items\)/u)
})

test('BOM form no longer orchestrates split header and item writes', () => {
  for (const retiredName of [
    'createBOMDraft',
    'updateBOMDraft',
    'addBOMItem',
    'updateBOMItem',
    'deleteBOMItem',
    'syncBOMItems',
  ]) {
    assert.doesNotMatch(pageSource, new RegExp(retiredName, 'u'))
  }
})

test('BOM material rows persist explicit fabric-processing ownership without name inference', () => {
  assert.match(formSource, /production_operation_code/u)
  assert.match(formSource, /normalizeBOMProductionOperationCode/u)
  assert.match(pageSource, /生产工序归属/u)
  assert.match(pageSource, /布料加工/u)
  assert.match(pageSource, /不指定/u)
  assert.match(pageSource, /不按材料名称自动判断/u)
  assert.doesNotMatch(pageSource, /includes\([^)]*(?:面料|布料)/u)
})
