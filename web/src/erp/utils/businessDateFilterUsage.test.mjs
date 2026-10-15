import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const erpRoot = resolve(__dirname, '..')
const pagesRoot = resolve(__dirname, '../pages')
const businessListLayoutPath = resolve(
  __dirname,
  '../components/business-list/BusinessListLayout.jsx'
)
const businessTaskActionsPath = resolve(
  __dirname,
  '../components/workflow/BusinessTaskActions.jsx'
)
const businessDateUsageCases = [
  [
    '../components/purchase-orders/purchaseOrderPageConfig.mjs',
    'currentBusinessDate',
  ],
  ['../data/processingContractTemplate.mjs', 'unixSecondsToBusinessDate'],
  ['../pages/OperationalFactsPage.jsx', 'currentBusinessDate'],
  ['../pages/OutsourcingOrdersPage.jsx', 'currentBusinessDate'],
  ['../pages/ProductionOrdersPage.jsx', 'currentBusinessDate'],
  ['../pages/PurchaseOrdersPage.jsx', 'currentBusinessDate'],
  ['../pages/SalesOrdersPage.jsx', 'currentBusinessDate'],
]

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

test('业务日期控件统一使用 DateInput 或 DateTimeInput', () => {
  const nativeDateInputPattern =
    /<(?:Input|input)\b[^>]*\btype\s*=\s*["'](?:date|datetime-local)["'][^>]*>/u
  const directDatePickerPattern = /<DatePicker\b/u
  const offenders = listPageFiles(erpRoot).flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8')
    const isSharedDateInput = filePath === businessListLayoutPath
    return (
      nativeDateInputPattern.test(source) ||
      (!isSharedDateInput && directDatePickerPattern.test(source))
    )
      ? [filePath.replace(`${erpRoot}/`, '')]
      : []
  })

  assert.deepEqual(
    offenders,
    [],
    `业务日期不得退回只能点击原生日历图标的输入框，请复用 DateInput / DateTimeInput: ${offenders.join(', ')}`
  )
})

test('只有跟进任务截止时间隐藏此刻并提供截止快捷项', () => {
  const showNowDisabledPattern =
    /<DateTimeInput\b[^>]*\bshowNow=\{false\}[^>]*>/u
  const consumers = listPageFiles(erpRoot).flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8')
    return showNowDisabledPattern.test(source) ? [filePath] : []
  })
  const sharedSource = readFileSync(businessListLayoutPath, 'utf8')
  const dateTimeInputDefinition = sharedSource.match(
    /export const DateTimeInput[\s\S]*?\n\)\)\n/u
  )?.[0]

  assert.deepEqual(consumers, [businessTaskActionsPath])
  assert.ok(dateTimeInputDefinition, '应保留共享 DateTimeInput 定义')
  assert.doesNotMatch(dateTimeInputDefinition, /showNow=\{false\}/u)
  assert.match(
    readFileSync(businessTaskActionsPath, 'utf8'),
    /quickOptions=\{WORKFLOW_DEADLINE_QUICK_OPTIONS\}/u
  )
})

test('业务当前操作条不渲染页面级边界说明', () => {
  const source = readFileSync(businessListLayoutPath, 'utf8')

  assert.equal(
    source.includes('boundaryText'),
    false,
    'SelectionActionBar should not render page-level boundaryText in the shared current-operation row'
  )
})

test('业务日期默认值和导出文件名使用上海业务日', () => {
  for (const [relativePath, helperName] of businessDateUsageCases) {
    const source = readFileSync(resolve(__dirname, relativePath), 'utf8')
    assert.equal(
      source.includes('toISOString().slice(0, 10)'),
      false,
      `${relativePath} must not derive the business date from UTC`
    )
    assert.match(source, new RegExp(`\\b${helperName}\\(`, 'u'))
  }
})
