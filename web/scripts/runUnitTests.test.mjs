import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { discoverWebUnitTests } from './runUnitTests.mjs'

const execFileAsync = promisify(execFile)
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const passingSources = {
  'root.test.mjs': "import test from 'node:test'; test('ROOT_TEST', () => {});",
  'src/feature/deep/page.test.mjs': "import test from 'node:test'; test('SOURCE_TEST', () => {});",
  'scripts/tool.test.cjs': "require('node:test')('SCRIPT_TEST', () => {});",
  'dev-server/bridge.test.js': "import test from 'node:test'; test('SERVER_TEST', () => {});",
}
const ignoredPaths = [
  'output/validation-copy/web/src/replica.test.mjs',
  'src/feature/output/replica.test.mjs',
  'scripts/node_modules/dependency/replica.test.mjs',
  'node_modules/dependency/replica.test.mjs',
  'build/replica.test.mjs',
  'build-workbench/replica.test.mjs',
  'scripts/test/helper.mjs',
]
const poison = "import { writeFileSync } from 'node:fs'; writeFileSync('poison-ran', 'executed'); throw new Error('ARTIFACT_EXECUTED');"

async function fixture(t, sources = passingSources) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-web-test discovery-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'scripts'), { recursive: true })
  await copyFile(new URL('./runUnitTests.mjs', import.meta.url), path.join(root, 'scripts/runUnitTests.mjs'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    type: 'module',
    scripts: { test: packageJson.scripts.test },
  }))
  for (const [relativePath, source] of Object.entries({
    ...sources,
    ...Object.fromEntries(ignoredPaths.map((file) => [file, poison])),
  })) {
    const file = path.join(root, relativePath)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, source)
  }
  return root
}

async function runPnpmTest(root, args = []) {
  return execFileAsync('pnpm', ['test', '--test-reporter=tap', ...args], {
    cwd: root,
    env: { ...process.env, NODE_TEST_CONTEXT: undefined, GIT_OPTIONAL_LOCKS: '0' },
  })
}

async function assertArtifactsPreserved(root) {
  for (const file of ignoredPaths) {
    assert.equal(await readFile(path.join(root, file), 'utf8'), poison)
  }
  await assert.rejects(readFile(path.join(root, 'poison-ran')), { code: 'ENOENT' })
}

test('discovers supported source tests while pruning outputs, dependencies and helpers', async (t) => {
  const root = await fixture(t)
  assert.deepEqual(
    discoverWebUnitTests(root).map((file) => file.split(path.sep).join('/')),
    Object.keys(passingSources).sort()
  )
})

test('pnpm test runs source tests and automatically includes a new untracked test', async (t) => {
  const root = await fixture(t)
  const first = await runPnpmTest(root)
  assert.match(first.stdout, /# tests 4\n# suites 0\n# pass 4\n# fail 0/u)
  await writeFile(path.join(root, 'src/feature/deep/new.test.mjs'),
    "import test from 'node:test'; test('NEW_SOURCE_TEST', () => {});")
  const second = await runPnpmTest(root)
  assert.match(second.stdout, /# tests 5\n# suites 0\n# pass 5\n# fail 0/u)
  await assertArtifactsPreserved(root)
})

test('pnpm test forwards native filtering options before discovered paths', async (t) => {
  const root = await fixture(t)
  const result = await runPnpmTest(root, ['--test-name-pattern=SOURCE_TEST'])
  assert.match(result.stdout, /ok \d+ - SOURCE_TEST/u)
  assert.doesNotMatch(result.stdout, /ok \d+ - (?:ROOT|SCRIPT|SERVER)_TEST/u)
  await assertArtifactsPreserved(root)
})

test('pnpm test propagates a real source test failure', async (t) => {
  const root = await fixture(t)
  await writeFile(path.join(root, 'src/failing.test.mjs'),
    "import test from 'node:test'; test('REAL_SOURCE_FAILURE', () => { throw new Error('expected failure'); });")
  await assert.rejects(runPnpmTest(root), (error) => {
    assert.notEqual(error.code, 0)
    assert.match(error.stdout, /not ok \d+ - REAL_SOURCE_FAILURE/u)
    assert.match(error.stdout, /# fail 1\b/u)
    return true
  })
  await assertArtifactsPreserved(root)
})

test('empty source test discovery fails without falling back to artifact discovery', async (t) => {
  const root = await fixture(t, {})
  await assert.rejects(runPnpmTest(root), (error) => {
    assert.notEqual(error.code, 0)
    assert.match(error.stderr, /未发现前端源码测试/u)
    return true
  })
  await assertArtifactsPreserved(root)
})
