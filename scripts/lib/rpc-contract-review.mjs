const GENERATED_START = '<!-- BEGIN GENERATED RPC FIELD CONTRACTS -->'
const GENERATED_END = '<!-- END GENERATED RPC FIELD CONTRACTS -->'

export function rpcDocumentationParts(source) {
  const begin = source.indexOf(GENERATED_START)
  const end = source.indexOf(GENERATED_END)
  if ((begin < 0) !== (end < 0) || (begin >= 0 && (end <= begin || source.indexOf(GENERATED_START, begin + 1) >= 0 || source.indexOf(GENERATED_END, end + 1) >= 0))) {
    throw new Error('接口字段合同生成标记缺失、重复或顺序错误')
  }
  return begin < 0 ? { before: source, after: '', generated: '' } : {
    before: source.slice(0, begin), after: source.slice(end + GENERATED_END.length),
    generated: source.slice(begin, end + GENERATED_END.length),
  }
}

const cells = (line) => line.trim().replace(/^\||\|$/gu, '').split(/(?<!\\)\|/u)
  .map((value) => value.trim().replaceAll('\\|', '|').replaceAll('&#124;', '|'))

// Method tables and authored call sections are inputs. Generated call sections
// may be stale before generation and are checked by the normal output diff.
export function inspectRPCDocumentation(rpc, source) {
  const { before, after } = rpcDocumentationParts(source)
  const expected = new Set(Object.entries(rpc).flatMap(([domain, methods]) => Object.values(methods).map((method) => `${domain}.${method}`)))
  const names = new Map()
  const manual = new Set()
  const issues = []
  let domain = ''
  let table = false
  let fence = null
  for (const [index, line] of `${before}\n${after}`.split(/\r?\n/u).entries()) {
    const marker = /^\s*(`{3,}|~{3,})/u.exec(line)?.[1]
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      continue
    }
    if (fence) continue
    if (/^#{1,3} /u.test(line)) {
      domain = /^### .*`([a-z_]+)`\s*$/u.exec(line)?.[1] || ''
      table = false
    }
    if (line.trim().startsWith('|')) {
      const values = cells(line)
      if (values.join('|') === '方法|中文名称|用途') { table = true; continue }
      if (!table || values.every((value) => /^:?-+:?$/u.test(value))) continue
      const method = /^`([a-z_]+)`$/u.exec(values[0])?.[1]
      const key = `${domain}.${method || values[0]}`
      if (!domain || !method || values.length !== 3 || !values[1] || !values[2]) issues.push({ key, reason: '接口名称或用途缺失', line: index + 1 })
      else if (!expected.has(key)) issues.push({ key, reason: '方法表包含未登记或已删除接口', line: index + 1 })
      else if (names.has(key)) issues.push({ key, reason: '接口名称重复登记', line: index + 1 })
      else names.set(key, { label: values[1], description: values[2] })
    } else {
      table = false
    }
    if (/^#### /u.test(line)) {
      for (const match of line.matchAll(/`([a-z_]+\.[a-z_]+)`/gu)) {
        const key = match[1]
        if (!expected.has(key)) issues.push({ key, reason: '人工调用合同引用未登记或已删除接口', line: index + 1 })
        else if (manual.has(key)) issues.push({ key, reason: '人工调用合同重复登记', line: index + 1 })
        else manual.add(key)
      }
    }
  }
  for (const key of [...expected].sort()) {
    if (!names.has(key)) issues.push({ key, reason: '接口中文名称或用途缺失' })
  }
  return { names, manual, issues }
}

export function assertRPCDocumentation(rpc, source) {
  const result = inspectRPCDocumentation(rpc, source)
  if (result.issues.length) throw new Error(`接口目录不一致：${result.issues.map((issue) => `${issue.key} ${issue.reason}`).join('；')}`)
  return result
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => [key, stable(item)]))
}

function fieldContract(field, request) {
  const result = { type: field.type }
  if (request) {
    result.required = field.required || '可选'
    result.nullable = field.nullable === true
    if (field.requiredWhen?.length) result.requiredWhen = field.requiredWhen
    // Descriptions carry parser defaults; source paths and line numbers do not.
    result.description = field.description || ''
  }
  return stable(result)
}

export function normalizeRPCCatalog(catalog, apiSource) {
  const { names } = inspectRPCDocumentation(catalog.rpc, apiSource)
  return Object.fromEntries(Object.entries(catalog.rpc).flatMap(([domain, methods]) => Object.values(methods).map((method) => {
    const key = `${domain}.${method}`
    const call = catalog.rpcCalls?.[domain]?.[method]
    if (!call) throw new Error(`接口字段合同缺失：${key}`)
    return [key, {
      label: names.get(key)?.label || method, description: names.get(key)?.description || '',
      dataType: call.dataType,
      parameters: Object.fromEntries((call.parameters || []).map((field) => [field.name, fieldContract(field, true)])),
      response: Object.fromEntries((call.response || []).map((field) => [field.name, fieldContract(field, false)])),
      source: catalog.rpcInspection?.[domain]?.[method]?.entry?.path || null,
      sources: [...new Set([catalog.rpcInspection?.[domain]?.[method]?.entry?.path, ...(call.parameters || []).map((field) => field.source?.path), ...(call.response || []).map((field) => field.source?.path)].filter(Boolean))].sort(),
      sample: { basis: call.example.basis, test: call.example.test || null, verification: call.example.verification ? { test: call.example.verification.test, case: call.example.verification.case } : null },
      example: stable({ params: call.example.params, data: call.example.data, message: call.example.message }),
    }]
  })).sort(([a], [b]) => a.localeCompare(b, 'en')))
}

const render = (value) => value === undefined ? '未定义' : typeof value === 'string' ? value : JSON.stringify(stable(value))

export function compareRPCContracts(baseline, current) {
  const changes = []
  for (const key of [...new Set([...Object.keys(baseline), ...Object.keys(current)])].sort()) {
    const before = baseline[key]
    const after = current[key]
    const fields = []
    if (!before || !after) fields.push({ path: 'method', kind: before ? 'removed' : 'added', before: before ? key : null, after: after ? key : null })
    else {
      for (const property of ['label', 'description', 'dataType']) {
        if (before[property] !== after[property]) fields.push({ path: property, kind: 'changed', before: render(before[property]), after: render(after[property]) })
      }
      if (JSON.stringify(stable(before.sample)) !== JSON.stringify(stable(after.sample))) fields.push({ path: 'sample.source', kind: 'changed', before: render(before.sample), after: render(after.sample) })
      if (JSON.stringify(stable(before.example)) !== JSON.stringify(stable(after.example))) fields.push({ path: 'sample.content', kind: 'changed', before: '基线请求与返回样例', after: '请求或返回样例内容已变化' })
      for (const group of ['parameters', 'response']) {
        for (const name of [...new Set([...Object.keys(before[group]), ...Object.keys(after[group])])].sort()) {
          const left = before[group][name]
          const right = after[group][name]
          if (JSON.stringify(stable(left)) === JSON.stringify(stable(right))) continue
          if (!left || !right) fields.push({ path: `${group}.${name}`, kind: left ? 'removed' : 'added', before: left ? render(left) : null, after: right ? render(right) : null })
          else for (const property of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
            if (JSON.stringify(stable(left[property])) !== JSON.stringify(stable(right[property]))) fields.push({ path: `${group}.${name}.${property}`, kind: 'changed', before: render(left[property]), after: render(right[property]) })
          }
        }
      }
    }
    if (fields.length) changes.push({ key, label: after?.label || before.label, kind: before ? after ? 'changed' : 'removed' : 'added', fields, source: after?.source || before?.source || null, sample: after?.sample || null })
  }
  return changes
}

export const RPC_CONTRACT_SOURCE_PATTERN = /^(?:server\/(?:cmd\/public-contracts\/|internal\/(?:biz|service|buildinfo|projectmanuals|core\/(?:qualitycheck|status|value))\/|api\/jsonrpc\/|docs\/api\.md$)|scripts\/(?:gen-public-contracts(?:\.test)?\.mjs$|lib\/rpc-contract-review[^/]*\.mjs$)|web\/src\/(?:common\/consts\/[^/]+\.generated\.mjs$|dev-workbench\/config\/rpcInspection\.generated\.mjs$))/u

export function requiresRPCContractCheck(files) {
  return files.some((file) => RPC_CONTRACT_SOURCE_PATTERN.test(file))
}
