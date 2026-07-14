import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./qualityApi.mjs', import.meta.url)),
  'utf8'
)

test('qualityApi: uses dedicated quality JSON-RPC domain and admin auth', () => {
  assert.match(source, /url:\s*'quality'/)
  assert.match(source, /authScope:\s*AUTH_SCOPE\.ADMIN/)
})

test('qualityApi: exposes quality inspection methods only', () => {
  for (const methodName of [
    'list_quality_inspections',
    'create_quality_inspection_draft',
    'create_quality_inspection_from_outsourcing_return',
    'list_outsourcing_return_quality_inspections',
    'submit_quality_inspection',
    'pass_quality_inspection',
    'reject_quality_inspection',
    'cancel_quality_inspection',
    'get_quality_inspection',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }

  for (const forbiddenActionName of [
    'postPurchaseReceipt',
    'cancelPurchaseReceipt',
    'postInventoryAdjustment',
    'generatePayable',
    'generateInvoice',
    'paySupplier',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbiddenActionName))
  }
})

test('qualityApi: exposes dedicated outsourcing return quality commands', () => {
  assert.match(
    source,
    /createQualityInspectionFromOutsourcingReturn[\s\S]*?create_quality_inspection_from_outsourcing_return/u
  )
  assert.match(
    source,
    /listOutsourcingReturnQualityInspections[\s\S]*?list_outsourcing_return_quality_inspections/u
  )
  assert.doesNotMatch(source, /createOperationalFact/u)
})
