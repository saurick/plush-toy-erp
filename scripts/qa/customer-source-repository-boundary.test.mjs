import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const privateSourceExtensions = new Set([
  '.doc',
  '.docx',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.xls',
  '.xlsx',
])

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function gitFiles(pathspec) {
  const output = execFileSync('git', ['ls-files', '-z', '--', pathspec], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return output.split('\0').filter(Boolean)
}

test('Product Core 当前树不保留客户原件', () => {
  const existingTrackedRawSources = gitFiles('docs/customers/*/raw-source-files/**')
  assert.equal(
    existingTrackedRawSources.length,
    0,
    `tracked customer raw sources must be removed from the current tree; count=${existingTrackedRawSources.length}`,
  )
})

test('Product Core 当前树不保留真实来源 manifest', () => {
  const existingPrivateManifests = gitFiles('docs/customers/**').filter(
    (relativePath) => path.posix.extname(relativePath).toLowerCase() === '.json',
  )
  assert.equal(
    existingPrivateManifests.length,
    0,
    `customer source JSON and private manifests must live in customer-private repositories; count=${existingPrivateManifests.length}`,
  )
})

test('客户文档目录只允许显式 public-assets 保留获批公开媒体', () => {
  const trackedPrivateSourceFiles = gitFiles('docs/customers/**').filter((relativePath) => {
    if (relativePath.split('/').includes('public-assets')) {
      return false
    }
    return privateSourceExtensions.has(path.posix.extname(relativePath).toLowerCase())
  })

  assert.equal(
    trackedPrivateSourceFiles.length,
    0,
    `customer source-like binaries must live outside Product Core or under an approved public-assets directory; count=${trackedPrivateSourceFiles.length}`,
  )
})

test('客户配置只允许 public-assets 保留获批公开媒体', () => {
  const trackedPrivateConfigAssets = gitFiles('config/customers/**').filter((relativePath) => {
    if (relativePath.split('/').includes('public-assets')) {
      return false
    }
    return privateSourceExtensions.has(path.posix.extname(relativePath).toLowerCase())
  })
  assert.equal(
    trackedPrivateConfigAssets.length,
    0,
    `private customer config assets require external storage or approved public-assets classification; count=${trackedPrivateConfigAssets.length}`,
  )
})

test('客户部署资料不保留来源型二进制', () => {
  const trackedDeploymentSourceFiles = gitFiles('deployments/**').filter((relativePath) =>
    privateSourceExtensions.has(path.posix.extname(relativePath).toLowerCase()),
  )
  assert.equal(
    trackedDeploymentSourceFiles.length,
    0,
    `deployment source-like binaries must live in private evidence storage; count=${trackedDeploymentSourceFiles.length}`,
  )
})

test('本地、Docker 与 archive 边界明确隔离客户原件', () => {
  const gitignore = read('.gitignore')
  for (const rule of [
    '.customer-sources/',
    'docs/customers/*/raw-source-files/',
    'output/customers/*/private-source-*/',
  ]) {
    assert.match(gitignore, new RegExp(`^${rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'mu'))
  }

  const dockerignore = read('.dockerignore')
  for (const rule of ['.customer-sources', 'docs/customers/*/raw-source-files']) {
    assert.match(dockerignore, new RegExp(`^${rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'mu'))
  }

  const attributes = read('.gitattributes')
  assert.match(attributes, /^docs\/customers\/\*\* export-ignore$/mu)
  assert.doesNotMatch(attributes, /raw-source-files\/\*\*\s+-diff/u)
})

test('普通导入测试只引用合成 fixture', () => {
  const fixtureRoot = path.join(repoRoot, 'scripts/import/fixtures/synthetic')
  assert.equal(existsSync(fixtureRoot), true)

  for (const testFile of [
    'scripts/import/customerSourceManifestCheck.test.mjs',
    'scripts/import/customerSourceExtract.test.mjs',
  ]) {
    const source = read(testFile)
    assert.match(source, /fixtures\/synthetic/u)
    assert.doesNotMatch(source, /docs\/customers\/yoyoosun/u)
  }
})
