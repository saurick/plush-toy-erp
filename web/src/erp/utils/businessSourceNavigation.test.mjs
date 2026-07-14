import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  businessSourceRouteFor,
  sourceRouteFor,
} from './businessSourceNavigation.mjs'

test('business source navigation emits the query owned by each direct target page', () => {
  assert.equal(
    businessSourceRouteFor('SALES_ORDER', 11),
    '/erp/sales/project-orders/sales-orders?sales_order_id=11'
  )
  assert.equal(
    businessSourceRouteFor('PRODUCTION_ORDER', 12),
    '/erp/production/orders?production_order_id=12'
  )
  assert.equal(
    businessSourceRouteFor('PRODUCTION_FACT', 13),
    '/erp/production/progress?fact_id=13'
  )
  assert.equal(
    businessSourceRouteFor('OUTSOURCING_ORDER', 14),
    '/erp/purchase/processing-contracts?outsourcing_order_id=14'
  )
  assert.equal(
    businessSourceRouteFor('PURCHASE_ORDER', 15),
    '/erp/purchase/accessories?purchase_order_id=15'
  )
  assert.equal(
    businessSourceRouteFor('PURCHASE_RECEIPT', 16),
    '/erp/warehouse/inbound?receipt_id=16'
  )
  assert.equal(
    businessSourceRouteFor('QUALITY_INSPECTION', 17),
    '/erp/production/quality-inspections?quality_inspection_id=17'
  )
  assert.equal(
    businessSourceRouteFor('SHIPMENT', 18),
    '/erp/warehouse/shipments?shipment_id=18'
  )
})

test('business source navigation fails closed for indirect or ambiguous source ids', () => {
  for (const sourceType of [
    'PRODUCTION_ORDER_MATERIAL_REQUIREMENT',
    'OUTSOURCING_FACT',
    'PURCHASE_RETURN',
    'FINANCE_FACT',
    'unknown',
    '',
  ]) {
    assert.equal(sourceRouteFor(sourceType), '')
    assert.equal(businessSourceRouteFor(sourceType, 99), '')
  }
  assert.equal(businessSourceRouteFor('SALES_ORDER', 0), '')
  assert.equal(businessSourceRouteFor('SALES_ORDER', 'not-an-id'), '')
})

test('direct source route keys are consumed by their target pages', () => {
  const pageSource = (relativePath) =>
    readFileSync(
      fileURLToPath(new URL(`../pages/${relativePath}`, import.meta.url)),
      'utf8'
    )

  const contracts = [
    ['V1SalesOrdersPage.jsx', 'sales_order_id', 'getSalesOrder'],
    ['V1ProductionOrdersPage.jsx', 'production_order_id', 'getProductionOrder'],
    [
      'V1OutsourcingOrdersPage.jsx',
      'outsourcing_order_id',
      'getOutsourcingOrder',
    ],
    ['V1PurchaseOrdersPage.jsx', 'purchase_order_id', 'getPurchaseOrder'],
    [
      'V1QualityInspectionsPage.jsx',
      'quality_inspection_id',
      'getQualityInspection',
    ],
  ]
  for (const [page, queryKey, loader] of contracts) {
    const source = pageSource(page)
    assert.match(source, new RegExp(`["']${queryKey}["']`, 'u'))
    assert.match(source, new RegExp(`\\b${loader}\\b`, 'u'))
  }

  const productionFacts = pageSource('OperationalFactsPage.jsx')
  assert.match(productionFacts, /'fact_id'/u)
  assert.match(
    productionFacts,
    /key === 'production'[\s\S]{0,120}keyword: routeFactID/u
  )

  assert.match(pageSource('V1PurchaseReceiptsPage.jsx'), /'receipt_id'/u)
  assert.match(pageSource('ShipmentsPage.jsx'), /'shipment_id'/u)
})
