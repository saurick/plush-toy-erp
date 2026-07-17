import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { productSKUParentFieldContract } from './productSKUParentField.mjs'

const formSource = readFileSync(
  new URL('./MasterDataForm.jsx', import.meta.url),
  'utf8'
)
const pageSource = readFileSync(
  new URL('../../pages/V1MasterDataPage.jsx', import.meta.url),
  'utf8'
)

test('product SKU parent field remains selectable while creating', () => {
  assert.deepEqual(productSKUParentFieldContract(false), {
    allowClear: true,
    disabled: false,
    helpText: undefined,
  })
})

test('product SKU parent field is immutable and explained while editing', () => {
  assert.deepEqual(productSKUParentFieldContract(true), {
    allowClear: false,
    disabled: true,
    helpText: '创建后不可更换所属产品',
  })
})

test('formal product SKU form consumes the edit-state parent contract', () => {
  const skuFields = formSource.slice(
    formSource.indexOf("if (type === 'product_skus')"),
    formSource.indexOf("if (type === 'processes')")
  )

  assert.match(skuFields, /label="所属产品"/u)
  assert.match(skuFields, /name="product_id"/u)
  assert.match(
    skuFields,
    /extra=\{productSKUParentField\.helpText\}[\s\S]*?allowClear=\{productSKUParentField\.allowClear\}[\s\S]*?disabled=\{productSKUParentField\.disabled\}/u
  )
  assert.match(
    pageSource,
    /<MasterDataFormFields[\s\S]*?isEditing=\{Boolean\(editingRecord\?\.id\)\}/u
  )
})
