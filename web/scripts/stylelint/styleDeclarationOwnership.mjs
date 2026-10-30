import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import mdnData from 'mdn-data'

const compact = (value) => value.trim().replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\s+/gu, (part, quoted) => quoted || ' ')

const expandedProperties = new Map()
function affectedProperties(property) {
  if (expandedProperties.has(property)) return expandedProperties.get(property)
  const definition = mdnData.css.properties[property]
  const children = Array.isArray(definition?.computed)
    ? definition.computed
    : Array.isArray(definition?.initial) ? definition.initial : null
  const result = children ? [...new Set(children.flatMap(affectedProperties))] : [property]
  expandedProperties.set(property, result)
  return result
}

export function findCrossFileStyleDeclarations(sources) {
  const declarations = new Map()
  for (const { file, css } of sources) {
    const root = postcss.parse(css, { from: file })
    root.walkRules((rule) => {
      const conditions = []
      for (let { parent } = rule; parent?.type !== 'root'; parent = parent?.parent) {
        if (!parent) break
        if (parent.type !== 'atrule') continue
        if (parent.name.endsWith('keyframes')) return
        conditions.unshift(`@${parent.name} ${compact(parent.params)}`)
      }
      for (const node of selectorParser().astSync(rule.selector, { lossless: false }).nodes) {
        const selector = node.toString().trim()
        for (const declaration of rule.nodes.filter((item) => item.type === 'decl')) {
          const property = declaration.prop.startsWith('--')
            ? declaration.prop
            : declaration.prop.toLowerCase()
          // A shorthand writes every constituent, including omitted values reset to their defaults.
          for (const affectedProperty of affectedProperties(property)) {
            const key = JSON.stringify([conditions, selector, affectedProperty])
            const entry = declarations.get(key) || { conditions, selector, property: affectedProperty, locations: [] }
            entry.locations.push({ file, line: declaration.source.start.line, property, value: declaration.value })
            declarations.set(key, entry)
          }
        }
      }
    })
  }
  return [...declarations.values()].filter((entry) =>
    new Set(entry.locations.map((location) => location.file)).size > 1
  )
}

async function readStyles(directory) {
  const sources = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) sources.push(...await readStyles(filename))
    else if (entry.isFile() && /\.(?:css|scss|sass)$/u.test(entry.name)) {
      sources.push({ file: filename, css: await fs.readFile(filename, 'utf8') })
    }
  }
  return sources
}

async function main() {
  const webRoot = fileURLToPath(new URL('../../', import.meta.url))
  const sources = await readStyles(path.join(webRoot, 'src'))
  const conflicts = findCrossFileStyleDeclarations(sources)
  for (const { conditions, selector, property, locations } of conflicts) {
    console.error(`[css:ownership] ${conditions.join(' / ') || '默认'} ${selector} 的 ${property} 跨文件重复维护`)
    for (const location of locations) {
      console.error(`  ${path.relative(webRoot, location.file)}:${location.line} ${location.property}: ${location.value}`)
    }
  }
  console.log(`[css:ownership] 检查 ${sources.length} 个文件，${conflicts.length} 项重复声明`)
  if (conflicts.length) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
