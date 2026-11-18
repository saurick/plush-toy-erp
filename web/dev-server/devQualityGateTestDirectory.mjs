import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import { discoverNodeTests } from '../../scripts/qa/run-node-tests.mjs'
import {
  NODE_TEST_GROUPS,
  EXPLICIT_ONLY_NODE_TESTS,
} from '../../scripts/qa/node-test-groups.mjs'
import { discoverWebUnitTests } from '../scripts/runUnitTests.mjs'

const IGNORED_GO_DIRECTORIES = new Set([
  '.git',
  'vendor',
  'node_modules',
  'bin',
  'output',
])

async function isDirectory(directory) {
  try {
    return (await lstat(directory)).isDirectory()
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function discoverGoTests(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !IGNORED_GO_DIRECTORIES.has(entry.name)) {
      files.push(...(await discoverGoTests(path.join(directory, entry.name))))
    } else if (entry.isFile() && entry.name.endsWith('_test.go')) {
      files.push(path.join(directory, entry.name))
    }
  }
  return files
}

// 复用 Node / Web 正式发现器；这里只投影文件归属，不导入或执行测试。
export async function readQualityGateTestDirectory(
  projectRoot,
  {
    nodeGroups = NODE_TEST_GROUPS,
    explicitTests = EXPLICIT_ONLY_NODE_TESTS,
  } = {}
) {
  const root = path.resolve(projectRoot)
  const missingRoots = []
  const read = async (directory, discover) => {
    const target = path.join(root, directory)
    if (!(await isDirectory(target))) {
      missingRoots.push(directory)
      return []
    }
    return discover(target)
  }
  const [nodeFiles, webFiles, goFiles] = await Promise.all([
    read('scripts', discoverNodeTests),
    read('web', discoverWebUnitTests),
    read('server', discoverGoTests),
  ])
  const memberships = new Map()
  for (const [group, files] of Object.entries({
    ...nodeGroups,
    explicit: explicitTests,
  })) {
    for (const file of files) {
      if (!memberships.has(file)) memberships.set(file, [])
      memberships.get(file).push(group)
    }
  }
  const relative = (file) => path.relative(root, file).split(path.sep).join('/')
  const discoveredNode = new Set(nodeFiles.map(relative))
  const files = [...new Set([...discoveredNode, ...memberships.keys()])].map(
    (file) => ({
      path: file,
      group:
        memberships.get(file)?.length > 1
          ? 'duplicate'
          : memberships.get(file)?.[0] || 'unregistered',
      present: discoveredNode.has(file),
    })
  )
  files.push(
    ...webFiles.map((file) => ({
      path: `web/${file.split(path.sep).join('/')}`,
      group: 'web',
      present: true,
    }))
  )
  files.push(
    ...goFiles.map((file) => ({
      path: relative(file),
      group: 'go',
      present: true,
    }))
  )
  files.sort((a, b) => a.path.localeCompare(b.path))
  return {
    kind: 'plush.quality-gate-test-directory',
    readAt: new Date().toISOString(),
    missingRoots: missingRoots.sort(),
    files,
  }
}
