import assert from 'node:assert/strict'
import test from 'node:test'

import { getBusinessRecordDefinition } from '../config/businessRecordDefinitions.mjs'
import {
  resolveBusinessRecordItemDesktopSpan,
  resolveBusinessRecordItemRowMinWidth,
  resolveBusinessRecordItemUnitText,
} from './businessRecordItemLayout.mjs'

test('businessRecordItemLayout: 条目字段按文本、数字和单位保留桌面宽度预算', () => {
  const definition = getBusinessRecordDefinition({
    key: 'material-bom',
    sectionKey: 'purchase',
  })
  const spans = Object.fromEntries(
    definition.itemFields.map((field) => [
      field.key,
      resolveBusinessRecordItemDesktopSpan(field),
    ])
  )

  assert.deepEqual(spans, {
    material_name: 6,
    spec: 5,
    quantity: 4,
    unit: 3,
    supplier_name: 5,
  })
  assert.equal(
    resolveBusinessRecordItemRowMinWidth(definition.itemFields),
    1472
  )
})

test('businessRecordItemLayout: 数量后缀取当前行单位，金额类固定显示 CNY', () => {
  assert.equal(
    resolveBusinessRecordItemUnitText(
      { key: 'quantity', label: '数量', type: 'number' },
      { unit: 'PCS' }
    ),
    'PCS'
  )
  assert.equal(
    resolveBusinessRecordItemUnitText(
      { key: 'quantity', label: '数量', type: 'number' },
      {}
    ),
    ''
  )
  assert.equal(
    resolveBusinessRecordItemUnitText({
      key: 'unit_price',
      label: '单价',
      type: 'number',
    }),
    'CNY'
  )
  assert.equal(
    resolveBusinessRecordItemUnitText({
      key: 'amount',
      label: '金额',
      type: 'number',
    }),
    'CNY'
  )
})
