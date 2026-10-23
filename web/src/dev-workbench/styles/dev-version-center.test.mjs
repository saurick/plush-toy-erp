import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readDevWorkbenchPageSource } from '../../../scripts/test/pageSources.mjs'

const css = readFileSync(
  new URL('./dev-version-center.css', import.meta.url),
  'utf8'
)
const component = readFileSync(
  new URL('../components/DevPipelineTimingPanel.jsx', import.meta.url),
  'utf8'
)
const timestampComponent = readFileSync(
  new URL('../components/DevTimestamp.jsx', import.meta.url),
  'utf8'
)
const versionPage = readDevWorkbenchPageSource('DevVersionCenterPage.jsx')

test('version center keeps strict quality evidence as a compact summary and deep link', () => {
  assert.match(versionPage, /当前发布 SHA 严格门禁/u)
  assert.match(versionPage, /formatQualityGateDuration/u)
  assert.match(versionPage, /view=run&profile=strict/u)
  assert.doesNotMatch(
    versionPage,
    /qualityGateSummary[\s\S]{0,80}(?:stageTimings|complexity|categories)/u
  )
  assert.match(css, /[.]erp-dev-version-quality-gate-summary/u)
  assert.match(
    versionPage,
    /erp-dev-version-next[\s\S]*erp-dev-version-quality-gate-summary/u
  )
})

test('manual takeover keeps the Git index lock diagram readable on its guide page', () => {
  assert.match(versionPage, /erp-dev-version-takeover-lock-flow/u)
  assert.match(css, /[.]erp-dev-version-takeover-lock-flow/u)
  assert.match(
    css,
    /[.]erp-dev-version-takeover-guide > section \{[\s\S]*?min-width:\s*0/u
  )
  assert.match(
    css,
    /[.]erp-dev-version-takeover-lock-flow [.]erp-markdown-mermaid,[\s\S]*?[.]erp-dev-version-takeover-lock-flow [.]erp-markdown-mermaid__viewport \{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%/u
  )
})

test('CI/CD timing separates event timestamps from default and deep detail levels', () => {
  assert.match(component, /DevTimestamp/u)
  assert.match(timestampComponent, /normalizeDevTimestamp/u)
  assert.match(timestampComponent, /<time dateTime=\{timestamp[.]dateTime\} title=\{timestamp[.]dateTime\}>/u)
  assert.match(component, /value=\{latestRun[.]finishedAt\}/u)
  assert.match(component, /value=\{release[?][.]publishedAt\}/u)
  assert.match(component, /value=\{deploymentOperation[?][.]updatedAt\}/u)
  assert.match(
    component,
    /erp-dev-pipeline-timing__analysis[\s\S]*流水线关键路径（可见部分）[\s\S]*耗时最长环节[\s\S]*erp-dev-pipeline-timing__details/u
  )
  assert.match(component, /查看全部任务与步骤/u)
  assert.match(component, /各任务默认收起/u)
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
    /<DevTimestamp[\s\S]*value=\{record[.]publishedAt\}[\s\S]*action="发布于"/u
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

test('timing labels keep Chinese-first trace titles', () => {
  assert.match(component, /presentStage = deliveryPipelinePresentation/u)
  assert.match(component, /presentStage\(stage[.]name \|\| stage[.]label\)/u)
  assert.match(component, /stagePresentation[.]title/u)
  assert.match(component, /所属任务：\$\{groupPresentation[.]title\}/u)
  assert.match(
    versionPage,
    /presentStage=\{deliveryOperationMessagePresentation\}/u
  )
})

test('version decisions and target evidence remain source-backed', () => {
  assert.match(versionPage, /aria-label="当前发布结论与下一步"/u)
  assert.match(versionPage, /boundaries[?][.]releaseDispatchAllowed/u)
  assert.match(versionPage, /disabled=\{!canDispatch\}/u)
  assert.match(versionPage, /aria-label="切换当前操作目标"/u)
  assert.match(versionPage, /data-kind="local"/u)
  assert.match(versionPage, /data-kind="release"/u)
  assert.match(versionPage, /data-kind="target"/u)
  assert.match(versionPage, /data-kind="public-entry"/u)
  assert.match(versionPage, /selectedTargetDefinition[.]dataBoundary/u)
  assert.doesNotMatch(
    versionPage,
    /erp-dev-version-target-selector__boundaries/u
  )
  assert.match(component, /构建缓存与制品/u)
  assert.match(versionPage, /v2 · 7 项制品/u)
  assert.match(versionPage, /v1 · 6 项制品/u)
  assert.match(versionPage, /record\.completeAssets\s*\? record\.promotionEligible\s*\? '保留中 · 制品齐全'\s*: record\.assets\.includes\('release-rehearsal\.json'\)\s*\? '演练证据待补齐'\s*: '仅可回滚'/u)
  assert.match(versionPage, /RETENTION_STATES\[record\.retention\.state\]\.label/u)
  assert.match(versionPage, /制品文件已清理，版本和部署记录保留/u)
  assert.match(
    versionPage,
    /if \(\['cleaned', 'cleaning'\]\.includes\(record\.retention\?\.state\)\) return <Text type="secondary">文件已清理，记录可查<\/Text>\s*const actionKind = deliveryVersionActionKind\(record\)/u
  )
  assert.match(versionPage, /CI\/CD 证据分两处查看/u)
  assert.match(
    versionPage,
    /发布与部署耗时汇总 GitLab 的 CI[\s\S]*检查、构建和制品发布耗时/u
  )
  assert.match(
    versionPage,
    /操作记录看工作台发起的发布、目标部署、回滚和数据重建结果/u
  )
  assert.match(css, /[.]erp-dev-version-workspace__evidence-note/u)
  assert.doesNotMatch(component, /展示远端流水线、制品发布和构建耗时/u)
  assert.doesNotMatch(component, /最近真实部署与传输/u)
  assert.match(component, /最近一次制品发布/u)
  assert.doesNotMatch(
    component,
    /目标部署仍以“操作记录”中的独立回执为准/u
  )
  assert.match(component, /失败原因/u)
  assert.match(component, /最近发布与部署/u)
  assert.match(component, /查看耗时详情/u)
})

test('manual takeover guide uses a standalone page without the former modal limits', () => {
  assert.match(versionPage, /手动与应急发布指引/u)
  assert.match(versionPage, /<ManualTakeoverGuide \/>/u)
  assert.match(versionPage, /<main className="erp-dev-version-guide-content">/u)
  assert.doesNotMatch(css, /erp-dev-version-takeover-modal/u)
})

test('operation detail separates release artifacts from target deployment metrics', () => {
  assert.match(versionPage, /title=\{operationDetailView[.]title\}/u)
  assert.match(versionPage, /operationDetailView[.]timingLabel/u)
  assert.match(versionPage, /operationDetailView[.]scopeNote/u)
  assert.match(versionPage, /operationReleaseMetricItems/u)
  assert.match(versionPage, /operationTargetMetricItems/u)
  assert.doesNotMatch(versionPage, /制品与传输效能/u)
  assert.doesNotMatch(versionPage, />传输制品</u)
  assert.match(versionPage, /技术详情与状态事件/u)
})

test('operation history filters expose high-value dimensions', () => {
  assert.match(versionPage, /role="search"/u)
  assert.match(versionPage, /筛选发布与部署记录/u)
  assert.match(versionPage, />结果</u)
  assert.match(versionPage, />动作</u)
  assert.match(versionPage, />记录归属</u)
  assert.match(versionPage, /aria-label="记录归属"/u)
  assert.match(versionPage, /value=\{operationHistoryFilters\.target\}/u)
  assert.match(versionPage, /版本 \/ SHA \/ 操作 ID/u)
  assert.match(versionPage, /清空筛选/u)
  assert.match(versionPage, /updateOperationHistoryFilter/u)
  assert.match(versionPage, /clearOperationHistoryFilters/u)
})
