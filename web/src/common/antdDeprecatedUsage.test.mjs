import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const AUDITED_ANTD_VERSION = '5.29.3'
const testDirectory = dirname(fileURLToPath(import.meta.url))
const sourceRoot = resolve(testDirectory, '..')
const webRoot = resolve(sourceRoot, '..')
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])
const testFilePattern = /\.(?:spec|test)\.[cm]?[jt]sx?$/u

const deprecatedMembersByComponent = {
  Anchor: ['Link'],
  AutoComplete: ['Option'],
  Breadcrumb: ['Item', 'Separator'],
  Button: ['Group'],
  Collapse: ['Panel'],
  Descriptions: ['Item'],
  Form: ['create'],
  Input: ['Group'],
  Mentions: ['Option'],
  Menu: ['Divider', 'Item', 'ItemGroup', 'SubMenu'],
  Select: ['OptGroup', 'Option'],
  Statistic: ['Countdown'],
  Steps: ['Step'],
  Tabs: ['TabPane'],
  Timeline: ['Item'],
}

const deprecatedPropsByComponent = {
  Alert: ['closeText'],
  AutoComplete: [
    'dataSource',
    'dropdownClassName',
    'dropdownMatchSelectWidth',
    'dropdownRender',
    'dropdownStyle',
    'onDropdownVisibleChange',
    'popupClassName',
  ],
  Avatar: ['maxCount', 'maxPopoverPlacement', 'maxPopoverTrigger', 'maxStyle'],
  Breadcrumb: ['routes'],
  Calendar: [
    'dateCellRender',
    'dateFullCellRender',
    'monthCellRender',
    'monthFullCellRender',
  ],
  Card: ['bodyStyle', 'bordered', 'headStyle'],
  Cascader: [
    'bordered',
    'dropdownClassName',
    'dropdownMenuColumnStyle',
    'dropdownRender',
    'dropdownStyle',
    'onDropdownVisibleChange',
    'popupClassName',
    'showArrow',
  ],
  Collapse: ['destroyInactivePanel'],
  ConfigProvider: ['autoInsertSpaceInButton', 'dropdownMatchSelectWidth'],
  DatePicker: [
    'bordered',
    'dropdownClassName',
    'onSelect',
    'popupClassName',
    'popupStyle',
  ],
  Descriptions: ['contentStyle', 'labelStyle'],
  Drawer: [
    'afterVisibleChange',
    'bodyStyle',
    'contentWrapperStyle',
    'destroyOnClose',
    'drawerStyle',
    'footerStyle',
    'headerStyle',
    'maskStyle',
    'visible',
  ],
  Dropdown: [
    'destroyPopupOnHide',
    'dropdownRender',
    'onVisibleChange',
    'overlay',
    'visible',
  ],
  Empty: ['imageStyle'],
  Form: ['hideRequiredMark'],
  Image: ['destroyOnClose'],
  Input: ['addonAfter', 'addonBefore', 'bordered'],
  InputNumber: ['addonAfter', 'addonBefore', 'bordered'],
  Modal: ['bodyStyle', 'destroyOnClose', 'maskStyle', 'visible'],
  Pagination: ['selectComponentClass'],
  Popover: [
    'afterVisibleChange',
    'arrowPointAtCenter',
    'defaultVisible',
    'destroyTooltipOnHide',
    'onVisibleChange',
    'overlayClassName',
    'overlayInnerStyle',
    'overlayStyle',
    'visible',
  ],
  Progress: ['successPercent', 'width'],
  Select: [
    'bordered',
    'dropdownClassName',
    'dropdownMatchSelectWidth',
    'dropdownRender',
    'dropdownStyle',
    'onDropdownVisibleChange',
    'popupClassName',
    'showArrow',
  ],
  Slider: [
    'getTooltipPopupContainer',
    'handleStyle',
    'onAfterChange',
    'railStyle',
    'tipFormatter',
    'tooltipPlacement',
    'tooltipPrefixCls',
    'tooltipVisible',
    'trackStyle',
  ],
  Tabs: ['destroyInactiveTabPane', 'indicatorSize'],
  Tag: ['visible'],
  Tooltip: [
    'afterVisibleChange',
    'arrowPointAtCenter',
    'defaultVisible',
    'destroyTooltipOnHide',
    'onVisibleChange',
    'overlayClassName',
    'overlayInnerStyle',
    'overlayStyle',
    'visible',
  ],
  TreeSelect: [
    'bordered',
    'dropdownClassName',
    'dropdownMatchSelectWidth',
    'dropdownRender',
    'dropdownStyle',
    'onDropdownVisibleChange',
    'popupClassName',
    'showArrow',
  ],
  Typography: ['setContentRef'],
  Upload: ['transformFile'],
}

function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(entryPath)
    if (!entry.isFile()) return []
    if (!sourceExtensions.has(extname(entry.name))) return []
    if (testFilePattern.test(entry.name)) return []
    return [entryPath]
  })
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function collectAntdImports(source) {
  const imports = new Map()
  const namedImportPattern =
    /import\s*\{([\s\S]*?)\}\s*from\s*['"]antd['"]/gu

  for (const match of source.matchAll(namedImportPattern)) {
    for (const rawSpecifier of match[1].split(',')) {
      const specifier = rawSpecifier
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/^\s*type\s+/u, '')
        .trim()
      const parsed = specifier.match(
        /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/u
      )
      if (parsed) imports.set(parsed[1], parsed[2] || parsed[1])
    }
  }

  return imports
}

function findOpeningTags(source, localName) {
  const openingTags = []
  const startPattern = new RegExp(
    `<${escapeRegExp(localName)}(?:\\.[A-Za-z_$][\\w$]*)?\\b`,
    'gu'
  )

  for (const match of source.matchAll(startPattern)) {
    const { index: matchIndex } = match
    let quote = null
    let escaped = false
    let braceDepth = 0

    for (let index = matchIndex; index < source.length; index += 1) {
      const character = source.at(index)
      if (quote) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = null
        continue
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character
      } else if (character === '{') {
        braceDepth += 1
      } else if (character === '}') {
        braceDepth = Math.max(braceDepth - 1, 0)
      } else if (character === '>' && braceDepth === 0) {
        openingTags.push(source.slice(matchIndex, index + 1))
        break
      }
    }
  }

  return openingTags
}

function toRelativePath(filePath) {
  return relative(sourceRoot, filePath).split(sep).join('/')
}

test('Ant Design deprecation audit stays bound to the installed version', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(webRoot, 'node_modules/antd/package.json'), 'utf8')
  )
  assert.equal(
    packageJson.version,
    AUDITED_ANTD_VERSION,
    'Ant Design changed; rerun the repository-wide deprecation audit and update this guard.'
  )
})

test('production sources do not use audited Ant Design deprecated APIs', () => {
  const findings = []

  for (const filePath of collectSourceFiles(sourceRoot)) {
    const source = readFileSync(filePath, 'utf8')
    const relativePath = toRelativePath(filePath)
    const namespaceImport = source.match(
      /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*['"]antd['"]/u
    )
    if (namespaceImport) {
      findings.push(
        `${relativePath}: namespace import ${namespaceImport[1]} hides API-level deprecation checks`
      )
    }

    const imports = collectAntdImports(source)
    for (const [componentName, localName] of imports) {
      if (componentName === 'BackTop') {
        findings.push(`${relativePath}: BackTop component -> FloatButton.BackTop`)
      }

      for (const member of deprecatedMembersByComponent[componentName] || []) {
        const memberPattern = new RegExp(
          `\\b${escapeRegExp(localName)}\\.${escapeRegExp(member)}\\b`,
          'u'
        )
        if (memberPattern.test(source)) {
          findings.push(`${relativePath}: ${componentName}.${member}`)
        }
      }

      const deprecatedProps = deprecatedPropsByComponent[componentName] || []
      if (deprecatedProps.length === 0) continue
      for (const openingTag of findOpeningTags(source, localName)) {
        for (const propName of deprecatedProps) {
          const propPattern = new RegExp(
            `\\b${escapeRegExp(propName)}\\s*(?:=|:)`,
            'u'
          )
          if (propPattern.test(openingTag)) {
            findings.push(`${relativePath}: ${componentName}.${propName}`)
          }
        }
      }
    }

    if (
      /\b(?:[A-Z][A-Z0-9_]*PAGE_SIZE_OPTIONS|pageSizeOptions)\s*=\s*\[\s*['"]\d/u.test(
        source
      ) ||
      /\bpageSizeOptions\s*=\s*\{\s*\[\s*['"]\d/u.test(source)
    ) {
      findings.push(`${relativePath}: Pagination.pageSizeOptions string values`)
    }
    if (/\bModal\.config\b/u.test(source)) {
      findings.push(`${relativePath}: Modal.config`)
    }
    if (/\bConfigProvider\.SizeContext\b/u.test(source)) {
      findings.push(`${relativePath}: ConfigProvider.SizeContext`)
    }
  }

  assert.deepEqual(findings, [])
})
