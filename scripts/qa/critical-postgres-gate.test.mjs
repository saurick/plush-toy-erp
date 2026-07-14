import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
  const masterDataSchema = read('server/internal/data/masterdata_schema_postgres_test.go')
  const productionOrderFactConcurrency = read(
    'server/internal/data/production_order_fact_postgres_concurrency_test.go',
  )
  const productionOrderConcurrency = read(
    'server/internal/data/production_order_postgres_concurrency_test.go',
  )

  assert.match(full, /make purchase_receipt_pg_createdb/u, 'full must prepare the isolated test database')
  assert.match(full, /make purchase_receipt_migrate_apply/u, 'full must apply current migrations before concurrency tests')
  assert.match(full, /make critical_transactions_pg_test/u, 'full must run the non-skippable transaction gate')
  assert.doesNotMatch(
    full,
    /make purchase_return_(?:pg_createdb|migrate_apply|pg_test)/u,
    'full must not duplicate purchase return tests outside the complete critical PostgreSQL matrix',
  )
  const fullVulnerabilityScanIndex = full.lastIndexOf('scripts/qa/govulncheck.sh')
  for (const gate of [
    'make critical_transactions_pg_test',
    '--kind go --label server-all',
    'make build',
  ]) {
    assert(
      full.lastIndexOf(gate) < fullVulnerabilityScanIndex,
      `full must finish ${gate} before the external-network vulnerability scan`,
    )
  }
  assert.match(strict, /bash "\$ROOT_DIR\/scripts\/qa\/full\.sh"/u, 'strict must delegate to the complete full profile')
  assert.match(strict, /GOVULNCHECK_STRICT=1/u, 'strict must finish with a blocking vulnerability scan')

  const defaultDSNs = Object.fromEntries(
    ['INVENTORY', 'BOM_LOT', 'PURCHASE_RECEIPT', 'PURCHASE_RETURN'].map((name) => [
      name,
      makefile.match(new RegExp(`^${name}_PG_DB_URL \\?= (.+)$`, 'mu'))?.[1],
    ]),
  )
  for (const [name, dsn] of Object.entries(defaultDSNs)) {
    assert.ok(dsn, `Makefile must define a ${name.toLowerCase()} PostgreSQL test DSN`)
  }
  const receiptDefault = defaultDSNs.PURCHASE_RECEIPT
  const returnDefault = defaultDSNs.PURCHASE_RETURN
  const receiptURL = new URL(receiptDefault)
  const databasePaths = new Set()
  for (const [name, dsn] of Object.entries(defaultDSNs)) {
    const url = new URL(dsn)
    assert.equal(url.protocol, receiptURL.protocol)
    assert.equal(url.username, receiptURL.username)
    assert.equal(url.password, receiptURL.password)
    assert.equal(url.hostname, receiptURL.hostname)
    assert.equal(url.port, receiptURL.port)
    assert.equal(url.search, receiptURL.search)
    databasePaths.add(url.pathname)
    const helper = {
      INVENTORY: 'scripts/inventory-pg.sh',
      BOM_LOT: 'scripts/bom-lot-pg.sh',
      PURCHASE_RECEIPT: 'scripts/purchase-receipt-pg.sh',
      PURCHASE_RETURN: 'scripts/purchase-return-pg.sh',
    }[name]
    assert.match(
      read(helper),
      new RegExp(dsn.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
      `${helper} must use the Makefile default isolated server DSN`,
    )
  }
  assert.equal(databasePaths.size, Object.keys(defaultDSNs).length)
  const returnHelper = read('scripts/purchase-return-pg.sh')
  assert.match(returnHelper, /file:\/\/internal\/data\/model\/migrate/u)
  assert.doesNotMatch(returnHelper, /MAX_MIGRATION_VERSION|max_version/u)

  assert.match(makefile, /^critical_transactions_pg_test:/mu)
  assert.match(pgScript, /test-critical\)/u)
  assert.match(pgScript, /PURCHASE_RECEIPT_PG_TEST=1/u)
  assert.match(pgScript, /INVENTORY_PG_TEST=1/u)
  assert.match(pgScript, /BOM_LOT_PG_TEST=1/u)
  assert.match(pgScript, /PURCHASE_RETURN_PG_TEST=1/u)
  assert.match(pgScript, /go test -json/u)
  assert.match(pgScript, /verify-go-test-json\.mjs/u)
  assert.match(
    pgScript,
    /INVENTORY_PG_TEST_DB_URL="\$PURCHASE_RECEIPT_PG_DB_URL"/u,
    'critical PostgreSQL gate must reuse the same guarded, migrated test database',
  )
  for (const testPrefix of [
    'TestPurchaseReceiptPostgres',
    'TestPurchaseReceiptAdjustmentPostgres',
    'TestPurchaseReturnPostgres',
    'TestQualityInspectionPostgres',
    'TestWorkflowPostgres',
    'TestCustomerConfigPostgres',
    'TestMasterDataSchemaPostgres',
    'TestProductionOrderSchemaPostgres',
    'TestProductionOrderPostgres',
    'TestSourceDocumentPostgres',
    'TestInventoryPostgres',
    'TestInventoryLotPostgres',
    'TestBOMPostgres',
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
    'TestWorkflowPostgresBusinessStateRejectsRemovedShipmentReleasePendingStatus',
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
    'TestCustomerConfigPostgresPublishedRevisionAndProjectionsRejectTampering',
  ]) {
    assert.match(
      customerConfigConcurrency,
      new RegExp(`func ${testName}\\(`, 'u'),
      `critical Customer Config PostgreSQL contract must keep ${testName}`,
    )
  }

  assert.match(
    masterDataSchema,
    /func TestMasterDataSchemaPostgresProductUnitNetWeightConstraint\(/u,
    'critical PostgreSQL contract must keep product unit net weight schema and bad-row evidence',
  )
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

test('direct purchase PostgreSQL entrypoints reject zero tests and skips', () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'plush-pg-go-test-json-'))
  const fakeBin = path.join(fixtureRoot, 'bin')
  const fakeGo = path.join(fakeBin, 'go')
  mkdirSync(fakeBin)
  writeFileSync(
    fakeGo,
    `#!/usr/bin/env bash
set -euo pipefail
case "\${FAKE_GO_RESULT:?}" in
pass)
  printf '{"Action":"run","Test":"%s"}\\n' "$FAKE_GO_TEST_NAME"
  printf '{"Action":"pass","Test":"%s"}\\n' "$FAKE_GO_TEST_NAME"
  ;;
skip)
  printf '{"Action":"run","Test":"%s"}\\n' "$FAKE_GO_TEST_NAME"
  printf '{"Action":"skip","Test":"%s"}\\n' "$FAKE_GO_TEST_NAME"
  ;;
zero) ;;
*) exit 2 ;;
esac
`,
  )
  chmodSync(fakeGo, 0o755)

  const entrypoints = [
    {
      label: 'purchase receipt',
      script: 'scripts/purchase-receipt-pg.sh',
      command: 'test',
      testName: 'TestPurchaseReceiptPostgresFlow',
    },
    {
      label: 'workflow',
      script: 'scripts/purchase-receipt-pg.sh',
      command: 'test-workflow',
      testName: 'TestWorkflowPostgresFlow',
    },
    {
      label: 'purchase return',
      script: 'scripts/purchase-return-pg.sh',
      command: 'test',
      testName: 'TestPurchaseReturnPostgresFlow',
    },
  ]

  try {
    for (const entrypoint of entrypoints) {
      for (const resultMode of ['pass', 'zero', 'skip']) {
        const result = spawnSync(
          'bash',
          [path.join(repoRoot, entrypoint.script), entrypoint.command],
          {
            cwd: path.join(repoRoot, 'server'),
            encoding: 'utf8',
            env: {
              ...process.env,
              FAKE_GO_RESULT: resultMode,
              FAKE_GO_TEST_NAME: entrypoint.testName,
              PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
            },
          },
        )
        const output = `${result.stdout}\n${result.stderr}`
        if (resultMode === 'pass') {
          assert.equal(result.status, 0, `${entrypoint.label} must accept an executed passing test: ${output}`)
          assert.match(output, /\[qa:go-test-json\] run=1 pass=1 skip=0 fail=0/u)
        } else {
          assert.notEqual(result.status, 0, `${entrypoint.label} must reject ${resultMode}: ${output}`)
        }
        if (resultMode === 'zero') {
          assert.match(output, /required suite did not run/u)
        }
        if (resultMode === 'skip') {
          assert.match(output, /skip=1/u)
          assert.match(output, /skipped: /u)
        }
      }
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
