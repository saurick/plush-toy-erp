import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const stylesheet = readFileSync(
  new URL('./business-tables.css', import.meta.url),
  'utf8'
)

test('business header stat labels can use the full tile width', () => {
  const rule = stylesheet.match(
    /\.erp-business-page-header-card__stats \.ant-typography\s*\{([^}]*)\}/
  )

  assert.ok(rule, 'expected the business header stat label rule')
  assert.match(rule[1], /max-width:\s*100%\s*;/)
  assert.doesNotMatch(rule[1], /calc\(100%\s*-\s*46px\)/)
  assert.match(rule[1], /word-break:\s*keep-all\s*;/)
})

test('copyable table cells reveal a real button on hover and keyboard focus', () => {
  assert.match(
    stylesheet,
    /\.erp-business-table-copyable-cell:hover[\s\S]*?\.erp-business-table-copyable-cell__button\.ant-btn[\s\S]*?opacity:\s*1\s*;/u
  )
  assert.match(
    stylesheet,
    /\.erp-business-table-copyable-cell:focus-within[\s\S]*?\.erp-business-table-copyable-cell__button\.ant-btn/u
  )
  assert.match(stylesheet, /@media\s*\(hover:\s*none\)\s*\{/u)
  assert.doesNotMatch(
    stylesheet,
    /@media\s*\(hover:\s*none\)\s+and\s+\(pointer:\s*coarse\)\s*\{/u
  )
})

test('copyable table content keeps the project full-text wrapping contract', () => {
  const rule = stylesheet.match(
    /\.erp-business-table-copyable-cell__content\s*\{([^}]*)\}/u
  )
  assert.ok(rule, 'expected copyable table cell content rule')
  assert.match(rule[1], /white-space:\s*normal\s*;/u)
  assert.match(rule[1], /overflow-wrap:\s*anywhere\s*;/u)
  assert.doesNotMatch(rule[1], /text-overflow:\s*ellipsis\s*;/u)
})

test('screen table header labels stay on one line without clipping', () => {
  const genericTitleRule = stylesheet.match(
    /\.ant-table-wrapper \.ant-table-thead > tr > th \.ant-table-column-title\s*\{([^}]*)\}/u
  )
  assert.ok(genericTitleRule, 'expected the shared Ant table title rule')
  assert.match(genericTitleRule[1], /min-width:\s*max-content\s*;/u)
  assert.match(genericTitleRule[1], /overflow:\s*visible\s*;/u)
  assert.match(genericTitleRule[1], /white-space:\s*nowrap\s*;/u)
  assert.doesNotMatch(genericTitleRule[1], /overflow-wrap:\s*anywhere\s*;/u)

  const businessHeaderContainerRule = stylesheet.match(
    /\.erp-module-column-header\s*\{([^}]*)\}/u
  )
  assert.ok(
    businessHeaderContainerRule,
    'expected the business table header rule'
  )
  assert.match(businessHeaderContainerRule[1], /width:\s*100%\s*;/u)
  assert.match(businessHeaderContainerRule[1], /min-width:\s*0\s*;/u)
  assert.match(businessHeaderContainerRule[1], /max-width:\s*100%\s*;/u)
  assert.match(businessHeaderContainerRule[1], /gap:\s*6px\s*;/u)
  assert.match(businessHeaderContainerRule[1], /white-space:\s*nowrap\s*;/u)

  const businessHeaderControlsRule = stylesheet.match(
    /\.erp-business-module-table-card\s+\.ant-table-wrapper\s+\.ant-table-thead\s+> tr\s+> th\s+\.ant-table-column-sorters:has\(\.erp-module-column-header\)\s*\{([^}]*)\}/u
  )
  assert.ok(
    businessHeaderControlsRule,
    'expected separate spacing between column settings and sorting'
  )
  assert.match(businessHeaderControlsRule[1], /gap:\s*8px\s*;/u)

  const businessHeaderRule = stylesheet.match(
    /\.erp-module-column-header-text\s*\{([^}]*)\}/u
  )
  assert.ok(businessHeaderRule, 'expected the business table header text rule')
  assert.match(businessHeaderRule[1], /min-width:\s*max-content\s*;/u)
  assert.match(businessHeaderRule[1], /max-width:\s*none\s*;/u)
  assert.match(businessHeaderRule[1], /overflow:\s*visible\s*;/u)
  assert.match(businessHeaderRule[1], /text-overflow:\s*clip\s*;/u)
  assert.match(businessHeaderRule[1], /white-space:\s*nowrap\s*;/u)

  const businessHeaderTriggerRule = stylesheet.match(
    /\.erp-module-column-header-trigger\.ant-btn\s*\{([^}]*)\}/u
  )
  assert.ok(
    businessHeaderTriggerRule,
    'expected the business table header trigger rule'
  )
  assert.match(businessHeaderTriggerRule[1], /position:\s*static\s*;/u)
  assert.match(businessHeaderTriggerRule[1], /flex:\s*0 0 auto\s*;/u)
  assert.match(businessHeaderTriggerRule[1], /width:\s*24px\s*;/u)
  assert.match(businessHeaderTriggerRule[1], /min-width:\s*24px\s*;/u)
  assert.match(businessHeaderTriggerRule[1], /height:\s*24px\s*;/u)
  assert.match(businessHeaderTriggerRule[1], /margin-left:\s*auto\s*;/u)
  assert.doesNotMatch(businessHeaderTriggerRule[1], /position:\s*absolute\s*;/u)
})
