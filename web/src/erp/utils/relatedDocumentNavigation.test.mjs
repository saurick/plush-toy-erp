import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  canOpenRelatedDocumentPath,
  clearLinkedDocumentParams,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
  relatedDocumentRoute,
} from './relatedDocumentNavigation.mjs'

test('related document route keeps exact context and a visible business number', () => {
  assert.equal(
    relatedDocumentRoute(
      '/erp/warehouse/inbound',
      { receipt_id: 16 },
      {
        keyword: 'PR-001',
        source: 'finance-payable',
        fields: ['receipt_no', 'source_no'],
      }
    ),
    '/erp/warehouse/inbound?receipt_id=16&link_keyword=PR-001&link_source=finance-payable&link_fields=receipt_no%2Csource_no'
  )
})

test('linked document context is readable and clears as one unit', () => {
  const params = new URLSearchParams(
    'receipt_id=16&link_keyword=PR-001&link_source=finance-payable&link_fields=receipt_no%2Csource_no'
  )
  assert.deepEqual(linkedDocumentContext(params), {
    keyword: 'PR-001',
    source: 'finance-payable',
    fields: ['receipt_no', 'source_no'],
  })
  assert.equal(clearLinkedDocumentParams(params).toString(), 'receipt_id=16')
})

test('exact context owns filtering while linked keyword stays presentation-only', () => {
  assert.equal(
    linkedDocumentRequestKeyword({
      linkedKeyword: 'PR-001',
      hasExactContext: true,
    }),
    ''
  )
  assert.equal(
    linkedDocumentRequestKeyword({ linkedKeyword: 'PR-001' }),
    'PR-001'
  )
  assert.equal(
    linkedDocumentRequestKeyword({
      localKeyword: '供应商甲',
      linkedKeyword: 'PR-001',
      hasExactContext: true,
    }),
    ''
  )
})

test('related document path requires both menu and effective page projection', () => {
  const adminProfile = {
    permissions: ['purchase.receipt.read'],
    effective_session: {
      pages: ['inbound'],
      actions: ['purchase.receipt.read'],
    },
  }
  assert.equal(
    canOpenRelatedDocumentPath({
      path: '/erp/warehouse/inbound',
      adminProfile,
      allowedMenuPaths: ['/erp/warehouse/inbound'],
    }),
    true
  )
  assert.equal(
    canOpenRelatedDocumentPath({
      path: '/erp/warehouse/inbound',
      adminProfile,
      allowedMenuPaths: ['/erp/finance/payables'],
    }),
    false
  )
  assert.equal(
    canOpenRelatedDocumentPath({
      path: '/erp/warehouse/inbound',
      adminProfile: {
        ...adminProfile,
        effective_session: { ...adminProfile.effective_session, pages: [] },
      },
      allowedMenuPaths: ['/erp/warehouse/inbound'],
    }),
    false
  )
})

test('quality type changes delegate source compatibility and outsourcing translation', () => {
  const source = readFileSync(
    new URL('../pages/V1QualityInspectionsPage.jsx', import.meta.url),
    'utf8'
  )
  assert.match(
    source,
    /const routeSourceParams = qualityInspectionRouteSourceParams\(\{/u
  )
  assert.match(
    source,
    /listOutsourcingReturnQualityInspections\([\s\S]{0,180}fact_id: routeSourceParams\.fact_id/u
  )
  assert.match(source, /!isQualityInspectionRouteSourceCompatible\(/u)
  assert.match(
    source,
    /routeKeysToClear\.push\('source_type', 'source_id'\)/u
  )
})

test('inventory source type changes clear and stop reusing an incompatible route source id', () => {
  const source = readFileSync(
    new URL('../pages/V1InventoryLedgerPage.jsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /const routeSourceMatchesLocal =/u)
  assert.match(
    source,
    /source_id: routeSourceMatchesLocal\s*\?\s*routeSourceID \|\| undefined\s*:\s*undefined/u
  )
  assert.match(
    source,
    /clearRouteContext\(\['source_type', 'source_id'\]\)[\s\S]{0,100}setSourceType\(nextType\)/u
  )
})
