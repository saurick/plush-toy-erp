import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { PermissionCode } from '../../web/src/common/consts/permissions.generated.mjs'
import { RpcDomain, RpcMethod, RpcTransport } from '../../web/src/common/consts/rpcMethods.generated.mjs'
import * as statuses from '../../web/src/common/consts/statuses.generated.mjs'
import * as policies from '../../web/src/common/consts/policies.generated.mjs'
import { NumericContract } from '../../web/src/common/consts/numeric.generated.mjs'
import { AttachmentPolicy } from '../../web/src/common/consts/attachments.generated.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// ESLint is an explicit Web dependency; its parser also understands JSX and
// import attributes. A regex cannot distinguish object keys from comments.
const { Linter } = createRequire(path.join(root, 'web/package.json'))('eslint')
const permissionValues = new Set(Object.values(PermissionCode))
const tables = { PermissionCode, RpcDomain, RpcMethod, RpcTransport, NumericContract, AttachmentPolicy, ...statuses, ...policies }
const contractModules = {
  'permissions.generated.mjs': { PermissionCode },
  'rpcMethods.generated.mjs': { RpcDomain, RpcMethod, RpcTransport },
  'statuses.generated.mjs': statuses,
  'policies.generated.mjs': policies,
  'numeric.generated.mjs': { NumericContract },
  'attachments.generated.mjs': { AttachmentPolicy },
}

function propertyName(node) {
  return node.computed ? (node.property.type === 'Literal' ? node.property.value : null) : node.property.name
}

export function checkConsumerSource(source, filename = 'consumer.mjs') {
  const rule = {
    create(context) {
      const clients = new Map()
      const calls = []
      const report = (node, message) => context.report({ node, message })
      const variableOf = (node) => {
        for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
          const variable = scope.set.get(node.name)
          if (variable) return variable
        }
        return null
      }
      const imported = (node) => {
        if (node?.type !== 'Identifier') return null
        const definition = variableOf(node)?.defs[0]
        if (definition?.type !== 'ImportBinding') return null
        return { specifier: definition.node, source: definition.parent.source.value }
      }
      const contractOf = (node, seen = new Set()) => {
        if (node?.type === 'Identifier') {
          const variable = variableOf(node)
          const binding = imported(node)
          if (binding) {
            const module = contractModules[path.posix.basename(binding.source)]
            if (!module) return null
            if (binding.specifier.type === 'ImportNamespaceSpecifier') return { value: module, keys: [] }
            const name = binding.specifier.imported?.name
            return Object.hasOwn(module, name) ? { value: module[name], name, keys: [] } : null
          }
          if (!variable && Object.hasOwn(tables, node.name)) return { value: tables[node.name], name: node.name, keys: [] }
          const definition = variable?.defs[0]
          if (seen.has(variable) || definition?.node.type !== 'VariableDeclarator' || definition.node.id.type !== 'Identifier' || definition.parent.kind !== 'const') return null
          seen.add(variable)
          return contractOf(definition.node.init, seen)
        }
        if (node?.type !== 'MemberExpression') return null
        const parent = contractOf(node.object, seen)
        const key = propertyName(node)
        if (!parent || parent.invalid || key === null) return null
        const name = parent.name || key
        const keys = parent.name ? [...parent.keys, key] : []
        if (!parent.value || !Object.hasOwn(parent.value, key)) return { invalid: true, name, keys }
        return { value: parent.value[key], name, keys }
      }
      const permissionArgument = (node, seen = new Set()) => {
        if (node?.type === 'Literal' && typeof node.value === 'string') {
          if (!permissionValues.has(node.value)) report(node, `未知权限 ${node.value}`)
        } else if (node?.type === 'ArrayExpression') {
          node.elements.forEach((element) => permissionArgument(element, seen))
        } else if (node?.type === 'SpreadElement') {
          permissionArgument(node.argument, seen)
        } else if (node?.type === 'Identifier') {
          const variable = variableOf(node)
          const definition = variable?.defs[0]
          if (!seen.has(variable) && definition?.node.type === 'VariableDeclarator' && definition.parent.kind === 'const') {
            seen.add(variable)
            permissionArgument(definition.node.init, seen)
          }
        }
      }
      return {
        Literal(node) {
          // Object field names have their own domain (e.g. audit events).
          // Check permission values and call arguments, not coincident keys.
          if (node.parent.type === 'Property' && node.parent.key === node) return
          if (permissionValues.has(node.value)) report(node, `权限值 ${node.value} 必须引用 PermissionCode`)
        },
        MemberExpression(node) {
          const contract = contractOf(node)
          if (contract?.invalid) report(node, `未定义的公共契约 ${[contract.name, ...contract.keys].join('.')}`)
        },
        ImportDeclaration(node) {
          for (const specifier of node.specifiers) {
            if (specifier.imported?.name === 'adminRpc' && /adminRpc/u.test(node.source.value)) clients.set(variableOf(specifier.local) || specifier.local.name, 'admin')
          }
        },
        NewExpression(node) {
          const binding = imported(node.callee)
          if (binding ? binding.specifier.imported?.name !== 'JsonRpc' || !/jsonRpc/u.test(binding.source) : node.callee.name !== 'JsonRpc' || variableOf(node.callee)) return
          const url = node.arguments[0]?.properties?.find((item) => item.key.name === 'url')?.value
          const contract = contractOf(url)
          const domain = contract?.name === 'RpcDomain' ? contract.value : url?.value
          if (url?.type === 'Literal') report(url, 'RPC 域必须引用 RpcDomain')
          if (node.parent.type === 'VariableDeclarator' && typeof domain === 'string') clients.set(variableOf(node.parent.id) || node.parent.id.name, domain)
        },
        CallExpression(node) {
          if (node.callee.type === 'MemberExpression' && propertyName(node.callee) === 'call') calls.push(node)
          if (node.callee.type === 'Identifier' && /^(?:has|require)(?:Any|All)?(?:Action)?Permission$/u.test(node.callee.name)) {
            node.arguments.forEach((arg) => permissionArgument(arg))
          }
        },
        'Program:exit'() {
          for (const node of calls) {
            const domain = clients.get(variableOf(node.callee.object) || node.callee.object.name)
            if (!domain) continue
            const method = node.arguments[0]
            if (method?.type === 'Literal') report(method, `RPC 方法必须引用 RpcMethod.${domain}`)
            const contract = contractOf(method)
            if (contract?.name === 'RpcMethod' && !contract.invalid) {
              const supplied = contract.keys[0]
              if (supplied && supplied !== domain) report(method, `RPC 方法域 ${supplied} 与客户端 ${domain} 不一致`)
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

// Deployment scripts remain portable: check their actual RPC envelopes and
// local transport wrappers without adding a Web runtime dependency to them.
export function checkScriptConsumerSource(source, filename = 'script.mjs', rpcCatalog = RpcMethod) {
  const rule = {
    create(context) {
      const calls = []
      const values = (node) => node?.type === 'Literal' && typeof node.value === 'string'
        ? [node.value]
        : node?.type === 'ConditionalExpression' ? [...values(node.consequent), ...values(node.alternate)] : []
      const domainOfURL = (node) => {
        const texts = node?.type === 'TemplateLiteral' ? node.quasis.map((part) => part.value.cooked) : values(node)
        return texts.map((text) => text?.match(/\/rpc\/([a-z_]+)$/u)?.[1]).find(Boolean)
      }
      const visit = (node, callback) => {
        if (!node || typeof node !== 'object') return
        if (node.type) callback(node)
        for (const [key, child] of Object.entries(node)) {
          if (key === 'parent') continue
          if (Array.isArray(child)) child.forEach((item) => visit(item, callback))
          else if (child?.type) visit(child, callback)
        }
      }
      const check = (domain, node) => {
        if (!domain || !values(node).length) return
        if (!Object.hasOwn(rpcCatalog, domain)) {
          context.report({ node, message: `未定义的脚本 RPC 域 ${domain}` })
          return
        }
        const methods = new Set(Object.values(rpcCatalog[domain]))
        for (const method of values(node)) {
          if (!methods.has(method)) context.report({ node, message: `未定义的脚本 RPC 方法 ${domain}.${method}` })
        }
      }
      const wrapper = (call) => {
        if (call.callee.type !== 'Identifier') return null
        let definition
        for (let scope = context.sourceCode.getScope(call.callee); scope; scope = scope.upper) {
          const variable = scope.set.get(call.callee.name)
          if (variable) { definition = variable.defs[0]?.node; break }
        }
        const fn = definition?.type === 'VariableDeclarator' ? definition.init : definition
        if (!['FunctionDeclaration', 'ArrowFunctionExpression', 'FunctionExpression'].includes(fn?.type)) return null
        const methodIndex = fn.params.findIndex((param) => param.name === 'method')
        if (methodIndex < 0) return null
        const domains = new Set()
        let domainIndex = -1
        visit(fn.body, (node) => {
          const domain = domainOfURL(node)
          if (domain) domains.add(domain)
          if (node.type === 'TemplateLiteral') {
            node.quasis.forEach((part, index) => {
              if (part.value.cooked?.endsWith('/rpc/') && node.expressions[index]?.type === 'Identifier') {
                domainIndex = fn.params.findIndex((param) => param.name === node.expressions[index].name)
              }
            })
          }
        })
        const domain = domainIndex >= 0 ? values(call.arguments[domainIndex])[0] : domains.size === 1 ? [...domains][0] : null
        return { domain, method: call.arguments[methodIndex] }
      }
      return {
        ObjectExpression(node) {
          const property = (name) => node.properties.find((item) => item.type === 'Property' && (item.key.name || item.key.value) === name)?.value
          const method = property('method')
          if (!method) return
          const pathDomain = domainOfURL(property('rpcPath'))
          if (pathDomain) { check(pathDomain, method); return }
          if (!property('jsonrpc')) return
          for (let parent = node.parent; parent; parent = parent.parent) {
            if (parent.type !== 'CallExpression') continue
            const domain = domainOfURL(parent.arguments[0])
            if (domain) { check(domain, method); break }
          }
        },
        CallExpression(node) { calls.push(node) },
        'Program:exit'() {
          for (const call of calls) {
            const target = wrapper(call)
            if (target) check(target.domain, target.method)
          }
        },
      }
    },
  }
  return new Linter().verify(source, [{
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { contracts: { rules: { scripts: rule } } },
    rules: { 'contracts/scripts': 'error' },
  }], { filename, allowInlineConfig: false })
}

export function checkScriptConsumers(repositoryRoot = root, rpcCatalog = RpcMethod) {
  const errors = []
  const scan = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) scan(file)
      else if (/\.m?js$/u.test(entry.name) && !/\.(?:test|generated)\.|-test-fixture\./u.test(entry.name)) {
        for (const issue of checkScriptConsumerSource(fs.readFileSync(file, 'utf8'), file, rpcCatalog)) errors.push(`${path.relative(repositoryRoot, file)}:${issue.line || 1}: ${issue.message}`)
      }
    }
  }
  for (const directory of ['scripts/deploy', 'scripts/lib']) scan(path.join(repositoryRoot, directory))
  const file = path.join(repositoryRoot, 'scripts/local-runtime-rehearsal.mjs')
  for (const issue of checkScriptConsumerSource(fs.readFileSync(file, 'utf8'), file, rpcCatalog)) errors.push(`${path.relative(repositoryRoot, file)}:${issue.line || 1}: ${issue.message}`)
  return errors
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = [...checkConsumers(), ...checkScriptConsumers()]
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
  else console.log('[public-contract-consumers] 通过')
}
