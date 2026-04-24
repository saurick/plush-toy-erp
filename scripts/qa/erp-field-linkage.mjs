#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..', '..')
const outputDir = path.join(rootDir, 'output', 'qa', 'field-linkage')
const nodeTapPath = path.join(outputDir, 'node-test.tap')
const reportPath = path.join(
  rootDir,
  'web',
  'public',
  'qa',
  'erp-field-linkage-coverage.latest.json'
)
const commandLabel = 'node scripts/qa/erp-field-linkage.mjs'

const testFiles = [
  'src/erp/qa/fieldLinkageCatalog.test.mjs',
  'src/erp/utils/businessRecordForm.test.mjs',
  'src/erp/data/processingContractTemplate.test.mjs',
  'src/erp/utils/materialPurchaseContractEditor.test.mjs',
  'src/erp/utils/processingContractEditor.test.mjs',
  'src/erp/utils/printWorkspace.test.mjs',
  'src/erp/config/printTemplates.test.mjs',
]

const usage = `用法:
  node scripts/qa/erp-field-linkage.mjs

作用:
  运行毛绒 ERP 字段联动专项测试，并生成字段联动覆盖报告 JSON

输出:
  - output/qa/field-linkage/node-test.tap
  - web/public/qa/erp-field-linkage-coverage.latest.json
`

const printUsage = () => {
  process.stdout.write(`${usage}\n`)
}

const summarizeOutput = (stdout, stderr) =>
  [stdout, stderr]
    .filter(Boolean)
    .join('\n')
    .trim()
    .slice(0, 6000)

const runCommand = async ({ command, args, cwd, captureStdout }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      if (captureStdout) stdout += text
      process.stdout.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })
    child.on('error', (error) => {
      if (error?.code === 'ENOENT') {
        reject(new Error(`未找到 ${command}，请先安装对应依赖`))
        return
      }
      reject(error)
    })
    child.on('close', (code) => {
      if (code !== 0) {
        const summary = summarizeOutput(stdout, stderr)
        reject(
          new Error(
            `命令失败: ${command} ${args.join(' ')}\n${summary || '无输出'}`
          )
        )
        return
      }
      resolve({ stdout, stderr })
    })
  })

const main = async () => {
  const args = process.argv.slice(2)
  if (args[0] === '-h' || args[0] === '--help') {
    printUsage()
    return
  }
  if (args.length > 0) {
    process.stderr.write(
      `[qa:erp-field-linkage] 不支持的参数: ${args.join(' ')}\n\n${usage}\n`
    )
    process.exitCode = 1
    return
  }

  await mkdir(outputDir, { recursive: true })

  process.stdout.write('[qa:erp-field-linkage] 运行前端字段联动测试\n')
  const nodeResult = await runCommand({
    command: process.execPath,
    args: ['--test', '--test-reporter=tap', ...testFiles],
    cwd: path.join(rootDir, 'web'),
    captureStdout: true,
  })
  await writeFile(nodeTapPath, nodeResult.stdout)

  process.stdout.write('[qa:erp-field-linkage] 生成字段联动覆盖报告\n')
  await runCommand({
    command: process.execPath,
    args: [
      path.join(rootDir, 'web', 'scripts', 'buildFieldLinkageCoverageReport.mjs'),
      '--node-tap',
      nodeTapPath,
      '--output',
      reportPath,
      '--command',
      commandLabel,
    ],
    cwd: rootDir,
    captureStdout: false,
  })

  process.stdout.write(`[qa:erp-field-linkage] 完成: ${reportPath}\n`)
}

main().catch((error) => {
  process.stderr.write(
    `[qa:erp-field-linkage][fatal] ${error?.stack || error?.message || error}\n`
  )
  process.exitCode = 1
})
