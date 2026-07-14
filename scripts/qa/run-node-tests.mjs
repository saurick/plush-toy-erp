#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { verifyNodeTestSummary } from './verify-node-test-summary.mjs'

const DEFAULT_TEST_ROOT = path.resolve(import.meta.dirname, '..')
const NODE_TEST_SUFFIXES = Object.freeze([
  '.test.cjs',
  '.test.js',
  '.test.mjs',
])

export async function discoverNodeTests(rootDir = DEFAULT_TEST_ROOT) {
  const resolvedRoot = path.resolve(rootDir)
  const tests = []

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'output') {
        continue
      }
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
        continue
      }
      if (
        entry.isFile() &&
        NODE_TEST_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
      ) {
        tests.push(entryPath)
      }
    }
  }

  await walk(resolvedRoot)
  return tests.sort((left, right) => left.localeCompare(right))
}

export function parseArgs(argv) {
  const options = {
    list: false,
    rootDir: DEFAULT_TEST_ROOT,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--list') {
      options.list = true
      continue
    }
    if (arg === '--root') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--root requires a directory')
      }
      options.rootDir = path.resolve(value)
      index += 1
      continue
    }
    if (arg === '-h' || arg === '--help') {
      options.help = true
      continue
    }
    throw new Error(`unknown option: ${arg}`)
  }

  return options
}

export function classifyNodeTestResult(result) {
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    return { exitCode: result.status ?? 1, summary: null }
  }
  const summary = verifyNodeTestSummary(`${result.stdout || ''}\n${result.stderr || ''}`)
  return { exitCode: summary.ok ? 0 : 1, summary }
}

function printHelp() {
  console.log(`Repository scripts Node test runner

Usage:
  node scripts/qa/run-node-tests.mjs [--list]

Options:
  --list        List discovered tests without running them.
  --root <dir>  Override the discovery root (used by self-tests).
  -h, --help    Show this help.

The default root is scripts/. Tests are discovered recursively by the
*.test.mjs, *.test.cjs and *.test.js suffixes. No Git metadata is required.`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const tests = await discoverNodeTests(options.rootDir)
  if (tests.length === 0) {
    throw new Error(`no Node tests found under ${options.rootDir}`)
  }

  const displayRoot = path.resolve(options.rootDir, '..')
  const displayPaths = tests.map((file) => path.relative(displayRoot, file))
  if (options.list) {
    for (const file of displayPaths) {
      console.log(file)
    }
    console.log(`[qa:node-tests] discovered=${tests.length}`)
    return
  }

  console.log(`[qa:node-tests] running=${tests.length}`)
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', ...tests],
    {
      cwd: path.resolve(options.rootDir, '..'),
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    },
  )
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  const outcome = classifyNodeTestResult(result)
  if (!outcome.summary?.ok) {
    console.error(
      `[qa:node-tests] status=incomplete tests=${outcome.summary?.tests ?? 'missing'} pass=${outcome.summary?.pass ?? 'missing'} fail=${outcome.summary?.fail ?? 'missing'} skipped=${outcome.summary?.skipped ?? 'missing'}`,
    )
  }
  process.exitCode = outcome.exitCode
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === entryPath) {
  main().catch((error) => {
    console.error(`[qa:node-tests] ${error.message}`)
    process.exitCode = 1
  })
}
