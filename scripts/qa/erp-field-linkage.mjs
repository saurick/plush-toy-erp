#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  assertRepositoryIdentityEqual,
  readRepositoryIdentity,
} from './lib/repository-identity.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..', '..')
const outputDir = path.join(rootDir, 'output', 'qa', 'field-linkage')
const nodeTapPath = path.join(outputDir, 'node-test.tap')
const reportPath = path.join(
  rootDir,
  'output',
  'qa',
  'coverage',
  'field-linkage.latest.json'
)
const reportLabel = 'output/qa/coverage/field-linkage.latest.json'
const commandLabel = 'node scripts/qa/erp-field-linkage.mjs'
const builderPath = path.join(
  rootDir,
  'web',
  'scripts',
  'buildFieldLinkageCoverageReport.mjs'
)

const testFiles = [
  'src/erp/qa/fieldLinkageCatalog.test.mjs',
  'src/erp/data/processingContractTemplate.test.mjs',
  'src/erp/utils/materialPurchaseContractEditor.test.mjs',
  'src/erp/utils/masterDataOrderView.test.mjs',
  'src/erp/utils/processingContractEditor.test.mjs',
  'src/erp/utils/printWorkspace.test.mjs',
  'src/erp/utils/workflowTaskBoard.test.mjs',
  'src/erp/config/printTemplates.test.mjs',
  '../scripts/qa/sales-order-field-chain-boundary.test.mjs',
]

const usage = `用法:
  node scripts/qa/erp-field-linkage.mjs

作用:
  运行毛绒 ERP 字段联动专项测试，并生成字段联动覆盖报告 JSON

输出:
  - output/qa/field-linkage/node-test.tap
  - output/qa/coverage/field-linkage.latest.json
`

const printUsage = () => {
  process.stdout.write(`${usage}\n`)
}

export const sanitizeNodeTap = (raw = '') => {
  const output = ['TAP version 13']
  let currentCaseId = ''
  for (const line of String(raw).split('\n')) {
    const result = line.match(
      /^(not ok|ok)\s+(\d+)\s+-\s+.*?(FL_[A-Za-z0-9_]+)/u
    )
    if (result) {
      const [, status, index, caseId] = result
      const skip = /#\s+SKIP\b/u.test(line) ? ' # SKIP' : ''
      output.push(`${status} ${index} - ${caseId}${skip}`)
      currentCaseId = caseId
      continue
    }
    if (/^(not ok|ok)\s+\d+\s+-/u.test(line)) {
      currentCaseId = ''
      continue
    }
    const duration = line.match(/^\s+duration_ms:\s+([0-9.]+)\s*$/u)
    if (currentCaseId && duration) {
      output.push(`  duration_ms: ${duration[1]}`)
    }
  }
  return `${output.join('\n')}\n`
}

export const runCommand = async ({ command, args, cwd }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', () => {
      reject(new Error('字段联动子进程无法启动'))
    })
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('字段联动子进程执行失败'))
        return
      }
      resolve({ stdout, stderr })
    })
  })

export const runFieldLinkageQa = async ({
  repositoryReader = () => readRepositoryIdentity(rootDir),
  executeCommand = runCommand,
  makeDirectory = mkdir,
  makeTemporaryDirectory = mkdtemp,
  moveFile = rename,
  removeFile = rm,
  writeTap = writeFile,
  outputDirectory = outputDir,
  nodeTapFile = nodeTapPath,
  coverageReportFile = reportPath,
} = {}) => {
  const expectedRepository = await repositoryReader()
  await makeDirectory(outputDirectory, { recursive: true })
  await makeDirectory(path.dirname(nodeTapFile), { recursive: true })
  await makeDirectory(path.dirname(coverageReportFile), { recursive: true })
  const stagingDirectory = await makeTemporaryDirectory(
    path.join(path.dirname(coverageReportFile), '.field-linkage-staging-')
  )
  const stagedTapFile = path.join(stagingDirectory, 'node-test.tap')
  const stagedReportFile = path.join(
    stagingDirectory,
    'field-linkage.latest.json'
  )

  try {
    const nodeResult = await executeCommand({
      command: process.execPath,
      args: ['--test', '--test-reporter=tap', ...testFiles],
      cwd: path.join(rootDir, 'web'),
    })
    assertRepositoryIdentityEqual(expectedRepository, await repositoryReader())
    await writeTap(stagedTapFile, sanitizeNodeTap(nodeResult.stdout), 'utf8')

    await executeCommand({
      command: process.execPath,
      args: [
        builderPath,
        '--node-tap',
        stagedTapFile,
        '--output',
        stagedReportFile,
        '--command',
        commandLabel,
        '--expected-repository',
        JSON.stringify(expectedRepository),
      ],
      cwd: rootDir,
    })
    assertRepositoryIdentityEqual(expectedRepository, await repositoryReader())

    // The report is authoritative and is promoted last. Any test, builder or
    // identity failure before this point leaves the previous canonical pair.
    await moveFile(stagedTapFile, nodeTapFile)
    await moveFile(stagedReportFile, coverageReportFile)
    return expectedRepository
  } finally {
    await removeFile(stagingDirectory, { recursive: true, force: true })
  }
}

const main = async () => {
  const args = process.argv.slice(2)
  if (args[0] === '-h' || args[0] === '--help') {
    printUsage()
    return
  }
  if (args.length > 0) {
    process.stderr.write(
      `[qa:erp-field-linkage] 存在不支持的参数\n\n${usage}\n`
    )
    process.exitCode = 1
    return
  }

  process.stdout.write('[qa:erp-field-linkage] 运行前端字段联动测试\n')
  await runFieldLinkageQa()
  process.stdout.write(`[qa:erp-field-linkage] 完成: ${reportLabel}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(() => {
    process.stderr.write(
      `[qa:erp-field-linkage][fatal] 字段联动专项测试未完成\n`
    )
    process.exitCode = 1
  })
}
