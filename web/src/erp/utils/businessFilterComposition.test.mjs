import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { parse } from '@babel/parser'

const components = new Set(['SelectFilter', 'FilterSelect', 'DateRangeFilter', 'FilterChipGroup', 'BusinessStatusFilter', 'MobileFilterChoices'])
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function inspectFilters(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
  const aliases = new Map()
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue
    for (const specifier of node.specifiers) {
      const name = specifier.imported?.name || path.basename(node.source.value).replace(/\.(?:jsx|js|mjs)$/u, '')
      if (components.has(name)) aliases.set(specifier.local.name, name)
    }
  }
  const issues = []
  function visit(node, ancestors = []) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'JSXElement') {
      const name = aliases.get(node.openingElement.name.name)
      const attributes = Object.fromEntries(node.openingElement.attributes.filter((item) => item.type === 'JSXAttribute').map((item) => [item.name.name, item.value?.value ?? source.slice(item.value?.start, item.value?.end)]))
      const report = (reason) => issues.push({ line: node.loc.start.line, component: name, reason })
      if (name) {
        const parent = ancestors.at(-1)
        const tag = parent?.openingElement.name.name
        const children = parent?.children.filter((child) => child.type === 'JSXElement') || []
        const externalLabel = children.some((child) => ['label', 'legend'].includes(child.openingElement.name.name))
        if (tag === 'label' || (externalLabel && (tag === 'fieldset' || children.length <= 2))) {
          report('筛选标题应传入共享组件，不在外层手写 label 或 legend')
        }
        if (name === 'SelectFilter' && (/排序/u.test(`${attributes.label || ''}${attributes['aria-label'] || ''}`) || /--sort/u.test(attributes.className || '')) && attributes.purpose !== 'sort') {
          report('排序用途须显式传入 purpose="sort"，不依赖布局类名')
        }
        if (name === 'BusinessStatusFilter' && (attributes.style || attributes.className)) {
          report('快捷状态使用共享布局，不能传入组件不消费的页面样式')
        }
      }
      ancestors = [...ancestors, node]
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra'].includes(key)) continue
      if (Array.isArray(value)) value.forEach((child) => visit(child, ancestors))
      else if (value && typeof value === 'object') visit(value, ancestors)
    }
  }
  visit(ast)
  return issues
}

function jsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? jsxFiles(target) : entry.name.endsWith('.jsx') ? [target] : []
  })
}

test('共享筛选边界能识别别名调用、外补标题和依赖 CSS 的排序', () => {
  const source = `import Select from '@/common/components/select/FilterSelect';
    import { SelectFilter } from './BusinessListLayout';
    const Example = () => <><label>岗位<Select /></label><SelectFilter aria-label="排序方式" /></>`
  assert.equal(inspectFilters(source).length, 2)
  assert.deepEqual(inspectFilters(`import Select from '@/common/components/select/FilterSelect';
    const Example = () => <section><h3>业务资料</h3><Select label="岗位" labelPlacement="stacked" /></section>`), [])
})

test('业务页、手机页和样例均沿用完整筛选组件', () => {
  const issues = jsxFiles(sourceRoot).flatMap((file) => inspectFilters(readFileSync(file, 'utf8')).map((issue) => ({ file: path.relative(sourceRoot, file), ...issue })))
  assert.deepEqual(issues, [])
})
