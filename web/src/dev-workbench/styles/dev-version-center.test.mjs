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
const versionPage = readFileSync(
  new URL('../pages/DevVersionCenterPage.jsx', import.meta.url),
  'utf8'
)

test('version center keeps strict quality evidence as a compact summary and deep link', () => {
  assert.match(versionPage, /当前发布 SHA 严格门禁/u)
  assert.match(versionPage, /formatQualityGateDuration/u)
  assert.match(versionPage, /view=run&profile=strict/u)
  assert.doesNotMatch(
    versionPage,
    /qualityGateSummary[\s\S]{0,80}(?:stageTimings|complexity|categories)/u
  )
  assert.match(css, /[.]erp-dev-version-quality-gate-summary/u)
})

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
  assert.match(component, /所属任务：\$\{groupPresentation[.]title\}/u)
})

test('status, artifact and transfer metrics stay readable across breakpoints', () => {
  assert.match(
    css,
    /[.]erp-dev-version-page > :not\([.]erp-dev-workspace-nav\) \{[\s\S]*width: auto;[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/u
  )
  assert.match(
    css,
    /[.]erp-dev-version-shell \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/u
  )
  assert.match(css, /[.]erp-dev-version-shell > \* \{[\s\S]*min-width: 0;/u)
  assert.match(
    css,
    /[.]erp-dev-version-summary \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/u
  )
  assert.match(
    css,
    /@media \(max-width: 1100px\)[\s\S]*[.]erp-dev-version-summary \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u
  )
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
    /@media \(max-width: 620px\)[\s\S]*[.]erp-dev-operation-metrics,[\s\S]*display: grid;[\s\S]*grid-template-columns: 1fr;/u
  )
  assert.match(
    css,
    /[.]erp-dev-version-page [.]erp-dev-version-summary \{[\s\S]*overflow-x: visible;[\s\S]*scroll-snap-type: none;/u
  )
  assert.match(component, /构建缓存与制品/u)
  assert.match(component, /最近真实部署与传输/u)
  assert.match(component, /相同 SHA 复用不计为目标写入/u)
  assert.match(component, /最近完整发布/u)
  assert.match(component, /相同 SHA 复用/u)
  assert.match(component, /失败原因/u)
  assert.match(component, /交付状态速览/u)
  assert.match(component, /查看完整效能/u)
  assert.match(css, /[.]erp-dev-pipeline-timing__critical-path/u)
  assert.match(
    css,
    /[.]erp-dev-pipeline-status-strip__metrics \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/u
  )
  assert.match(
    css,
    /@media \(max-width: 1100px\)[\s\S]*[.]erp-dev-pipeline-status-strip__metrics \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u
  )
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*[.]erp-dev-pipeline-status-strip__metrics,[\s\S]*grid-template-columns: 1fr;/u
  )
  assert.match(
    css,
    /[.]erp-dev-version-workspace,[\s\S]*[.]erp-dev-version-tab \{[\s\S]*min-width: 0;/u
  )
  assert.match(
    css,
    /@media \(max-width: 1100px\)[\s\S]*[.]erp-dev-pipeline-timing__summary \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u
  )
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*[.]erp-dev-pipeline-timing__summary,[\s\S]*display: grid;[\s\S]*grid-template-columns: 1fr;/u
  )
})

test('dark theme keeps timing surfaces and progress tracks readable', () => {
  assert.match(
    css,
    /:root\[data-erp-theme='dark'\] [.]erp-dev-pipeline-status-strip__metrics > div,[\s\S]*[.]erp-dev-pipeline-timing__summary > div,[\s\S]*[.]erp-dev-operation-metrics > div \{[\s\S]*border-color: rgba\(255, 255, 255, 0[.]16\);[\s\S]*background: rgba\(255, 255, 255, 0[.]06\);/u
  )
  assert.match(
    css,
    /:root\[data-erp-theme='dark'\] [.]erp-dev-timing-bars__track \{[\s\S]*background: rgba\(255, 255, 255, 0[.]16\);/u
  )
  assert.match(
    css,
    /:root\[data-erp-theme='dark'\] [.]erp-dev-pipeline-timing__critical-path \{[\s\S]*background: rgba\(22, 119, 255, 0[.]2\);/u
  )
})
