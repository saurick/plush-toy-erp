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
    'payload.material_category': 6,
    material_name: 6,
    'payload.supplier_item_no': 6,
    spec: 5,
    'payload.color': 6,
    unit: 3,
    'payload.assembly_part': 6,
    'payload.piece_count': 4,
    'payload.unit_usage': 4,
    'payload.loss_rate': 4,
    quantity: 4,
    'payload.process_prepare_note': 6,
    'payload.process_type': 6,
    supplier_name: 5,
    item_name: 6,
  })
  assert.equal(
    resolveBusinessRecordItemRowMinWidth(definition.itemFields),
    4928
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
