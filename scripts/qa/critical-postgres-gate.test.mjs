import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('full and strict require the isolated PostgreSQL critical transaction gate', () => {
  const full = read('scripts/qa/full.sh')
  const strict = read('scripts/qa/strict.sh')
  const makefile = read('server/Makefile')
  const pgScript = read('scripts/purchase-receipt-pg.sh')

  for (const [name, source] of [
    ['full', full],
    ['strict', strict],
  ]) {
    assert.match(source, /make purchase_receipt_pg_createdb/u, `${name} must prepare the isolated test database`)
    assert.match(source, /make purchase_receipt_migrate_apply/u, `${name} must apply current migrations before concurrency tests`)
    assert.match(source, /make critical_transactions_pg_test/u, `${name} must run the non-skippable transaction gate`)
  }

  assert.match(makefile, /^critical_transactions_pg_test:/mu)
  assert.match(pgScript, /test-critical\)/u)
  assert.match(pgScript, /PURCHASE_RECEIPT_PG_TEST=1/u)
  for (const testPrefix of [
    'TestPurchaseReceiptPostgres',
    'TestPurchaseReceiptAdjustmentPostgres',
    'TestWorkflowPostgres',
    'TestSourceDocumentPostgres',
  ]) {
    assert(pgScript.includes(testPrefix), `critical PostgreSQL gate must include ${testPrefix}`)
  }
})
