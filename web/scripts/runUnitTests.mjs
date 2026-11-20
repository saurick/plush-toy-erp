import { spawnSync } from 'node:child_process'
import { globSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { nodeTestProcessArgs, NODE_TEST_SUITE_TIMEOUT_MS } from '../../scripts/qa/lib/node-test-process.mjs'

const webRoot = fileURLToPath(new URL('../', import.meta.url))

export function discoverWebUnitTests(root = webRoot) {
  return globSync([
    '*.test.{cjs,js,mjs}',
    '{src,scripts,dev-server}/**/*.test.{cjs,js,mjs}',
  ], {
    cwd: root,
    exclude: ['**/output/**', '**/node_modules/**'],
  }).sort()
}

function runUnitTests(args) {
  const tests = discoverWebUnitTests()
  if (tests.length === 0) {
    throw new Error('未发现前端源码测试，请检查测试目录与文件命名')
  }
  const result = spawnSync(process.execPath, nodeTestProcessArgs(['--test', ...args, ...tests], { timeoutMs: NODE_TEST_SUITE_TIMEOUT_MS }), {
    cwd: webRoot,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runUnitTests(process.argv.slice(2))
}
