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
