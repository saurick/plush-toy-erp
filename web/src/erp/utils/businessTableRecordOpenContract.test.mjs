import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pagesRoot = resolve(__dirname, '../pages')
const businessListLayoutSource = readFileSync(
  resolve(__dirname, '../components/business-list/BusinessListLayout.jsx'),
  'utf8'
)

const expectedBusinessDataTablePages = [
  'BOMVersionsPage.jsx',
  'OperationalFactsPage.jsx',
  'ShipmentsPage.jsx',
  'V1MasterDataPage.jsx',
  'V1OutsourcingOrdersPage.jsx',
  'V1ProductionOrdersPage.jsx',
  'V1PurchaseOrdersPage.jsx',
  'V1PurchaseReceiptsPage.jsx',
  'V1QualityInspectionsPage.jsx',
  'V1SalesOrdersPage.jsx',
  'WorkflowBusinessModulePage.jsx',
]

function sliceBetween(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker)
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length)
  assert(startIndex >= 0, `missing source marker: ${startMarker}`)
  assert(endIndex > startIndex, `missing source marker: ${endMarker}`)
  return source.slice(startIndex, endIndex)
}

function extractSelfClosingTags(source, componentName) {
  const tags = []
  const marker = `<${componentName}`
  let searchFrom = 0

  while (searchFrom < source.length) {
    const startIndex = source.indexOf(marker, searchFrom)
    if (startIndex === -1) break

    let braceDepth = 0
    let quote = ''
    let escaped = false

    for (
      let index = startIndex + marker.length;
      index < source.length;
      index += 1
    ) {
      const char = source[index]
      const next = source[index + 1]

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
      if (char === "'" || char === '"' || char === '`') {
        quote = char
        continue
      }
      if (char === '{') {
        braceDepth += 1
        continue
      }
      if (char === '}') {
        braceDepth -= 1
        continue
      }
      if (braceDepth === 0 && char === '/' && next === '>') {
        tags.push(source.slice(startIndex, index + 2))
        searchFrom = index + 2
        break
      }
    }

    if (searchFrom <= startIndex) {
      throw new Error(`unterminated <${componentName} /> tag`)
    }
  }

  return tags
}

function readBusinessDataTablePages() {
  return readdirSync(pagesRoot)
    .filter((fileName) => fileName.endsWith('.jsx'))
    .map((fileName) => ({
      fileName,
      source: readFileSync(resolve(pagesRoot, fileName), 'utf8'),
    }))
    .filter(({ source }) => source.includes('<BusinessDataTable'))
    .sort((left, right) => left.fileName.localeCompare(right.fileName))
}

test('BusinessDataTable 把正式记录打开动作合并进页面 onRow', () => {
  const componentSource = sliceBetween(
    businessListLayoutSource,
    'export function BusinessDataTable(',
    'export function ToolbarButton('
  )

  assert.match(componentSource, /\bonOpenRecord\b/u)
  assert.doesNotMatch(componentSource, /onRow=\{onRow\}/u)
  assert.match(
    componentSource,
    /\bonRow(?:\?\.)?\(\s*record(?:\s*,\s*[A-Za-z_$][\w$]*)?\s*\)/u
  )
  assert.match(
    componentSource,
    /const\s+([A-Za-z_$][\w$]*)\s*=[\s\S]{0,180}?\bonRow(?:\?\.)?\(\s*record(?:\s*,\s*[A-Za-z_$][\w$]*)?\s*\)[\s\S]{0,240}?\.\.\.\1[\s\S]{0,240}?onDoubleClick\s*:/u
  )
  assert.match(componentSource, /onDoubleClick\s*:/u)
  assert.match(
    componentSource,
    /onOpenRecord(?:\?\.)?\(\s*record\s*,\s*event\s*\)/u
  )
})

test('BusinessDataTable 双击打开前过滤表格内交互元素', () => {
  const interactiveTargetSource = sliceBetween(
    businessListLayoutSource,
    'const BUSINESS_DATA_TABLE_INTERACTIVE_TARGET',
    'export function BusinessDataTable('
  )

  for (const selector of [
    'a',
    'button',
    'input',
    'textarea',
    'select',
    'label',
    '[role="button"]',
    '.ant-table-selection-column',
    '.ant-radio-wrapper',
    '.ant-checkbox-wrapper',
    '.erp-business-row-expand-button',
  ]) {
    assert.equal(
      interactiveTargetSource.includes(selector),
      true,
      `BusinessDataTable interactive-target filter must include ${selector}`
    )
  }
  assert.match(interactiveTargetSource, /target instanceof Element/u)
  assert.match(
    interactiveTargetSource,
    /target\.closest\(BUSINESS_DATA_TABLE_INTERACTIVE_TARGET\)/u
  )

  const componentSource = sliceBetween(
    businessListLayoutSource,
    'export function BusinessDataTable(',
    'export function ToolbarButton('
  )
  assert.match(
    componentSource,
    /is[A-Za-z_$\w]*Interactive[A-Za-z_$\w]*\(\s*event(?:\?\.|\.)target\s*\)/u
  )
})

test('当前 11 个正式 BusinessDataTable 主表都声明双击打开合同', () => {
  const pages = readBusinessDataTablePages()
  assert.deepEqual(
    pages.map(({ fileName }) => fileName),
    expectedBusinessDataTablePages
  )

  for (const { fileName, source } of pages) {
    const tags = extractSelfClosingTags(source, 'BusinessDataTable')
    assert(tags.length > 0, `${fileName} must render BusinessDataTable`)
    for (const [index, tag] of tags.entries()) {
      assert.equal(
        /\bonOpenRecord\s*=/u.test(tag) || /\bonDoubleClick\s*:/u.test(tag),
        true,
        `${fileName} BusinessDataTable #${index + 1} must open its primary record surface on double-click`
      )
    }
  }
})

test('库存台账主表双击打开当前记录主操作面', () => {
  const filePath = resolve(pagesRoot, 'V1InventoryLedgerPage.jsx')
  const source = readFileSync(filePath, 'utf8')
  const tags = extractSelfClosingTags(source, 'Table')

  assert.equal(tags.length, 1, `${basename(filePath)} must keep one primary Table`)
  assert.match(tags[0], /\bonRow\s*=/u)
  assert.match(tags[0], /\bonDoubleClick\s*:/u)
})
