import { Remarkable } from 'remarkable'
import { extractMarkdownHeadings } from '../../common/components/markdown/anchors.mjs'
import { buildDevDocsLocation } from '../pages/devDocsNavigation.mjs'

export const INTEGRATION_API_DOCUMENT = 'server/docs/api.md'
export const INTEGRATION_GUIDE_DOCUMENT =
  'docs/engineering/跨层公共契约与生成规范.md'
export const INTEGRATION_PAGE_SIZE = 20
export const INTEGRATION_EVIDENCE_API =
  '/__dev/api/qa/quality-gates/integration-evidence'

const sectionCache = new Map()

function documentSections(source) {
  if (sectionCache.has(source)) return sectionCache.get(source)
  const tokens = new Remarkable().parse(source, {})
  const headings = extractMarkdownHeadings(source, [1, 2, 3, 4, 5, 6])
  const lines = source.split(/\r?\n/u)
  const ends = new Map()
  const following = []
  for (let index = tokens.length - 1; index >= 0; index--) {
    const token = tokens[index]
    if (token.type !== 'heading_open') continue
    while (following.length && tokens[following.at(-1)].hLevel > token.hLevel) following.pop()
    ends.set(index, following.at(-1) ?? tokens.length)
    following.push(index)
  }
  let headingIndex = 0
  const sections = tokens.flatMap((token, index) => {
    if (token.type !== 'heading_open') return []
    const nextIndex = ends.get(index)
    const end = nextIndex === tokens.length ? lines.length : tokens[nextIndex].lines[0]
    const heading = headings[headingIndex++]
    return [{
      heading,
      level: token.hLevel,
      names: codes(tokens[index + 1]),
      start: token.lines[0],
      end,
      bodyStart: token.lines[1],
      bodyLines: lines.slice(token.lines[1], end),
      source: lines.slice(token.lines[1], end).join('\n').trim(),
      tokens: tokens.slice(index + 1, nextIndex),
    }]
  })
  if (sectionCache.size >= 2) sectionCache.delete(sectionCache.keys().next().value)
  sectionCache.set(source, sections)
  return sections
}

function integrationTestReferences(tokens) {
  return [...new Set(tokens.flatMap((token) => (token.children || [])
    .filter((child) => child.type === 'link_open')
    .flatMap((child) => {
      try {
        const url = new URL(child.href, `https://source.local/${INTEGRATION_API_DOCUMENT}`)
        return url.origin === 'https://source.local' && !url.search && !url.hash &&
          /^\/server\/internal\/.+_test\.go$/u.test(url.pathname) ? [url.pathname.slice(1)] : []
      } catch { return [] }
    })))]
}

function callSection(section, validate) {
  if (!section) return null
  const fences = section.tokens.filter(
    (token) => token.type === 'fence' && token.params.trim() === 'json'
  )
  const table = section.tokens.find((token) => token.type === 'table_open')
  // Remarkable's table tokenizer splits escaped pipes as column boundaries.
  // Keep source cell boundaries so unions and parser expressions retain meaning.
  const rows = table ? section.bodyLines.slice(
    table.lines[0] - section.bodyStart, table.lines[1] - section.bodyStart
  ).filter((_, index) => index !== 1).map((line) => line.trim()
    .replace(/^\||\|$/gu, '').split(/(?<!\\)\|/u)
    .map((cell) => cell.trim().replaceAll('\\|', '|').replaceAll('&#124;', '|'))) : []
  const header = rows[0] || []
  const hasFields = /字段$/u.test(header[0] || '') && header[1] === '类型' &&
    (header.length === 3 || (header[2] === '必填条件' && header.length === 4))
  let example
  try {
    example = fences.length === 1 ? JSON.parse(fences[0].content) : null
  } catch {
    example = null
  }
  const source = section.bodyLines.filter((line, index) =>
    fences.every((token) => {
      const position = section.bodyStart + index
      return position < token.lines[0] || position >= token.lines[1]
    })
  ).join('\n').trim()
  return {
    source,
    fields: hasFields ? rows.slice(1).map((cells) => ({
      name: cells[0].replace(/^`([^`]+)`$/u, '$1'),
      type: cells[1],
      required: header.length === 4 ? cells[2] : '',
      description: cells[header.length - 1],
    })) : null,
    fieldHeader: hasFields ? header[0] : '',
    notesSource: hasFields ? section.bodyLines.filter((line, index) => {
      const position = section.bodyStart + index
      return (position < table.lines[0] || position >= table.lines[1]) &&
        fences.every((token) => position < token.lines[0] || position >= token.lines[1])
    }).join('\n').trim() : source,
    example: validate(example) ? example : null,
    invalidExample: fences.length > 0 && !validate(example),
  }
}

export function readIntegrationNames(source, rpcMethods) {
  const result = new Map()
  let domain = ''
  let row = null
  let namesTable = false
  for (const token of new Remarkable().parse(source, {})) {
    if (token.type === 'heading_open' && token.hLevel <= 3) domain = ''
    if (token.type === 'inline' && !row) {
      domain = codes(token).find((name) => Object.hasOwn(rpcMethods, name)) || domain
    }
    if (token.type === 'table_open') namesTable = false
    if (token.type === 'tr_open') row = []
    if (row && token.type === 'inline') row.push(token)
    if (token.type === 'tr_close' && row) {
      if (row.map((cell) => cell.content).join('|') === '方法|中文名称|用途') namesTable = true
      else if (domain && namesTable) {
        const method = codes(row[0])[0]
        if (!Object.values(rpcMethods[domain]).includes(method) || row.length !== 3 || !row[1].content.trim() || !row[2].content.trim()) {
          throw new Error('接口名称或用途与实际分发不一致')
        }
        const key = `${domain}.${method}`
        if (result.has(key)) throw new Error('接口名称重复登记')
        result.set(key, { label: row[1].content, description: row[2].content })
      }
      row = null
    }
    if (token.type === 'table_close') namesTable = false
  }
  return result
}

export function readIntegrationCallDetails(source, rpcMethods) {
  const sections = documentSections(source)
  const result = new Map()
  for (const section of sections) {
    if (section.level !== 4) continue
    const key = section.names.find((name) => {
      const [domain, method, extra] = name.split('.')
      return !extra && Object.hasOwn(rpcMethods, domain) &&
        Object.values(rpcMethods[domain]).includes(method)
    })
    if (!key) continue
    const child = (title) => sections.find(
      (item) => item.level === 5 && item.start > section.start &&
        item.end <= section.end && item.heading.title === title
    )
    const method = key.split('.')[1]
    const request = callSection(child('请求参数'), (value) =>
      value?.jsonrpc === '2.0' && value.method === method &&
      typeof value.id === 'string' && value.params !== null &&
      typeof value.params === 'object' && !Array.isArray(value.params)
    )
    const response = callSection(child('返回结果'), (value) =>
      value?.jsonrpc === '2.0' && typeof value.id === 'string' &&
      Number.isInteger(value.result?.code) &&
      (value.result.message === undefined || typeof value.result.message === 'string') &&
      (value.result.data === undefined || value.result.data === null ||
        (typeof value.result.data === 'object' && !Array.isArray(value.result.data)))
    )
    if (request || response) {
      if (result.has(key)) throw new Error('方法调用合同重复登记')
      result.set(key, {
        heading: section.heading,
        label: section.heading.title.replace(key, '').trim(),
        request,
        response,
        references: integrationTestReferences(section.tokens),
      })
    }
  }
  return result
}

export function readIntegrationBoundary(source) {
  const section = documentSections(source).find(
    (item) => item.level === 2 &&
      item.heading.title === '代表性接口合同与系统接入边界'
  )
  return section?.source.split(/\n\s*\n/u)[0] || ''
}

export function readIntegrationRelationshipExamples(source) {
  const section = documentSections(source).find(
    (item) => item.level === 3 &&
      item.heading.title === '接入关系展示 / Integration Relationships'
  )
  if (!section) return null
  const rows = []
  let row = null
  for (const token of section.tokens) {
    if (token.type === 'tr_open') row = []
    if (row && token.type === 'inline') row.push(token.content)
    if (token.type === 'tr_close' && row) {
      if (row.length === 3 && row[1].includes(' → ')) {
        rows.push({
          label: row[0],
          steps: row[1].split(' → ').map((step) => {
            const match = /^(.*?)（(.*?)）$/u.exec(step)
            return { title: match ? match[1] : step, description: match?.[2] || '' }
          }),
          note: row[2],
        })
      }
      row = null
    }
  }
  return rows.length ? {
    rows,
    location: buildDevDocsLocation({
      path: INTEGRATION_GUIDE_DOCUMENT,
      headingId: section.heading.id,
    }),
  } : null
}

export function integrationEndpoint(domain, transport) {
  return transport.path.replace('{url}', domain)
}

export function buildIntegrationCurl(entry, transport) {
  const example = entry.contract?.documentation?.request?.example
  if (!example) return ''
  const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`
  return [
    `curl --request ${transport.method}`,
    quote(`<服务地址>${integrationEndpoint(entry.domain, transport)}`),
    `--header ${quote('Content-Type: application/json')}`,
    `--header ${quote('Authorization: Bearer <访问令牌>')}`,
    `--data-raw ${quote(JSON.stringify(example))}`,
  ].join(' ')
}

export function readIntegrationGuide(source) {
  const title = '接入方式选择 / Integration Selection'
  const tokens = new Remarkable().parse(source, {})
  const index = tokens.findIndex(
    (token, position) =>
      token.type === 'heading_open' &&
      token.hLevel === 3 &&
      tokens[position + 1]?.content === title
  )
  if (index < 0) return null
  const start = tokens[index]
  const end = tokens
    .slice(index + 1)
    .find((token) => token.type === 'heading_open' && token.hLevel <= start.hLevel)
  const markdown = source
    .split(/\r?\n/u)
    .slice(start.lines[1], end?.lines[0])
    .join('\n')
    .trim()
  if (!markdown) return null
  const contentTokens = new Remarkable().parse(markdown, {})
  const table = contentTokens.find((token) => token.type === 'table_open')
  const note = table && contentTokens.find((token) =>
    token.type === 'paragraph_open' && token.lines[0] >= table.lines[1]
  )
  const lines = markdown.split(/\r?\n/u)
  const heading = extractMarkdownHeadings(source, [3]).find(
    (item) => item.title === title
  )
  return {
    source: markdown,
    selectionSource: table ? lines.slice(0, table.lines[1]).join('\n') : markdown,
    boundarySource: note ? lines.slice(...note.lines).join('\n') : '',
    detailsSource: note ? lines.slice(note.lines[1]).join('\n').trim() : '',
    location: buildDevDocsLocation({
      path: INTEGRATION_GUIDE_DOCUMENT,
      headingId: heading.id,
    }),
  }
}

// Scenario identities and method associations are read from the formal API
// table; this projection owns no independent scenario catalogue.
export function readIntegrationScenarios(source) {
  const tokens = new Remarkable().parse(source, {})
  const scenarios = []
  let active = false
  let row = null
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token.type === 'heading_open' && token.hLevel <= 2) {
      active = tokens[index + 1]?.content === '模拟消费者与接入验证'
    }
    if (!active) continue
    if (token.type === 'tr_open') row = []
    if (row && token.type === 'inline') row.push(token)
    if (token.type !== 'tr_close' || !row) continue
    const test = codes(row[3]).find((value) =>
      /^TestSourceDocumentPostgresIntegration\w+$/u.test(value)
    )
    if (test) {
      const methods = codes(row[1]).flatMap((value) => {
        let domain = ''
        return value.split(/\s*\/\s*/u).flatMap((part) => {
          const pieces = part.split('.')
          if (pieces.length === 2) {
            const [qualifiedDomain] = pieces
            domain = qualifiedDomain
            return [part]
          }
          return domain && pieces.length === 1 ? [`${domain}.${part}`] : []
        })
      })
      if (scenarios.some((item) => item.test === test)) {
        throw new Error('模拟场景重复登记')
      }
      scenarios.push({
        test,
        label: row[0].content,
        methods: [...new Set(methods)],
      })
    }
    row = null
  }
  return scenarios
}

export async function readIntegrationEvidence({
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const response = await fetchImpl(INTEGRATION_EVIDENCE_API, {
    signal,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('场景运行证据读取失败')
  const value = await response.json()
  if (
    value?.kind !== 'plush.integration-evidence' ||
    typeof value.current !== 'boolean' ||
    !Array.isArray(value.scenarios) ||
    value.scenarios.length > 50 ||
    (value.current && !value.run) ||
    (value.run &&
      (!['passed', 'failed'].includes(value.run.status) ||
        typeof value.run.cleanupComplete !== 'boolean' ||
        !/^output\/dev-workbench\/database\/ci-[a-z0-9_-]+\.json$/u.test(
          value.run.receipt || ''
        ) ||
        (value.run.repository &&
          (!/^[a-f0-9]{40,64}$/u.test(value.run.repository.commit || '') ||
            !/^[a-f0-9]{64}$/u.test(
              value.run.repository.fingerprint || ''
            ))))) ||
    value.scenarios.some(
      (row) =>
        !/^TestSourceDocumentPostgresIntegration\w+$/u.test(row.test || '') ||
        typeof row.label !== 'string' ||
        row.label.length > 200 ||
        !Array.isArray(row.methods) ||
        row.methods.some(
          (method) => !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/u.test(method)
        ) ||
        !['passed', 'failed', 'skipped', 'missing'].includes(row.status)
    )
  ) {
    throw new Error('场景运行证据不完整')
  }
  return value
}

const codes = (token) =>
  (token?.children || [])
    .filter((child) => child.type === 'code')
    .map((child) => child.content)

// References come from the existing API document. A method mention is only a
// chapter reference; only an explicit domain/method table row is a detail contract.
export function readIntegrationContracts(source, rpcMethods) {
  const tokens = new Remarkable().parse(source, {})
  const headings = extractMarkdownHeadings(source, [1, 2, 3, 4, 5, 6])
  const result = new Map()
  let headingIndex = 0
  let heading = null
  let domain = ''
  let row = null
  let namesTable = false
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token.type === 'heading_open') {
      heading = headings[headingIndex++]
      if (token.hLevel <= 3) domain = ''
      const names = codes(tokens[index + 1])
      domain = names.find((name) => Object.hasOwn(rpcMethods, name)) || domain
      for (const name of names) {
        const [qualifiedDomain, method, extra] = name.split('.')
        if (
          !extra &&
          !result.has(name) &&
          Object.values(rpcMethods[qualifiedDomain] || {}).includes(method)
        ) {
          result.set(name, { kind: 'chapter', heading, references: [] })
        }
      }
    }
    if (token.type === 'table_open') namesTable = false
    if (token.type === 'tr_open') row = []
    if (row && token.type === 'inline') row.push(token)
    if (token.type === 'tr_close' && row) {
      if (row.map((cell) => cell.content).join('|') === '方法|中文名称|用途') namesTable = true
      const identity = codes(row[0])
        .map((value) => value.split('/').map((part) => part.trim()))
        .find((parts) => parts.length === 2)
      if (
        identity &&
        Object.values(rpcMethods[identity[0]] || {}).includes(identity[1]) &&
        row.length >= 4
      ) {
        const references = row.flatMap((cell) =>
          (cell.children || [])
            .filter((child) => child.type === 'link_open')
            .flatMap((child) => {
              try {
                const url = new URL(
                  child.href,
                  `https://source.local/${INTEGRATION_API_DOCUMENT}`
                )
                return url.origin === 'https://source.local' &&
                  !url.search &&
                  !url.hash &&
                  /^\/server\/internal\/.+_test\.go$/u.test(url.pathname)
                  ? [url.pathname.slice(1)]
                  : []
              } catch {
                return []
              }
            })
        )
        result.set(identity.join('.'), {
          kind: 'detail',
          heading,
          fields: row[1].content,
          authorization: row[2].content,
          retry: row[3].content,
          references: [...new Set(references)],
        })
      }
      row = null
    }
    if (token.type === 'table_close') namesTable = false
    if (token.type === 'inline' && domain && !namesTable) {
      for (const method of codes(token)) {
        const key = `${domain}.${method}`
        if (
          !result.has(key) &&
          Object.values(rpcMethods[domain]).includes(method)
        ) {
          result.set(key, { kind: 'chapter', heading, references: [] })
        }
      }
    }
  }
  for (const [key, documentation] of readIntegrationCallDetails(source, rpcMethods)) {
    const contract = result.get(key) || {
      kind: 'chapter', heading: documentation.heading, references: [],
    }
    result.set(key, { ...contract, references: [...new Set([...contract.references, ...documentation.references])], documentation })
  }
  return result
}

export function buildIntegrationEntries(rpcMethods, source, inspections = {}) {
  const contracts = readIntegrationContracts(source, rpcMethods)
  const names = readIntegrationNames(source, rpcMethods)
  const domainLabels = new Map(documentSections(source)
    .filter((section) => section.level === 3)
    .flatMap((section) => section.names
      .filter((name) => Object.hasOwn(rpcMethods, name))
      .map((name) => [name, { label: section.heading.title.replace(name, '').trim() || name, heading: section.heading }])))
  return Object.entries(rpcMethods)
    .flatMap(([domain, methods]) =>
      [...new Set(Object.values(methods))].map((method) => ({
        key: `${domain}.${method}`,
        domain,
        domainLabel: domainLabels.get(domain)?.label || domain,
        purposeLocation: domainLabels.has(domain) ? buildDevDocsLocation({
          path: INTEGRATION_API_DOCUMENT, headingId: domainLabels.get(domain).heading.id,
        }) : null,
        method,
        ...names.get(`${domain}.${method}`),
        inspection: inspections[domain]?.[method] || null,
        contract: contracts.get(`${domain}.${method}`) || null,
      }))
    )
    .sort((left, right) => left.key.localeCompare(right.key, 'en'))
}

export function integrationContractLocation(contract) {
  return buildDevDocsLocation({
    path: INTEGRATION_API_DOCUMENT,
    headingId: contract?.documentation?.heading?.id || contract?.heading?.id || '',
  })
}

// This is the permission registry's explanation, not the current caller's grant
// or a proof that all handler conditions have been enumerated.
export function integrationPermissions(permissions = []) {
  const byMethod = new Map()
  for (const permission of permissions) {
    if (!permission || typeof permission.permission_key !== 'string') {
      throw new Error('权限登记缺少权限标识')
    }
    const methods = Array.isArray(permission.usage?.backend_methods)
      ? permission.usage.backend_methods
      : []
    for (const reference of methods) {
      if (
        !reference ||
        typeof reference.domain !== 'string' ||
        typeof reference.method !== 'string'
      ) {
        throw new Error('权限登记的方法关联不完整')
      }
      const key = `${reference.domain}.${reference.method}`
      const values = byMethod.get(key) || []
      if (!values.some((item) => item.key === permission.permission_key)) {
        values.push({
          key: permission.permission_key,
          name: permission.name || permission.permission_key,
          conditions: Array.isArray(permission.usage.conditions)
            ? permission.usage.conditions
            : [],
        })
      }
      byMethod.set(key, values)
    }
  }
  return byMethod
}

export function parseIntegrationSearch(search) {
  const params = new URLSearchParams(search)
  const value = (key) =>
    params.getAll(key).length === 1 ? params.get(key) : ''
  const rawPage = value('page')
  const view = value('view')
  const defaultView = value('node') ? 'guide' : 'inventory'
  return {
    view: ['inventory', 'guide'].includes(view) ? view : defaultView,
    domain: value('domain'),
    q: value('q'),
    rpc: value('rpc'),
    detail: ['request', 'response', 'governance'].includes(value('detail'))
      ? value('detail') : 'request',
    section: ['access', 'permissions', 'contract', 'evidence'].includes(value('section'))
      ? value('section') : '',
    format: value('format') === 'curl' ? 'curl' : 'json',
    example: value('example'),
    page: /^[1-9]\d{0,5}$/u.test(rawPage) ? Number(rawPage) : 1,
    node: value('node'),
  }
}

export function filterIntegrationEntries(entries, { domain = '', q = '' }) {
  const words = q.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  return entries.filter(
    (entry) =>
      (!domain || entry.domain === domain) &&
      words.every((word) =>
        (`${entry.key} ${entry.domainLabel || ''} ${entry.label || ''} ${entry.description || ''} ${entry.contract?.documentation?.label || ''}`)
          .toLowerCase().includes(word)
      )
  )
}
