import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

test('audit logs responsive contract: phone and tablet use Drawer while desktop keeps inline detail', () => {
  const pageSource = readSource('../pages/AuditLogsPage.jsx')
  const styleSource = readSource('../styles/app/theme-overrides.css')

  assert.match(
    pageSource,
    /import React, \{[\s\S]*?useRef[\s\S]*?\} from 'react'/u
  )
  assert.match(pageSource, /Drawer,[\s\S]*?Grid,/u)
  assert.match(pageSource, /const screens = Grid\.useBreakpoint\(\)/u)
  assert.match(pageSource, /const compactAuditLayout = !screens\.lg/u)
  assert.match(
    pageSource,
    /const \[detailDrawerOpen, setDetailDrawerOpen\] = useState\(false\)/u
  )
  assert.match(pageSource, /<aside className="erp-audit-detail"/u)
  assert.match(pageSource, /rootClassName="erp-audit-detail-drawer"/u)
  assert.match(pageSource, /width=\{screens\.md \? 560 : '100%'\}/u)
  assert.match(
    pageSource,
    /compactAuditLayout && detailDrawerOpen && Boolean\(selectedEvent\)/u
  )
  assert.match(
    styleSource,
    /@media \(max-width: 991px\) \{[\s\S]*?\.erp-audit-workspace > \.erp-audit-detail \{\s*display: none;/u
  )
})

test('audit logs responsive contract: detail opens from the event card and restores focus after close', () => {
  const pageSource = readSource('../pages/AuditLogsPage.jsx')

  assert.match(pageSource, /eventTriggerRef\.current = event\.currentTarget/u)
  assert.match(
    pageSource,
    /if \(compactAuditLayout\) \{[\s\S]*?setDetailDrawerOpen\(true\)/u
  )
  assert.match(
    pageSource,
    /keyboard[\s\S]*?maskClosable[\s\S]*?destroyOnHidden/u
  )
  assert.match(pageSource, /onClose=\{closeDetailDrawer\}/u)
  assert.match(
    pageSource,
    /const closeDetailDrawer = useCallback\(\(\) => \{[\s\S]*?setDetailDrawerOpen\(false\)[\s\S]*?DRAWER_FOCUS_RESTORE_FALLBACK_MS/u
  )
  assert.match(
    pageSource,
    /activeElement !== document\.body[\s\S]*?activeElement\.isConnected/u
  )
  assert.match(
    pageSource,
    /afterOpenChange=\{\(open\) => \{[\s\S]*?restoreEventTriggerFocus\(\)[\s\S]*?clearFocusRestoreTimer\(\)/u
  )
})

test('audit logs responsive contract: empty or desktop state closes compact detail', () => {
  const pageSource = readSource('../pages/AuditLogsPage.jsx')

  assert.match(
    pageSource,
    /if \(!compactAuditLayout \|\| !selectedEvent\) \{\s*setDetailDrawerOpen\(false\)/u
  )
  assert.match(
    pageSource,
    /filteredEvents\[0\] \? getEventDomId\(filteredEvents\[0\]\) : null/u
  )
  assert.match(pageSource, /<AuditEventDetail event=\{selectedEvent\} \/>/u)
})

test('audit logs request failure clears stale facts and exposes a retry state', () => {
  const pageSource = readSource('../pages/AuditLogsPage.jsx')

  assert.match(pageSource, /setEvents\(\[\]\)/u)
  assert.match(pageSource, /setTotal\(0\)/u)
  assert.match(pageSource, /setSelectedEventId\(null\)/u)
  assert.match(pageSource, /setDetailDrawerOpen\(false\)/u)
  assert.match(pageSource, /message="操作记录加载失败"/u)
  assert.match(pageSource, /当前不展示上一次筛选结果，请重试/u)
  assert.match(pageSource, /onClick=\{loadData\}/u)
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
    assert.match(pageSource, new RegExp(`'${eventKey.replaceAll('.', '\\.')}':`, 'u'))
  }
  assert.match(
    pageSource,
    /return '系统准备未完成，请联系管理员检查系统设置'/u
  )
  assert.match(pageSource, /return '系统设置需要管理员检查'/u)
  assert.match(pageSource, /return '本次操作已记录'/u)
  assert.match(pageSource, /visibleAuditChangeKeys\.has\(key\)/u)
  assert.match(pageSource, /accountStatusLabelMap/u)
  assert.match(pageSource, /roleTypeLabelMap/u)
  assert.match(pageSource, /getAuditChangeSummary\(event\)/u)
  assert.match(pageSource, /getAuditChangeSummary\(record\)/u)
  assert.doesNotMatch(
    pageSource,
    /admin_bootstrap\.blocked'[\s\S]{0,180}event\.payload\?\.reason/u
  )
  assert.doesNotMatch(pageSource, /payload\.reason/u)
  assert.doesNotMatch(pageSource, /getVisibleAuditText\(event\.summary/u)
  assert.doesNotMatch(pageSource, /return event\.summary/u)
})
