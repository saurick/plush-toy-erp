import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { createSyntheticSourceFixture } from './fixtures/synthetic/createSyntheticSourceFixture.mjs'
import {
  runManifestCheck,
  selectStructuredExtractSources,
} from './customerSourceManifestCheck.mjs'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '../..')
const cliPath = path.join(testDir, 'customerSourceManifestCheck.mjs')

test('manifest checker validates an external v2 manifest with synthetic sources', async (t) => {
  const fixture = await prepareFixture(t)
  fixture.manifest.sources[0].storage = {
    provider: 'minio',
    bucketAlias: 'synthetic-private',
    objectKey: `sources/${fixture.manifest.sources[0].sourceId}/v0001/original.xlsx`,
  }
  await fixture.writeManifest()

  const result = await runManifestCheck({
    manifest: 'source-manifest.json',
    rawDir: 'raw',
    customer: 'synthetic-customer',
    baseDir: fixture.tempDir,
  })

  assert.equal(result.summary.version, 2)
  assert.equal(result.summary.customerKey, 'synthetic-customer')
  assert.equal(result.summary.sourceCount, 1)
  assert.equal(result.summary.structuredExtractCount, 1)
  assert.equal(result.summary.manualReferenceCount, 0)
  assert.equal(result.summary.rawFileCount, 1)
  assert.equal(result.summary.canExecuteRealImport, false)
  assert.equal(result.summary.noRealImport, true)
  assert.deepEqual(result.sources[0].sourceTypes, ['Synthetic Test Fixture'])
  assert.deepEqual(result.sources[0].domains, ['materials', 'bom', 'products', 'units'])
  assert.equal(selectStructuredExtractSources(result.sources)[0].relativePath, fixture.relativePath)
  assert.ok(!result.report.includes(fixture.tempDir))
  assert.ok(!result.report.includes(fixture.relativePath))
})

test('manifest checker accepts the documented minimal v2 shape without storage', async (t) => {
  const fixture = await prepareFixture(t)
  delete fixture.manifest.description
  fixture.manifest.boundaries = { canExecuteRealImport: false }
  const source = fixture.manifest.sources[0]
  delete source.sourceTypes
  delete source.domains
  delete source.usage
  delete source.sensitiveReviewRequired
  delete source.structuredExtract.parser
  delete source.storage
  await fixture.writeManifest()

  const result = await fixture.run()
  assert.equal(result.summary.sourceCount, 1)
  assert.equal(result.summary.canExecuteRealImport, false)
  assert.equal(result.sources[0].storage, undefined)
})

test('manifest checker rejects real-import capability', async (t) => {
  const fixture = await prepareFixture(t)
  fixture.manifest.boundaries.canExecuteRealImport = true
  await fixture.writeManifest()
  await assert.rejects(
    () => fixture.run(),
    /boundaries\.canExecuteRealImport must be false/u,
  )
})

test('manifest checker resolves CLI paths from cwd and does not expose absolute paths', async (t) => {
  const fixture = await prepareFixture(t)
  const result = spawnSync(
    process.execPath,
    [cliPath, '--manifest', 'source-manifest.json', '--raw-dir', 'raw', '--customer', 'synthetic-customer'],
    { cwd: fixture.tempDir, encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /sourceCount: 1/u)
  assert.ok(!result.stdout.includes(fixture.tempDir))
  assert.ok(!result.stderr.includes(fixture.tempDir))
})

test('manifest evidence output cannot enter raw-dir or overwrite its manifest', async (t) => {
  const fixture = await prepareFixture(t)
  await assert.rejects(
    () => fixture.run({ out: fixture.rawDir }),
    /must be outside the raw source directory/u,
  )

  const collisionDir = path.join(fixture.tempDir, 'collision')
  await mkdir(collisionDir)
  const collisionManifest = path.join(collisionDir, 'source-manifest-check.json')
  const manifestBytes = `${JSON.stringify(fixture.manifest, null, 2)}\n`
  await writeFile(collisionManifest, manifestBytes, 'utf8')
  await assert.rejects(
    () => runManifestCheck({
      manifest: collisionManifest,
      rawDir: fixture.rawDir,
      out: collisionDir,
      customer: fixture.manifest.customerKey,
    }),
    /would overwrite a source manifest or source file/u,
  )
  assert.equal(await readFile(collisionManifest, 'utf8'), manifestBytes)
})

test('manifest checker blocks checksum and size drift', async (t) => {
  await t.test('checksum', async (t) => {
    const fixture = await prepareFixture(t)
    fixture.manifest.sources[0].sha256 = '0'.repeat(64)
    await fixture.writeManifest()
    await assert.rejects(() => fixture.run(), /sha256 mismatch/u)
  })

  await t.test('size', async (t) => {
    const fixture = await prepareFixture(t)
    fixture.manifest.sources[0].sizeBytes += 1
    await fixture.writeManifest()
    await assert.rejects(() => fixture.run(), /sizeBytes mismatch/u)
  })
})

test('manifest checker rejects an oversized structured xlsx before reading it into memory', async (t) => {
  const fixture = await prepareFixture(t)
  const sourcePath = path.join(fixture.rawDir, fixture.relativePath)
  await truncate(sourcePath, 128 * 1024 * 1024 + 1)
  fixture.manifest.sources[0].sizeBytes = 128 * 1024 * 1024 + 1
  await fixture.writeManifest()
  await assert.rejects(
    () => fixture.run(),
    /structured xlsx exceeds the extraction size limit/u,
  )
})

test('manifest checker blocks duplicate source IDs and relative paths', async (t) => {
  await t.test('duplicate sourceId', async (t) => {
    const fixture = await prepareFixture(t)
    const duplicate = structuredClone(fixture.manifest.sources[0])
    duplicate.relativePath = 'second-source.xlsx'
    fixture.manifest.sources.push(duplicate)
    await writeFile(path.join(fixture.rawDir, duplicate.relativePath), fixture.xlsx)
    await fixture.writeManifest()
    await assert.rejects(() => fixture.run(), /duplicate sourceId/u)
  })

  await t.test('duplicate relativePath', async (t) => {
    const fixture = await prepareFixture(t)
    const duplicate = structuredClone(fixture.manifest.sources[0])
    duplicate.sourceId = 'synthetic-customer-second-source'
    fixture.manifest.sources.push(duplicate)
    await fixture.writeManifest()
    await assert.rejects(() => fixture.run(), /duplicate relativePath/u)
  })
})

test('manifest checker rejects unsafe source paths and unsupported extensions', async (t) => {
  for (const unsafePath of ['../escape.xlsx', '/tmp/escape.xlsx', 'nested\\escape.xlsx', 'nested/./escape.xlsx']) {
    await t.test(unsafePath, async (t) => {
      const fixture = await prepareFixture(t)
      fixture.manifest.sources[0].relativePath = unsafePath
      await fixture.writeManifest()
      await assert.rejects(
        () => fixture.run(),
        /must be relative|POSIX separators|unsafe path segment|normalized relative path|local absolute paths/u,
      )
    })
  }

  await t.test('unsupported extension', async (t) => {
    const fixture = await prepareFixture(t)
    const unsupportedName = 'minimal-material-detail.exe'
    await rm(path.join(fixture.rawDir, fixture.relativePath))
    await writeFile(path.join(fixture.rawDir, unsupportedName), fixture.xlsx)
    fixture.manifest.sources[0].relativePath = unsupportedName
    fixture.manifest.sources[0].mediaType = 'application/octet-stream'
    await fixture.writeManifest()
    await assert.rejects(() => fixture.run(), /unsupported source extension/u)
  })
})

test('manifest checker rejects a symlink that escapes raw-dir', async (t) => {
  const fixture = await prepareFixture(t)
  const outsidePath = path.join(fixture.tempDir, 'outside.xlsx')
  const linkedName = 'linked-source.xlsx'
  await writeFile(outsidePath, fixture.xlsx)
  await rm(path.join(fixture.rawDir, fixture.relativePath))
  await symlink(outsidePath, path.join(fixture.rawDir, linkedName))
  fixture.manifest.sources[0].relativePath = linkedName
  await fixture.writeManifest()

  await assert.rejects(() => fixture.run(), /symlink.*escapes/u)
})

test('manifest checker rejects customer mismatch', async (t) => {
  const fixture = await prepareFixture(t)
  await assert.rejects(
    () => runManifestCheck({
      manifest: fixture.manifestPath,
      rawDir: fixture.rawDir,
      customer: 'different-customer',
    }),
    /customerKey does not match --customer/u,
  )
})

test('manifest checker reports unregistered files without exposing their names or absolute paths', async (t) => {
  const fixture = await prepareFixture(t)
  const privateName = 'private-unregistered.docx'
  await writeFile(path.join(fixture.rawDir, privateName), 'synthetic-word-placeholder')

  await assert.rejects(
    async () => fixture.run(),
    (error) => {
      assert.match(error.message, /1 unregistered file/u)
      assert.ok(!error.message.includes(privateName))
      assert.ok(!error.message.includes(fixture.tempDir))
      return true
    },
  )
})

test('manifest checker accepts registered legacy Excel and Word references as manual sources', async (t) => {
  const mediaTypes = new Map([
    ['.doc', 'application/msword'],
    ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['.xls', 'application/vnd.ms-excel'],
  ])
  for (const [extension, mediaType] of mediaTypes) {
    await t.test(extension, async (t) => {
      const fixture = await prepareFixture(t)
      const sourceBytes = Buffer.from(`synthetic${extension}`)
      const relativePath = `manual-reference${extension}`
      await rm(path.join(fixture.rawDir, fixture.relativePath))
      await writeFile(path.join(fixture.rawDir, relativePath), sourceBytes)
      fixture.manifest.sources = [{
        sourceId: `synthetic-customer-manual-${extension.slice(1)}`,
        relativePath,
        sha256: createHash('sha256').update(sourceBytes).digest('hex'),
        sizeBytes: sourceBytes.length,
        mediaType,
        sourceKind: 'manual_reference',
        classification: 'synthetic-test-data',
        structuredExtract: {
          enabled: false,
          reason: 'No Product Core parser is enabled for this synthetic reference.',
        },
      }]
      await fixture.writeManifest()
      const result = await fixture.run()
      assert.equal(result.summary.manualReferenceCount, 1)
    })
  }
})

test('manifest checker only accepts logical MinIO storage references', async (t) => {
  await t.test('forbidden credential field', async (t) => {
    const fixture = await prepareFixture(t)
    fixture.manifest.sources[0].storage = {
      provider: 'minio',
      bucketAlias: 'synthetic-private',
      objectKey: 'sources/source/v0001/original.xlsx',
      secretKey: 'must-not-be-stored',
    }
    await fixture.writeManifest()
    await assert.rejects(() => fixture.run(), /forbidden or unsupported field: secretKey/u)
  })

  await t.test('URL-like object key', async (t) => {
    const fixture = await prepareFixture(t)
    fixture.manifest.sources[0].storage = {
      provider: 'minio',
      bucketAlias: 'synthetic-private',
      objectKey: 'https://storage.invalid/source.xlsx',
    }
    await fixture.writeManifest()
    await assert.rejects(() => fixture.run(), /unsafe path segment|must not be a URL/u)
  })

  await t.test('non-MinIO provider', async (t) => {
    const fixture = await prepareFixture(t)
    fixture.manifest.sources[0].storage = {
      provider: 's3',
      bucketAlias: 'synthetic-private',
      objectKey: 'sources/source/v0001/original.xlsx',
    }
    await fixture.writeManifest()
    await assert.rejects(() => fixture.run(), /provider must be minio/u)
  })

  for (const objectKey of [
    'sources/other-source/v0001/original.xlsx',
    'sources/synthetic-customer-minimal-material-detail/v1/original.xlsx',
    'sources/synthetic-customer-minimal-material-detail/v0001/replaced.xlsx',
  ]) {
    await t.test('non-immutable object key', async (t) => {
      const fixture = await prepareFixture(t)
      fixture.manifest.sources[0].storage = {
        provider: 'minio',
        bucketAlias: 'synthetic-private',
        objectKey,
      }
      await fixture.writeManifest()
      await assert.rejects(
        () => fixture.run(),
        /must use sources\/<sourceId>\/vNNNN\/original\.<ext>/u,
      )
    })
  }

  await t.test('all stored sources use one customer bucket alias', async (t) => {
    const fixture = await prepareFixture(t)
    const first = fixture.manifest.sources[0]
    first.storage = {
      provider: 'minio',
      bucketAlias: 'synthetic-private-a',
      objectKey: `sources/${first.sourceId}/v0001/original.xlsx`,
    }
    const second = structuredClone(first)
    second.sourceId = 'synthetic-customer-second-source'
    second.relativePath = 'second-source.xlsx'
    second.storage.bucketAlias = 'synthetic-private-b'
    second.storage.objectKey = `sources/${second.sourceId}/v0001/original.xlsx`
    fixture.manifest.sources.push(second)
    await writeFile(path.join(fixture.rawDir, second.relativePath), fixture.xlsx)
    await fixture.writeManifest()
    await assert.rejects(() => fixture.run(), /one bucketAlias per customer/u)
  })
})

test('manifest checker rejects URLs credentials and local absolute paths in allowed text fields', async (t) => {
  const mutations = [
    (manifest) => { manifest.sources[0].usage = 'Review https://storage.invalid/private/object' },
    (manifest) => { manifest.sources[0].usage = 'accessKey=synthetic-secret-placeholder' },
    (manifest) => { manifest.description = 'Prepared under /Users/example/private-sources' },
  ]
  for (const mutate of mutations) {
    await t.test('forbidden private value', async (t) => {
      const fixture = await prepareFixture(t)
      mutate(fixture.manifest)
      await fixture.writeManifest()
      await assert.rejects(
        () => fixture.run(),
        /must not contain URLs, credentials, or local absolute paths/u,
      )
    })
  }
})

test('manifest checker rejects unsupported fields outside the storage object', async (t) => {
  const mutations = [
    {
      label: 'root',
      mutate(manifest) {
        manifest.endpoint = 'https://storage.invalid'
      },
      pattern: /source manifest contains forbidden or unsupported field: endpoint/u,
    },
    {
      label: 'source',
      mutate(manifest) {
        manifest.sources[0].accessKey = 'must-not-be-stored'
      },
      pattern: /sources\[0\] contains forbidden or unsupported field: accessKey/u,
    },
    {
      label: 'structuredExtract',
      mutate(manifest) {
        manifest.sources[0].structuredExtract.presignedUrl = 'https://storage.invalid/object'
      },
      pattern: /sources\[0\]\.structuredExtract contains forbidden or unsupported field: presignedUrl/u,
    },
  ]

  for (const { label, mutate, pattern } of mutations) {
    await t.test(label, async (t) => {
      const fixture = await prepareFixture(t)
      mutate(fixture.manifest)
      await fixture.writeManifest()
      await assert.rejects(() => fixture.run(), pattern)
    })
  }
})

test('manifest checker accepts only stable duplicate group identifiers', async (t) => {
  const fixture = await prepareFixture(t)
  fixture.manifest.sources[0].duplicateGroup = '../private-copy'
  await fixture.writeManifest()
  await assert.rejects(
    () => fixture.run(),
    /sources\[0\]\.duplicateGroup must be a stable key/u,
  )
})

test('manifest checker CLI help works and required arguments fail closed', () => {
  const help = spawnSync(process.execPath, [cliPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /Customer source manifest checker/u)
  assert.match(help.stdout, /--manifest/u)
  assert.ok(!/yoyoosun|永绅/iu.test(help.stdout))

  const missing = spawnSync(process.execPath, [cliPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /Missing required --manifest/u)

  const missingRawDir = spawnSync(process.execPath, [cliPath, '--manifest', 'source-manifest.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(missingRawDir.status, 2)
  assert.match(missingRawDir.stderr, /Missing required --raw-dir/u)
})

async function prepareFixture(t) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'source-manifest-check-'))
  t.after(() => rm(tempDir, { recursive: true, force: true }))
  const rawDir = path.join(tempDir, 'raw')
  await mkdir(rawDir, { recursive: true })
  const synthetic = createSyntheticSourceFixture()
  const manifest = structuredClone(synthetic.manifest)
  const manifestPath = path.join(tempDir, 'source-manifest.json')
  await writeFile(path.join(rawDir, synthetic.relativePath), synthetic.xlsx)

  const fixture = {
    tempDir,
    rawDir,
    manifestPath,
    manifest,
    relativePath: synthetic.relativePath,
    xlsx: synthetic.xlsx,
    async writeManifest() {
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    },
    async run(options = {}) {
      return runManifestCheck({
        manifest: manifestPath,
        rawDir,
        customer: manifest.customerKey,
        ...options,
      })
    },
  }
  await fixture.writeManifest()
  return fixture
}
