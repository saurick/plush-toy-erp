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
  const workflowConcurrency = read(
    'server/internal/data/workflow_repo_postgres_concurrency_test.go',
  )
  const customerConfigConcurrency = read(
    'server/internal/data/customer_config_repo_postgres_concurrency_test.go',
  )
  const productionOrderSchema = read(
    'server/internal/data/production_order_schema_postgres_test.go',
  )
  const productionOrderFactConcurrency = read(
    'server/internal/data/production_order_fact_postgres_concurrency_test.go',
  )
  const productionOrderConcurrency = read(
    'server/internal/data/production_order_postgres_concurrency_test.go',
  )

  for (const [name, source] of [
    ['full', full],
    ['strict', strict],
  ]) {
    assert.match(source, /make purchase_receipt_pg_createdb/u, `${name} must prepare the isolated test database`)
    assert.match(source, /make purchase_receipt_migrate_apply/u, `${name} must apply current migrations before concurrency tests`)
    assert.match(source, /make critical_transactions_pg_test/u, `${name} must run the non-skippable transaction gate`)
    const vulnerabilityScanIndex = source.lastIndexOf('scripts/qa/govulncheck.sh')
    for (const gate of ['make critical_transactions_pg_test', 'go test ./...', 'make build']) {
      assert(
        source.lastIndexOf(gate) < vulnerabilityScanIndex,
        `${name} must finish ${gate} before the external-network vulnerability scan`,
      )
    }
  }

  assert.match(makefile, /^critical_transactions_pg_test:/mu)
  assert.match(pgScript, /test-critical\)/u)
  assert.match(pgScript, /PURCHASE_RECEIPT_PG_TEST=1/u)
  assert.match(pgScript, /INVENTORY_PG_TEST=1/u)
  assert.match(
    pgScript,
    /INVENTORY_PG_TEST_DB_URL="\$PURCHASE_RECEIPT_PG_DB_URL"/u,
    'critical PostgreSQL gate must reuse the same guarded, migrated test database',
  )
  for (const testPrefix of [
    'TestPurchaseReceiptPostgres',
    'TestPurchaseReceiptAdjustmentPostgres',
    'TestWorkflowPostgres',
    'TestCustomerConfigPostgres',
    'TestProductionOrderSchemaPostgres',
    'TestProductionOrderPostgres',
    'TestSourceDocumentPostgres',
    'TestInventoryPostgres',
    'TestOperationalFactPostgres',
    'TestProcessRuntimePostgres',
    'TestFinanceFactCancelAuditPostgres',
    'TestFinanceProcessCommandPostgres',
    'TestSalesProcessCommandPostgres',
  ]) {
    assert(pgScript.includes(testPrefix), `critical PostgreSQL gate must include ${testPrefix}`)
  }

  for (const testName of [
    'TestWorkflowPostgresConflictingTerminalUpdatesApplySideEffectsOnce',
    'TestWorkflowPostgresConcurrentSameTerminalRetryIsIdempotent',
    'TestWorkflowPostgresConcurrentDifferentIntentSameKeyConflicts',
    'TestWorkflowPostgresConcurrentSameUrgeKeyIncrementsOnce',
    'TestWorkflowPostgresMigrationShape',
    'TestWorkflowPostgresShipmentReminderMigrationNormalizesBusinessStatus',
    'TestWorkflowPostgresConcurrentBlockedCommandsAllowOneWinner',
    'TestWorkflowPostgresConcurrentBlockedAndDoneAllowOneWinner',
    'TestWorkflowPostgresConcurrentUrgesDoNotLoseCount',
    'TestWorkflowPostgresUrgeAndTerminalAllowOneWinner',
    'TestWorkflowPostgresRejectsStaleVersionWithoutSideEffects',
  ]) {
    assert.match(
      workflowConcurrency,
      new RegExp(`func ${testName}\\(`, 'u'),
      `critical Workflow PostgreSQL contract must keep ${testName}`,
    )
  }

  for (const testName of [
    'TestCustomerConfigPostgresSingleActiveIndexRejectsDuplicate',
    'TestCustomerConfigPostgresConcurrentActivationKeepsOneActive',
  ]) {
    assert.match(
      customerConfigConcurrency,
      new RegExp(`func ${testName}\\(`, 'u'),
      `critical Customer Config PostgreSQL contract must keep ${testName}`,
    )
  }

  assert.match(
    productionOrderSchema,
    /func TestProductionOrderSchemaPostgresConstraintsAndReceiptIndexes\(/u,
    'critical PostgreSQL contract must keep production order schema shape and bad-row evidence',
  )
  for (const testName of [
    'TestProductionOrderPostgresConcurrentFactReplayAndQuantityWinner',
    'TestProductionOrderPostgresCancellationAndFactPostingOneWinner',
    'TestProductionOrderPostgresCloseRequiresCompletionOrReasonAndReplaysExactly',
    'TestProductionOrderPostgresCloseChecksEveryLineIndependently',
    'TestProductionOrderPostgresCloseFailsClosedForCorruptOrExcessFacts',
    'TestProductionOrderPostgresCloseSerializesWithFactPostAndReversal',
    'TestProductionOrderPostgresGetAndListReadContract',
    'TestProductionOrderPostgresSalesEligibilityLocksAndRollsBack',
  ]) {
    assert.match(
      productionOrderFactConcurrency + productionOrderConcurrency,
      new RegExp(`func ${testName}\\(`, 'u'),
      `critical PostgreSQL contract must keep ${testName}`,
    )
  }
})
