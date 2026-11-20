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
const businessTableCss = readFileSync(
  resolve(__dirname, '../styles/app/business-tables.css'),
  'utf8'
)

test('共享操作条按真实可用空间收纳，不按动作类别或屏幕固定数量隐藏', () => {
  assert.match(
    layoutSource,
    /erp-business-selection-action-bar__actions--responsive/u
  )
  assert.match(layoutSource, /更多操作/u)
  assert.match(layoutSource, /selectStableBusinessActionIndexes/u)
  assert.doesNotMatch(layoutSource, /(?:PHONE|TABLET|DESKTOP)_SELECTION_ACTION_LIMIT|OVERFLOW_ACTION_ROLES/u)
})

test('当前操作条适配容器变化，按钮尺寸不参与过渡', () => {
  assert.match(layoutSource, /ResizeObserver/u)
  assert.match(
    businessTableCss,
    /erp-business-selection-action-bar__actions \.ant-btn[\s\S]*?transition-property:\s*color, background-color, border-color, box-shadow;/u
  )
})

test('更多操作使用点击下拉，未选择也可查看，并保留键盘交互', () => {
  assert.doesNotMatch(layoutSource, /<Drawer/u)
  assert.match(layoutSource, /popupRender=\{renderMoreActions\}/u)
  assert.match(layoutSource, /placement="bottomRight"/u)
  assert.match(layoutSource, /open=\{moreActionsOpen\}/u)
  assert.match(layoutSource, /autoFocus/u)
  assert.match(
    layoutSource,
    /onKeyDown=\{\(event\) => \{[\s\S]*?event\.key === 'Escape'[\s\S]*?closeMoreActionsAndRestoreFocus\(\)[\s\S]*?focusMoreAction\(event\)/u
  )
  assert.match(layoutSource, /ref=\{moreActionsTriggerRef\}/u)
  assert.match(layoutSource, /aria-expanded=\{moreActionsOpen\}/u)
  assert.doesNotMatch(
    layoutSource,
    /erp-business-selection-action-bar__compact-more[\s\S]*?disabled=\{!hasSelection\}/u
  )
  assert.doesNotMatch(
    layoutSource,
    /if \(!compact \|\| !hasSelection\) setMoreActionsOpen\(false\)/u
  )
  assert.match(
    layoutSource,
    /moreActionsListRef\.current[\s\S]*?button:not\(:disabled\), \.erp-business-action-tooltip-anchor\[tabindex="0"\][\s\S]*?preventScroll: true/u
  )
  assert.doesNotMatch(layoutSource, /useState\(true\)/u)
  assert.match(layoutSource, /React\.Children\.map\(action\.props\.children/u)
  assert.match(layoutSource, /containsDeferredSelectionAction\(action\)/u)
  assert.match(layoutSource, /forceRender/u)
  assert.match(layoutSource, /destroyOnHidden=\{false\}/u)
})

test('临时不可用动作使用共享提示，禁用按钮仍可触发原因说明', () => {
  assert.match(layoutSource, /export function BusinessActionTooltip/u)
  assert.match(layoutSource, /disabledReason = ''/u)
  assert.match(
    layoutSource,
    /<Tooltip[\s\S]*?title=\{disabled && disabledReason \? disabledReason : null\}[\s\S]*?trigger=\{\['hover', 'focus'\]\}[\s\S]*?erp-business-action-tooltip-anchor/u
  )
  assert.doesNotMatch(
    layoutSource,
    /if \(!disabled \|\| !disabledReason\) return children/u
  )
})

test('次级状态动作直接使用共享按钮，保留禁用原因与危险样式', () => {
  const secondarySource = layoutSource.slice(
    layoutSource.indexOf('export function BusinessLifecycleSecondaryAction'),
    layoutSource.indexOf(
      'BusinessLifecycleSecondaryAction.selectionActionPriority'
    )
  )

  assert.doesNotMatch(secondarySource, /<Dropdown/u)
  assert.match(
    secondarySource,
    /<BusinessActionTooltip disabled=\{disabled\} disabledReason=\{disabledReason\}/u
  )
  assert.match(
    secondarySource,
    /data-business-action-key=\{`lifecycle-\$\{action.key\}`\}/u
  )
  assert.match(secondarySource, /danger=\{action.danger === true\}/u)
  assert.match(secondarySource, /disabled=\{disabled\}/u)
  assert.match(secondarySource, /onClick=\{\(\) => onAction\(action\)\}/u)
})

test('窄屏动作保持可读触控尺寸，不再把全部按钮逐行撑满', () => {
  assert.match(
    responsiveCss,
    /erp-business-selection-action-bar__actions--responsive[\s\S]*white-space:\s*nowrap/u
  )
  assert.match(
    responsiveCss,
    /@media screen and \(max-width: 991px\)[\s\S]*?erp-business-selection-action-bar__actions--responsive\s+\.ant-btn\s*\{[^}]*min-height:\s*44px/u
  )
  assert.match(
    responsiveCss,
    /erp-business-selection-action-bar__action-item,[\s\S]*?width:\s*max-content;[\s\S]*?flex:\s*0 0 auto;/u
  )
  assert.match(
    responsiveCss,
    /erp-business-selection-action-menu__item[\s\S]*min-height:\s*44px/u
  )
})
