import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(
  new URL('./dev-version-center.css', import.meta.url),
  'utf8'
)
const component = readFileSync(
  new URL('../components/DevPipelineTimingPanel.jsx', import.meta.url),
  'utf8'
)

test('CI/CD timing details keep a touch-friendly keyboard-visible trigger', () => {
  assert.match(
    css,
    /[.]erp-dev-pipeline-timing__details > summary \{[\s\S]*min-height: 44px;[\s\S]*padding: 8px 4px;/u
  )
  assert.match(
    css,
    /[.]erp-dev-receipt-card__timings > summary \{[\s\S]*min-height: 44px;[\s\S]*padding: 8px 4px;/u
  )
  assert.match(css, /summary:focus-visible/u)
})

test('mobile timing labels wrap and retain the full readable value', () => {
  assert.match(
    css,
    /@media \(max-width: 1100px\)[\s\S]*[.]erp-dev-pipeline-timing__summary strong,[\s\S]*overflow-wrap: anywhere;[\s\S]*white-space: normal;/u
  )
  assert.match(component, /title=\{stage[.]name \|\| stage[.]label\}/u)
  assert.match(
    component,
    /title=\{summary[.]bottleneck\?\.name \|\| '尚未识别'\}/u
  )
})
