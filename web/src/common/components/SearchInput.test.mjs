import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { parse } from '@babel/parser'
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
    /className=\{joinClassNames\(\s*'erp-search-input'/u
  )
  assert.match(componentSource, /allowClear = false/u)
  assert.match(
    componentSource,
    /<SearchOutlined aria-hidden="true" \/>/u
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
      /<SearchOutlined aria-hidden="true"/u.test(source)
    )
  )
  const connectedSearchSources = toRelativePaths(
    jsxSources.filter(({ source }) => /<Input\.Search\b/u.test(source))
  )

  assert.deepEqual(directPrefixSources, ['common/components/SearchInput.jsx'])
  assert.deepEqual(connectedSearchSources, [])
})

test('all standalone search consumers submit through onSearch and never query on input or Enter separately', () => {
  const violations = []
  const visit = (node, filePath) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'JSXOpeningElement' && ['Input', 'input'].includes(node.name.name)) {
      const searchAttribute = node.attributes.some((item) =>
        ['aria-label', 'placeholder', 'type'].includes(item.name?.name) && /搜索|^search$/u.test(item.value?.value || '')
      )
      if (searchAttribute) violations.push(`${relative(srcRoot, filePath)}:${node.loc.start.line}: bypasses shared search`)
    }
    if (node.type === 'JSXOpeningElement' && ['SearchInput', 'MobileSearchInput', 'SearchControl'].includes(node.name.name)) {
      const attributes = node.attributes.map((item) => item.name?.name)
      const hasSearch = attributes.includes('onSearch') || node.attributes.some((item) => item.type === 'JSXSpreadAttribute')
      if (!hasSearch || attributes.some((name) => ['onChange', 'onPressEnter'].includes(name))) {
        violations.push(`${relative(srcRoot, filePath)}:${node.loc.start.line}`)
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue
      if (Array.isArray(value)) value.forEach((item) => visit(item, filePath))
      else if (value && typeof value === 'object') visit(value, filePath)
    }
  }
  for (const filePath of collectJsxFiles(srcRoot)) {
    const source = readFileSync(filePath, 'utf8')
    visit(parse(source, { sourceType: 'module', plugins: ['jsx'] }), filePath)
  }
  assert.deepEqual(violations, [])
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
    onSubmitted: () => calls.push('enter'),
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

test('desktop and mobile search submit once, support clear and cancel, and collapse on submission', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { Simulate }, { default: SearchInput }, { default: MobileSearchInput }] = await Promise.all([
    import('react-dom/client'), import('react-dom/test-utils'), import('./SearchInput.jsx'), import('./navigation/MobileSearchInput.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  for (const Component of [SearchInput, MobileSearchInput]) {
    const queries = []
    await act(async () => root.render(createElement(Component, { allowClear: true, value: '', onSearch: (value) => queries.push(value) })))
    const input = container.querySelector('input')
    const type = (value) => act(async () => { input.value = value; Simulate.change(input) })
    await act(async () => input.focus())
    await type(' 草稿 ')
    assert.deepEqual(queries, [])
    const imeConfirm = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(async () => { Simulate.compositionStart(input); input.dispatchEvent(imeConfirm); Simulate.keyUp(input, { key: 'Enter' }) })
    assert.equal(imeConfirm.defaultPrevented, false, 'confirming an IME candidate must not be cancelled')
    assert.deepEqual(queries, [])
    await act(async () => Simulate.compositionEnd(input))
    assert.deepEqual(queries, [])
    await act(async () => container.querySelector('.erp-search-submit').click())
    assert.deepEqual(queries, ['草稿'])
    assert.equal(input.value, '草稿')
    if (Component === MobileSearchInput) {
      assert.equal(container.querySelector('.erp-mobile-search--expanded'), null)
      assert.notEqual(document.activeElement, input, 'submission dismisses the soft keyboard without waiting for a response')
    }
    await act(async () => input.focus())
    await type('放弃草稿')
    await act(async () => Simulate.keyDown(input, { key: 'Escape' }))
    assert.equal(input.value, '草稿')
    assert.deepEqual(queries, ['草稿'])
    await act(async () => input.focus())
    await type('回车提交')
    await act(async () => Simulate.keyDown(input, { key: 'Enter' }))
    assert.deepEqual(queries, ['草稿', '回车提交'])
    await act(async () => container.querySelector('.erp-search-submit').click())
    assert.deepEqual(queries, ['草稿', '回车提交'])
    await act(async () => container.querySelector('[aria-label="清除搜索"]').click())
    assert.deepEqual(queries, ['草稿', '回车提交', ''])
  }
})
