import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_NODE_TAP_PATH,
  DEFAULT_OUTPUT_PATH,
  buildFieldLinkageReport,
  buildRepositoryState,
  buildRunContext,
  collectNodeTapStatuses,
  generateFieldLinkageReport,
  normalizeReportCommand,
  parseArgs,
  parseExpectedRepository,
} from './buildFieldLinkageCoverageReport.mjs'
import {
  runFieldLinkageQa,
  sanitizeNodeTap,
} from '../../scripts/qa/erp-field-linkage.mjs'

const REPOSITORY = Object.freeze({
  commit: 'a'.repeat(40),
  dirty: true,
  fingerprint: 'b'.repeat(64),
})
const expectedRepositoryArgs = () => [
  '--expected-repository',
  JSON.stringify(REPOSITORY),
]

test('field linkage report defaults to ignored output instead of web/public', () => {
  const options = parseArgs(expectedRepositoryArgs())
  assert.equal(options.nodeTap, DEFAULT_NODE_TAP_PATH)
  assert.equal(options.output, DEFAULT_OUTPUT_PATH)
  assert.deepEqual(options.expectedRepository, REPOSITORY)
  assert.match(
    options.output,
    /output[/\\]qa[/\\]coverage[/\\]field-linkage\.latest\.json$/u
  )
  assert.doesNotMatch(options.output, /web[/\\]public/u)
})

test('field linkage builder requires one canonical expected repository identity', () => {
  assert.throws(() => parseArgs([]), /--expected-repository is required/u)
  for (const value of [
    '{not-json',
    JSON.stringify({ commit: 'a'.repeat(40) }),
    JSON.stringify({ ...REPOSITORY, localPath: '/Users/alice/private' }),
  ]) {
    assert.throws(
      () => parseArgs(['--expected-repository', value]),
      (error) => {
        assert.match(error.message, /canonical repository identity/u)
        assert.doesNotMatch(error.message, /Users|alice|private/u)
        return true
      }
    )
  }
  assert.deepEqual(
    parseExpectedRepository(JSON.stringify(REPOSITORY)),
    REPOSITORY
  )
})

test('field linkage runner writes the report only to ignored coverage output', async () => {
  const runnerPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'scripts',
    'qa',
    'erp-field-linkage.mjs'
  )
  const source = await readFile(runnerPath, 'utf8')
  assert.match(
    source,
    /["']output["'],[\s\S]*["']qa["'],[\s\S]*["']coverage["'],[\s\S]*["']field-linkage\.latest\.json["']/u
  )
  assert.doesNotMatch(source, /web[/\\].*public[/\\].*field-linkage/u)
})

test('field linkage report refuses output outside its ignored coverage root', () => {
  assert.throws(
    () =>
      parseArgs([
        '--output',
        'web/public/qa/erp-field-linkage-coverage.latest.json',
      ]),
    /must stay inside output\/qa\/coverage/u
  )
  assert.throws(
    () => parseArgs(['--output', '/tmp/field-linkage.json']),
    /must stay inside output\/qa\/coverage/u
  )
})

test('field linkage report does not preserve arbitrary command secrets', () => {
  assert.equal(
    normalizeReportCommand('node scripts/qa/erp-field-linkage.mjs'),
    'node scripts/qa/erp-field-linkage.mjs'
  )
  const command = normalizeReportCommand(
    'curl https://example.test/run?token=github_pat_private'
  )
  assert.equal(command, 'custom field linkage command')
  assert.doesNotMatch(command, /token|github_pat|example\.test/u)
})

test('field linkage run context excludes local paths and usernames', async () => {
  const repository = await buildRepositoryState()
  const runContext = await buildRunContext(repository)
  assert.match(repository.commit, /^[0-9a-f]{40,64}$/u)
  assert.equal(typeof repository.dirty, 'boolean')
  assert.match(repository.fingerprint, /^[0-9a-f]{64}$/u)
  assert.equal(Object.hasOwn(runContext, 'repoRoot'), false)
  assert.equal(Object.hasOwn(runContext, 'generatedBy'), false)
  assert.equal(Object.hasOwn(runContext, 'username'), false)
  assert.equal(Object.hasOwn(runContext, 'remote'), false)
  assert.equal(Object.hasOwn(runContext, 'token'), false)
  assert.doesNotMatch(JSON.stringify(runContext), /\/Users\//u)
})

test('field linkage report exposes canonical repository identity at top level', () => {
  const report = buildFieldLinkageReport({
    generatedAt: '2026-07-19T00:00:00.000Z',
    command: 'node scripts/qa/erp-field-linkage.mjs',
    repository: REPOSITORY,
    runContext: { nodeVersion: process.version },
    cases: [],
  })
  assert.deepEqual(report.repository, REPOSITORY)
  assert.equal(Object.hasOwn(report.runContext, 'repoRoot'), false)
})

test('field linkage builder binds TAP to expected identity before and after writing', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'field-linkage-build-'))
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })
  const output = path.join(tempDir, 'field-linkage.json')
  const moved = []
  const removed = []
  let identityReads = 0
  const report = await generateFieldLinkageReport(
    {
      nodeTap: path.join(tempDir, 'old.tap'),
      output,
      command: 'node scripts/qa/erp-field-linkage.mjs',
      expectedRepository: REPOSITORY,
    },
    {
      repositoryReader: async () => {
        identityReads += 1
        return { ...REPOSITORY }
      },
      collectStatuses: async (_tap, statuses) => {
        statuses.set(
          'FL_contract_terms__excluded_from_non_contract_business_scope',
          {
            status: 'pass',
          }
        )
      },
      clock: () => new Date('2026-07-19T00:00:00.000Z'),
      makeDirectory: async () => {},
      writeOutput: async (target, content) => {
        assert.doesNotMatch(content, /Users|alice|private/u)
        await writeFile(target, content, 'utf8')
      },
      moveOutput: async (source, target) => {
        moved.push([source, target])
      },
      removeOutput: async (target) => {
        removed.push(target)
      },
    }
  )
  assert.deepEqual(report.repository, REPOSITORY)
  assert.equal(identityReads, 3)
  assert.equal(moved.length, 1)
  assert(removed.some((target) => target.endsWith('.tmp')))
})

test('field linkage builder refuses identity drift and never promotes the TAP', async () => {
  const changedRepository = {
    ...REPOSITORY,
    fingerprint: 'c'.repeat(64),
  }
  const identities = [{ ...REPOSITORY }, changedRepository]
  let moved = false
  await assert.rejects(
    generateFieldLinkageReport(
      {
        nodeTap: 'old.tap',
        output: 'latest.json',
        command: 'node scripts/qa/erp-field-linkage.mjs',
        expectedRepository: REPOSITORY,
      },
      {
        repositoryReader: async () => identities.shift(),
        collectStatuses: async () => {},
        makeDirectory: async () => {},
        writeOutput: async () => {},
        moveOutput: async () => {
          moved = true
        },
        removeOutput: async () => {},
      }
    ),
    /repository identity changed during evidence collection/u
  )
  assert.equal(moved, false)
})

test('field linkage wrapper rechecks identity and stores only sanitized TAP', async () => {
  const writes = []
  const commands = []
  await runFieldLinkageQa({
    repositoryReader: async () => ({ ...REPOSITORY }),
    executeCommand: async (command) => {
      commands.push(command)
      return {
        stdout:
          'ok 1 - /Users/alice/private FL_alpha__pass\n  duration_ms: 1.2\n',
        stderr: 'file:///private/var/secret',
      }
    },
    makeDirectory: async () => {},
    removeFile: async () => {},
    writeTap: async (_target, content) => writes.push(content),
  })
  assert.equal(commands.length, 2)
  assert.equal(writes.length, 1)
  assert.equal(
    writes[0],
    'TAP version 13\nok 1 - FL_alpha__pass\n  duration_ms: 1.2\n'
  )
  assert.doesNotMatch(writes[0], /Users|alice|private|file:/u)
  const expectedIndex = commands[1].args.indexOf('--expected-repository')
  assert(expectedIndex >= 0)
  assert.deepEqual(JSON.parse(commands[1].args[expectedIndex + 1]), REPOSITORY)
})

test('field linkage wrapper stops before writing TAP when tests change the repository', async () => {
  const changedRepository = {
    ...REPOSITORY,
    fingerprint: 'c'.repeat(64),
  }
  const identities = [{ ...REPOSITORY }, changedRepository]
  let commandCount = 0
  let wroteTap = false
  await assert.rejects(
    runFieldLinkageQa({
      repositoryReader: async () => identities.shift(),
      executeCommand: async () => {
        commandCount += 1
        return { stdout: 'ok 1 - FL_alpha__pass\n', stderr: '' }
      },
      makeDirectory: async () => {},
      removeFile: async () => {},
      writeTap: async () => {
        wroteTap = true
      },
    }),
    /repository identity changed during evidence collection/u
  )
  assert.equal(commandCount, 1)
  assert.equal(wroteTap, false)
})

test('field linkage TAP sanitizer drops absolute paths and arbitrary diagnostics', () => {
  const sanitized = sanitizeNodeTap(
    [
      'ok 1 - C:\\Users\\alice\\secret FL_alpha__pass',
      '  duration_ms: 2.5',
      'not ok 2 - file:///private/var/tmp/fail FL_beta__fail',
      '  stack: /Users/alice/private/test.mjs:1',
      'ok 3 - FL_gamma__skip # SKIP /Users/alice/reason',
    ].join('\n')
  )
  assert.equal(
    sanitized,
    [
      'TAP version 13',
      'ok 1 - FL_alpha__pass',
      '  duration_ms: 2.5',
      'not ok 2 - FL_beta__fail',
      'ok 3 - FL_gamma__skip # SKIP',
      '',
    ].join('\n')
  )
  assert.doesNotMatch(sanitized, /Users|alice|private|file:/u)
})

test('field linkage TAP collector preserves pass, fail, and skip status', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'field-linkage-tap-'))
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })
  const tapPath = path.join(tempDir, 'node-test.tap')
  await writeFile(
    tapPath,
    [
      'ok 1 - FL_alpha__pass',
      '  duration_ms: 1.2',
      'not ok 2 - FL_beta__fail',
      'ok 3 - FL_gamma__skip # SKIP unavailable',
      '',
    ].join('\n')
  )
  const statuses = new Map()
  await collectNodeTapStatuses(tapPath, statuses)
  assert.deepEqual(statuses.get('FL_alpha__pass'), {
    caseId: 'FL_alpha__pass',
    status: 'pass',
    durationMs: 1,
    failureMessages: [],
  })
  assert.equal(statuses.get('FL_beta__fail').status, 'fail')
  assert.equal(statuses.get('FL_gamma__skip').status, 'skip')
})
