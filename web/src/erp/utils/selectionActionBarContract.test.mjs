import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const layoutSource = readFileSync(
  resolve(__dirname, '../components/business-list/BusinessListLayout.jsx'),
  'utf8'
)
const responsiveCss = readFileSync(
  resolve(__dirname, '../styles/app/business-responsive.css'),
  'utf8'
)

test('当前操作条按手机和平板宽度收口动作，不为页面各写一套分支', () => {
  assert.match(layoutSource, /PHONE_SELECTION_ACTION_LIMIT\s*=\s*1/u)
  assert.match(layoutSource, /TABLET_SELECTION_ACTION_LIMIT\s*=\s*2/u)
  assert.match(layoutSource, /Grid\.useBreakpoint\(\)/u)
  assert.match(
    layoutSource,
    /erp-business-selection-action-bar__actions--compact/u
  )
  assert.match(layoutSource, /更多操作/u)
  assert.match(layoutSource, /Number\(right\.enabled\) - Number\(left\.enabled\)/u)
})

test('当前操作条的更多面板使用现有 Drawer 契约并显式恢复触发点焦点', () => {
  assert.match(layoutSource, /<Drawer/u)
  assert.match(layoutSource, /open=\{moreActionsOpen\}/u)
  assert.match(layoutSource, /keyboard/u)
  assert.match(layoutSource, /maskClosable/u)
  assert.match(
    layoutSource,
    /moreActionsListRef\.current[\s\S]*?button:not\(:disabled\)[\s\S]*?preventScroll: true/u
  )
  assert.match(layoutSource, /moreActionsButtonRef\.current\?\.focus/u)
  assert.doesNotMatch(layoutSource, /useState\(true\)/u)
  assert.match(layoutSource, /React\.Children\.map\(action\.props\.children/u)
  assert.match(layoutSource, /containsDeferredSelectionAction\(action\)/u)
  assert.match(layoutSource, /destroyOnHidden=\{false\}/u)
})

test('窄屏动作保持可读触控尺寸，不再把全部按钮逐行撑满', () => {
  assert.match(
    responsiveCss,
    /erp-business-selection-action-bar__actions--compact[\s\S]*white-space:\s*nowrap/u
  )
  assert.match(
    responsiveCss,
    /erp-business-selection-action-bar__actions--compact\s+\.erp-business-selection-action-bar__compact-visible\s+\.ant-btn,[\s\S]*?min-height:\s*44px/u
  )
  assert.match(
    responsiveCss,
    /erp-business-selection-action-bar__actions--compact\s+\.erp-business-selection-action-bar__compact-more\.ant-btn\s*\{[\s\S]*?width:\s*auto;[\s\S]*?flex:\s*0 0 auto;/u
  )
  assert.match(
    responsiveCss,
    /erp-business-selection-action-drawer__item[\s\S]*min-height:\s*44px/u
  )
})
