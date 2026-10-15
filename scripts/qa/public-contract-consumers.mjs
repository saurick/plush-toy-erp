import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { PermissionCode } from '../../web/src/common/consts/permissions.generated.mjs'
import { RpcDomain, RpcMethod } from '../../web/src/common/consts/rpcMethods.generated.mjs'
import * as statuses from '../../web/src/common/consts/statuses.generated.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// ESLint is an explicit Web dependency; its parser also understands JSX and
// import attributes. A regex cannot distinguish object keys from comments.
const { Linter } = createRequire(path.join(root, 'web/package.json'))('eslint')
const permissionValues = new Set(Object.values(PermissionCode))
const tables = { PermissionCode, RpcDomain, ...statuses }

function propertyName(node) {
  return node.computed ? (node.property.type === 'Literal' ? node.property.value : null) : node.property.name
}

function domainOf(node) {
  if (node?.type === 'Literal') return node.value
  if (node?.type === 'MemberExpression' && node.object.name === 'RpcDomain') return RpcDomain[propertyName(node)]
  return null
}

export function checkConsumerSource(source, filename = 'consumer.mjs') {
  const rule = {
    create(context) {
      const clients = new Map()
      const calls = []
      const report = (node, message) => context.report({ node, message })
      return {
        Literal(node) {
          // Object field names have their own domain (e.g. audit events).
          // Check permission values and call arguments, not coincident keys.
          if (node.parent.type === 'Property' && node.parent.key === node) return
          if (permissionValues.has(node.value)) report(node, `权限值 ${node.value} 必须引用 PermissionCode`)
        },
        MemberExpression(node) {
          const name = propertyName(node)
          if (name === null) return
          const table = tables[node.object.name]
          if (table && !Object.hasOwn(table, name)) report(node, `未定义的公共契约 ${node.object.name}.${name}`)
          if (node.object.name === 'RpcMethod' && !Object.hasOwn(RpcMethod, name)) report(node, `未定义的 RPC 域 ${name}`)
          if (node.object.type === 'MemberExpression' && node.object.object.name === 'RpcMethod') {
            const domain = propertyName(node.object)
            if (domain !== null && !Object.hasOwn(RpcMethod[domain] || {}, name)) report(node, `未定义的 RPC 方法 ${domain}.${name}`)
          }
        },
        ImportDeclaration(node) {
          for (const specifier of node.specifiers) {
            if (specifier.imported?.name === 'adminRpc' && /adminRpc/u.test(node.source.value)) clients.set(specifier.local.name, 'admin')
          }
        },
        NewExpression(node) {
          if (node.callee.name !== 'JsonRpc') return
          const url = node.arguments[0]?.properties?.find((item) => item.key.name === 'url')?.value
          const domain = domainOf(url)
          if (url?.type === 'Literal') report(url, 'RPC 域必须引用 RpcDomain')
          if (node.parent.type === 'VariableDeclarator' && domain) clients.set(node.parent.id.name, domain)
        },
        CallExpression(node) {
          if (node.callee.type === 'MemberExpression' && propertyName(node.callee) === 'call') calls.push(node)
          if (node.callee.type === 'Identifier' && /^(?:has|require)(?:Any|All)?(?:Action)?Permission$/u.test(node.callee.name)) {
            for (const arg of node.arguments) {
              if (arg.type === 'Literal' && typeof arg.value === 'string' && !permissionValues.has(arg.value)) report(arg, `未知权限 ${arg.value}`)
            }
          }
        },
        'Program:exit'() {
          for (const node of calls) {
            const domain = clients.get(node.callee.object.name)
            if (!domain) continue
            const method = node.arguments[0]
            if (method?.type === 'Literal') report(method, `RPC 方法必须引用 RpcMethod.${domain}`)
            if (method?.type === 'MemberExpression' && method.object.type === 'MemberExpression' && method.object.object.name === 'RpcMethod') {
              const supplied = propertyName(method.object)
              if (supplied !== null && supplied !== domain) report(method, `RPC 方法域 ${supplied} 与客户端 ${domain} 不一致`)
            }
          }
        },
      }
    },
  }
  return new Linter().verify(source, [{
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { contracts: { rules: { references: rule } } },
    rules: { 'contracts/references': 'error' },
  }], { filename, allowInlineConfig: false, reportUnusedDisableDirectives: false })
}

export function checkConsumers(directory = path.join(root, 'web/src')) {
  const errors = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) errors.push(...checkConsumers(target))
    else if (/\.(?:js|mjs|jsx)$/u.test(entry.name) && !/\.(?:test|generated)\./u.test(entry.name)) {
      for (const result of checkConsumerSource(fs.readFileSync(target, 'utf8'), target)) {
        errors.push(`${path.relative(root, target)}:${result.line || 1}: ${result.message}`)
      }
    }
  }
  return errors
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = checkConsumers()
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
  else console.log('[public-contract-consumers] 通过')
}
