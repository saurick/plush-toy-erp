import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Linter } from 'eslint'
import * as permissions from '../../src/common/consts/permissions.generated.mjs'
import * as states from '../../src/common/consts/statuses.generated.mjs'
import * as rpc from '../../src/common/consts/rpcMethods.generated.mjs'
import * as attachments from '../../src/common/consts/attachments.generated.mjs'
import * as numeric from '../../src/common/consts/numeric.generated.mjs'

const modules = new Map([
  ['permissions', permissions], ['statuses', states], ['rpcMethods', rpc],
  ['attachments', attachments], ['numeric', numeric],
].map(([name, values]) => [fileURLToPath(new URL(`../../src/common/consts/${name}.generated.mjs`, import.meta.url)), values]))

// Static boundary assertions inspect public values even when the source uses
// generated constants. Resolve only actual imports and immutable member reads;
// never evaluate application code or replace unrelated same-named variables.
export function resolvePublicContractSource(source, filename) {
  if (!/\.generated\.mjs['"]/u.test(source)) return source
  const edits = []
  const literal = (value) => typeof value === 'string'
    ? `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
    : JSON.stringify(value)
  const rule = {
    create(context) {
      function resolve(node) {
        if (node.type === 'Identifier') {
          let scope = context.sourceCode.getScope(node)
          while (scope) {
            const variable = scope.set.get(node.name)
            if (variable) {
              if (variable.defs.length !== 1 || variable.defs[0].type !== 'ImportBinding') return null
              const { node: specifier, parent } = variable.defs[0]
              const values = modules.get(path.resolve(path.dirname(filename), parent.source.value))
              if (!values) return null
              const name = specifier.imported?.name
              if (!Object.hasOwn(values, name)) throw new Error(`Unknown public contract import: ${name}`)
              return { value: values[name] }
            }
            scope = scope.upper
          }
          return null
        }
        if (node.type !== 'MemberExpression') return null
        const owner = resolve(node.object)
        if (!owner) return null
        const key = node.computed ? node.property.value : node.property.name
        if (key === undefined) return null
        if (!Object.hasOwn(owner.value, key)) throw new Error(`Unknown public contract member: ${key}`)
        return { value: owner.value[key] }
      }
      return {
        ImportDeclaration(node) {
          const target = path.resolve(path.dirname(filename), node.source.value)
          if (modules.has(target)) edits.push({ start: node.source.range[0], end: node.source.range[1], text: literal(pathToFileURL(target).href) })
        },
        MemberExpression(node) {
          if (node.parent.type === 'MemberExpression' && node.parent.object === node) return
          const resolved = resolve(node)
          if (!resolved || typeof resolved.value === 'object') return
          let [start, end] = node.range
          if (node.parent.type === 'Property' && node.parent.computed && node.parent.key === node) {
            start = node.parent.range[0]
            end = source.indexOf(']', end) + 1
            if (!end) throw new Error('Unclosed computed contract key')
          }
          edits.push({ start, end, text: literal(resolved.value) })
        },
      }
    },
  }
  const messages = new Linter({ cwd: fileURLToPath(new URL('../../../', import.meta.url)) }).verify(source, [{
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { contracts: { rules: { resolve: rule } } },
    rules: { 'contracts/resolve': 'error' },
  }], { filename, allowInlineConfig: false, reportUnusedDisableDirectives: false })
  if (messages.length) throw new Error(messages.map((item) => item.message).join('\n'))
  let result = source
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  }
  return result
}

export function readContractSource(file, encoding = 'utf8') {
  const filename = file instanceof URL ? fileURLToPath(file) : path.resolve(file)
  const source = readFileSync(filename, encoding)
  return /\.(?:js|jsx|mjs)$/u.test(filename) ? resolvePublicContractSource(source, filename) : source
}
