import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  BUSINESS_USABILITY_CATALOG,
  BUSINESS_USABILITY_STATUS,
} from '../../erp/config/businessUsabilityCatalog.mjs'
import {
  DEV_BUSINESS_USABILITY_ALL_ROLES,
  DEV_BUSINESS_USABILITY_ALL_STATUS,
  DEV_BUSINESS_USABILITY_PAGE_SIZE,
  DEV_BUSINESS_USABILITY_ROUTE,
  buildBusinessUsabilitySummary,
  filterBusinessUsabilityEntries,
  getBusinessUsabilityRoleLabels,
} from './devBusinessUsability.mjs'

test('devBusinessUsability: 只读摘要来自共享业务易用性目录', () => {
  const summary = buildBusinessUsabilitySummary()
  assert.equal(DEV_BUSINESS_USABILITY_ROUTE, '/__dev/business-usability')
  assert.equal(DEV_BUSINESS_USABILITY_PAGE_SIZE, 10)
  assert.equal(summary.total, BUSINESS_USABILITY_CATALOG.length)
  assert.equal(summary.pageHelpCount, 10)
  assert.equal(summary.covered, 10)
  assert.equal(
    summary.covered + summary.partial + summary.missing,
    summary.total
  )
  assert(summary.explanationCount > summary.pageHelpCount)
})

test('devBusinessUsability: 可按覆盖状态、岗位帮助和通俗文字筛选', () => {
  assert.equal(
    filterBusinessUsabilityEntries(BUSINESS_USABILITY_CATALOG, {
      status: BUSINESS_USABILITY_STATUS.COVERED,
    }).length,
    10
  )
  assert(
    filterBusinessUsabilityEntries(BUSINESS_USABILITY_CATALOG, {
      role: 'warehouse',
    }).every((entry) => entry.roleHelpKeys.includes('warehouse'))
  )
  assert.deepEqual(
    filterBusinessUsabilityEntries(BUSINESS_USABILITY_CATALOG, {
      keyword: '可用量',
    }).map((entry) => entry.key),
    ['inventory']
  )
  assert.equal(
    filterBusinessUsabilityEntries(BUSINESS_USABILITY_CATALOG, {
      status: DEV_BUSINESS_USABILITY_ALL_STATUS,
      role: DEV_BUSINESS_USABILITY_ALL_ROLES,
    }).length,
    BUSINESS_USABILITY_CATALOG.length
  )
  assert(
    getBusinessUsabilityRoleLabels(BUSINESS_USABILITY_CATALOG[0]).every(Boolean)
  )
})

test('devBusinessUsability: 页面明确只读且不复制权限与岗位责任真源', () => {
  const pageSource = readFileSync(
    new URL('../pages/DevBusinessUsabilityPage.jsx', import.meta.url),
    'utf8'
  )
  const styleSource = readFileSync(
    new URL('../styles/dev-business-usability.css', import.meta.url),
    'utf8'
  )
  assert.match(pageSource, /只读检查/u)
  assert.match(pageSource, /推荐岗位不是权限/u)
  assert.match(pageSource, /BUSINESS_USABILITY_CATALOG/u)
  assert.match(
    pageSource,
    /rowKey="key"[\s\S]*size="small"[\s\S]*pageSize: DEV_BUSINESS_USABILITY_PAGE_SIZE[\s\S]*showSizeChanger: false/u
  )
  assert.match(pageSource, /\/erp\/help-center/u)
  assert.match(pageSource, /\/__dev\/status-flows/u)
  assert.match(
    styleSource,
    /\[data-erp-theme='dark'\] \.erp-dev-business-usability-summary strong \{\s*color: var\(--erp-primary-strong, #86efac\);\s*\}/u
  )
  assert.doesNotMatch(
    pageSource,
    /JsonRpc|fetch\(|axios|effective_role_access/u
  )
})
