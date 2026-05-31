import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { OUTPUT_FILES } from './currentSourceSnapshotFreezeCheck.mjs'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '../..')
const cliPath = path.join(testDir, 'currentSourceSnapshotFreezeCheck.mjs')
const sourceFixture = path.join(testDir, 'fixtures/current/source-snapshot.freeze.sample.json')
const existingFixture = path.join(testDir, 'fixtures/current/existing-v1.freeze.sample.json')

test('help 输出可运行', () => {
  const result = runCli(['--help'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Current source snapshot freeze checker/)
  assert.match(result.stdout, /--source/)
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

test('缺少 --out 返回非 0', () => {
  const result = runCli(['--source', sourceFixture, '--existing', existingFixture])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing required --out/)
})

test('valid freeze fixture 生成 3 个 freeze 输出', async () => {
  const outDir = await tempOutDir()
  const result = runCli(baseArgs(outDir))
  assert.equal(result.status, 0, result.stderr)

  for (const fileName of OUTPUT_FILES) {
    await assertFileExists(path.join(outDir, fileName))
  }

  const metadata = await readJson(path.join(outDir, 'freeze-metadata.json'))
  assert.equal(metadata.sourceCount, 20)
  assert.equal(metadata.noRealImport, true)
  assert.equal(metadata.canExecuteRealImport, false)
  assert.equal(metadata.manualReviewRequired, true)
  assert.match(metadata.sourceSha256, /^[a-f0-9]{64}$/)
  assert.match(metadata.existingSha256, /^[a-f0-9]{64}$/)
  assert.equal(metadata.domainCounts.customers, 2)

  const report = await readFile(path.join(outDir, 'freeze-check-report.md'), 'utf8')
  assert.match(report, /No real import/)
  assert.match(report, /shipping_released != shipped/)
  assert.match(report, /workflow task done != fact posted/)
})

test('freeze-check-summary.json 包含 warnings 和 blockers 统计', async () => {
  const outDir = await tempOutDir()
  const result = runCli(baseArgs(outDir))
  assert.equal(result.status, 0, result.stderr)

  const summary = await readJson(path.join(outDir, 'freeze-check-summary.json'))
  assert.equal(summary.valid, false)
  assert.ok(summary.blockerCount > 0)
  assert.ok(summary.warningCount > 0)
  assert.ok(summary.sensitiveFieldCount > 0)
  assert.ok(summary.forbiddenFieldCount > 0)
  assert.ok(summary.deferredFieldCount > 0)
})

test('duplicate sourceId 记录 blocker 并锁定 valid=false', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'current-freeze-duplicate-'))
  const sourcePath = path.join(tempDir, 'source.json')
  const outDir = path.join(tempDir, 'out')
  await writeSource(sourcePath, [
    sourceRow({ sourceId: 'dup-source' }),
    sourceRow({ sourceId: 'dup-source', rowNumber: 2 }),
  ])

  const result = runCli(['--source', sourcePath, '--existing', existingFixture, '--out', outDir])
  assert.equal(result.status, 0, result.stderr)
  const summary = await readJson(path.join(outDir, 'freeze-check-summary.json'))
  assert.equal(summary.valid, false)
  assert.equal(summary.duplicateSourceIdCount, 1)
  assertRisk(summary.blockers, 'duplicate-source-id', 'dup-source')
  await rm(tempDir, { recursive: true, force: true })
})

test('invalid domain 记录 blocker 并锁定 valid=false', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'current-freeze-domain-'))
  const sourcePath = path.join(tempDir, 'source.json')
  const outDir = path.join(tempDir, 'out')
  await writeSource(sourcePath, [sourceRow({ domain: 'unknown_domain' })])

  const result = runCli(['--source', sourcePath, '--existing', existingFixture, '--out', outDir])
  assert.equal(result.status, 0, result.stderr)
  const summary = await readJson(path.join(outDir, 'freeze-check-summary.json'))
  assert.equal(summary.valid, false)
  assert.equal(summary.invalidDomainCount, 1)
  assertRisk(summary.blockers, 'invalid-domain', 'freeze-row-1')
  await rm(tempDir, { recursive: true, force: true })
})

test('fields 非 object 记录 blocker 并锁定 valid=false', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'current-freeze-fields-'))
  const sourcePath = path.join(tempDir, 'source.json')
  const outDir = path.join(tempDir, 'out')
  await writeSource(sourcePath, [sourceRow({ fields: ['not-object'] })])

  const result = runCli(['--source', sourcePath, '--existing', existingFixture, '--out', outDir])
  assert.equal(result.status, 0, result.stderr)
  const summary = await readJson(path.join(outDir, 'freeze-check-summary.json'))
  assert.equal(summary.valid, false)
  assert.equal(summary.invalidFieldsCount, 1)
  assertRisk(summary.blockers, 'invalid-fields', 'freeze-row-1')
  await rm(tempDir, { recursive: true, force: true })
})

test('missing source reference 记录 blocker 并锁定 valid=false', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'current-freeze-reference-'))
  const sourcePath = path.join(tempDir, 'source.json')
  const outDir = path.join(tempDir, 'out')
  const row = sourceRow()
  delete row.fileName
  await writeSource(sourcePath, [row])

  const result = runCli(['--source', sourcePath, '--existing', existingFixture, '--out', outDir])
  assert.equal(result.status, 0, result.stderr)
  const summary = await readJson(path.join(outDir, 'freeze-check-summary.json'))
  assert.equal(summary.valid, false)
  assert.equal(summary.missingSourceReferenceCount, 1)
  assertRisk(summary.blockers, 'missing-source-reference', 'freeze-row-1')
  await rm(tempDir, { recursive: true, force: true })
})

test('forbidden field 被记录', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'current-freeze-forbidden-'))
  const sourcePath = path.join(tempDir, 'source.json')
  const outDir = path.join(tempDir, 'out')
  await writeSource(sourcePath, [
    sourceRow({
      sourceId: 'forbidden-row',
      fields: {
        document_no: 'SO-FORBIDDEN',
        inventory_txn: 'IN',
        invoice: 'INV-SANITIZED',
      },
    }),
  ])

  const result = runCli(['--source', sourcePath, '--existing', existingFixture, '--out', outDir])
  assert.equal(result.status, 0, result.stderr)
  const summary = await readJson(path.join(outDir, 'freeze-check-summary.json'))
  assert.ok(summary.forbiddenFieldCount >= 2)
  assertRisk(summary.blockers, 'forbidden-field', 'forbidden-row')
  await rm(tempDir, { recursive: true, force: true })
})

test('sensitive field 被记录但不输出原始敏感值', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'current-freeze-sensitive-'))
  const sourcePath = path.join(tempDir, 'source.json')
  const outDir = path.join(tempDir, 'out')
  await writeSource(sourcePath, [
    sourceRow({
      sourceId: 'sensitive-row',
      fields: {
        document_no: 'C-SENSITIVE',
        title: 'Sensitive Field Name Only',
        phone: 'SECRET-SHOULD-NOT-APPEAR',
      },
    }),
  ])

  const result = runCli(['--source', sourcePath, '--existing', existingFixture, '--out', outDir])
  assert.equal(result.status, 0, result.stderr)
  const summaryText = await readFile(path.join(outDir, 'freeze-check-summary.json'), 'utf8')
  const reportText = await readFile(path.join(outDir, 'freeze-check-report.md'), 'utf8')
  assert.doesNotMatch(summaryText, /SECRET-SHOULD-NOT-APPEAR/)
  assert.doesNotMatch(reportText, /SECRET-SHOULD-NOT-APPEAR/)

  const summary = JSON.parse(summaryText)
  assert.equal(summary.sensitiveFieldCount, 1)
  assertRisk(summary.warnings, 'sensitive-field', 'sensitive-row')
  await rm(tempDir, { recursive: true, force: true })
})

test('shipping_released / shipped 混淆被记录', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'current-freeze-shipping-'))
  const sourcePath = path.join(tempDir, 'source.json')
  const outDir = path.join(tempDir, 'out')
  await writeSource(sourcePath, [
    sourceRow({
      sourceId: 'shipping-row',
      fields: {
        document_no: 'SO-SHIPPING',
        shipping_released: 'done',
        shipped: 'true',
      },
    }),
  ])

  const result = runCli(['--source', sourcePath, '--existing', existingFixture, '--out', outDir])
  assert.equal(result.status, 0, result.stderr)
  const summary = await readJson(path.join(outDir, 'freeze-check-summary.json'))
  assert.ok(summary.shippingBoundaryRiskCount >= 2)
  assertRisk(summary.blockers, 'shipping-boundary-risk', 'shipping-row')
  await rm(tempDir, { recursive: true, force: true })
})

test('workflow done / fact posted 风险被记录', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'current-freeze-workflow-'))
  const sourcePath = path.join(tempDir, 'source.json')
  const outDir = path.join(tempDir, 'out')
  await writeSource(sourcePath, [
    sourceRow({
      sourceId: 'workflow-row',
      fields: {
        document_no: 'SO-WORKFLOW',
        workflow_task_done: 'true',
        fact_posted: 'true',
      },
    }),
  ])

  const result = runCli(['--source', sourcePath, '--existing', existingFixture, '--out', outDir])
  assert.equal(result.status, 0, result.stderr)
  const summary = await readJson(path.join(outDir, 'freeze-check-summary.json'))
  assert.ok(summary.workflowFactBoundaryRiskCount >= 2)
  assertRisk(summary.blockers, 'workflow-fact-boundary-risk', 'workflow-row')
  await rm(tempDir, { recursive: true, force: true })
})

test('SHA256 对同一输入稳定', async () => {
  const outA = await tempOutDir()
  const outB = await tempOutDir()
  assert.equal(runCli(baseArgs(outA)).status, 0)
  assert.equal(runCli(baseArgs(outB)).status, 0)
  const metadataA = await readJson(path.join(outA, 'freeze-metadata.json'))
  const metadataB = await readJson(path.join(outB, 'freeze-metadata.json'))
  assert.equal(metadataA.sourceSha256, metadataB.sourceSha256)
  assert.equal(metadataA.existingSha256, metadataB.existingSha256)
  assert.equal(metadataA.freezeId, metadataB.freezeId)
})

test('不依赖 DB、server 或 web runtime 即可运行', async () => {
  const outDir = await tempOutDir()
  const result = runCli(baseArgs(outDir), {
    env: {
      DATABASE_URL: 'postgres://freeze-must-not-connect.invalid/plush',
      ERP_DB_DSN: 'postgres://freeze-must-not-connect.invalid/plush',
      SERVER_CONFIG: '/path/that/does/not/exist',
      WEB_RUNTIME_CONFIG: '/path/that/does/not/exist',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  const metadata = await readJson(path.join(outDir, 'freeze-metadata.json'))
  assert.equal(metadata.canExecuteRealImport, false)
})

test('输出目录可重复生成', async () => {
  const outDir = await tempOutDir()
  assert.equal(runCli(baseArgs(outDir)).status, 0)
  assert.equal(runCli(baseArgs(outDir)).status, 0)
  await assertFileExists(path.join(outDir, 'freeze-check-report.md'))
})

test('output report 包含 no real import', async () => {
  const outDir = await tempOutDir()
  const result = runCli(baseArgs(outDir))
  assert.equal(result.status, 0, result.stderr)
  const report = await readFile(path.join(outDir, 'freeze-check-report.md'), 'utf8')
  assert.match(report, /No real import/)
  assert.match(report, /canExecuteRealImport/)
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

function baseArgs(outDir) {
  return ['--source', sourceFixture, '--existing', existingFixture, '--out', outDir]
}

async function tempOutDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'current-source-freeze-'))
  return path.join(tempDir, 'out')
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function assertFileExists(filePath) {
  const content = await readFile(filePath, 'utf8')
  assert.ok(content.length > 0, `${filePath} should not be empty`)
}

async function writeSource(filePath, sources) {
  await writeFile(
    filePath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: '2026-05-31T00:00:00.000Z',
        sources,
      },
      null,
      2,
    ),
  )
}

function sourceRow(overrides = {}) {
  return {
    sourceId: 'freeze-row-1',
    sourceType: 'Data Import Source',
    sourceKind: 'manual_snapshot',
    moduleKey: 'partners',
    fileName: 'freeze-test.json',
    sheetName: null,
    rowNumber: 1,
    domain: 'customers',
    fields: {
      document_no: 'C-FREEZE',
      title: 'Freeze Test Customer',
    },
    items: [],
    ...overrides,
  }
}

function assertRisk(items, riskType, sourceId) {
  assert.ok(
    items.some((item) => item.riskType === riskType && item.sourceId === sourceId),
    `${sourceId} should have ${riskType}`,
  )
}
