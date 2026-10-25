import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { lstat, readdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { readRepositoryIdentity } from '../qa/lib/repository-identity.mjs'

export const WORKBENCH_ARTIFACT_PATH = 'web/build-workbench/.workbench-artifact.json'
export const WORKBENCH_BUILD_PATH = 'web/build-workbench/workbench-build.json'
const PRIVATE_FEEDBACK = 'docs/customers/yoyoosun/甲方反馈记录.md'
const REQUIRED = [
  '.n-node-version', 'web/package.json', 'web/pnpm-lock.yaml',
  'web/build-workbench/workbench.html', 'web/build-workbench/favicon-dev.svg',
  WORKBENCH_BUILD_PATH, 'web/dev-server/standaloneWorkbench.mjs',
  'scripts/deploy/workbench-release.mjs', 'server/deploy/workbench/target.json',
  'toolchain/bin/node', 'toolchain/bin/dev-permission-relationships',
]
export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function git(root, args) {
  return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export async function digestFile(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}

export async function inventoryWorkbench(root, { state = false } = {}) {
  const entries = []
  const walk = async (directory, prefix = '') => {
    for (const name of (await readdir(directory)).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name
      if (relative === WORKBENCH_ARTIFACT_PATH || (!state && relative === 'output')) continue
      if (/[\\\x00-\x1f\x7f]/u.test(relative)) throw new Error('制品路径含控制字符或反斜杠')
      if (!state && (relative === 'runtime' || relative === PRIVATE_FEEDBACK ||
        /(?:^|\/)\.env(?:$|\.(?!example$|sample$|template$))/u.test(relative))) {
        throw new Error('制品含运行配置或客户反馈输入')
      }
      const file = path.join(directory, name)
      const stat = await lstat(file)
      if (stat.isSymbolicLink()) {
        const resolved = await realpath(file)
        const dependencyRoot = path.join(root, 'web/node_modules')
        if (state || !relative.startsWith('web/node_modules/') || !resolved.startsWith(`${dependencyRoot}${path.sep}`)) {
          throw new Error('制品或状态含越界符号链接')
        }
        const target = await readlink(file)
        if (path.isAbsolute(target)) throw new Error('依赖符号链接必须为包内相对路径')
        entries.push({ path: relative, link: target })
      } else if (stat.isDirectory()) {
        if (state) entries.push({ path: relative, directory: true, mode: stat.mode & 0o777 })
        await walk(file, relative)
      } else if (stat.isFile()) {
        entries.push({ path: relative, bytes: stat.size, mode: stat.mode & 0o777, sha256: await digestFile(file) })
      } else throw new Error('制品或状态含不支持的文件类型')
      if (entries.length > 200_000) throw new Error('制品文件数量超限')
    }
  }
  await walk(root)
  return entries
}

export async function inspectWorkbenchSource(root) {
  if (!(await lstat(path.join(root, '.git'))).isDirectory()) throw new Error('制品必须携带自包含 Git 目录')
  if (['commondir', 'objects/info/alternates', 'objects/info/http-alternates'].some((file) => existsSync(path.join(root, '.git', file)))) {
    throw new Error('制品 Git 目录必须自包含，不能引用外部对象库或关联工作树')
  }
  if (await realpath(git(root, ['rev-parse', '--show-toplevel'])) !== await realpath(root) ||
      await realpath(git(root, ['rev-parse', '--absolute-git-dir'])) !== await realpath(path.join(root, '.git'))) {
    throw new Error('制品 Git 身份不属于当前目录')
  }
  const identity = await readRepositoryIdentity(root)
  if (identity.dirty) throw new Error('正式工作台制品要求 clean committed source')
  // The current file and historical blobs must both stay outside distribution.
  const objects = git(root, ['rev-list', '--objects', '--all', '--missing=print', '--', PRIVATE_FEEDBACK])
  for (const line of objects.split('\n')) {
    if (!line.endsWith(` ${PRIVATE_FEEDBACK}`)) continue
    try {
      git(root, ['cat-file', '-e', line.split(' ')[0]])
    } catch { continue }
    throw new Error('Git 对象库仍可读取客户反馈原文')
  }
  const config = git(root, ['config', '--local', '--list'])
  if (/(?:https?:\/\/[^/\s]+@|extraheader|credential\.|insteadOf|^core\.worktree=)/imu.test(config)) throw new Error('Git 配置含凭据、URL 改写或外部工作树')
  return identity
}

export async function sealWorkbenchArtifact(root) {
  try {
    if ((await readdir(path.join(root, 'output'))).length) throw new Error('封装输入不能携带运行状态或证据 output')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const identity = await inspectWorkbenchSource(root)
  const build = JSON.parse(await readFile(path.join(root, WORKBENCH_BUILD_PATH), 'utf8'))
  if (build.kind !== 'plush.workbench-build' || build.repository?.commit !== identity.commit ||
    build.repository?.fingerprint !== identity.fingerprint || build.repository?.dirty !== false) {
    throw new Error('工作台构建与当前 clean 源码身份不一致')
  }
  const entries = await inventoryWorkbench(root)
  const paths = new Set(entries.filter((entry) => !entry.link).map((entry) => entry.path))
  if (REQUIRED.some((file) => !paths.has(file)) || !entries.some((entry) => entry.path.startsWith('web/node_modules/'))) {
    throw new Error('制品缺少预构建页面、运行依赖或预编译工具')
  }
  for (const binary of ['toolchain/bin/node', 'toolchain/bin/dev-permission-relationships']) {
    const bytes = await readFile(path.join(root, binary))
    const entry = entries.find((item) => item.path === binary)
    if (bytes.length < 20 || bytes.subarray(0, 4).toString('hex') !== '7f454c46' || bytes[4] !== 2 || bytes.readUInt16LE(18) !== 62 || !(entry.mode & 0o111)) {
      throw new Error('工作台工具必须预编译为可执行 linux/amd64 ELF')
    }
  }
  const nodeVersion = (await readFile(path.join(root, '.n-node-version'), 'utf8')).trim()
  const lockSha256 = await digestFile(path.join(root, 'web/pnpm-lock.yaml'))
  if (build.nodeVersion !== nodeVersion || build.lockSha256 !== lockSha256) throw new Error('构建工具链或依赖锁不一致')
  const content = { kind: 'plush.workbench-artifact', repository: identity, nodeVersion, lockSha256, entries }
  const manifest = { ...content, artifactId: sha256(JSON.stringify(content)) }
  await writeFile(path.join(root, WORKBENCH_ARTIFACT_PATH), `${JSON.stringify(manifest)}\n`, { flag: 'wx', mode: 0o600 })
  return manifest
}

export async function verifyWorkbenchArtifact(root) {
  const file = path.join(root, WORKBENCH_ARTIFACT_PATH)
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) throw new Error('制品清单文件无效')
  const { artifactId, ...content } = JSON.parse(await readFile(file, 'utf8'))
  if (content.kind !== 'plush.workbench-artifact' || !/^[a-f0-9]{64}$/u.test(artifactId || '') ||
    artifactId !== sha256(JSON.stringify(content))) throw new Error('制品清单摘要不一致')
  if (content.repository?.dirty !== false || !/^[a-f0-9]{40}$/u.test(content.repository?.commit || '') ||
    !/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(content.nodeVersion || '') || !Array.isArray(content.entries) ||
    REQUIRED.some((file) => !content.entries.some((entry) => entry.path === file && entry.sha256))) throw new Error('制品身份或必要输入缺失')
  if (JSON.stringify(await inventoryWorkbench(root)) !== JSON.stringify(content.entries)) throw new Error('制品文件清单、权限或摘要不一致')
  return { ...content, artifactId }
}
