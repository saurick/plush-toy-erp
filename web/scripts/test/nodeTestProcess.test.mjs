import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { nodeTestProcessArgs, runNodeTestProcess } from '../../../scripts/qa/lib/node-test-process.mjs'

if (process.platform === 'darwin') { test('native macOS entry, shared budget and kernel memory limits are enforced', async () => {
  const script = fileURLToPath(new URL('../../../scripts/qa/native/test_node_test_guard.py', import.meta.url))
  const result = await promisify(execFile)('python3', [script], {
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    timeout: 60000,
    maxBuffer: 32 * 1024,
  })
  assert.match(result.stderr, /Ran [1-9]\d* tests/u)
  assert.match(result.stderr, /\nOK\s*$/u)
}) }

if (process.platform === 'darwin') { test('embedded tool heap limits, MCP and documented bypasses are verified', async () => {
  const script = fileURLToPath(new URL('../../../scripts/qa/native/test_node_tool_guard.py', import.meta.url))
  const result = await promisify(execFile)('python3', [script], {
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    timeout: 60000,
    maxBuffer: 32 * 1024,
  })
  assert.match(result.stderr, /Ran [1-9]\d* tests/u)
  assert.match(result.stderr, /\nOK\s*$/u)
}) }

async function fixture(t, source) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-node-resource-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'fixture.test.mjs'), source)
  return root
}

async function run(root, limits = {}, args = []) {
  return runNodeTestProcess(['--test', '--test-reporter=tap', ...args, 'fixture.test.mjs'], {
    cwd: root,
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    limits: { timeoutMs: 6000, pollMs: 20, ...limits },
  })
}

function alive(pid) {
  try { process.kill(pid, 0); return true }
  catch (error) { if (error.code === 'ESRCH') return false; throw error }
}

async function waitForProcesses(root) {
  const file = path.join(root, 'processes.json')
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try { return JSON.parse(await readFile(file, 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    await delay(20)
  }
  throw new Error('fixture did not publish its process identity')
}

async function assertExited(pids) {
  for (let attempt = 0; attempt < 150 && pids.some(alive); attempt += 1) await delay(20)
  assert.equal(pids.some(alive), false, 'owned processes must exit after their supervisor is stopped')
}

const blockingSource = `import test from 'node:test';
import { writeFileSync } from 'node:fs';
test('owned blocking worker', () => {
  writeFileSync('processes.json', JSON.stringify({ worker: process.pid, runner: process.ppid }));
  while (true) {}
});`

test('supervised tests retain native success and assertion failure evidence', async (t) => {
  const root = await fixture(t, "import test from 'node:test'; test('ordinary test', () => {});")
  const passed = await run(root)
  assert.equal(passed.status, 0)
  assert.equal(passed.reason, '')
  assert.match(passed.stdout, /# pass 1\b/u)
  await writeFile(path.join(root, 'fixture.test.mjs'), "import test from 'node:test'; import assert from 'node:assert/strict'; test('ordinary failure', () => assert.equal(1, 2));")
  const failed = await run(root)
  assert.equal(failed.status, 1)
  assert.equal(failed.reason, '')
  assert.match(failed.stdout, /ERR_ASSERTION/u)
  assert.match(failed.stdout, /# fail 1\b/u)
})

test('external deadline stops a blocked event loop and leaves unrelated processes alive', async (t) => {
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  const unrelatedClosed = new Promise((resolve) => unrelated.once('close', resolve))
  t.after(async () => { unrelated.kill('SIGKILL'); await unrelatedClosed })
  const root = await fixture(t, "import test from 'node:test'; test('synchronous loop', () => { while (true) {} });")
  const result = await run(root, { timeoutMs: 500 })
  assert.equal(result.cleanupError, '')
  assert.equal(result.reason, 'timeout')
  assert.notEqual(result.status, 0)
  assert(result.durationMs < 4000, 'external supervision must remain responsive')
  assert(alive(unrelated.pid), 'the watchdog owns only its private test process group')
})

test('file worker deadline remains effective while the suite deadline is longer', async (t) => {
  const root = await fixture(t, "import test from 'node:test'; test('blocked worker', () => { while (true) {} });")
  const result = await run(root, { workerTimeoutMs: 200 })
  assert.equal(result.cleanupError, '')
  assert.equal(result.reason, 'worker-timeout')
  assert.notEqual(result.status, 0)
})

test('failing DOM object formatting is stopped by RSS protection even with a heap cap', async (t) => {
  const happyDOM = import.meta.resolve('happy-dom')
  const root = await fixture(t, `import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from ${JSON.stringify(happyDOM)};
test('raw DOM assertion', () => {
  const window = new Window();
  const container = window.document.createElement('div');
  container.innerHTML = '<button>sample</button>';
  assert.equal(container.querySelector('button'), null);
});`)
  const result = await run(root, { heapMiB: 128, processRssMiB: 192, totalRssMiB: 1024 })
  assert.equal(result.cleanupError, '')
  assert.equal(result.reason, 'process-rss-limit')
  assert.notEqual(result.status, 0)
  assert(result.peakProcessRssMiB > 192)
  const source = await readFile(path.join(root, 'fixture.test.mjs'), 'utf8')
  await writeFile(path.join(root, 'fixture.test.mjs'), source.replace(
    "assert.equal(container.querySelector('button'), null);",
    "assert.equal(Boolean(container.querySelector('button')), false, 'button must be absent');",
  ))
  const safeFailure = await run(root, { heapMiB: 128, processRssMiB: 192 })
  assert.equal(safeFailure.status, 1, 'primitive assertions must retain the original failing condition')
  assert.equal(safeFailure.reason, '')
  assert.match(safeFailure.stdout, /button must be absent/u)
  assert(safeFailure.stdout.length < 5000)
})

test('aggregate RSS protection kills the owned descendant group', async (t) => {
  const root = await fixture(t, `import test from 'node:test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
test('native memory in descendants', async () => {
  const children = Array.from({ length: 3 }, () => spawn(process.execPath,
    ['-e', 'const held = Buffer.alloc(48 * 1024 * 1024, 1); setInterval(() => held[0], 1000);'], { stdio: 'ignore', detached: true }));
  writeFileSync('descendants.json', JSON.stringify(children.map(child => child.pid)));
  await new Promise(() => {});
});`)
  const result = await run(root, { processRssMiB: 512, totalRssMiB: 200 })
  assert.equal(result.cleanupError, '')
  assert.equal(result.reason, 'total-rss-limit')
  assert.notEqual(result.status, 0)
  const descendants = JSON.parse(await readFile(path.join(root, 'descendants.json'), 'utf8'))
  for (let attempt = 0; attempt < 50 && descendants.some(alive); attempt += 1) await delay(20)
  assert.equal(descendants.some(alive), false, 'terminated tests must not retain memory in child processes')
})

test('output overflow fails with bounded captured data', async (t) => {
  const root = await fixture(t, "import test from 'node:test'; test('noisy output', () => { while (true) console.log('x'.repeat(1024)); });")
  const result = await run(root, { outputBytes: 8192 })
  assert.equal(result.cleanupError, '')
  assert.equal(result.reason, 'output-limit')
  assert.notEqual(result.status, 0)
  assert(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= 8192)
})

test('interrupting a supervisor also terminates its blocking worker', async (t) => {
  const root = await fixture(t, blockingSource)
  const supervisor = spawn(process.execPath, nodeTestProcessArgs(['--test', 'fixture.test.mjs']), {
    cwd: root, env: { ...process.env, NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  supervisor.stderr.on('data', (chunk) => { stderr += chunk })
  const closed = new Promise((resolve) => supervisor.once('close', (status) => resolve(status)))
  let identity
  t.after(() => {
    supervisor.kill('SIGKILL')
    if (identity && alive(identity.worker)) process.kill(-identity.runner, 'SIGKILL')
  })
  identity = await waitForProcesses(root)
  supervisor.kill('SIGTERM')
  const status = await Promise.race([closed, delay(4000, 'not-closed', { ref: false })])
  assert.equal(status, 1)
  assert.match(stderr, /reason=interrupted cleanupError=none/u)
  await assertExited([identity.worker, identity.runner])
})

test('a supervisor detects parent exit and does not orphan a test worker', async (t) => {
  const root = await fixture(t, blockingSource)
  const args = nodeTestProcessArgs(['--test', 'fixture.test.mjs'])
  const parent = spawn(process.execPath, ['--input-type=module', '-e', `
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const supervisor = spawn(process.execPath, ${JSON.stringify(args)}, { stdio: 'ignore' });
writeFileSync('supervisor.pid', String(supervisor.pid));
setInterval(() => {}, 1000);`], {
    cwd: root, env: { ...process.env, NODE_TEST_CONTEXT: undefined }, stdio: 'ignore',
  })
  const closed = new Promise((resolve) => parent.once('close', resolve))
  let identity
  let supervisorPid
  t.after(() => {
    parent.kill('SIGKILL')
    if (supervisorPid && alive(supervisorPid)) process.kill(supervisorPid, 'SIGKILL')
    if (identity && alive(identity.worker)) process.kill(-identity.runner, 'SIGKILL')
  })
  identity = await waitForProcesses(root)
  supervisorPid = Number(await readFile(path.join(root, 'supervisor.pid'), 'utf8'))
  parent.kill('SIGKILL')
  await closed
  await assertExited([supervisorPid, identity.worker, identity.runner])
})

test('resource limits reject disabling protection before starting a child', async () => {
  await assert.rejects(runNodeTestProcess(['--test'], { limits: { timeoutMs: 0 } }), /invalid Node test limit/u)
  await assert.rejects(runNodeTestProcess(['--test', '--max-old-space-size=65536']), /shared runner/u)
  await assert.rejects(runNodeTestProcess(['--eval', '0']), /requires --test/u)
  await assert.rejects(runNodeTestProcess(['--test', '--test-isolation=none']), /process isolation/u)
})
