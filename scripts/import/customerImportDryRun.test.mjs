import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { OUTPUT_FILES } from './customerImportDryRun.mjs'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '../..')
const cliPath = path.join(testDir, 'customerImportDryRun.mjs')
const sourceFixture = path.join(testDir, 'fixtures/customers/yoyoosun/source-snapshot.sample.json')
const existingFixture = path.join(testDir, 'fixtures/customers/yoyoosun/existing-v1.sample.json')

test('help 输出可运行', () => {
  const result = runCli(['--help'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Customer import dry-run tooling/)
  assert.match(result.stdout, /--fail-on-blockers/)
})

test('缺少 --source 返回非 0', async () => {
  const outDir = await tempOutDir()
  const result = runCli(['--existing', existingFixture, '--out', outDir])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing required --source/)
})

test('缺少 --existing 返回非 0', async () => {
  const outDir = await tempOutDir()
  const result = runCli(['--source', sourceFixture, '--out', outDir])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing required --existing/)
})

test('happy path 生成完整 dry-run package', async () => {
  const outDir = await tempOutDir()
  const result = runCli(baseArgs(outDir))
  assert.equal(result.status, 0, result.stderr)

  for (const fileName of OUTPUT_FILES) {
    await assertFileExists(path.join(outDir, fileName))
  }

  const summary = await readJson(path.join(outDir, 'validation-summary.json'))
  assert.equal(summary.totalSources, 16)
  assert.equal(summary.canExecuteRealImport, false)
  assert.ok(summary.candidateCountsByAction.create >= 1)
  assert.ok(summary.candidateCountsByAction.update >= 1)

  const report = await readFile(path.join(outDir, 'dry-run-report.md'), 'utf8')
  assert.match(report, /No real import/)
  assert.match(report, /canExecuteRealImport/)
})

test('候选、阻断、deferred、forbidden 和 skip 规则覆盖样本', async () => {
  const outDir = await tempOutDir()
  const result = runCli(baseArgs(outDir))
  assert.equal(result.status, 0, result.stderr)

  const candidates = await readJson(path.join(outDir, 'candidates.json'))
  const unresolved = await readJson(path.join(outDir, 'unresolved-queue.json'))
  const duplicates = await readJson(path.join(outDir, 'duplicates.json'))
  const forbidden = await readJson(path.join(outDir, 'forbidden-auto-import.json'))

  assertCandidate(candidates, 'src-customer-update', {
    targetModel: 'customers',
    actionCandidate: 'update',
    matchedExistingId: 'customer-1',
  })
  assertCandidate(candidates, 'src-customer-create', {
    targetModel: 'customers',
    actionCandidate: 'create',
  })

  assert.ok(duplicates.some((item) => item.targetModel === 'customers' && item.duplicateType === 'code'))
  assertUnresolved(unresolved, 'src-customer-duplicate', 'duplicate code', 'block')

  assert.notEqual(findCandidate(candidates, 'src-contact-no-owner').actionCandidate, 'create')
  assertUnresolved(unresolved, 'src-contact-no-owner', 'missing required field', 'block')

  assert.notEqual(findCandidate(candidates, 'src-sales-order-no-customer').actionCandidate, 'create')
  assertUnresolved(unresolved, 'src-sales-order-no-customer', 'unknown customer', 'block')

  assert.notEqual(findCandidate(candidates, 'src-sales-order-item-unknown-unit').actionCandidate, 'create')
  assertUnresolved(unresolved, 'src-sales-order-item-unknown-unit', 'unknown unit', 'block')

  assertCandidate(candidates, 'src-product-sku-deferred', {
    targetModel: 'product_skus',
    actionCandidate: 'defer',
  })
  assertUnresolved(unresolved, 'src-product-sku-deferred', 'deferred domain', 'defer')

  assertCandidate(candidates, 'src-purchase-order-deferred', {
    targetModel: 'purchase_orders',
    actionCandidate: 'defer',
  })
  assertUnresolved(unresolved, 'src-purchase-order-deferred', 'deferred domain', 'defer')

  assertCandidate(candidates, 'src-shipment-forbidden', {
    targetModel: 'shipments',
    actionCandidate: 'forbidden',
  })
  assertCandidate(candidates, 'src-inventory-forbidden', {
    targetModel: 'inventory facts',
    actionCandidate: 'forbidden',
  })
  assertCandidate(candidates, 'src-finance-forbidden', {
    targetModel: 'finance facts',
    actionCandidate: 'forbidden',
  })
  assert.ok(forbidden.some((item) => item.sourceField === 'shipping_released' && item.boundary === 'shipping_released != shipped'))
  assert.ok(forbidden.some((item) => item.forbiddenTarget.includes('inventory_txn')))
  assert.ok(forbidden.some((item) => item.forbiddenTarget.includes('invoice')))
  assert.ok(forbidden.some((item) => item.forbiddenTarget === 'fact posted' && item.boundary === 'workflow task done != fact posted'))
  assert.equal(
    candidates.some((item) => item.actionCandidate === 'create' && /shipments|inventory facts|finance facts|fact posted/.test(item.targetModel)),
    false,
  )

  assertCandidate(candidates, 'src-demo-skip', {
    targetModel: 'none',
    actionCandidate: 'skip',
  })
  assertCandidate(candidates, 'src-debug-skip', {
    targetModel: 'none',
    actionCandidate: 'skip',
  })
})

test('invalid value path 产生 date、quantity 和 money 证据', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'customer-import-invalid-'))
  const sourcePath = path.join(tempDir, 'source.json')
  const outDir = path.join(tempDir, 'out')
  await writeFile(
    sourcePath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: '2026-05-31T00:00:00.000Z',
        sources: [
          {
            sourceId: 'invalid-date',
            sourceType: 'Data Import Source',
            sourceKind: 'manual_snapshot',
            moduleKey: 'project-orders',
            fileName: 'invalid.json',
            sheetName: null,
            rowNumber: 1,
            domain: 'sales_orders',
            fields: {
              document_no: 'SO-BAD-DATE',
              customer_code: 'C001',
              order_date: '2026/13/01',
              amount: '=SUM(A1:A2)'
            },
            items: []
          },
          {
            sourceId: 'invalid-quantity',
            sourceType: 'Data Import Source',
            sourceKind: 'manual_snapshot',
            moduleKey: 'project-orders',
            fileName: 'invalid.json',
            sheetName: null,
            rowNumber: 2,
            domain: 'sales_order_items',
            fields: {
              product_no: 'P001',
              unit: 'PCS',
              quantity: '-1'
            },
            items: []
          }
        ]
      },
      null,
      2,
    ),
  )

  const result = runCli([
    '--source',
    sourcePath,
    '--existing',
    existingFixture,
    '--out',
    outDir,
    '--format',
    'json',
  ])
  assert.equal(result.status, 0, result.stderr)

  const unresolved = await readJson(path.join(outDir, 'unresolved-queue.json'))
  const normalizedRows = await readJson(path.join(outDir, 'normalized-rows.json'))
  assertUnresolved(unresolved, 'invalid-date', 'invalid date', 'block')
  assertUnresolved(unresolved, 'invalid-quantity', 'invalid quantity', 'block')
  assert.ok(
    normalizedRows.some((row) =>
      row.normalizationWarnings.some((warning) => warning.includes('Invalid money value')),
    ),
  )

  await rm(tempDir, { recursive: true, force: true })
})

test('Print Template Input 与 Industry Template Candidate 不会自动 create/update', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'customer-import-source-type-'))
  const sourcePath = path.join(tempDir, 'source.json')
  const outDir = path.join(tempDir, 'out')
  await writeFile(
    sourcePath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: '2026-05-31T00:00:00.000Z',
        sources: [
          {
            sourceId: 'print-template-input',
            sourceType: 'Print Template Input',
            sourceKind: 'manual_snapshot',
            moduleKey: 'processing-contracts',
            fileName: 'template.json',
            sheetName: null,
            rowNumber: 1,
            domain: 'suppliers',
            fields: {
              factory_name: 'Template Factory',
              amount: '1000'
            },
            items: []
          },
          {
            sourceId: 'industry-template-candidate',
            sourceType: 'Industry Template Candidate',
            sourceKind: 'manual_snapshot',
            moduleKey: 'products',
            fileName: 'template.json',
            sheetName: null,
            rowNumber: 2,
            domain: 'products',
            fields: {
              product_no: 'P-TEMPLATE',
              title: 'Template Product'
            },
            items: []
          }
        ]
      },
      null,
      2,
    ),
  )

  const result = runCli([
    '--source',
    sourcePath,
    '--existing',
    existingFixture,
    '--out',
    outDir,
    '--format',
    'json',
  ])
  assert.equal(result.status, 0, result.stderr)

  const candidates = await readJson(path.join(outDir, 'candidates.json'))
  assertCandidate(candidates, 'print-template-input', {
    actionCandidate: 'review',
  })
  assertCandidate(candidates, 'industry-template-candidate', {
    actionCandidate: 'defer',
  })
  assert.equal(
    candidates.some(
      (item) =>
        /print-template-input|industry-template-candidate/.test(item.sourceReference) &&
        ['create', 'update'].includes(item.actionCandidate),
    ),
    false,
  )

  await rm(tempDir, { recursive: true, force: true })
})

test('--fail-on-blockers 存在 block/forbidden 时返回非 0', async () => {
  const outDir = await tempOutDir()
  const result = runCli([...baseArgs(outDir, 'json'), '--fail-on-blockers'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Dry-run blockers found/)
  await assertFileExists(path.join(outDir, 'validation-summary.json'))
})

test('--strict-source 缺 source metadata 时返回非 0', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'customer-import-strict-'))
  const sourcePath = path.join(tempDir, 'bad-source.json')
  const outDir = path.join(tempDir, 'out')
  await writeFile(
    sourcePath,
    JSON.stringify({
      version: 1,
      generatedAt: '2026-05-31T00:00:00.000Z',
      sources: [
        {
          sourceType: 'Data Import Source',
          sourceKind: 'manual_snapshot',
          moduleKey: 'partners',
          domain: 'customers',
          fields: {
            title: 'Missing sourceId'
          }
        }
      ]
    }),
  )
  const result = runCli([
    '--source',
    sourcePath,
    '--existing',
    existingFixture,
    '--out',
    outDir,
    '--format',
    'json',
    '--strict-source',
  ])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /misses required field/)
  await rm(tempDir, { recursive: true, force: true })
})

test('不依赖 DB、server 或 web runtime 即可运行', async () => {
  const outDir = await tempOutDir()
  const result = runCli(baseArgs(outDir), {
    env: {
      DATABASE_URL: 'postgres://dry-run-must-not-connect.invalid/plush',
      ERP_DB_DSN: 'postgres://dry-run-must-not-connect.invalid/plush',
      SERVER_CONFIG: '/path/that/does/not/exist',
      WEB_RUNTIME_CONFIG: '/path/that/does/not/exist'
    }
  })
  assert.equal(result.status, 0, result.stderr)
  const summary = await readJson(path.join(outDir, 'validation-summary.json'))
  assert.equal(summary.canExecuteRealImport, false)
})

test('同输入重复运行 summary 关键字段确定', async () => {
  const outA = await tempOutDir()
  const outB = await tempOutDir()
  assert.equal(runCli(baseArgs(outA, 'json')).status, 0)
  assert.equal(runCli(baseArgs(outB, 'json')).status, 0)
  const summaryA = await readJson(path.join(outA, 'validation-summary.json'))
  const summaryB = await readJson(path.join(outB, 'validation-summary.json'))
  assert.deepEqual(
    pickSummaryDeterministicFields(summaryA),
    pickSummaryDeterministicFields(summaryB),
  )
})

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
  })
}

function baseArgs(outDir, format = 'json,md') {
  return [
    '--source',
    sourceFixture,
    '--existing',
    existingFixture,
    '--out',
    outDir,
    '--format',
    format,
  ]
}

async function tempOutDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'customer-import-dry-run-'))
  return path.join(tempDir, 'out')
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function assertFileExists(filePath) {
  const content = await readFile(filePath, 'utf8')
  assert.ok(content.length > 0, `${filePath} should not be empty`)
}

function findCandidate(candidates, sourceId) {
  const candidate = candidates.find((item) => item.sourceReference.includes(sourceId))
  assert.ok(candidate, `candidate for ${sourceId} should exist`)
  return candidate
}

function assertCandidate(candidates, sourceId, expected) {
  const candidate = findCandidate(candidates, sourceId)
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(candidate[key], value, `${sourceId} ${key}`)
  }
}

function assertUnresolved(unresolved, sourceId, unresolvedType, severity) {
  assert.ok(
    unresolved.some(
      (item) =>
        item.sourceReference.includes(sourceId) &&
        item.unresolvedType === unresolvedType &&
        item.severity === severity,
    ),
    `${sourceId} should have ${unresolvedType} / ${severity}`,
  )
}

function pickSummaryDeterministicFields(summary) {
  return {
    totalSources: summary.totalSources,
    normalizedRows: summary.normalizedRows,
    candidateCountsByAction: summary.candidateCountsByAction,
    unresolvedCountsBySeverity: summary.unresolvedCountsBySeverity,
    forbiddenCount: summary.forbiddenCount,
    duplicateCount: summary.duplicateCount,
    conflictCount: summary.conflictCount,
    blockerCount: summary.blockerCount,
    canExecuteRealImport: summary.canExecuteRealImport,
  }
}
