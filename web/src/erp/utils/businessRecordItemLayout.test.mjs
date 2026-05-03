import assert from 'node:assert/strict'
import test from 'node:test'

import { getBusinessRecordDefinition } from '../config/businessRecordDefinitions.mjs'
import {
  resolveBusinessRecordItemColStyle,
  resolveBusinessRecordItemDesktopSpan,
  resolveBusinessRecordItemFieldWidth,
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
    'payload.material_category': 5,
    material_name: 5,
    'payload.supplier_item_no': 5,
    spec: 5,
    'payload.color': 3,
    unit: 2,
    'payload.assembly_part': 5,
    'payload.piece_count': 3,
    'payload.unit_usage': 3,
    'payload.loss_rate': 3,
    quantity: 3,
    'payload.process_prepare_note': 5,
    'payload.process_type': 5,
    supplier_name: 5,
    item_name: 5,
  })
  assert.equal(
    resolveBusinessRecordItemRowMinWidth(definition.itemFields),
    3968
  )
})

test('businessRecordItemLayout: 客户立项明细按 trade-erp 的短字段预算收窄', () => {
  const definition = getBusinessRecordDefinition({
    key: 'project-orders',
    sectionKey: 'sales',
  })
  const widths = Object.fromEntries(
    definition.itemFields.map((field) => [
      field.key,
      resolveBusinessRecordItemFieldWidth(field),
    ])
  )

  assert.deepEqual(widths, {
    item_name: 320,
    'payload.color': 192,
    spec: 320,
    quantity: 192,
    'payload.production_qty': 192,
    'payload.unshipped_qty': 192,
    unit: 128,
    unit_price: 256,
    amount: 256,
    'payload.line_remark': 320,
  })
  assert.deepEqual(
    resolveBusinessRecordItemColStyle({ key: 'payload.color' }),
    {
      flex: '0 0 192px',
      maxWidth: '192px',
    }
  )
  assert.equal(
    resolveBusinessRecordItemRowMinWidth(definition.itemFields),
    2368
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
