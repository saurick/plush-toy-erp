import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { OUTPUT_FILES, readXlsxWorkbook, runExtraction } from './customerSourceExtract.mjs'
import {
  createSyntheticPurchaseSourceFixture,
  createSyntheticSourceFixture,
} from './fixtures/synthetic/createSyntheticSourceFixture.mjs'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '../..')
const cliPath = path.join(testDir, 'customerSourceExtract.mjs')

test('help 输出可运行', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Customer source extractor/)
  assert.match(result.stdout, /--manifest/)
  assert.match(result.stdout, /--raw-dir/)
  assert.ok(!/yoyoosun|永绅/iu.test(result.stdout))
})

test('xlsx reader 正确处理合成 fixture 的自闭合空单元格', async (t) => {
  const fixture = await prepareSyntheticFixture(t)
  const workbook = await readXlsxWorkbook(fixture.xlsxPath)
  const sheet = workbook.sheets.find((item) => item.name === '材料分析明细表')
  assert.ok(sheet)
  const row = sheet.rows.find((item) => item.rowNumber === 7)
  assert.ok(row)
  assert.equal(row.values[2], undefined)
  assert.equal(row.values[4], '左侧片')
  assert.equal(row.values[6], '激光')
})

test('runExtraction 只用合成 fixture 生成 no-real-import evidence', async (t) => {
  const fixture = await prepareSyntheticFixture(t)
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'customer-source-extract-'))
  t.after(() => rm(outDir, { recursive: true, force: true }))
  const manifestBefore = await readFile(fixture.manifestPath)
  const sourcesBefore = await Promise.all(fixture.sourcePaths.map((sourcePath) => readFile(sourcePath)))
  const result = await runExtraction({
    manifest: fixture.manifestPath,
    rawDir: fixture.rawDir,
    out: outDir,
    customer: fixture.manifest.customerKey,
  })

  assert.deepEqual((await readdir(outDir)).sort(), [...OUTPUT_FILES].sort())
  for (const fileName of OUTPUT_FILES) {
    const content = await readFile(path.join(outDir, fileName), 'utf8')
    assert.ok(content.length > 0, `${fileName} should not be empty`)
  }

  assert.deepEqual(await readFile(fixture.manifestPath), manifestBefore)
  for (const [index, sourcePath] of fixture.sourcePaths.entries()) {
    assert.deepEqual(await readFile(sourcePath), sourcesBefore[index])
  }
  assert.equal(result.sourceSnapshot.canExecuteRealImport, false)
  assert.equal(result.sourceSnapshot.noRealImport, true)
  assert.equal(result.sourceSnapshot.sourceManifest.path, 'source-manifest.json')
  assert.equal(result.summary.sourceManifest.path, 'source-manifest.json')
  assert.equal(result.summary.sourceManifest.sourceCount, 2)
  assert.equal(result.summary.sourceManifest.structuredExtractCount, 2)
  assert.ok(result.sourceSnapshot.sources.every((source) => source.sourceManifestId))
  assert.equal(result.importConfig.boundaries.executesImport, false)
  assert.equal(result.importConfig.boundaries.createsTenant, false)
  assert.ok(result.summary.sourceCount > 0)
  assert.ok(result.summary.countsByDomain.materials > 0)
  assert.ok(result.summary.countsByDomain.bom > 0)
  assert.ok(result.summary.countsByDomain.purchase_orders > 0)
  assert.ok(result.summary.countsByDomain.suppliers > 0)
  assert.equal(result.summary.countsByDomain.outsourcing, undefined)
  assert.ok(!result.report.includes(fixture.tempDir))
  assert.ok(!result.report.includes(fixture.relativePath))
})

test('固定 generatedAt 时提取输出可重复', async (t) => {
  const fixture = await prepareSyntheticFixture(t)
  const firstOut = await mkdtemp(path.join(os.tmpdir(), 'customer-source-extract-first-'))
  const secondOut = await mkdtemp(path.join(os.tmpdir(), 'customer-source-extract-second-'))
  t.after(() => Promise.all([
    rm(firstOut, { recursive: true, force: true }),
    rm(secondOut, { recursive: true, force: true }),
  ]))
  const generatedAt = '2026-07-14T00:00:00.000Z'
  const options = {
    manifest: fixture.manifestPath,
    rawDir: fixture.rawDir,
    customer: fixture.manifest.customerKey,
    generatedAt,
  }

  const first = await runExtraction({ ...options, out: firstOut })
  const second = await runExtraction({ ...options, out: secondOut })

  assert.deepEqual(second, first)
  for (const fileName of OUTPUT_FILES) {
    assert.equal(
      await readFile(path.join(secondOut, fileName), 'utf8'),
      await readFile(path.join(firstOut, fileName), 'utf8'),
    )
  }
})

test('提取输出不能进入 raw-dir 或覆盖来源 manifest', async (t) => {
  const fixture = await prepareSyntheticFixture(t)
  await assert.rejects(
    () => runExtraction({
      manifest: fixture.manifestPath,
      rawDir: fixture.rawDir,
      out: fixture.rawDir,
      customer: fixture.manifest.customerKey,
    }),
    /must be outside the raw source directory/u,
  )

  const collisionDir = path.join(fixture.tempDir, 'collision')
  await mkdir(collisionDir)
  const collisionManifest = path.join(collisionDir, 'source-snapshot.extracted.json')
  const manifestBytes = `${JSON.stringify(fixture.manifest, null, 2)}\n`
  await writeFile(collisionManifest, manifestBytes, 'utf8')
  await assert.rejects(
    () => runExtraction({
      manifest: collisionManifest,
      rawDir: fixture.rawDir,
      out: collisionDir,
      customer: fixture.manifest.customerKey,
    }),
    /would overwrite a source manifest or source file/u,
  )
  assert.equal(await readFile(collisionManifest, 'utf8'), manifestBytes)

  const linkedOut = path.join(fixture.tempDir, 'linked-output')
  await mkdir(linkedOut)
  const sentinelPath = path.join(fixture.tempDir, 'outside-sentinel.txt')
  await writeFile(sentinelPath, 'sentinel\n', 'utf8')
  await symlink('../outside-sentinel.txt', path.join(linkedOut, 'extraction-report.md'))
  await assert.rejects(
    () => runExtraction({
      manifest: fixture.manifestPath,
      rawDir: fixture.rawDir,
      out: linkedOut,
      customer: fixture.manifest.customerKey,
    }),
    /regular files, not links or directories/u,
  )
  assert.equal(await readFile(sentinelPath, 'utf8'), 'sentinel\n')
})

test('损坏或超限 xlsx fail-closed 且 CLI 不泄露本地路径', async (t) => {
  const fixture = await prepareSyntheticFixture(t)
  const malformed = Buffer.alloc(22)
  malformed.writeUInt32LE(0x06054b50, 0)
  malformed.writeUInt16LE(1, 8)
  malformed.writeUInt16LE(1, 10)
  malformed.writeUInt32LE(46, 12)
  malformed.writeUInt32LE(0xffffffff, 16)
  await writeFile(fixture.xlsxPath, malformed)
  const source = fixture.manifest.sources.find((item) => item.relativePath === fixture.relativePath)
  source.sha256 = createHash('sha256').update(malformed).digest('hex')
  source.sizeBytes = malformed.length
  await writeFile(fixture.manifestPath, `${JSON.stringify(fixture.manifest, null, 2)}\n`, 'utf8')

  const cliResult = spawnSync(
    process.execPath,
    [
      cliPath,
      '--manifest', 'source-manifest.json',
      '--raw-dir', 'raw',
      '--out', 'out',
      '--customer', fixture.manifest.customerKey,
    ],
    { cwd: fixture.tempDir, encoding: 'utf8' },
  )
  assert.equal(cliResult.status, 2)
  assert.match(cliResult.stderr, /Invalid xlsx zip central directory bounds/u)
  assert.doesNotMatch(cliResult.stderr, /RangeError|customerSourceExtract\.mjs/u)
  assert.ok(!cliResult.stderr.includes(fixture.tempDir))

  const valid = createSyntheticSourceFixture().xlsx
  const oversizedEntry = Buffer.from(valid)
  const centralOffset = findZipSignature(oversizedEntry, 0x02014b50)
  oversizedEntry.writeUInt32LE(64 * 1024 * 1024 + 1, centralOffset + 24)
  const oversizedPath = path.join(fixture.tempDir, 'oversized.xlsx')
  await writeFile(oversizedPath, oversizedEntry)
  await assert.rejects(
    () => readXlsxWorkbook(oversizedPath),
    /entry exceeds the extraction size limit/u,
  )

  const checksumDrift = Buffer.from(valid)
  const workbookDataOffset = findStoredZipEntryData(checksumDrift, 'xl/workbook.xml')
  checksumDrift[workbookDataOffset] ^= 1
  const checksumDriftPath = path.join(fixture.tempDir, 'checksum-drift.xlsx')
  await writeFile(checksumDriftPath, checksumDrift)
  await assert.rejects(
    () => readXlsxWorkbook(checksumDriftPath),
    /entry checksum mismatch/u,
  )
})

async function prepareSyntheticFixture(t) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'customer-source-extract-fixture-'))
  t.after(() => rm(tempDir, { recursive: true, force: true }))
  const rawDir = path.join(tempDir, 'raw')
  await mkdir(rawDir, { recursive: true })
  const synthetic = createSyntheticSourceFixture()
  const purchase = createSyntheticPurchaseSourceFixture({
    customerKey: synthetic.manifest.customerKey,
  })
  const manifest = structuredClone(synthetic.manifest)
  manifest.description = 'Synthetic material, BOM, and purchase source fixtures for Product Core tests.'
  manifest.sources.push(...purchase.manifest.sources)
  const manifestPath = path.join(tempDir, 'source-manifest.json')
  const xlsxPath = path.join(rawDir, synthetic.relativePath)
  const purchaseXlsxPath = path.join(rawDir, purchase.relativePath)
  await writeFile(xlsxPath, synthetic.xlsx)
  await writeFile(purchaseXlsxPath, purchase.xlsx)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return {
    tempDir,
    rawDir,
    manifestPath,
    xlsxPath,
    sourcePaths: [xlsxPath, purchaseXlsxPath],
    relativePath: synthetic.relativePath,
    manifest,
  }
}

function findZipSignature(buffer, signature) {
  for (let offset = 0; offset <= buffer.length - 4; offset += 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset
    }
  }
  throw new Error('synthetic zip signature not found')
}

function findStoredZipEntryData(buffer, expectedName) {
  for (let offset = 0; offset <= buffer.length - 30; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      continue
    }
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength)
    if (name === expectedName) {
      return offset + 30 + nameLength + extraLength
    }
  }
  throw new Error('synthetic zip entry not found')
}
