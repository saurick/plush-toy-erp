import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const testDir = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(testDir, '../..')
const componentSource = readFileSync(
  resolve(testDir, 'SearchInput.jsx'),
  'utf8'
)
const rhythmSource = readFileSync(
  resolve(srcRoot, 'erp/styles/app/business-control-rhythm.css'),
  'utf8'
)

function collectJsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return collectJsxFiles(entryPath)
    return entry.isFile() && entry.name.endsWith('.jsx') ? [entryPath] : []
  })
}

test('shared search input owns prefix, accessibility and control rhythm', () => {
  assert.match(
    componentSource,
    /className=\{joinClassNames\('erp-search-input'/u
  )
  assert.match(componentSource, /allowClear = false/u)
  assert.match(
    componentSource,
    /prefix=\{<SearchOutlined aria-hidden="true" \/>\}/u
  )
  assert.match(componentSource, /searchHint \|\| placeholder/u)
  assert.match(componentSource, /aria-label=\{accessibleLabel\}/u)
  assert.match(componentSource, /title=\{title\}/u)
  assert.match(
    rhythmSource,
    /\.erp-search-input\.ant-input-affix-wrapper[\s\S]*?height:\s*var\(--erp-form-control-height\);[\s\S]*?padding-block:\s*0;/u
  )
  assert.match(
    rhythmSource,
    /\.erp-search-input\.ant-input-affix-wrapper[\s\S]*?input\.ant-input[\s\S]*?line-height:\s*calc\(var\(--erp-form-control-height\) - 2px\);/u
  )
})

test('search icons and connected search inputs only come from the shared component', () => {
  const jsxSources = collectJsxFiles(srcRoot).map((filePath) => ({
    filePath,
    source: readFileSync(filePath, 'utf8'),
  }))
  const toRelativePaths = (entries) =>
    entries
      .map(({ filePath }) => relative(srcRoot, filePath).split(sep).join('/'))
      .sort()
  const directPrefixSources = toRelativePaths(
    jsxSources.filter(({ source }) =>
      /prefix=\{\s*<SearchOutlined\b/u.test(source)
    )
  )
  const connectedSearchSources = toRelativePaths(
    jsxSources.filter(({ source }) => /<Input\.Search\b/u.test(source))
  )

  assert.deepEqual(directPrefixSources, ['common/components/SearchInput.jsx'])
  assert.deepEqual(connectedSearchSources, [])
})
