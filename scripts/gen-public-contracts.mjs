#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertRPCDocumentation, rpcDocumentationParts } from './lib/rpc-contract-review.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = 'web/src/common/consts'
const header = '// 由 `node scripts/gen-public-contracts.mjs` 生成；请勿手改。\n'

function jsString(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\t', '\\t').replaceAll('\n', '\\n').replaceAll('\r', '\\r')}'`
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
  for (const key of ['permissions', 'permissionLabels', 'states', 'attachments', 'numeric', 'policies', 'rpc', 'rpcTransport', 'rpcInspection', 'taskDiscovery']) {
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
    'workflowTaskDiscovery.generated.mjs': moduleSource('server/internal/biz/workflow_task_catalog.json', { WorkflowTaskDiscoveryCatalog: catalog.taskDiscovery }),
    'permissions.generated.mjs': moduleSource('server/internal/biz/rbac.go', { PermissionCode: catalog.permissions, PermissionLabel: catalog.permissionLabels }),
    'statuses.generated.mjs': moduleSource('server/internal/core/status 及 server/cmd/public-contracts 登记的 biz 领域声明', catalog.states),
    'attachments.generated.mjs': moduleSource('server/internal/biz/business_attachment.go', { AttachmentPolicy: catalog.attachments }),
    'numeric.generated.mjs': moduleSource('server/internal/core/value/numeric.go', { NumericContract: numeric }),
    'policies.generated.mjs': moduleSource('server/internal/biz/business_pagination.go、server/internal/biz/work_center_pagination.go、server/internal/biz/admin_password.go、server/internal/biz/help_content.go、server/internal/biz/sales_order_export.go、server/internal/server/template_pdf.go、server/internal/server/template_pdf_security.go', catalog.policies),
    'rpcMethods.generated.mjs': moduleSource('server/api/jsonrpc/v1/jsonrpc.pb.go 消息描述、HTTP binding、Swagger 及 server/internal/service 的实际分发', { RpcTransport: catalog.rpcTransport, RpcDomain: domains, RpcMethod: catalog.rpc }),
    'rpcInspection.generated.mjs': moduleSource('server/internal/service 实际分支与参数读取点；仅供 DEV 工作台核对，不是完整 Schema 或授权结论', { RpcInspection: catalog.rpcInspection }),
  }
}

export function loadCatalog(repositoryRoot = root, { review = false } = {}) {
  const result = spawnSync('go', ['run', './cmd/public-contracts', '--root', repositoryRoot, ...(review ? ['--review'] : [])], {
    cwd: path.join(root, 'server'), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error((result.stderr || result.stdout).trim().slice(0, 4096))
  return JSON.parse(result.stdout)
}

export function syncOutputs(outputs, { repositoryRoot = root, check = false } = {}) {
  const changed = []
  for (const [name, content] of Object.entries(outputs)) {
    const relative = name === 'rpcInspection.generated.mjs'
      ? `web/src/dev-workbench/config/${name}` : `${outputDirectory}/${name}`
    const destination = path.join(repositoryRoot, relative)
    if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') === content) continue
    changed.push(relative)
    if (!check) {
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, content)
    }
  }
  if (check && changed.length) {
    throw new Error(`公共契约生成物未同步：${changed.join(', ')}；请运行 node scripts/gen-public-contracts.mjs`)
  }
  return changed
}

export function syncTaskDesignCatalog(catalog, { repositoryRoot = root, check = false } = {}) {
  const relative = 'docs/product/ui-design/index.html'
  const destination = path.join(repositoryRoot, relative)
  const source = fs.readFileSync(destination, 'utf8')
  const start = '    // BEGIN GENERATED TASK DISCOVERY'
  const end = '    // END GENERATED TASK DISCOVERY'
  const begin = source.indexOf(start)
  const endPosition = source.indexOf(end, begin + start.length)
  if (begin < 0 || endPosition < 0 || source.indexOf(end) !== endPosition || source.indexOf(start, begin + start.length) >= 0 || source.indexOf(end, endPosition + end.length) >= 0) {
    throw new Error('任务交互设计缺少唯一且顺序正确的分类生成标记')
  }
  const finish = endPosition + end.length
  const next = source.slice(0, begin) + `${start}\n    const taskDiscoveryCatalog = ${JSON.stringify(catalog.taskDiscovery)};\n${end}` + source.slice(finish)
  if (next === source) return []
  if (check) throw new Error('任务交互设计分类未同步，请运行 node scripts/gen-public-contracts.mjs')
  fs.writeFileSync(destination, next)
  return [relative]
}

const rpcDocsStart = '<!-- BEGIN GENERATED RPC FIELD CONTRACTS -->'
const rpcDocsEnd = '<!-- END GENERATED RPC FIELD CONTRACTS -->'
const requestFieldType = (field) => field.nullable && !field.type.split(/\s*\|\s*/u).includes('null') ? `${field.type} | null` : field.type
const rpcTableCell = (value) => String(value ?? '').replaceAll('|', '&#124;').replace(/\s+/gu, ' ').trim()

function completeManualRPCTables(catalog, source) {
  const lines = source.split('\n')
  const out = []
  let current
  let part
  let fence = false
  const cell = rpcTableCell
  const fieldHeader = (line) => /^\| (字段|返回字段|result\.data 字段) \|/u.test(line || '')
  const groupHeading = (line) => /^\*\*(?:顶层字段|`[^`]+`)(?:（续）)?\*\*$/u.test(line || '')
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!fence && line === '```json' && current && part === 'response' && typeof current.example.message === 'string') {
      const close = lines.indexOf('```', index + 1)
      if (close > index) {
        try {
          const value = JSON.parse(lines.slice(index + 1, close).join('\n'))
          if (value?.result?.code === 0) {
            value.result.message = current.example.message
            out.push(line, JSON.stringify(value, null, 2), lines[close])
            index = close
            continue
          }
        } catch { /* Keep authored invalid examples visible for their existing format guard. */ }
      }
    }
    if (/^```/u.test(line)) fence = !fence
    if (!fence) {
      if (/^#{1,4} /u.test(line)) {
        current = undefined
        part = undefined
        const method = /^#### .*`([a-z_]+)\.([a-z_]+)`/u.exec(line)
        if (method) current = catalog.rpcCalls?.[method[1]]?.[method[2]]
      }
      if (line === '##### 请求参数') part = 'parameters'
      if (line === '##### 返回结果') part = 'response'
      if (current && part && /^\| (字段|返回字段|result\.data 字段) \|/u.test(line) && /^\| ---/u.test(lines[index + 1] || '')) {
        const originals = new Map()
        let cursor = index
        while (fieldHeader(lines[cursor])) {
          const relativeResponse = part === 'response' && /^\| result\.data 字段 \|/u.test(lines[cursor])
          cursor += 2
          while (lines[cursor]?.startsWith('|')) {
            const cells = lines[cursor].split(/(?<!\\)\|/u).slice(1, -1).map((value) => value.trim().replaceAll('\\|', '|'))
            const name = cells[0].replaceAll('`', '')
            originals.set(relativeResponse ? `result.data.${name}` : name, cells)
            cursor++
          }
          index = cursor - 1
          while (lines[cursor] === '' || groupHeading(lines[cursor])) cursor++
          if (!/^\| ---/u.test(lines[cursor + 1] || '')) break
        }
        // Regeneration replaces its own first group label along with the tables.
        let trailing = out.length - 1
        while (out[trailing] === '') trailing--
        if (groupHeading(out[trailing])) out.splice(trailing)
        if (part === 'response') {
          out.push('| 返回字段 | 类型 | 说明 |', '| --- | --- | --- |')
          for (const [name, type, description] of [
            ['result.code', 'integer', '业务结果码；成功为 0，错误复用正式码表。'],
            ['result.message', 'string', '业务结果提示。'],
            ['result.data', current.dataType === 'null' ? 'null' : `${current.dataType} / null`, '当前方法的业务返回内容；统一封装允许空 data。'],
          ]) {
            const old = originals.get(name)
            if (old) out.push(`| ${old.map(cell).join(' | ')} |`)
            else out.push(`| \`${name}\` | ${cell(type)} | ${description} |`)
          }
        }
        const fieldRows = new Map()
        for (const field of current[part] || []) {
          const old = originals.get(field.name)
          const description = old?.at(-1) || ''
          const generated = /^(解析器 |后端返回映射字段|由后端实际解析读取|当前参数白名单接受|读取 JSON 原值)/u.test(description) || /依据：`server\/[^`]+:\d+`。$/u.test(description)
          if (old && !generated) {
            if (part === 'parameters') {
              const accepted = new Set(requestFieldType(field).split(' | '))
              const authored = old[1].replaceAll('&#124;', '|').replaceAll('\\|', '|').split(' | ')
              if (!authored.every((type) => accepted.has(type.replace(/^array<.*>$/u, 'array')))) throw new Error(`人工字段类型超出后端解析器：${field.name}`)
            }
            fieldRows.set(field.name, part === 'parameters' ? `| \`${field.name}\` | ${cell(old[1])} | ${cell(old[2])} | ${cell(description)} |` : `| \`${field.name}\` | ${cell(field.type)} | ${cell(description)} |`)
          } else {
            const reference = field.source?.path ? ` 依据：\`${field.source.path}:${field.source.line}\`。` : ''
            fieldRows.set(field.name, part === 'parameters' ? `| \`${field.name}\` | ${cell(requestFieldType(field))} | ${cell(field.required)} | ${cell(field.description)}${reference} |` : `| \`${field.name}\` | ${cell(field.type)} | ${reference.trim() || '后端返回映射。'} |`)
          }
        }
        if (part === 'response') out.push('')
        const headers = part === 'parameters'
          ? ['| 字段 | 类型 | 必填条件 | 说明 |', '| --- | --- | --- | --- |']
          : ['| 返回字段 | 类型 | 说明 |', '| --- | --- | --- |']
        appendRPCFieldTables(out, headers, current[part] || [], (field) => fieldRows.get(field.name))
        continue
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

function appendRPCFieldTables(body, headers, fields, renderRow) {
  let currentGroup
  let count = 0
  for (const field of fields) {
    const name = field.name.replace(/^result\.data\./u, '')
    const parent = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : '顶层字段'
    if (parent !== currentGroup || count === 16) {
      if (currentGroup !== undefined) body.push('')
      body.push(`**${parent === '顶层字段' ? parent : `\`${parent}\``}${parent === currentGroup ? '（续）' : ''}**`, '', headers[0], headers[1])
      currentGroup = parent
      count = 0
    }
    body.push(renderRow(field))
    count++
  }
}

export function renderRPCDocumentation(catalog, source) {
  const { names: descriptions, manual } = assertRPCDocumentation(catalog.rpc, source)
  const names = new Map([...descriptions].map(([key, value]) => [key, value.label]))
  const parts = rpcDocumentationParts(source)
  const begin = source.indexOf(rpcDocsStart)
  const methods = new Set(Object.entries(catalog.rpc).flatMap(([domain, names]) => Object.values(names).map((method) => `${domain}.${method}`)))
  const cell = rpcTableCell
  const sourceRef = (field) => field.source?.path && field.source?.line ? ` 依据：\`${field.source.path}:${field.source.line}\`。` : ''
  const body = []
  for (const key of [...methods].sort()) {
    const [domainKey, method] = key.split('.')
    const contract = catalog.rpcCalls?.[domainKey]?.[method]
    if (!contract || !names.has(key)) throw new Error(`接口字段合同或中文名称缺失：${key}`)
    if (manual.has(key)) continue
    const fields = contract.parameters || []
    const response = contract.response || []
    const request = { jsonrpc: '2.0', method, params: contract.example.params, id: `rpc-demo-${key}` }
    const result = { jsonrpc: '2.0', id: request.id, result: { code: 0, ...(typeof contract.example.message === 'string' ? { message: contract.example.message } : {}), data: contract.example.data } }
    body.push(`#### ${names.get(key)} \`${key}\``, '', '##### 请求参数', '')
    appendRPCFieldTables(body, ['| 字段 | 类型 | 必填条件 | 说明 |', '| --- | --- | --- | --- |'], fields,
      (field) => `| \`${cell(field.name)}\` | ${cell(requestFieldType(field))} | ${cell(field.required)} | ${cell(field.description)}${sourceRef(field)} |`)
    body.push('', fields.length ? '对象引用、权限、状态和并发版本由后端校验。' : '此方法不读取业务参数；示例使用空对象。', '', '```json', JSON.stringify(request, null, 2), '```', '', '##### 返回结果', '', '| 返回字段 | 类型 | 说明 |', '| --- | --- | --- |', '| `result.code` | integer | 成功为 0；错误复用正式码表。 |', '| `result.message` | string | 业务结果提示。 |', `| \`result.data\` | ${cell(contract.dataType)}${contract.dataType === 'null' ? '' : ' / null'} | 当前方法的返回内容。 |`, '')
    appendRPCFieldTables(body, ['| 返回字段 | 类型 | 说明 |', '| --- | --- | --- |'], response,
      (field) => `| \`${cell(field.name)}\` | ${cell(field.type)} | ${sourceRef(field).trim() || '后端返回映射。'} |`)
    body.push('', '```json', JSON.stringify(result, null, 2), '```', '')
    if (contract.example.source) body.push(`样例依据：[${contract.example.test}](../${contract.example.source.path.replace(/^server\//u, '')}) 的隔离夹具成功调用，按当前后端字段结构核对；不代表该接口全部业务条件已验证。`, '')
    else body.push('样例依据：当前参数解析、DTO 与成功返回映射；业务执行仍需有效引用、当前版本及所属状态条件。', '')
    if (contract.example.verification?.source) body.push(`执行核对入口：[${contract.example.verification.test}/${contract.example.verification.case}](../${contract.example.verification.source.path.replace(/^server\//u, '')})；实际执行状态读取对应源码身份的原始回执。`, '')
  }
  const generated = `${rpcDocsStart}\n\n本节由 \`node scripts/gen-public-contracts.mjs\` 从后端解析器、DTO、返回映射和模拟样例生成；前文已维护的调用合同不在此重复。字段按所属对象分组，长表分段，完整路径保持可检索。\n\n所有方法共用以下阅读规则：必填、清空和条件分支按解析器及领域校验执行；返回字段的可见性由权限、状态和查询范围决定。JSON 只展示模拟值与数组示例项，完整字段见各组表格，不代表当前业务数据或第三方验收。\n\n${body.join('\n')}\n${rpcDocsEnd}`
  return begin >= 0 ? completeManualRPCTables(catalog, parts.before) + generated + completeManualRPCTables(catalog, parts.after) : `${completeManualRPCTables(catalog, source).trimEnd()}\n\n## 全量接口字段合同 / RPC Field Contracts\n\n${generated}\n`
}

export function syncRPCDocumentation(catalog, { repositoryRoot = root, check = false } = {}) {
  const relative = 'server/docs/api.md'
  const file = path.join(repositoryRoot, relative)
  const source = fs.readFileSync(file, 'utf8')
  const next = renderRPCDocumentation(catalog, source)
  if (next === source) return []
  if (check) throw new Error('接口字段合同未同步，请运行 node scripts/gen-public-contracts.mjs')
  fs.writeFileSync(file, next)
  return [relative]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.includes('--review')) {
      if (new Set(args).size !== args.length || args.some((arg) => !['--review', '--staged', '--json'].includes(arg))) throw new Error('合同比较仅支持 --review、--staged 与 --json')
      const { createRPCContractReview } = await import('./lib/rpc-contract-review-node.mjs')
      const report = await createRPCContractReview(root, { range: args.includes('--staged') ? 'staged' : 'worktree', generators: { loadCatalog, renderCatalog, syncOutputs, syncTaskDesignCatalog, syncRPCDocumentation } })
      console.log(args.includes('--json') ? JSON.stringify(report) : `[gen-public-contracts] ${report.changes.length} 个方法变化；${report.checks.filter((row) => row.status === 'failed').length} 项检查未通过`)
    } else if (args.includes('--verify-examples')) {
      if (args.length !== 1) throw new Error('样例执行核对仅支持 --verify-examples')
      const { verifyRPCDocumentedExamples } = await import('./lib/rpc-contract-review-node.mjs')
      const report = await verifyRPCDocumentedExamples(root)
      console.log(`[gen-public-contracts] 样例执行${report.status === 'passed' ? '通过' : '失败'}：${report.methods.length} 个接口；${report.receipt}`)
      if (report.status !== 'passed') process.exitCode = 1
    } else {
      if (args.some((arg) => arg !== '--check') || args.length > 1) throw new Error('仅支持生成、--check、--review 或 --verify-examples')
      const catalog = loadCatalog()
      const outputs = renderCatalog(catalog)
      const changed = [...syncOutputs(outputs, { check: args.includes('--check') }), ...syncTaskDesignCatalog(catalog, { check: args.includes('--check') }), ...syncRPCDocumentation(catalog, { check: args.includes('--check') })]
      console.log(`[gen-public-contracts] ${args.includes('--check') ? '检查通过' : `已同步 ${changed.length} 个文件`}`)
    }
  } catch (error) {
    console.error(`[gen-public-contracts] ${error.message}`)
    process.exitCode = 1
  }
}
