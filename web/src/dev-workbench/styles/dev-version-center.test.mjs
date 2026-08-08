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

test('mobile timing labels wrap and retain Chinese-first trace titles', () => {
  assert.match(
    css,
    /@media \(max-width: 1100px\)[\s\S]*[.]erp-dev-pipeline-timing__summary strong,[\s\S]*overflow-wrap: anywhere;[\s\S]*white-space: normal;/u
  )
  assert.match(
    component,
    /deliveryPipelinePresentation\(\s*stage[.]name \|\| stage[.]label\s*\)/u
  )
  assert.match(component, /stagePresentation[.]title/u)
  assert.match(
    component,
    /deliveryPipelinePresentation\(summary[.]bottleneck[.]name\)[\s\S]*[.]title/u
  )
})

test('artifact and transfer metrics collapse from three columns to one', () => {
  assert.match(
    css,
    /[.]erp-dev-operation-metrics \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/u
  )
  assert.match(
    css,
    /@media \(max-width: 1100px\)[\s\S]*[.]erp-dev-operation-metrics \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u
  )
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*[.]erp-dev-operation-metrics \{[\s\S]*grid-template-columns: 1fr;/u
  )
  assert.match(component, /最新发布 BuildKit 命中/u)
  assert.match(component, /最近部署传输/u)
  assert.match(component, /失败原因/u)
  assert.match(
    css,
    /@media \(max-width: 1100px\)[\s\S]*[.]erp-dev-pipeline-timing__summary \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u
  )
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*[.]erp-dev-pipeline-timing__summary,[\s\S]*grid-template-columns: 1fr;/u
  )
})
