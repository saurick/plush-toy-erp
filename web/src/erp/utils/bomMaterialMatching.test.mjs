import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readBOMMaterialSource,
  compareBOMMaterial,
  bomMaterialConflictText,
  buildBOMMaterialCreateDefaults,
} from './bomMaterialMatching.mjs'
import { bindBOMMaterialReference } from './bomMaterialGroups.mjs'
import { buildBOMImportDraft } from './bomXlsxImport.mjs'

const units = [
  { id: 1, code: 'YD', name: '码' },
  { id: 2, code: 'M', name: '米' },
]
const material = {
  id: 3,
  code: 'MAT-3',
  name: '毛线（黑色）',
  supplier_item_no: 'BC-18',
  spec: '51"',
  color: '黑色',
  default_unit_id: 1,
  is_active: true,
}
const item = {
  unit_id: 1,
  quantity: '0.008',
  loss_rate: '0.1',
  total_usage_snapshot: '44',
  source_snapshot: {
    material_name: '黑色毛线',
    supplier_item_no: '客供',
    material_spec: '51″',
    color: '黑色',
    unit: '码',
    row_number: 6,
  },
  _import_source: { materialName: '黑色毛线', associatedMaterialID: undefined },
}

test('名称或料号不同可由人选择，规格颜色单位冲突阻止关联', () => {
  const rows = compareBOMMaterial(item, material, units)
  assert.equal(rows.find((row) => row.key === 'materialName').differs, true)
  assert.equal(bomMaterialConflictText(item, material, units), '')
  assert.match(
    bomMaterialConflictText(item, { ...material, spec: '58"' }, units),
    /规格/u
  )
  assert.match(
    bomMaterialConflictText(item, { ...material, color: '白色' }, units),
    /颜色/u
  )
  assert.match(
    bomMaterialConflictText(item, { ...material, default_unit_id: 2 }, units),
    /单位/u
  )
  assert.match(
    bomMaterialConflictText(item, { ...material, is_active: false }, units),
    /停用/u
  )
  assert.equal(bomMaterialConflictText(item, undefined, units), '')
})

test('标准单位别名使用同一单位身份，不按显示文字误判', () => {
  const aliased = {
    ...item,
    source_snapshot: { ...item.source_snapshot, unit: 'yd' },
  }
  assert.equal(bomMaterialConflictText(aliased, material, units), '')
  assert.equal(
    buildBOMMaterialCreateDefaults(aliased, units).default_unit_id,
    1
  )
})

test('建档预填原表，供料方式不变成料号，历史缺值不从当前档案补造', () => {
  assert.deepEqual(buildBOMMaterialCreateDefaults(item, units), {
    name: '黑色毛线',
    supplier_item_no: undefined,
    spec: '51″',
    color: '黑色',
    default_unit_id: 1,
  })
  assert.equal(buildBOMMaterialCreateDefaults({ source_snapshot: { material_code: 'MAT-SOURCE' } }, units).code, 'MAT-SOURCE')
  const history = readBOMMaterialSource({
    material_id: 3,
    source_snapshot: { unit: '码', row_number: 6 },
  })
  assert.equal(history.materialName, '')
  assert.equal(history.materialSpec, '')
  assert.deepEqual(buildBOMMaterialCreateDefaults({}, units), {})
  assert.deepEqual(compareBOMMaterial(item, null, units), [])
})

test('初次关联、改选和清空保留原表身份，用量快照按既有边界失效', () => {
  const original = structuredClone(item)
  const bound = bindBOMMaterialReference(item, material)
  assert.equal(bound.material_id, 3)
  assert.equal(bound.quantity, '0.008')
  assert.equal(bound.total_usage_snapshot, '44')
  assert.deepEqual(bound.source_snapshot, original.source_snapshot)
  const replaced = bindBOMMaterialReference(bound, { ...material, id: 4 })
  const cleared = bindBOMMaterialReference(replaced, undefined)
  assert.equal(cleared.material_id, undefined)
  assert.equal(cleared.total_usage_snapshot, undefined)
  assert.deepEqual(readBOMMaterialSource(cleared), readBOMMaterialSource(item))
  assert.deepEqual(item, original)
})

test('唯一编号命中仍须核对关键属性，导入快照包含完整材料识别信息', () => {
  const parsed = {
    fileName: '模拟材料.xlsx',
    context: {},
    rows: [
      {
        rowNumber: 6,
        materialCode: 'MAT-3',
        materialName: '黑色毛线',
        supplierItemNo: '客供',
        materialSpec: '58"',
        color: '黑色',
        unit: '码',
        quantity: '0.008',
        lossRate: '0.1',
        sourceSnapshot: {
          row_number: 6,
          sheet_name: '材料明细',
          quantity_value: '0.008',
          loss_source: 'explicit',
        },
      },
    ],
  }
  const draft = buildBOMImportDraft(parsed, { materials: [material], units })
  const imported = draft.values.items[0]
  assert.equal(imported.material_id, undefined)
  assert.equal(imported._import_source.materialMatchStatus, 'conflict')
  assert.equal(imported.source_snapshot.material_name, '黑色毛线')
  assert.equal(imported.source_snapshot.supplier_item_no, '客供')
  assert.equal(imported.source_snapshot.material_spec, '58"')
  assert.equal(
    readBOMMaterialSource({ source_snapshot: imported.source_snapshot })
      .materialName,
    '黑色毛线'
  )
  const excessive = structuredClone(parsed)
  excessive.rows[0].materialName = '料'.repeat(256)
  assert.throws(() => buildBOMImportDraft(excessive), /物料名称不能超过 255/u)
})
