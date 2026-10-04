#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = 'web/src/common/consts'
const header = '// 由 `node scripts/gen-public-contracts.mjs` 生成；请勿手改。\n'

function jsString(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n').replaceAll('\r', '\\r')}'`
}

// The generated module has no runtime dependency on Go or the generator.
function frozen(value, depth = 0) {
  if (typeof value === 'string') return jsString(value)
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const indent = '  '.repeat(depth)
  const next = `${indent}  `
  if (Array.isArray(value)) {
    return `Object.freeze([${value.map((item) => frozen(item, depth)).join(', ')}])`
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right, 'en'))
  return `Object.freeze({\n${entries.map(([key, item]) => `${next}${/^[A-Za-z_$][\w$]*$/u.test(key) ? key : jsString(key)}: ${frozen(item, depth + 1)},`).join('\n')}\n${indent}})`
}

function moduleSource(source, exports) {
  return `${header}// 真源：${source}。\n${Object.entries(exports).map(([name, value]) => `export const ${name} = ${frozen(value)}\n`).join('\n')}`
}

export function renderCatalog(catalog) {
  for (const key of ['permissions', 'states', 'attachments', 'numeric', 'rpc']) {
    if (!catalog[key] || Object.keys(catalog[key]).length === 0) throw new Error(`缺少契约：${key}`)
  }
  const precision = catalog.numeric.Precision
  const scale = catalog.numeric.Scale
  if (!Number.isSafeInteger(precision) || !Number.isSafeInteger(scale) || scale <= 0 || precision <= scale) {
    throw new Error('无效数值精度契约')
  }
  const integerDigits = precision - scale
  const numeric = {
    precision, scale, integerDigits,
    maxUnits: '9'.repeat(precision),
    maximum: `${'9'.repeat(integerDigits)}.${'9'.repeat(scale)}`,
  }
  const domains = Object.fromEntries(Object.keys(catalog.rpc).map((domain) => [domain.toUpperCase(), domain]))
  return {
    'permissions.generated.mjs': moduleSource('server/internal/biz/rbac.go', { PermissionCode: catalog.permissions }),
    'statuses.generated.mjs': moduleSource('server/internal/core/status、server/internal/biz/workflow_metadata.go、server/internal/biz/operational_fact.go、server/internal/biz/outsourcing_order.go、server/internal/biz/production_order.go', catalog.states),
    'attachments.generated.mjs': moduleSource('server/internal/biz/business_attachment.go', { AttachmentPolicy: catalog.attachments }),
    'numeric.generated.mjs': moduleSource('server/internal/core/value/numeric.go', { NumericContract: numeric }),
    'rpcMethods.generated.mjs': moduleSource('server/internal/service/jsonrpc_dispatch.go 及其域 handler 的 method switch', { RpcDomain: domains, RpcMethod: catalog.rpc }),
  }
}

export function loadCatalog(repositoryRoot = root) {
  const result = spawnSync('go', ['run', './cmd/public-contracts', '--root', repositoryRoot], {
    cwd: path.join(root, 'server'), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 120_000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim().slice(0, 4096))
  return JSON.parse(result.stdout)
}

export function syncOutputs(outputs, { repositoryRoot = root, check = false } = {}) {
  const changed = []
  for (const [name, content] of Object.entries(outputs)) {
    const relative = `${outputDirectory}/${name}`
    const destination = path.join(repositoryRoot, relative)
    if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') === content) continue
    changed.push(relative)
    if (!check) fs.writeFileSync(destination, content)
  }
  if (check && changed.length) {
    throw new Error(`公共契约生成物未同步：${changed.join(', ')}；请运行 node scripts/gen-public-contracts.mjs`)
  }
  return changed
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.some((arg) => arg !== '--check') || args.length > 1) throw new Error('仅支持 --check 或无参数生成')
    const outputs = renderCatalog(loadCatalog())
    const changed = syncOutputs(outputs, { check: args.includes('--check') })
    console.log(`[gen-public-contracts] ${args.includes('--check') ? '检查通过' : `已同步 ${changed.length} 个文件`}`)
  } catch (error) {
    console.error(`[gen-public-contracts] ${error.message}`)
    process.exitCode = 1
  }
}
