import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { act, createElement } from 'react'
import { registerJSXTestLoader, installTestDOM } from '../../../scripts/test/reactRuntime.mjs'

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

test('search scope is discoverable on focus, dismisses on Escape and blur, and preserves handlers', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: SearchInput }] = await Promise.all([
    import('react-dom/client'), import('./SearchInput.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const calls = []
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  await act(async () => root.render(createElement(SearchInput, {
    showSearchScope: true,
    searchHint: '可搜索：单号、产品、来源订单',
    onFocus: () => calls.push('focus'),
    onBlur: () => calls.push('blur'),
    onPressEnter: () => calls.push('enter'),
  })))
  const input = container.querySelector('input')
  const initialDescription = input.getAttribute('aria-describedby')
  assert.equal(document.getElementById(initialDescription), null)
  await act(async () => input.focus())
  assert.match(document.getElementById(input.getAttribute('aria-describedby')).textContent, /来源订单/)
  await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(input.getAttribute('aria-describedby'), initialDescription)
  await act(async () => { input.blur(); input.focus() })
  assert.ok(input.getAttribute('aria-describedby'))
  await act(async () => input.blur())
  assert.equal(input.getAttribute('aria-describedby'), initialDescription)
  assert.deepEqual(calls, ['focus', 'enter', 'blur', 'focus', 'blur'])
})
