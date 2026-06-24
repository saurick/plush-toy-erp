import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pagesRoot = resolve(__dirname, '../pages')

function listPageFiles(rootDir) {
  return readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(rootDir, entry.name)
    if (entry.isDirectory()) return listPageFiles(fullPath)
    return /\.jsx$/u.test(entry.name) ? [fullPath] : []
  })
}

function findMatchingBrace(source, openIndex) {
  let depth = 0
  let quote = ''
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) quote = ''
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function findBusinessOperationFilterBlocks(source) {
  const blocks = []
  let searchFrom = 0

  while (searchFrom < source.length) {
    const panelIndex = source.indexOf('<BusinessOperationPanel', searchFrom)
    if (panelIndex === -1) break

    const filtersIndex = source.indexOf('filters=', panelIndex)
    const closingIndex = source.indexOf('>', panelIndex)
    if (filtersIndex === -1 || filtersIndex > closingIndex) {
      searchFrom = panelIndex + '<BusinessOperationPanel'.length
      continue
    }

    const expressionStart = source.indexOf('{', filtersIndex)
    const expressionEnd =
      expressionStart >= 0 ? findMatchingBrace(source, expressionStart) : -1
    if (expressionStart >= 0 && expressionEnd > expressionStart) {
      blocks.push(source.slice(expressionStart + 1, expressionEnd))
      searchFrom = expressionEnd + 1
      continue
    }

    searchFrom = panelIndex + '<BusinessOperationPanel'.length
  }

  return blocks
}

test('business date filters: BusinessOperationPanel filters must use DateRangeFilter for date ranges', () => {
  const offenders = listPageFiles(pagesRoot).flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8')
    return findBusinessOperationFilterBlocks(source).flatMap((block, index) =>
      block.includes('<DateInput')
        ? [
            `${filePath.replace(`${pagesRoot}/`, 'pages/')}:filters[${
              index + 1
            }]`,
          ]
        : []
    )
  })

  assert.deepEqual(
    offenders,
    [],
    `BusinessOperationPanel filters should not compose date ranges from standalone DateInput. Use DateRangeFilter instead: ${offenders.join(
      ', '
    )}`
  )
})
