#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const catalogPath = path.join(repoRoot, 'server/internal/errcode/catalog.go')
const parserPath = path.join(repoRoot, 'scripts/gen-error-codes-ast.go')
const outputPath = path.join(repoRoot, 'web/src/common/consts/errorCodes.generated.js')

function parseCliArgs(argv) {
  const allowed = new Set(['--check', '--stdout'])
  for (const arg of argv) {
    if (!allowed.has(arg)) {
      throw new Error(`未知参数：${arg}`)
    }
  }
  const args = new Set(argv)
  if (args.has('--check') && args.has('--stdout')) {
    throw new Error('--check 与 --stdout 不能同时使用')
  }
  return {
    checkOnly: args.has('--check'),
    printStdout: args.has('--stdout'),
  }
}

function toUpperSnake(name) {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()
}

function validateDefinitions(parsed) {
  const definitions = parsed.map(({ ident, code }) => ({
    ident,
    key: toUpperSnake(ident),
    code,
  }))
  for (const [label, values] of [
    ['identifier', definitions.map((item) => item.ident)],
    ['frontend key', definitions.map((item) => item.key)],
    ['code', definitions.map((item) => String(item.code))],
  ]) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index)
    if (duplicates.length > 0) {
      throw new Error(`catalog.go 含重复 ${label}：${[...new Set(duplicates)].join(', ')}`)
    }
  }
  return definitions
}

function loadDefinitionsFromFile(filePath) {
  const result = spawnSync(
    'go',
    ['run', parserPath, '--catalog', filePath],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 },
  )
  if (result.error) {
    throw new Error(`无法运行 Go AST 解析器：${result.error.message}`)
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '未知错误').trim().slice(0, 4096)
    throw new Error(`catalog.go AST 解析失败：${detail}`)
  }
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`Go AST 解析器输出无效：${error.message}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Go AST 解析器输出必须是数组')
  }
  return validateDefinitions(parsed)
}

function loadDefinitions(source) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plush-error-codes-'))
  const tempCatalog = path.join(tempRoot, 'catalog.go')
  try {
    fs.writeFileSync(tempCatalog, source)
    return loadDefinitionsFromFile(tempCatalog)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function render(definitions) {
  const lines = [
    '// 由 `node scripts/gen-error-codes.mjs` 自动生成；请勿手改。',
    '// 真源：`server/internal/errcode/catalog.go`。',
    'export const RpcErrorCode = Object.freeze({',
  ]

  for (const item of definitions) {
    lines.push(`  ${item.key}: ${item.code},`)
  }

  lines.push('})', '')
  return lines.join('\n')
}

function main(argv = process.argv.slice(2)) {
  const { checkOnly, printStdout } = parseCliArgs(argv)
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`未找到错误码目录：${catalogPath}`)
  }

  const definitions = loadDefinitionsFromFile(catalogPath)
  if (definitions.length === 0) {
    throw new Error('未从 catalog.go 解析到任何错误码定义')
  }

  const rendered = render(definitions)
  if (printStdout) {
    process.stdout.write(rendered)
    return
  }

  if (checkOnly) {
    if (!fs.existsSync(outputPath)) {
      throw new Error(`缺少生成文件：${path.relative(repoRoot, outputPath)}`)
    }
    const current = fs.readFileSync(outputPath, 'utf8')
    if (current !== rendered) {
      throw new Error('前端错误码生成文件未同步，请执行：node scripts/gen-error-codes.mjs')
    }
    console.log('[gen-error-codes] 通过')
    return
  }

  // 构建期只从服务端目录生成码表，消费侧分组/文案仍保留在手写文件里。
  fs.writeFileSync(outputPath, rendered)
  console.log(`[gen-error-codes] 已更新 ${path.relative(repoRoot, outputPath)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(`[gen-error-codes] ${error.message}`)
    process.exitCode = 1
  }
}

export { loadDefinitions, loadDefinitionsFromFile, parseCliArgs, render }
