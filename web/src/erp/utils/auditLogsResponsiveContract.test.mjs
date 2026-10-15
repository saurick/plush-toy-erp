import assert from 'node:assert/strict'

import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { readContractSource as readFileSync } from '../../../scripts/test/publicContractSource.mjs'

function readSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

test('audit logs use the shared list and an explicit detail drawer on every screen size', () => {
  const source = readSource('../pages/AuditLogsPage.jsx')
  for (const component of [
    'BusinessPageLayout',
    'BusinessOperationPanel',
    'BusinessDataTable',
    'BusinessListToolbarActions',
  ]) {
    assert.ok(source.includes(`<${component}`))
  }
  assert.match(source, /onOpenRecord=\{openDetail\}/u)
  assert.match(source, /width=\{screens.md \? 640 : '100%'\}/u)
  assert.match(source, /rootClassName="erp-audit-detail-drawer"/u)
  assert.doesNotMatch(source, /erp-audit-workspace|erp-audit-event-list/u)
  assert.match(source, /listAllPaginatedRecords/u)
})

test('audit logs preserve drawer focus return, request recovery and honest page-risk scope', () => {
  const source = readSource('../pages/AuditLogsPage.jsx')
  assert.match(source, /const trigger = event\?\.currentTarget/u)
  assert.match(source, /onClose=\{closeDetailDrawer\}/u)
  assert.match(source, /keyboard[\s\S]*?maskClosable[\s\S]*?destroyOnHidden/u)
  assert.match(source, /restoreEventTriggerFocus/u)
  assert.match(source, /setEvents\(\[\]\)/u)
  assert.match(source, /setSelectedEventId\(null\)/u)
  assert.match(source, /message="操作记录加载失败"/u)
  assert.match(source, /onClick=\{loadData\}/u)
  assert.match(source, /风险仅筛选本页/u)
  assert.match(source, /清空本页风险条件后，可导出完整筛选结果/u)
})

test('audit logs visible summary uses registered business copy and never renders raw event summary', () => {
  const pageSource = readSource('../pages/AuditLogsPage.jsx')

  assert.match(
    pageSource,
    /const registeredMeta = actionMetaMap\[event\.event_key\]/u
  )
  assert.match(pageSource, /label: '其他系统操作'/u)
  assert.match(pageSource, /intent: '系统记录了一项管理操作'/u)
  for (const eventKey of [
    'admin_user.revoked',
    'customer_config.publish',
    'customer_config.activate',
    'customer_config.rollback',
    'workflow_task.break_glass',
  ]) {
    assert.match(
      pageSource,
      new RegExp(`'${eventKey.replaceAll('.', '\\.')}':`, 'u')
    )
  }
  assert.match(pageSource, /return '系统准备未完成，请联系管理员检查系统设置'/u)
  assert.match(pageSource, /return '系统设置需要管理员检查'/u)
  const changesSource = readSource('./auditLogChanges.mjs')
  assert.match(changesSource, /visibleAuditChangeKeys\.has\(key\)/u)
  assert.match(changesSource, /accountStatusLabelMap/u)
  assert.match(changesSource, /roleTypeLabelMap/u)
  assert.match(pageSource, /getAuditChangeSummary\(event\)/u)
  assert.doesNotMatch(
    pageSource,
    /admin_bootstrap\.blocked'[\s\S]{0,180}event\.payload\?\.reason/u
  )
  assert.doesNotMatch(pageSource, /payload\.reason/u)
  assert.doesNotMatch(pageSource, /getVisibleAuditText\(event\.summary/u)
  assert.doesNotMatch(pageSource, /return event\.summary/u)
})
