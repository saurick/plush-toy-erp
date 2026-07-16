import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DASHBOARD_DOUBLE_CLICK_CONTROL_SELECTOR,
  openDashboardItemOnDoubleClick,
  shouldIgnoreDashboardDoubleClick,
} from './dashboardDoubleClick.mjs'

test('dashboard double-click guard covers nested interactive controls', () => {
  for (const selector of [
    'a',
    'button',
    'input',
    'textarea',
    'select',
    'label',
    '[role="button"]',
    '[role="link"]',
    '.ant-pagination',
    '.ant-picker',
    '.ant-select',
  ]) {
    assert.equal(
      DASHBOARD_DOUBLE_CLICK_CONTROL_SELECTOR.includes(selector),
      true,
      `missing interactive selector: ${selector}`
    )
  }

  const interactiveTarget = {
    closest(selector) {
      assert.equal(selector, DASHBOARD_DOUBLE_CLICK_CONTROL_SELECTOR)
      return { tagName: 'BUTTON' }
    },
  }
  assert.equal(
    shouldIgnoreDashboardDoubleClick({ target: interactiveTarget }),
    true
  )
})

test('dashboard double-click opens plain surfaces exactly once', () => {
  let openCount = 0
  const plainTarget = { closest: () => null }

  assert.equal(
    openDashboardItemOnDoubleClick({ target: plainTarget }, () => {
      openCount += 1
    }),
    true
  )
  assert.equal(openCount, 1)
})

test('dashboard double-click ignores controls and missing actions', () => {
  let openCount = 0
  const interactiveTarget = { closest: () => ({ tagName: 'A' }) }

  assert.equal(
    openDashboardItemOnDoubleClick({ target: interactiveTarget }, () => {
      openCount += 1
    }),
    false
  )
  assert.equal(
    openDashboardItemOnDoubleClick({ target: { closest: () => null } }),
    false
  )
  assert.equal(openCount, 0)
})
