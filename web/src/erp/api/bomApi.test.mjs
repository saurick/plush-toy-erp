import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./bomApi.mjs', import.meta.url)),
  'utf8'
)

test('bomApi: uses dedicated BOM JSON-RPC domain and admin auth', () => {
  assert.match(source, /url:\s*'bom'/)
  assert.match(source, /authScope:\s*AUTH_SCOPE\.ADMIN/)
})

test('bomApi: exposes BOM version lifecycle methods only', () => {
  for (const methodName of [
    'list_bom_versions',
    'get_bom_version',
    'save_bom_with_items',
    'copy_bom_version',
    'activate_bom_version',
    'archive_bom_version',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }

  for (const retiredMethodName of [
    'create_bom_draft',
    'update_bom_draft',
    'add_bom_item',
    'update_bom_item',
    'delete_bom_item',
  ]) {
    assert.doesNotMatch(source, new RegExp(`call\\(\\s*'${retiredMethodName}'`))
  }

  for (const forbiddenActionName of [
    'generatePurchaseDemand',
    'postInventory',
    'calculateCost',
    'createProductionOrder',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbiddenActionName))
  }
})

test('bomApi: copy-source suggestions can read every BOM version page', () => {
  assert.match(source, /export async function listAllBOMVersions/u)
  assert.match(
    source,
    /listAllPaginatedRecords\(\s*listBOMVersions,\s*params,\s*'bom_versions'/u
  )
})
