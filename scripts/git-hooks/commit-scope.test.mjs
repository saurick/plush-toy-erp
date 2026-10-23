import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))
const environment = { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
for (const key of execFileSync('git', ['rev-parse', '--local-env-vars'], { cwd: sourceRoot, encoding: 'utf8' }).trim().split('\n')) {
  delete environment[key]
}
delete environment.PLUSH_COMMIT_CONTEXT
environment.GIT_OPTIONAL_LOCKS = '0'

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'plush-commit-scope-test-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, env: environment, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  git('init', '-q')
  git('config', 'user.name', 'Commit Scope Test')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  for (const name of ['a.txt', 'b.txt']) writeFileSync(path.join(root, name), `${name}\nkeep\n`)
  git('add', '--', 'a.txt', 'b.txt')
  git('commit', '-qm', 'test: 初始内容')
  const base = git('rev-parse', 'HEAD')
  for (const name of ['scripts/git-hooks/commit-scope.py', '.githooks/pre-commit', '.githooks/commit-msg', 'scripts/git-hooks/commit-msg.sh']) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    copyFileSync(path.join(sourceRoot, name), path.join(root, name))
  }
  git('config', 'core.hooksPath', '.githooks')
  const setHook = (body = ':') => writeFileSync(path.join(root, 'scripts/git-hooks/pre-commit.sh'), `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, { mode: 0o755 })
  setHook()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const command = (options) => ['scripts/git-hooks/commit-scope.py', '--base', base, '--message', 'test(git): 验证精确提交', ...options]
  const run = (...options) => spawnSync('python3', command(options), { cwd: root, env: environment, encoding: 'utf8', timeout: 15000 })
  const start = (...options) => {
    const child = spawn('python3', command(options), { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    const finished = once(child, 'close').then(([status]) => ({ status, output }))
    t.after(() => { if (child.exitCode === null) child.kill('SIGKILL') })
    return { child, finished, output: () => output }
  }
  const patch = (name, content, label = name) => {
    const index = path.join(root, '.git', `candidate-${label.replaceAll('/', '_')}`)
    const env = { ...environment, GIT_INDEX_FILE: index }
    const call = (args, input) => execFileSync('git', args, { cwd: root, env, input, encoding: 'utf8' })
    call(['read-tree', base])
    const oid = call(['hash-object', '-w', '--stdin'], content).trim()
    call(['update-index', '--add', '--cacheinfo', '100644', oid, name])
    const file = path.join(root, '.git', `${label.replaceAll('/', '_')}.patch`)
    writeFileSync(file, call(['diff', '--cached', '--binary', '--full-index', base]))
    return file
  }
  return { root, git, base, setHook, run, start, patch }
}

async function expectOutput(job, pattern) {
  if (pattern.test(job.output())) return
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(`missing ${pattern}: ${job.output()}`)), 8000)
    const inspect = () => { if (pattern.test(job.output())) done() }
    const closed = () => done(new Error(`closed before ${pattern}: ${job.output()}`))
    const done = (error) => {
      clearTimeout(timer)
      job.child.stdout.off('data', inspect)
      job.child.stderr.off('data', inspect)
      job.child.off('close', closed)
      if (error) reject(error)
      else resolve()
    }
    job.child.stdout.on('data', inspect)
    job.child.stderr.on('data', inspect)
    job.child.on('close', closed)
  })
}

test('exact files include addition/deletion/binary names and preserve unrelated WIP', t => {
  const f = fixture(t)
  rmSync(path.join(f.root, 'a.txt'))
  writeFileSync(path.join(f.root, 'new file.bin'), Buffer.from([0, 255, 2, 3]))
  writeFileSync(path.join(f.root, 'b.txt'), 'foreign WIP\n')
  const result = f.run('--', 'a.txt', 'new file.bin')
  assert.equal(result.status, 0, result.stderr + result.stdout)
  assert.equal(f.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'), 'a.txt\nnew file.bin')
  assert.equal(f.git('diff', '--cached'), '')
  assert.equal(readFileSync(path.join(f.root, 'b.txt'), 'utf8'), 'foreign WIP\n')
  assert.equal(f.git('show', 'HEAD:b.txt'), 'b.txt\nkeep')
})

test('partial patch commits only reviewed lines and keeps the remaining edits', t => {
  const f = fixture(t)
  writeFileSync(path.join(f.root, 'a.txt'), 'selected\nforeign remainder\n')
  const patch = f.patch('a.txt', 'selected\nkeep\n')
  const result = f.run('--patch', patch)
  assert.equal(result.status, 0, result.stderr + result.stdout)
  assert.equal(f.git('show', 'HEAD:a.txt'), 'selected\nkeep')
  assert.equal(readFileSync(path.join(f.root, 'a.txt'), 'utf8'), 'selected\nforeign remainder\n')
  assert.equal(f.git('diff', '--cached'), '')
})

test('two concurrent commits wait on one mutex, then revalidate unrelated HEAD advance', { timeout: 15000 }, async t => {
  const f = fixture(t)
  const fifo = path.join(f.root, '.git', 'release')
  execFileSync('mkfifo', [fifo])
  writeFileSync(path.join(f.root, '.git', 'slow-once'), '')
  f.setHook('if [[ -f .git/slow-once ]]; then\n  rm .git/slow-once\n  echo HOOK_READY\n  read -r release < .git/release\nfi\necho checked >> .git/hook-runs')
  writeFileSync(path.join(f.root, 'a.txt'), 'first\n')
  writeFileSync(path.join(f.root, 'b.txt'), 'second\n')
  const first = f.start('--', 'a.txt')
  await expectOutput(first, /HOOK_READY/u)
  const second = f.start('--', 'b.txt')
  await expectOutput(second, /等待当前提交结束/u)
  await writeFile(fifo, 'go\n')
  const results = await Promise.all([first.finished, second.finished])
  for (const result of results) assert.equal(result.status, 0, result.output)
  assert.equal(f.git('rev-list', '--count', `${f.base}..HEAD`), '2')
  assert.equal(f.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD^'), 'a.txt')
  assert.equal(f.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'), 'b.txt')
  assert.equal(readFileSync(path.join(f.root, '.git', 'hook-runs'), 'utf8'), 'checked\nchecked\n')
  assert.equal(f.git('diff', '--cached'), '')
})

test('a changed reviewed file is rejected after another commit', t => {
  const f = fixture(t)
  const oldPatch = f.patch('a.txt', 'old reviewed candidate\n')
  writeFileSync(path.join(f.root, 'a.txt'), 'other committed content\n')
  assert.equal(f.run('--', 'a.txt').status, 0)
  const head = f.git('rev-parse', 'HEAD')
  const result = f.run('--patch', oldPatch)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /其他提交中变化/u)
  assert.equal(f.git('rev-parse', 'HEAD'), head)
  assert.equal(f.git('diff', '--cached'), '')
})

test('foreign staging and native index.lock are preserved', t => {
  const f = fixture(t)
  writeFileSync(path.join(f.root, 'a.txt'), 'own\n')
  writeFileSync(path.join(f.root, 'b.txt'), 'foreign\n')
  f.git('add', '--', 'b.txt')
  const staged = f.git('diff', '--cached', '--binary')
  let result = f.run('--', 'a.txt')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /暂存区含其他内容/u)
  assert.equal(f.git('diff', '--cached', '--binary'), staged)
  writeFileSync(path.join(f.root, '.git', 'index.lock'), 'unique candidate')
  result = f.run('--', 'a.txt')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /index.lock/u)
  assert.equal(readFileSync(path.join(f.root, '.git', 'index.lock'), 'utf8'), 'unique candidate')
  assert.equal(f.git('diff', '--cached', '--binary'), staged)
})

test('raw commits are blocked; an exactly matching reviewed staged patch can be adopted', t => {
  const f = fixture(t)
  const patch = f.patch('a.txt', 'reviewed\n')
  writeFileSync(path.join(f.root, 'a.txt'), 'reviewed\n')
  f.git('add', '--', 'a.txt')
  const raw = spawnSync('git', ['commit', '-m', 'test: 不受控提交'], { cwd: f.root, env: environment, encoding: 'utf8' })
  assert.notEqual(raw.status, 0)
  assert.match(raw.stderr, /commit-scope.py/u)
  assert.equal(f.git('rev-parse', 'HEAD'), f.base)
  assert.equal(f.git('diff', '--cached', '--name-only'), 'a.txt')
  const adopted = f.run('--patch', patch)
  assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr)
  assert.equal(f.git('diff', '--cached'), '')
})

test('hook failure removes only this invocation staging and permits a later clean attempt', t => {
  const f = fixture(t)
  f.setHook('echo intentional failure >&2\nexit 1')
  writeFileSync(path.join(f.root, 'a.txt'), 'own\n')
  const result = f.run('--', 'a.txt')
  assert.notEqual(result.status, 0)
  assert.equal(f.git('rev-parse', 'HEAD'), f.base)
  assert.equal(f.git('diff', '--cached'), '')
  assert.equal(readFileSync(path.join(f.root, 'a.txt'), 'utf8'), 'own\n')
  f.setHook()
  assert.equal(f.run('--', 'a.txt').status, 0)
})

test('a failed hook preserves staging that existed before the invocation', t => {
  const f = fixture(t)
  const patch = f.patch('a.txt', 'reviewed\n')
  writeFileSync(path.join(f.root, 'a.txt'), 'reviewed\n')
  f.git('add', '--', 'a.txt')
  const staged = f.git('diff', '--cached', '--binary')
  f.setHook('exit 1')
  const result = f.run('--patch', patch)
  assert.notEqual(result.status, 0)
  assert.equal(f.git('rev-parse', 'HEAD'), f.base)
  assert.equal(f.git('diff', '--cached', '--binary'), staged)
})

test('branch identity changes during hooks stop the commit', t => {
  const f = fixture(t)
  writeFileSync(path.join(f.root, 'a.txt'), 'own\n')
  f.git('branch', 'fixture-other')
  f.setHook('git symbolic-ref HEAD refs/heads/fixture-other')
  const result = f.run('--', 'a.txt')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /分支在提交期间变化/u)
  assert.equal(f.git('rev-parse', 'HEAD'), f.base)
  assert.equal(f.git('diff', '--cached', '--name-only'), 'a.txt')
})

test('out-of-scope staging during hooks is rejected and preserved for review', t => {
  const f = fixture(t)
  writeFileSync(path.join(f.root, 'a.txt'), 'own\n')
  writeFileSync(path.join(f.root, 'b.txt'), 'foreign\n')
  f.setHook('git add -- b.txt')
  const result = f.run('--', 'a.txt')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /暂存内容偏离/u)
  assert.equal(f.git('rev-parse', 'HEAD'), f.base)
  assert.equal(f.git('diff', '--cached', '--name-only'), 'a.txt\nb.txt')
})

test('a concurrent scoped worktree edit is retained and never silently committed', t => {
  const f = fixture(t)
  writeFileSync(path.join(f.root, 'a.txt'), 'own\n')
  f.setHook('echo concurrent-write > a.txt')
  const result = f.run('--', 'a.txt')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /其他写入修改/u)
  assert.equal(f.git('rev-parse', 'HEAD'), f.base)
  assert.equal(f.git('diff', '--cached'), '')
  assert.equal(readFileSync(path.join(f.root, 'a.txt'), 'utf8'), 'concurrent-write\n')
})

test('bounded mutex timeout leaves the active commit index unchanged', { timeout: 15000 }, async t => {
  const f = fixture(t)
  const fifo = path.join(f.root, '.git', 'release')
  execFileSync('mkfifo', [fifo])
  f.setHook('echo HOOK_READY\nread -r release < .git/release')
  writeFileSync(path.join(f.root, 'a.txt'), 'first\n')
  writeFileSync(path.join(f.root, 'b.txt'), 'second\n')
  const first = f.start('--', 'a.txt')
  await expectOutput(first, /HOOK_READY/u)
  const staged = f.git('diff', '--cached', '--binary')
  const result = f.run('--wait-seconds', '0.1', '--', 'b.txt')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /等待提交入口超时/u)
  assert.equal(f.git('diff', '--cached', '--binary'), staged)
  await writeFile(fifo, 'go\n')
  assert.equal((await first.finished).status, 0)
})
