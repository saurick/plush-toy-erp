import assert from 'node:assert/strict'
import test from 'node:test'

import { outsourcingFactProductSKUText } from './outsourcingFactDisplay.mjs'

test('outsourcing fact SKU display prefers the frozen source snapshot', () => {
  assert.equal(
    outsourcingFactProductSKUText({
      product_sku_id: 501,
      sku_code_snapshot: '  SKU-OUT-SNAPSHOT  ',
    }),
    'SKU-OUT-SNAPSHOT'
  )
})

test('outsourcing fact SKU display keeps historical missing values honest', () => {
  assert.equal(outsourcingFactProductSKUText({ product_sku_id: 501 }), '产品规格已关联')
  assert.equal(outsourcingFactProductSKUText({ product_sku_id: null }), '-')
  assert.equal(outsourcingFactProductSKUText({}), '-')
})
