import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  classifyNodeTestResult,
  discoverNodeTests,
  parseArgs,
} from './run-node-tests.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

test('scripts Node tests are discovered recursively in stable order', async () => {
  const discovered = await discoverNodeTests(path.join(repoRoot, 'scripts'))
  const relative = discovered.map((file) => path.relative(repoRoot, file))

  assert.deepEqual(relative, [...relative].sort())
  for (const required of [
    'scripts/qa/manual-regression-data-plan.test.mjs',
    'scripts/qa/purchase-quality-simulated-matrix.test.mjs',
    'scripts/qa/yoyoosun-customer-closure.test.mjs',
    'scripts/qa/yoyoosun-release-readiness.test.mjs',
    'scripts/deploy/release-evidence-closeout-runner.test.mjs',
    'scripts/qa/run-node-tests.test.mjs',
  ]) {
    assert(relative.includes(required), `discovery must include ${required}`)
  }
})

test('discovery accepts supported Node test suffixes and ignores unrelated files', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-node-tests-'))
  t.after(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(root, { recursive: true, force: true })
  })
  await mkdir(path.join(root, 'nested'), { recursive: true })
  await Promise.all([
    writeFile(path.join(root, 'alpha.test.mjs'), ''),
    writeFile(path.join(root, 'nested', 'beta.test.cjs'), ''),
    writeFile(path.join(root, 'nested', 'gamma.test.js'), ''),
    writeFile(path.join(root, 'nested', 'ignored.spec.mjs'), ''),
  ])

  const discovered = await discoverNodeTests(root)
  assert.deepEqual(
    discovered.map((file) => path.relative(root, file)),
    ['alpha.test.mjs', 'nested/beta.test.cjs', 'nested/gamma.test.js'],
  )
})

test('runner CLI options fail closed', () => {
  assert.deepEqual(parseArgs(['--list']), {
    list: true,
    rootDir: path.resolve(repoRoot, 'scripts'),
  })
  assert.throws(() => parseArgs(['--root']), /requires a directory/u)
  assert.throws(() => parseArgs(['--unknown']), /unknown option/u)
})

test('runner outcome fails closed when a discovered test is skipped', () => {
  const skipped = classifyNodeTestResult({
    status: 0,
    stdout: '# tests 1\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n',
  })
  assert.equal(skipped.exitCode, 1)
  assert.equal(skipped.summary.skipped, 1)

  const passed = classifyNodeTestResult({
    status: 0,
    stdout: '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',
  })
  assert.equal(passed.exitCode, 0)
  assert.equal(passed.summary.tests, 1)

  const zero = classifyNodeTestResult({
    status: 0,
    stdout: '# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',
  })
  assert.equal(zero.exitCode, 1)
  assert.deepEqual(
    classifyNodeTestResult({ status: 7, stdout: '# skipped 0\n' }),
    { exitCode: 7, summary: null },
  )
  assert.throws(
    () => classifyNodeTestResult({ error: new Error('spawn failed') }),
    /spawn failed/u,
  )
})

test('QA gates compose one discovery path and strict is a full superset', async () => {
  const [fast, full, strict] = await Promise.all(
    ['scripts/qa/fast.sh', 'scripts/qa/full.sh', 'scripts/qa/strict.sh'].map(
      (file) => readFile(path.join(repoRoot, file), 'utf8'),
    ),
  )

  assert.match(fast, /scripts\/qa\/run-node-tests\.mjs/u)
  assert.match(full, /bash "\$ROOT_DIR\/scripts\/qa\/fast\.sh"/u)
  assert.match(strict, /bash "\$ROOT_DIR\/scripts\/qa\/full\.sh"/u)
  assert.match(strict, /QA_BROWSER_SCENARIOS=/u)

  const manuallyEnumeratedScriptTest =
    /scripts\/(?:deploy|import|qa)\/[^"'\s]+\.test\.(?:cjs|js|mjs)/u
  assert.doesNotMatch(fast, manuallyEnumeratedScriptTest)
  assert.doesNotMatch(strict, manuallyEnumeratedScriptTest)
})
