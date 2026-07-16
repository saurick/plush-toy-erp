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

  assert.match(
    full,
    /purchase-receipt-pg\.sh" test-critical-disposable/u,
    'full must create, migrate, test, and clean a per-run PostgreSQL database',
  )
  assert.doesNotMatch(
    full,
    /make purchase_receipt_(?:pg_createdb|migrate_apply)|make critical_transactions_pg_test/u,
    'full must not reuse the fixed manual PostgreSQL database',
  )
  assert.doesNotMatch(
    full,
    /make purchase_return_(?:pg_createdb|migrate_apply|pg_test)/u,
    'full must not duplicate purchase return tests outside the complete critical PostgreSQL matrix',
  )
  const fullVulnerabilityScanIndex = full.lastIndexOf('scripts/qa/govulncheck.sh')
  for (const gate of [
    'test-critical-disposable',
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
  assert.match(pgScript, /test-critical-disposable\)/u)
  assert.match(pgScript, /_critical_\{process_id\}_\{secrets\.token_hex\(4\)\}/u)
  assert.match(pgScript, /CREATE DATABASE \\"\$\{CRITICAL_DATABASE_NAME\}\\"/u)
  assert.match(pgScript, /DROP DATABASE IF EXISTS \\"\$\{CRITICAL_DATABASE_NAME\}\\" WITH \(FORCE\)/u)
  assert.match(pgScript, /trap cleanup_disposable_critical_gate EXIT/u)
  assert.match(pgScript, /trap 'exit 129' HUP/u)
  assert.match(pgScript, /trap 'exit 130' INT/u)
  assert.match(pgScript, /trap 'exit 143' TERM/u)
  assert.match(pgScript, /PURCHASE_RECEIPT_PG_DB_URL="\$CRITICAL_DATABASE_URL" "\$0" apply/u)
  assert.match(pgScript, /PURCHASE_RECEIPT_PG_DB_URL="\$CRITICAL_DATABASE_URL" "\$0" test-critical/u)
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
    'TestPurchaseReturnFromQualityInspectionPostgres',
    'TestQualityInspectionPostgres',
    'TestQualityInspectionFromOutsourcingReturnPostgres',
    'TestSourceFinanceSnapshotBackfillMigrationPostgres',
    'TestWorkflowPostgres',
    'TestCustomerConfigPostgres',
    'TestMasterDataSchemaPostgres',
    'TestProductionOrderSchemaPostgres',
    'TestProductionOrderPostgres',
    'TestProductionMaterialIssuePostgres',
    'TestProductionReworkPostgres',
    'TestSourceDocumentPostgres',
    'TestInventoryPostgres',
    'TestInventoryLotPostgres',
    'TestBOMPostgres',
    'TestOperationalFactPostgres',
    'TestOutsourcingFactFromOrderPostgres',
    'TestProcessRuntimePostgres',
    'TestFinanceBusinessSourcesPostgres',
    'TestOperationalFactRepoFinance',
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

test('full and strict require the fail-closed populated upgrade PostgreSQL gate', () => {
  const full = read('scripts/qa/full.sh')
  const strict = read('scripts/qa/strict.sh')
  const makefile = read('server/Makefile')
  const pgScript = read('scripts/purchase-receipt-pg.sh')
  const fixture = read('scripts/qa/fixtures/populated-upgrade-20260710150001.sql')
  const cutoverPreflight = read('scripts/qa/customer-config-cutover-20260714055825.sql')
  const profiles = read('scripts/qa/gate-profiles.mjs')

  const populatedIndex = full.indexOf('make populated_upgrade_pg_test')
  const criticalIndex = full.indexOf('test-critical-disposable')
  assert(populatedIndex >= 0, 'full must run the populated upgrade PostgreSQL gate')
  assert(
    populatedIndex < criticalIndex,
    'full must finish the historical populated upgrade before current-schema PostgreSQL gates',
  )
  assert.match(
    strict,
    /bash "\$ROOT_DIR\/scripts\/qa\/full\.sh"/u,
    'strict must inherit the populated upgrade gate through full',
  )

  assert.match(makefile, /^populated_upgrade_pg_test:/mu)
  assert.match(makefile, /purchase-receipt-pg\.sh test-populated-upgrade/u)
  assert.match(pgScript, /test-populated-upgrade\)/u)
  assert.match(pgScript, /_populated_\{process_id\}_\{random_value\}/u)
  assert(pgScript.includes('CREATE DATABASE'))
  assert(pgScript.includes('DROP DATABASE IF EXISTS'))
  assert(pgScript.includes('WITH (FORCE)'))
  assert.match(pgScript, /populated_database_created=1/u)
  assert.match(pgScript, /trap cleanup_populated_upgrade EXIT/u)
  assert.match(pgScript, /--to-version "\$version"/u)
  for (const checkpoint of [
    '20260710150001',
    '20260711063237',
    '20260713095327',
    '20260714055504',
    '20260714055825',
  ]) {
    assert(pgScript.includes(checkpoint), `populated upgrade gate must apply checkpoint ${checkpoint}`)
  }
  assert.match(pgScript, /fixtures\/populated-upgrade-20260710150001\.sql/u)
  assert.match(pgScript, /customer-config-cutover-20260714055825\.sql/u)
  assert.match(pgScript, /--audit populated-upgrade/u)
  assert.match(pgScript, /--audit customer-config-cutover/u)
  assert.match(pgScript, /assert_populated_preflight_green checkpoint-20260710150001/u)
  assert.match(pgScript, /assert_populated_preflight_green checkpoint-20260714055504/u)
  assert.match(pgScript, /assert_populated_preflight_green latest/u)
  assert.match(pgScript, /before_hash" != "\$after_hash/u)
  assert.match(pgScript, /restored_hash" != "\$POPULATED_LEGAL_HASH/u)
  assert.match(pgScript, /--format '\{\{ len \.Pending \}\}\|\{\{ len \.OutOfOrder \}\}'/u)
  assert.doesNotMatch(pgScript, /\{\{ add /u)
  assert.match(pgScript, /migration_status_counts" != '0\|0'/u)
  assert.match(pgScript, /shipment_pending\|shipment_pending\|1/u)

  for (const blocker of [
    'bom',
    'finance',
    'process-lifecycle',
    'workflow-state',
    'node-lifecycle',
    'workflow-task-status',
    'workflow-task-paired-anchor',
    'cross-process-anchor',
    'legacy-timestamp',
    'workflow-task-version',
    'finance-target-audit',
  ]) {
    assert(pgScript.includes(blocker), `populated upgrade gate must exercise ${blocker}`)
  }
  for (const message of [
    'bom_headers has 1 rows incompatible with the target checks',
    'finance_facts has 1 legacy CANCELLED rows without a durable cancellation audit',
    'finance_facts has 1 rows incompatible with the target cancellation audit bundle',
    'process_instances has 1 incompatible lifecycle rows',
    'workflow_business_states has 1 unsupported rows',
    'process_node_instances has 1 incompatible rows',
    'workflow_tasks has 1 incompatible status or anchor rows',
    'workflow_tasks has 1 invalid process anchors incompatible with target foreign keys or process ownership',
    'workflow_tasks has 1 rows with legacy timestamps that the target migration drops',
    'workflow_tasks has 1 non-positive versions',
  ]) {
    assert(pgScript.includes(message), `populated upgrade gate must require blocker message: ${message}`)
  }

  for (const table of [
    'units',
    'products',
    'bom_headers',
    'finance_facts',
    'roles',
    'process_instances',
    'process_node_instances',
    'workflow_business_states',
    'workflow_tasks',
  ]) {
    assert.match(fixture, new RegExp(`INSERT INTO ${table} \\(`, 'u'))
  }
  assert.match(fixture, /910002/u, 'fixture must contain a second process and node')
  assert.match(
    fixture,
    /'shipment_release_pending'/u,
    'fixture must prove the pending shipment status normalization migration',
  )
  assert.match(fixture, /'DRAFT'/u)
  assert.match(fixture, /'active'/u)
  assert.match(fixture, /'waiting'/u)
  assert.match(fixture, /'ready'/u)
  assert.match(pgScript, /POPULATED_EXPECTED_ROW_COUNT=13/u)
  assert.match(pgScript, /POPULATED_EXPECTED_ROW_COUNT=9/u)
  assert.match(pgScript, /UPDATE workflow_tasks\s+SET process_instance_id = NULL,/u)
  assert.match(pgScript, /DELETE FROM process_node_instances WHERE id IN \(910001, 910002\)/u)
  assert.match(pgScript, /DELETE FROM process_instances WHERE id IN \(910001, 910002\)/u)
  assert.match(pgScript, /cutover_readback" != '1\|0\|0\|0'/u)
  assert.match(
    pgScript,
    /admin:system:1\|qa_business_default:business_default:1\|qa_custom:custom:1/u,
  )
  assert.match(cutoverPreflight, /BEGIN TRANSACTION READ ONLY/u)
  assert.match(cutoverPreflight, /version = '20260714055825'/u)
  assert.match(
    pgScript,
    /process_instances has 2 rows that must be explicitly governed before customer config hash cutover/u,
  )
  assert.match(
    pgScript,
    /workflow_tasks has 1 config revision anchors that must be explicitly governed before customer config hash cutover/u,
  )
  assert.match(pgScript, /SET config_revision = 'synthetic-cutover-revision'/u)
  assert.match(pgScript, /SET config_revision = NULL/u)
  const processCutoverBlockerIndex = pgScript.lastIndexOf('process-runtime')
  const cutoverCleanupIndex = pgScript.lastIndexOf('cutover_before_hash=')
  const configRevisionBlockerIndex = pgScript.lastIndexOf('workflow-config-revision')
  const cutoverGreenIndex = pgScript.lastIndexOf(
    'assert_customer_config_cutover_preflight_green cutover-ready-20260714055825',
  )
  const cutoverApplyIndex = pgScript.lastIndexOf('apply_populated_upgrade_to 20260714055825')
  assert(
    processCutoverBlockerIndex < cutoverCleanupIndex &&
      cutoverCleanupIndex < configRevisionBlockerIndex &&
      configRevisionBlockerIndex < cutoverGreenIndex &&
      cutoverGreenIndex < cutoverApplyIndex,
    'populated gate must prove both 055825 blockers around explicit test-only cleanup and green before apply',
  )

  const fastGates = profiles.slice(
    profiles.indexOf('const FAST_GATES'),
    profiles.indexOf('const FULL_ONLY_GATES'),
  )
  const fullOnlyGates = profiles.slice(
    profiles.indexOf('const FULL_ONLY_GATES'),
    profiles.indexOf('const STRICT_ONLY_GATES'),
  )
  const fullRequiredFiles = profiles.slice(
    profiles.indexOf('const FULL_REQUIRED_FILES'),
    profiles.indexOf('const STRICT_REQUIRED_FILES'),
  )
  assert.doesNotMatch(fastGates, /populated-upgrade-postgres/u)
  assert.match(fullOnlyGates, /populated-upgrade-postgres/u)
  assert.match(fullRequiredFiles, /fixtures\/populated-upgrade-20260710150001\.sql/u)
  assert.match(profiles, /customer-config-cutover-20260714055825\.sql/u)
})

test('populated upgrade entrypoint cleans only a database it created', () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'plush-populated-upgrade-cleanup-'))
  const fakeBin = path.join(fixtureRoot, 'bin')
  const fakePsql = path.join(fakeBin, 'psql')
  const fakeAtlas = path.join(fakeBin, 'atlas')
  const logFile = path.join(fixtureRoot, 'commands.log')
  mkdirSync(fakeBin)
  writeFileSync(
    fakePsql,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'psql:%s\\n' "$*" >> "\${FAKE_PG_LOG:?}"
if [[ "$*" == *'CREATE DATABASE '* && "\${FAKE_CREATE_FAIL:-0}" == '1' ]]; then
  exit 19
fi
`,
  )
  writeFileSync(
    fakeAtlas,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'atlas:%s\\n' "$*" >> "\${FAKE_PG_LOG:?}"
exit 42
`,
  )
  chmodSync(fakePsql, 0o755)
  chmodSync(fakeAtlas, 0o755)

  const run = (createFails) => {
    writeFileSync(logFile, '')
    const result = spawnSync(
      'bash',
      [path.join(repoRoot, 'scripts/purchase-receipt-pg.sh'), 'test-populated-upgrade'],
      {
        cwd: path.join(repoRoot, 'server'),
        encoding: 'utf8',
        env: {
          ...process.env,
          FAKE_CREATE_FAIL: createFails ? '1' : '0',
          FAKE_PG_LOG: logFile,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
          PURCHASE_RECEIPT_PG_DB_URL:
            'postgres://postgres:local-test-password@127.0.0.1:55432/plush_erp_purchase_receipt_test?sslmode=disable',
        },
      },
    )
    return { result, log: readFileSync(logFile, 'utf8') }
  }

  try {
    const failedApply = run(false)
    assert.equal(failedApply.result.status, 42)
    const createdDatabase = failedApply.log.match(/CREATE DATABASE "([A-Za-z0-9_]+)"/u)?.[1]
    const droppedDatabase = failedApply.log.match(
      /DROP DATABASE IF EXISTS "([A-Za-z0-9_]+)" WITH \(FORCE\)/u,
    )?.[1]
    assert.ok(createdDatabase, 'entrypoint must create a disposable database before Atlas')
    assert.match(createdDatabase, /_populated_[0-9]+_[0-9]+$/u)
    assert.notEqual(createdDatabase, 'plush_erp_purchase_receipt_test')
    assert.equal(droppedDatabase, createdDatabase, 'Atlas failure must clean the exact created database')

    const failedCreate = run(true)
    assert.equal(failedCreate.result.status, 19)
    assert.match(failedCreate.log, /CREATE DATABASE/u)
    assert.doesNotMatch(
      failedCreate.log,
      /DROP DATABASE/u,
      'a create collision/failure must never drop a database the entrypoint did not create',
    )
    assert.doesNotMatch(failedCreate.log, /^atlas:/mu)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('critical PostgreSQL batch owns a unique database and cleans it fail-closed', () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'plush-critical-postgres-disposable-'))
  const fakeBin = path.join(fixtureRoot, 'bin')
  const logFile = path.join(fixtureRoot, 'commands.log')
  mkdirSync(fakeBin)

  const executables = {
    psql: `#!/usr/bin/env bash
set -euo pipefail
printf 'psql:%s\n' "$*" >> "\${FAKE_PG_LOG:?}"
if [[ "$*" == *'CREATE DATABASE '* && "\${FAKE_CREATE_FAIL:-0}" == '1' ]]; then exit 19; fi
if [[ "$*" == *'DROP DATABASE '* && "\${FAKE_DROP_FAIL:-0}" == '1' ]]; then exit 44; fi
`,
    atlas: `#!/usr/bin/env bash
set -euo pipefail
printf 'atlas:%s\n' "$*" >> "\${FAKE_PG_LOG:?}"
if [[ "$*" == 'migrate apply '* && "\${FAKE_ATLAS_FAIL:-0}" == '1' ]]; then exit 42; fi
`,
    go: `#!/usr/bin/env bash
set -euo pipefail
printf 'go:%s\n' "$*" >> "\${FAKE_PG_LOG:?}"
if [[ "\${FAKE_GO_FAIL:-0}" == '1' ]]; then exit 43; fi
printf '{"Action":"pass","Test":"TestPurchaseReceiptPostgresSynthetic"}\n'
`,
    node: `#!/usr/bin/env bash
set -euo pipefail
printf 'node:%s\n' "$*" >> "\${FAKE_PG_LOG:?}"
`,
  }
  for (const [name, source] of Object.entries(executables)) {
    const file = path.join(fakeBin, name)
    writeFileSync(file, source)
    chmodSync(file, 0o755)
  }

  const run = (extraEnv = {}) => {
    writeFileSync(logFile, '')
    const result = spawnSync(
      'bash',
      [path.join(repoRoot, 'scripts/purchase-receipt-pg.sh'), 'test-critical-disposable'],
      {
        cwd: path.join(repoRoot, 'server'),
        encoding: 'utf8',
        env: {
          ...process.env,
          FAKE_PG_LOG: logFile,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
          PURCHASE_RECEIPT_PG_DB_URL:
            'postgres://postgres:critical-secret@127.0.0.1:55432/plush_erp_purchase_receipt_test?sslmode=disable',
          ...extraEnv,
        },
      },
    )
    return { result, log: readFileSync(logFile, 'utf8') }
  }

  const identities = (log) => ({
    created: log.match(/CREATE DATABASE "([A-Za-z0-9_]+)"/u)?.[1],
    dropped: log.match(/DROP DATABASE IF EXISTS "([A-Za-z0-9_]+)" WITH \(FORCE\)/u)?.[1],
  })

  try {
    const first = run()
    const firstIdentity = identities(first.log)
    assert.equal(first.result.status, 0, `${first.result.stdout}\n${first.result.stderr}`)
    assert.match(firstIdentity.created, /_critical_[0-9]+_[0-9a-f]{8}$/u)
    assert.notEqual(firstIdentity.created, 'plush_erp_purchase_receipt_test')
    assert.equal(firstIdentity.dropped, firstIdentity.created)
    assert.match(first.log, new RegExp(`/${firstIdentity.created}\\?sslmode=disable`, 'u'))
    assert.doesNotMatch(`${first.result.stdout}\n${first.result.stderr}`, /critical-secret/u)

    const second = run()
    const secondIdentity = identities(second.log)
    assert.equal(second.result.status, 0, `${second.result.stdout}\n${second.result.stderr}`)
    assert.notEqual(secondIdentity.created, firstIdentity.created)
    assert.equal(secondIdentity.dropped, secondIdentity.created)

    const failedCreate = run({ FAKE_CREATE_FAIL: '1' })
    assert.equal(failedCreate.result.status, 19)
    assert.doesNotMatch(failedCreate.log, /DROP DATABASE|^atlas:|^go:/mu)

    const failedAtlas = run({ FAKE_ATLAS_FAIL: '1' })
    assert.equal(failedAtlas.result.status, 42)
    assert.equal(identities(failedAtlas.log).dropped, identities(failedAtlas.log).created)
    assert.doesNotMatch(failedAtlas.log, /^go:/mu)

    const failedGo = run({ FAKE_GO_FAIL: '1' })
    assert.equal(failedGo.result.status, 43)
    assert.equal(identities(failedGo.log).dropped, identities(failedGo.log).created)

    const failedDrop = run({ FAKE_DROP_FAIL: '1' })
    assert.equal(failedDrop.result.status, 44)
    assert.equal(identities(failedDrop.log).dropped, identities(failedDrop.log).created)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
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
