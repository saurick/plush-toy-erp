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
const timestampComponent = readFileSync(
  new URL('../components/DevDeliveryTimestamp.jsx', import.meta.url),
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
  assert.match(
    css,
    /[.]erp-dev-pipeline-timing__jobs > details > summary \{[\s\S]*min-height: 44px;/u
  )
  assert.match(css, /summary:focus-visible/u)
})

test('CI/CD timing separates event timestamps from default and deep detail levels', () => {
  assert.match(component, /DevDeliveryTimestamp/u)
  assert.match(timestampComponent, /formatDeliveryTimestamp/u)
  assert.match(timestampComponent, /<time dateTime=\{value\} title=\{value\}>/u)
  assert.match(component, /value=\{latestRun[.]finishedAt\}/u)
  assert.match(component, /value=\{release[?][.]publishedAt\}/u)
  assert.match(component, /value=\{deploymentOperation[?][.]updatedAt\}/u)
  assert.match(
    component,
    /erp-dev-pipeline-timing__analysis[\s\S]*观测关键路径[\s\S]*耗时最长环节[\s\S]*erp-dev-pipeline-timing__details/u
  )
  assert.match(component, /查看全部 job \/ step/u)
  assert.match(component, /各 job 默认收起/u)
  assert.match(component, /全部展开/u)
  assert.match(component, /全部收起/u)
  assert.match(component, /showTimeRange/u)
  assert.match(css, /[.]erp-dev-pipeline-timing__jobs-toolbar/u)
  assert.match(css, /[.]erp-dev-timing-bars__meta/u)
})

test('version rows expose one complete published timestamp without changing version identity', () => {
  assert.match(versionPage, /erp-dev-version-published-at/u)
  assert.match(versionPage, /发布于/u)
  assert.match(
    versionPage,
    /<DevDeliveryTimestamp[\s\S]*value=\{record[.]publishedAt\}[\s\S]*action="发布于"/u
  )
})

test('version center exposes source-backed decision timestamps at every operation level', () => {
  assert.match(versionPage, /erp-dev-quality-gate-finished-at/u)
  assert.match(
    versionPage,
    /value=\{strictProof[?][.]receipt[?][.]finishedAt\}/u
  )
  assert.match(versionPage, /erp-dev-latest-version-published-at/u)
  assert.match(versionPage, /value=\{versions\[0\][?][.]publishedAt\}/u)
  assert.match(versionPage, /erp-dev-current-operation-time/u)
  assert.match(versionPage, /erp-dev-operation-history-time/u)
  assert.match(versionPage, /erp-dev-operation-detail-time/u)
  assert.match(versionPage, /erp-dev-operation-event-time/u)
  assert.match(versionPage, /operationUpdateAction/u)
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
