import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readRepositoryIdentity } from '../qa/lib/repository-identity.mjs'
import { workbenchBuildIdentityPlugin } from '../../web/vite.workbench-identity.mjs'
import { digestFile, sealWorkbenchArtifact, verifyWorkbenchArtifact, WORKBENCH_BUILD_PATH } from './workbench-artifact.mjs'
import { activateWorkbench, inspectWorkbenchState, main, transferWorkbench } from './workbench-release.mjs'

async function put(root, file, content, mode = 0o600) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true })
  await writeFile(path.join(root, file), content, { mode })
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-workbench-release-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = path.join(root, 'prepared')
  await mkdir(input)
  const files = {
    '.gitignore': 'toolchain/\nweb/node_modules/\nweb/build-workbench/\noutput/\n',
    '.n-node-version': '24.22.1\n',
    'web/package.json': '{"packageManager":"pnpm@10.34.5"}',
    'web/pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'web/dev-server/standaloneWorkbench.mjs': '// prebuilt source fixture\n',
    'scripts/deploy/workbench-release.mjs': '// fixed deployment entry fixture\n',
    'server/deploy/workbench/target.json': '{"key":"workbench-test-133"}',
  }
  for (const [file, content] of Object.entries(files)) await put(input, file, content)
  const git = (...args) => execFileSync('git', args, { cwd: input, stdio: 'ignore', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  git('init', '--initial-branch=main')
  git('add', '--', '.')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture')
  await put(input, 'web/build-workbench/workbench.html', '<h1>workbench fixture</h1>')
  await put(input, 'web/build-workbench/favicon-dev.svg', '<svg/>')
  await put(input, 'web/node_modules/stub/index.js', 'export default true')
  const elf = Buffer.alloc(64)
  elf.write('7f454c46', 0, 'hex')
  elf[4] = 2
  elf.writeUInt16LE(62, 18)
  await put(input, 'toolchain/bin/node', elf, 0o755)
  await put(input, 'toolchain/bin/dev-permission-relationships', elf, 0o755)
  await put(input, WORKBENCH_BUILD_PATH, JSON.stringify({ kind: 'plush.workbench-build',
    repository: await readRepositoryIdentity(input), nodeVersion: '24.22.1', lockSha256: await digestFile(path.join(input, 'web/pnpm-lock.yaml')),
  }))
  return { root, input, git }
}

test('sealing binds clean build/source, toolchain and every file; changes and external links fail closed', async (t) => {
  const { input } = await fixture(t)
  const manifest = await sealWorkbenchArtifact(input)
  assert.equal((await verifyWorkbenchArtifact(input)).artifactId, manifest.artifactId)
  const plan = await transferWorkbench(input, manifest)
  assert.equal(plan.remoteWrites, false)
  await put(input, 'web/build-workbench/workbench.html', 'different bytes')
  await assert.rejects(verifyWorkbenchArtifact(input), /摘要不一致/u)
  await symlink('/etc/passwd', path.join(input, 'web/node_modules/outside'))
  await assert.rejects(verifyWorkbenchArtifact(input), /越界符号链接/u)
})

test('sealing rejects dirty source, mismatched builds and private Git history even when the worktree file is absent', async (t) => {
  const { input, git } = await fixture(t)
  await put(input, 'untracked.txt', 'unreviewed')
  await assert.rejects(sealWorkbenchArtifact(input), /clean committed/u)
  await rm(path.join(input, 'untracked.txt'))
  const buildFile = path.join(input, WORKBENCH_BUILD_PATH)
  const build = JSON.parse(await readFile(buildFile, 'utf8'))
  await writeFile(buildFile, JSON.stringify({ ...build, repository: { ...build.repository, commit: 'f'.repeat(40) } }))
  await assert.rejects(sealWorkbenchArtifact(input), /构建与当前 clean 源码/u)
  const feedback = 'docs/customers/yoyoosun/甲方反馈记录.md'
  await put(input, feedback, 'synthetic private feedback fixture')
  git('add', '--', feedback)
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'private fixture')
  git('rm', '--', feedback)
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'remove private fixture')
  await assert.rejects(sealWorkbenchArtifact(input), /Git 对象库/u)
})

test('build identity records the executing Node version and sealing rejects a different configured version', async (t) => {
  const { input, git } = await fixture(t)
  await put(input, '.n-node-version', '0.0.0\n')
  git('add', '--', '.n-node-version')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'different required runtime')
  const plugin = workbenchBuildIdentityPlugin(input)
  await plugin.buildStart()
  let asset
  await plugin.generateBundle.call({ emitFile(value) { asset = value } })
  assert.equal(asset.fileName, 'workbench-build.json')
  assert.equal(JSON.parse(asset.source).nodeVersion, process.versions.node)
  await put(input, WORKBENCH_BUILD_PATH, asset.source)
  await assert.rejects(sealWorkbenchArtifact(input), /构建工具链或依赖锁不一致/u)
})

test('a source that depends on an external Git object directory cannot be sealed', async (t) => {
  const { root, input, git } = await fixture(t)
  const outside = path.join(root, 'outside-objects')
  await rename(path.join(input, '.git/objects'), outside)
  await put(input, '.git/objects/info/alternates', `${outside}\n`)
  assert.doesNotThrow(() => git('rev-parse', '--verify', 'HEAD'))
  await assert.rejects(sealWorkbenchArtifact(input), /必须自包含/u)
  assert.equal(existsSync(path.join(input, 'web/build-workbench/.workbench-artifact.json')), false)
})

async function deploymentFixture(t) {
  const { root, input } = await fixture(t)
  const manifest = await sealWorkbenchArtifact(input)
  const deployment = path.join(root, 'deployment')
  const oldKey = 'aaaaaaaaaaaaaaaa-11111111-1111-4111-8111-111111111111'
  const previous = path.join(deployment, 'releases', oldKey)
  await mkdir(path.join(deployment, 'releases'), { recursive: true })
  await cp(input, previous, { recursive: true })
  await put(deployment, 'runtime/workbench.env', 'PLUSH_WORKBENCH_ORIGIN=https://workbench.example.test\n')
  await put(previous, 'output/dev-workbench/delivery-operations/operations/receipt.json', '{"status":"passed","id":"historical-fixture"}')
  await symlink(`releases/${oldKey}`, path.join(deployment, 'current'))
  const calls = []
  const services = {
    assertHost() {},
    async stop() { calls.push('stop') },
    async start() { calls.push('start') },
    async publicCheck() { calls.push('public') },
    async health() { return { status: 'ok', maintenance: true, activeWrites: 0, artifactId: manifest.artifactId, sourceSha: manifest.repository.commit, nodeVersion: manifest.nodeVersion } },
  }
  return { input, manifest, deployment, previous, oldKey, calls, services }
}

test('activation preserves byte-identical history and rollback carries the latest state forward', async (t) => {
  const f = await deploymentFixture(t)
  const first = await activateWorkbench({ input: f.input, root: f.deployment, services: f.services })
  assert.equal(first.status, 'passed')
  assert.equal(first.stateFiles, 1)
  assert.deepEqual(f.calls, ['stop', 'start', 'public'])
  const active = path.join(f.deployment, await readlink(path.join(f.deployment, 'current')))
  await put(active, 'output/qa/retained-report.json', '{"historical":true}')
  const second = await activateWorkbench({ input: f.previous, root: f.deployment, services: f.services })
  assert.equal(second.status, 'passed')
  assert.equal(second.stateFiles, 2)
  const restored = path.join(f.deployment, await readlink(path.join(f.deployment, 'current')))
  assert.equal(await readFile(path.join(restored, 'output/qa/retained-report.json'), 'utf8'), '{"historical":true}')
  assert.equal(existsSync(path.join(f.deployment, 'runtime/release.lock')), false)
  assert.equal((await verifyWorkbenchArtifact(restored)).artifactId, f.manifest.artifactId)
})

test('active writes, pending operations, empty lock directories and unknown output block before stopping', async (t) => {
  const f = await deploymentFixture(t)
  f.services.health = async () => ({ maintenance: true, activeWrites: 1 })
  assert.equal((await activateWorkbench({ input: f.input, root: f.deployment, services: f.services })).status, 'failed')
  assert.deepEqual(f.calls, [])
  await put(f.previous, 'output/dev-workbench/delivery-operations/operations/ready.json', '{"status":"ready"}')
  await assert.rejects(inspectWorkbenchState(f.previous), /未结束/u)
  await rm(path.join(f.previous, 'output/dev-workbench/delivery-operations/operations/ready.json'))
  await mkdir(path.join(f.previous, 'output/dev-workbench/execution.lock'))
  await assert.rejects(inspectWorkbenchState(f.previous), /执行锁/u)
  await rm(path.join(f.previous, 'output/dev-workbench/execution.lock'), { recursive: true })
  await put(f.previous, 'output/unowned/file', 'unowned')
  await assert.rejects(inspectWorkbenchState(f.previous), /归属/u)
})

test('failed new runtime readback restores the previous service and retains both release directories', async (t) => {
  const f = await deploymentFixture(t)
  let healthReads = 0
  const healthy = f.services.health
  f.services.health = async () => {
    healthReads += 1
    if (healthReads === 2) throw new Error('new service did not become ready')
    return healthy()
  }
  const result = await activateWorkbench({ input: f.input, root: f.deployment, services: f.services })
  assert.equal(result.status, 'failed')
  assert.equal(result.failedStage, 'runtime-readback')
  assert.equal(result.previousServiceRestored, true)
  assert.equal(await readlink(path.join(f.deployment, 'current')), `releases/${f.oldKey}`)
  assert.equal(existsSync(path.join(f.deployment, result.candidate)), true)
  assert.equal(existsSync(path.join(f.deployment, 'runtime/release.lock')), false)
})

test('an uncertain stop result restarts and verifies the previous release without switching current', async (t) => {
  const f = await deploymentFixture(t)
  f.services.stop = async () => { f.calls.push('stop'); throw new Error('stop response lost') }
  const result = await activateWorkbench({ input: f.input, root: f.deployment, services: f.services })
  assert.equal(result.status, 'failed')
  assert.equal(result.failedStage, 'stop-service')
  assert.equal(result.previousServiceRestored, true)
  assert.deepEqual(f.calls, ['stop', 'start', 'public'])
  assert.equal(await readlink(path.join(f.deployment, 'current')), `releases/${f.oldKey}`)
  assert.equal(existsSync(path.join(f.deployment, result.candidate)), true)
  assert.equal(existsSync(path.join(f.deployment, 'runtime/release.lock')), false)
  assert.equal(await readFile(path.join(f.previous, 'output/dev-workbench/delivery-operations/operations/receipt.json'), 'utf8'), '{"status":"passed","id":"historical-fixture"}')
})

test('a healthy but wrong restored release retains maintenance and cannot claim recovery', async (t) => {
  const f = await deploymentFixture(t)
  const healthy = f.services.health
  let reads = 0
  f.services.health = async () => {
    reads += 1
    if (reads === 2) throw new Error('new service did not become ready')
    const result = await healthy()
    return reads === 3 ? { ...result, artifactId: 'f'.repeat(64) } : result
  }
  const result = await activateWorkbench({ input: f.input, root: f.deployment, services: f.services })
  assert.equal(result.status, 'failed')
  assert.equal(result.previousServiceRestored, false)
  assert.equal(result.failedStage, 'runtime-readback')
  assert.match(result.recoveryReason, /原服务运行身份未读回/u)
  assert.equal(await readlink(path.join(f.deployment, 'current')), `releases/${f.oldKey}`)
  assert.equal(existsSync(path.join(f.deployment, 'runtime/release.lock')), true)
  assert.equal(existsSync(path.join(f.deployment, result.candidate)), true)
})

test('CLI plans are non-executing and reject arbitrary targets or shell options', async () => {
  assert.match((await main(['--help'])).usage, /seal\|verify\|deploy/u)
  const plan = await main(['rollback', '--release', 'aaaaaaaaaaaaaaaa-11111111-1111-4111-8111-111111111111'])
  assert.equal(plan.remoteWrites, false)
  await assert.rejects(main(['deploy', '--target', 'elsewhere']), /参数无效/u)
  await assert.rejects(main(['rollback', '--release', '../outside']), /精确 release key/u)
  const unit = await readFile(new URL('../../server/deploy/workbench/plush-workbench-test.service', import.meta.url), 'utf8')
  assert.match(unit, /ExecStart=\/root\/deploy\/plush-workbench-test\/current\/toolchain\/bin\/node /u)
  assert.match(unit, /Environment=PATH=\/root\/deploy\/plush-workbench-test\/current\/toolchain\/bin:/u)
})
