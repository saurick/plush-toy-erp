import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(
  new URL('./dev-navigation.css', import.meta.url),
  'utf8'
)
const panel = readFileSync(
  new URL('../components/DevEnvironmentEvidencePanel.jsx', import.meta.url),
  'utf8'
)

test('environment evidence keeps all target facts and workbench history in one mobile area', () => {
  assert.match(panel, /环境与验收事实/u)
  assert.match(
    css,
    /@media \(max-width: 720px\)[\s\S]*\.erp-dev-environment-evidence__grid \{[\s\S]*display: flex;[\s\S]*overflow-x: auto;[\s\S]*scroll-snap-type: inline mandatory;/u
  )
  assert.match(
    css,
    /\.erp-dev-environment-card \{[\s\S]*flex: 0 0 min\(300px, calc\(100vw - 68px\)\);[\s\S]*scroll-snap-align: start;/u
  )
  assert.match(
    css,
    /\.erp-dev-environment-evidence__grid:focus-visible \{[\s\S]*outline:/u
  )
  assert.match(
    panel,
    /role="region"[\s\S]*aria-label="本地开发、demo 项目演练造数、test 甲方测试验收与隔离完整验收的环境与验收事实"[\s\S]*tabIndex=\{0\}/u
  )
  assert.match(panel, /最近工作台操作/u)
  assert.match(panel, /最严重阻断/u)
  assert.match(panel, /最后核对/u)
  assert.match(panel, /查看工作台操作记录/u)
  assert.match(panel, /远端 CI\/CD 活动/u)
  assert.match(panel, /Release \/ SHA/u)
  assert.match(panel, /客户配置 revision/u)
  assert.match(panel, /数据版本 \/ run/u)
  assert.match(panel, /权威读回于/u)
  assert.match(panel, /当前下一步/u)
  assert.match(
    panel,
    /<details>[\s\S]*<summary>身份与边界<\/summary>[\s\S]*<dl>[\s\S]*Release \/ SHA[\s\S]*Semantic digest[\s\S]*card\.health[\s\S]*card\.rollbackBoundary[\s\S]*<\/details>/u,
    '技术身份、健康细节与回滚边界必须默认收起，常驻摘要只保留结果、时间和下一步'
  )
  assert.match(
    panel,
    /<Skeleton active paragraph=\{\{ rows: 2 \}\} title=\{false\} \/>/u,
    '首次读回的三张目标卡必须使用紧凑骨架，避免把 DEV 页面首屏整体下推'
  )
})
