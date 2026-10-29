import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { Linter } from 'eslint'
import * as routes from './devRoutes.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const linter = new Linter()
const directories = new Set([
  'components/DevPageNav.jsx',
  'components/DevToolTable.jsx',
  'pages/DevHubPage.jsx',
  'pages/delivery/DeliveryWorkspace.jsx',
])
const recoveryBoundary = 'components/DevRuntimeRecoveryBoundary.jsx'
const permissionSurfaces = new Set([
  'pages/DevPermissionRelationshipsPage.jsx',
  'components/DevRoleResponsibilityGraph.jsx',
])
const navigationCallbacks = /\b(?:onOpenView|onOpenTopics|onExploreStage|onExploreNode|onOpenRules|onOpenRecords|openRoleSettings|openChain|openDutyChain|onOpenRole|onOpenChain)\b/u
const permissionCallbacks = /\b(?:openRoleSettings|openChain|openDutyChain|onOpenRole|onOpenChain)\b/u

function permissionDestination(target) {
  return /^\/erp\/system\/permissions(?:\?|$)/u.test(target) || /^\/__dev\/status-flows(?:\?|$)/u.test(target)
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : entry.name.endsWith('.jsx') ? [file] : []
  })
}

function visit(node, inspect) {
  if (!node || typeof node !== 'object') return
  inspect(node)
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'extra', 'comments', 'tokens', 'parent'].includes(key)) continue
    if (Array.isArray(value)) value.forEach((child) => visit(child, inspect))
    else if (value && typeof value === 'object') visit(value, inspect)
  }
}

function staticTarget(attribute) {
  const value = attribute.value?.expression || attribute.value
  if (['StringLiteral', 'Literal'].includes(value?.type)) return value.value
  if (value?.type === 'Identifier') return routes[value.name] || ''
  if (value?.type === 'TemplateLiteral') return value.quasis[0]?.value.cooked || ''
  return ''
}

test('工作台内容区不重复提供跨页入口，权限页保留岗位配置和业务链路关联', () => {
  const violations = []
  for (const file of sourceFiles(root)) {
    const relative = path.relative(root, file)
    if (directories.has(relative) || relative === recoveryBoundary) continue
    const source = readFileSync(file, 'utf8')
    let ast
    const syntax = linter.verify(source, [{
      files: ['**/*.jsx'],
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { navigation: { rules: { capture: {
        meta: { schema: [] },
        create: () => ({ Program: (node) => { ast = node } }),
      } } } },
      rules: { 'navigation/capture': 'error' },
    }], { filename: relative })
    assert.deepEqual(syntax, [], `${relative} must parse before checking navigation`)
    assert(ast, `${relative} must be inspected`)
    const routerLinks = new Set((ast.program || ast).body
      .filter((node) => node.type === 'ImportDeclaration' && node.source.value === 'react-router-dom')
      .flatMap((node) => node.specifiers.filter((item) => ['Link', 'NavLink'].includes(item.imported?.name)).map((item) => item.local.name)))
    visit(ast, (node) => {
      if (permissionSurfaces.has(relative) && node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'navigate') {
        const target = staticTarget({ value: { expression: node.arguments[0] } })
        if (!permissionDestination(target)) violations.push(`${relative}:${node.loc.start.line} 权限页导航超出岗位配置和业务链路范围`)
      }
      if (node.type !== 'JSXOpeningElement' || node.name.type !== 'JSXIdentifier') return
      const attributes = node.attributes.filter((item) => item.type === 'JSXAttribute')
      const destination = attributes.find((item) => ['to', 'href'].includes(item.name.name))
      const samePageExample = relative === 'components/DevSharedComponentGuide.jsx' && staticTarget(destination || {}).startsWith('/__dev/ui-design?')
      const permissionLink = permissionSurfaces.has(relative) && permissionDestination(staticTarget(destination || {}))
      if (routerLinks.has(node.name.name) && !samePageExample && !permissionLink) violations.push(`${relative}:${node.loc.start.line} 内容区路由链接`)
      if ((['Button', 'a'].includes(node.name.name) || routerLinks.has(node.name.name)) && destination && !attributes.some((item) => item.name.name === 'download') && /^\/(?:__dev|erp)(?:\/|\?|$)/u.test(staticTarget(destination)) && !samePageExample && !permissionLink) violations.push(`${relative}:${node.loc.start.line} 内容区跨页地址`)
      const click = attributes.find((item) => item.name.name === 'onClick')
      const clickSource = click ? source.slice(click.range[0], click.range[1]) : ''
      const permissionAction = permissionSurfaces.has(relative) && permissionCallbacks.test(clickSource)
      const contextualRuleAction = relative === 'components/flow-state/BusinessActionRelations.jsx' && /onOpenRules\(action\)/u.test(clickSource)
      if (node.name.name === 'Button' && click && navigationCallbacks.test(clickSource) && !permissionAction && !contextualRuleAction) violations.push(`${relative}:${node.loc.start.line} 关联跳转回调`)
    })
  }
  assert.deepEqual(violations, [])
})
