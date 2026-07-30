import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { runFieldLinkageQa } from './erp-field-linkage.mjs'

const REPOSITORY = Object.freeze({
  commit: 'a'.repeat(40),
  dirty: true,
  fingerprint: 'b'.repeat(64),
})
const CHANGED_REPOSITORY = Object.freeze({
  ...REPOSITORY,
  fingerprint: 'c'.repeat(64),
})

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-field-linkage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const outputDirectory = path.join(root, 'field-linkage')
  const nodeTapFile = path.join(outputDirectory, 'node-test.tap')
  const coverageReportFile = path.join(root, 'coverage', 'latest.json')
  await writeFile(nodeTapFile, 'old tap\n', { encoding: 'utf8', flag: 'w' }).catch(
    async () => {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(outputDirectory, { recursive: true })
      await writeFile(nodeTapFile, 'old tap\n')
    }
  )
  const { mkdir } = await import('node:fs/promises')
  await mkdir(path.dirname(coverageReportFile), { recursive: true })
  await writeFile(coverageReportFile, '{"old":true}\n')
  return { outputDirectory, nodeTapFile, coverageReportFile }
}

function successfulExecutor() {
  let call = 0
  return async ({ args }) => {
    call += 1
    if (call === 1) {
      return {
        stdout: 'TAP version 13\nok 1 - FL_TEST_SAMPLE\n  duration_ms: 1.5\n',
        stderr: '',
      }
    }
    const outputIndex = args.indexOf('--output')
    await writeFile(args[outputIndex + 1], '{"new":true}\n')
    return { stdout: '', stderr: '' }
  }
}

test('field linkage publishes staged TAP and report only after stable success', async (t) => {
  const files = await fixture(t)
  await runFieldLinkageQa({
    ...files,
    repositoryReader: async () => REPOSITORY,
    executeCommand: successfulExecutor(),
  })
  assert.match(await readFile(files.nodeTapFile, 'utf8'), /FL_TEST_SAMPLE/u)
  assert.equal(
    await readFile(files.coverageReportFile, 'utf8'),
    '{"new":true}\n'
  )
})

test('field linkage child failure preserves the previous canonical evidence', async (t) => {
  const files = await fixture(t)
  await assert.rejects(
    () =>
      runFieldLinkageQa({
        ...files,
        repositoryReader: async () => REPOSITORY,
        executeCommand: async () => {
          throw new Error('child failed')
        },
      }),
    /child failed/u
  )
  assert.equal(await readFile(files.nodeTapFile, 'utf8'), 'old tap\n')
  assert.equal(
    await readFile(files.coverageReportFile, 'utf8'),
    '{"old":true}\n'
  )
})

test('field linkage identity drift preserves the previous canonical evidence', async (t) => {
  const files = await fixture(t)
  let readCount = 0
  await assert.rejects(
    () =>
      runFieldLinkageQa({
        ...files,
        repositoryReader: async () => {
          readCount += 1
          return readCount === 1 ? REPOSITORY : CHANGED_REPOSITORY
        },
        executeCommand: successfulExecutor(),
      }),
    /repository identity changed/u
  )
  assert.equal(await readFile(files.nodeTapFile, 'utf8'), 'old tap\n')
  assert.equal(
    await readFile(files.coverageReportFile, 'utf8'),
    '{"old":true}\n'
  )
})
