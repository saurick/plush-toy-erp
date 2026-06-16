import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_RAW_SOURCE_DIR,
  DEFAULT_SOURCE_MANIFEST,
  runManifestCheck,
  selectStructuredExtractSources,
} from './customerSourceManifestCheck.mjs'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '../..')
const cliPath = path.join(testDir, 'customerSourceManifestCheck.mjs')
const manifestPath = path.join(repoRoot, DEFAULT_SOURCE_MANIFEST)
const rawDir = path.join(repoRoot, DEFAULT_RAW_SOURCE_DIR)

test('manifest checker validates tracked yoyoosun source files', async () => {
  const result = await runManifestCheck({
    manifest: manifestPath,
    rawDir,
  })

  assert.equal(result.summary.customerKey, 'yoyoosun')
  assert.equal(result.summary.sourceCount, 11)
  assert.equal(result.summary.structuredExtractCount, 5)
  assert.equal(result.summary.manualReferenceCount, 6)
  assert.equal(result.summary.rawFileCount, 11)
  assert.equal(result.summary.canExecuteRealImport, false)

  const structuredSources = selectStructuredExtractSources(result.sources)
  assert.equal(structuredSources.length, 5)
  assert.ok(structuredSources.every((source) => source.path.endsWith('.xlsx')))
})

test('manifest checker blocks checksum drift', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'source-manifest-check-'))
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.sources[0].sha256 = '0'.repeat(64)
    const driftManifestPath = path.join(tempDir, 'source-manifest.drift.json')
    await writeFile(driftManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    await assert.rejects(
      () =>
        runManifestCheck({
          manifest: driftManifestPath,
          rawDir,
        }),
      /sha256 mismatch/u,
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('manifest checker CLI help is runnable', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Customer source manifest checker/)
  assert.match(result.stdout, /--manifest/)
})
