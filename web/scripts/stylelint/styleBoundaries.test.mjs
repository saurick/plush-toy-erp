import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import stylelint from 'stylelint'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import tailwindConfig from '../../tailwind.config.js'
import boundaries from './styleBoundaries.mjs'

async function warnings(code, file = 'src/erp/styles/app/example.css') {
  const result = await stylelint.lint({
    code,
    codeFilename: path.resolve(
      fileURLToPath(new URL('../../', import.meta.url)),
      file
    ),
    config: { plugins: [boundaries], rules: { 'erp/style-boundaries': true } },
  })
  return result.results.flatMap((item) =>
    item.warnings.map((warning) => warning.text)
  )
}

test('page emphasis uses subtle surfaces instead of thick side accents', async () => {
  for (const declaration of [
    'border-left: 3px solid var(--erp-primary)',
    'border-inline-start-width: 4px',
    'border-right: .25rem solid blue',
    'border-left: 3pt solid blue',
    'box-shadow: inset 3px 0 var(--erp-primary)',
    'box-shadow: 0 3px 8px #0002, inset 4px 0 0 blue',
    '--erp-slider-shadow: inset 3px 0 0 blue, inset 0 0 0 1px blue',
  ]) {
    assert.match((await warnings(`.erp-page { ${declaration}; }`))[0], /粗单侧色条/u)
  }
  for (const declaration of [
    'border: 1px solid var(--erp-primary)',
    'border-left: 1px solid var(--erp-border)',
    'outline: 3px solid blue',
    'box-shadow: inset 0 0 0 1px blue',
    'box-shadow: inset 0 -2px 0 blue',
    'box-shadow: 3px 0 8px #0002',
    'box-shadow: inset 3px 0 12px #0002',
  ]) {
    assert.deepEqual(await warnings(`.erp-page { ${declaration}; }`), [])
  }
})

test('module scope must cover every selector and positive alternative', async () => {
  for (const selector of [
    '.ant-input',
    '.anticon',
    '.is-active input',
    '#root input',
    '.erp-page, input',
    ':not(.erp-page) input',
    ':is(.erp-page, body) input',
  ]) {
    assert.equal(
      (await warnings(`${selector} { color: red; }`)).length,
      1,
      selector
    )
  }
  for (const selector of [
    '.erp-page .ant-input',
    ':is(.erp-page, .erp-other) input',
    '.app-table th',
    'body:has(> .erp-print-root) > *',
  ]) {
    assert.deepEqual(
      await warnings(`${selector} { color: red; }`),
      [],
      selector
    )
  }
})

test('shared tabs and filter chips keep one appearance owner while allowing page geometry', async () => {
  for (const css of [
    '.erp-page .erp-sliding-segmented { background: white; }',
    '.erp-page .erp-filter-chip[aria-pressed="true"] { border: 0; }',
    '.erp-page .ant-tabs-tab-active { color: #ddd; }',
    '.erp-page .ant-segmented-item-selected { background: white; }',
    '.erp-page { --erp-segmented-bg: white; }',
    '.erp-page { --erp-control-accent: #eee; }',
    '.erp-page { --erp-control-tab-border: #eee; }',
    '.erp-page .erp-mobile-search .ant-input { background: white; }',
    '.erp-page .erp-control-field { border-color: #eee; }',
    '.erp-page { --erp-control-muted: #eee; }',
  ]) {
    assert.match((await warnings(css))[0], /control-affordance/u)
    assert.deepEqual(
      await warnings(css, 'src/erp/styles/app/control-affordance.css'),
      []
    )
  }
  assert.deepEqual(
    await warnings(
      '.erp-page .erp-filter-chip { min-height: 44px; padding: 8px; }'
    ),
    []
  )
  assert.match(
    (
      await warnings('.erp-page { --erp-slider-shadow: inset 0 -3px 0 green; }')
    )[0],
    /内容页签统一使用共享的 2px 指示线/u
  )
  assert.deepEqual(
    await warnings('.erp-page { --erp-slider-shadow: inset 0 0 0 1px green; }'),
    []
  )
})

test('only shared content tab owners define the 2px underline', async () => {
  const selector = [
    '.erp-sliding-segmented.ant-segmented:not(.ant-segmented-vertical)',
    '.erp-sliding-tabs.ant-tabs > .ant-tabs-nav .ant-tabs-nav-list',
    '.erp-sliding-tab-list.erp-navigation-tabs',
  ].join(', ')
  const file = 'src/erp/styles/app/control-affordance.css'
  const declaration = '--erp-slider-shadow: inset 0 -2px 0 var(--erp-control-accent);'
  assert.deepEqual(await warnings(`${selector} { ${declaration} }`, file), [])
  for (const [css, source] of [
    [`${selector} { ${declaration} }`, 'src/erp/styles/app/example.css'],
    [`.erp-page { ${declaration} }`, file],
    [`${selector} { ${declaration.replace('-2px', '-3px')} }`, file],
  ]) {
    assert.match((await warnings(css, source))[0], /内容页签统一/u)
  }
})

test('mobile search layout and excluded fields do not claim shared appearance', async () => {
  assert.deepEqual(
    await warnings('.erp-page .erp-mobile-search { max-width: 440px; }'),
    []
  )
  assert.deepEqual(
    await warnings(
      '.erp-page input:not(.erp-control-field) { color: inherit; }'
    ),
    []
  )
  assert.deepEqual(
    await warnings(
      '.erp-mobile-controls .erp-control-field:focus { outline: 0; }',
      'src/erp/styles/app/control-focus.css'
    ),
    []
  )
})

test('duplicate classes are rejected only within the same compound selector', async () => {
  assert.match(
    (await warnings('.erp-page.erp-page input { color: red; }'))[0],
    /重复/u
  )
  assert.match(
    (await warnings('.erp-page :is(.ant-input.ant-input) { color: red; }'))[0],
    /重复/u
  )
  assert.deepEqual(await warnings('.erp-page .erp-page { color: red; }'), [])
})

test('focus painting belongs to the shared control owner, layout and custom controls remain local', async () => {
  const code =
    '.erp-page .ant-input:focus { border-color: green; box-shadow: none; }'
  assert.equal((await warnings(code)).length, 2)
  assert.deepEqual(
    await warnings(code, 'src/erp/styles/app/control-focus.css'),
    []
  )
  assert.deepEqual(
    await warnings(
      '.erp-page .ant-input { width: 100%; } .erp-link:focus-visible { outline: 2px solid green; }'
    ),
    []
  )
})

test('module print rules use a named page and keyframes do not require a scope', async () => {
  assert.match((await warnings('@page { margin: 0; }'))[0], /命名/u)
  assert.deepEqual(
    await warnings(
      '@page erp-report { margin: 0; } @keyframes fade { from { opacity: 0; } to { opacity: 1; } }'
    ),
    []
  )
})

test('control radius has one owner and compound controls may opt into square seams', async () => {
  assert.match(
    (
      await warnings(
        '.erp-page :where(.ant-input, .ant-picker) { border-radius: 12px; }'
      )
    )[0],
    /圆角/u
  )
  assert.deepEqual(
    await warnings(
      '.ant-input { border-radius: 12px; }',
      'src/erp/styles/app/control-foundation.css'
    ),
    []
  )
  assert.deepEqual(
    await warnings(
      '.erp-range .ant-picker { --erp-control-radius: 0; } .erp-card { border-radius: 12px; }'
    ),
    []
  )
})

test('Tailwind form styles require opt-in classes and cannot reset AntD native inputs', async () => {
  const { css } = await postcss([
    tailwindcss({
      ...tailwindConfig,
      content: [
        {
          raw: '<input class="form-input form-radio block"><select class="form-select"></select><textarea class="form-textarea"></textarea>',
        },
      ],
      corePlugins: { preflight: false },
    }),
  ]).process('@tailwind base; @tailwind components; @tailwind utilities;', {
    from: undefined,
  })
  for (const name of ['input', 'radio', 'select', 'textarea']) {
    assert.match(css, new RegExp(`\\.form-${name}`))
  }
  assert.doesNotMatch(css, /\[type=['"](?:text|password|email|radio)['"]\]/u)
})
