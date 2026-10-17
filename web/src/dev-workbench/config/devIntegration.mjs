import { Remarkable } from 'remarkable'
import { extractMarkdownHeadings } from '../../common/components/markdown/anchors.mjs'
import { buildDevDocsLocation } from '../pages/devDocsNavigation.mjs'

export const INTEGRATION_API_DOCUMENT = 'server/docs/api.md'
export const INTEGRATION_PAGE_SIZE = 20

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
    if (token.type === 'tr_open') row = []
    if (row && token.type === 'inline') row.push(token)
    if (token.type === 'tr_close' && row) {
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
    if (token.type === 'inline' && domain) {
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
  return result
}

export function buildIntegrationEntries(rpcMethods, source) {
  const contracts = readIntegrationContracts(source, rpcMethods)
  return Object.entries(rpcMethods)
    .flatMap(([domain, methods]) =>
      [...new Set(Object.values(methods))].map((method) => ({
        key: `${domain}.${method}`,
        domain,
        method,
        contract: contracts.get(`${domain}.${method}`) || null,
      }))
    )
    .sort((left, right) => left.key.localeCompare(right.key, 'en'))
}

export function integrationContractLocation(contract) {
  return buildDevDocsLocation({
    path: INTEGRATION_API_DOCUMENT,
    headingId: contract?.heading?.id || '',
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
  return {
    domain: value('domain'),
    q: value('q'),
    rpc: value('rpc'),
    page: /^[1-9]\d{0,5}$/u.test(rawPage) ? Number(rawPage) : 1,
    node: value('node'),
  }
}

export function filterIntegrationEntries(entries, { domain = '', q = '' }) {
  const words = q.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  return entries.filter(
    (entry) =>
      (!domain || entry.domain === domain) &&
      words.every((word) => entry.key.toLowerCase().includes(word))
  )
}
