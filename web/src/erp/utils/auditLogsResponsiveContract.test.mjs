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
  assert.match(pageSource, /message="审计日志加载失败"/u)
  assert.match(pageSource, /当前不展示上一次筛选结果，请重试/u)
  assert.match(pageSource, /onClick=\{loadData\}/u)
})
