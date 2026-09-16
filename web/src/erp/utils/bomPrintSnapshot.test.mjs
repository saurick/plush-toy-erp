import assert from 'node:assert/strict'
import test from 'node:test'
import { loadBOMPrintSnapshot } from './bomPrintSnapshot.mjs'
import {
  buildMaterialDetailDraftFromBOMVersion,
  buildColorCardDraftFromBOMVersion,
  buildWorkInstructionDraftFromBOMVersion,
} from '../data/engineeringPrintTemplates.mjs'
import { invalidateBOMUsageSnapshots } from './bomMaterialGroups.mjs'

function fixture() {
  return {
    getBOMVersion: async ({ id }) => ({
      id,
      product_id: 11,
      quantity_text: '100',
      items: [
        {
          material_id: 21,
          unit_id: 31,
          quantity: '2',
          loss_rate: '0.1',
          note: '核对色样',
        },
      ],
    }),
    getProduct: async ({ id }) => ({
      id,
      code: 'INTERNAL-11',
      style_no: 'A#',
      name: '产品 A',
      is_active: false,
    }),
    listAllMaterials: async (params) => {
      assert.equal(params.active_only, false)
      return {
        materials: [
          {
            id: 21,
            name: '停用材料',
            supplier_item_no: 'S21',
            spec: '50mm',
            is_active: false,
          },
        ],
      }
    },
    listAllUnits: async () => ({
      units: [{ id: 31, name: '米', is_active: false }],
    }),
  }
}

test('BOM print reloads the selected version and includes disabled references for all three templates', async () => {
  const { detail, ...references } = await loadBOMPrintSnapshot(94, fixture())
  assert.equal(detail.id, 94)
  for (const build of [
    buildMaterialDetailDraftFromBOMVersion,
    buildColorCardDraftFromBOMVersion,
    buildWorkInstructionDraftFromBOMVersion,
  ]) {
    const draft = build(detail, references)
    assert.equal(draft.productNo, 'A#')
    assert.equal(draft.productName, '产品 A')
    assert.match(JSON.stringify(draft), /停用材料/u)
    assert.match(JSON.stringify(draft), /核对色样/u)
  }
  const draft = buildMaterialDetailDraftFromBOMVersion(detail, references)
  assert.equal(draft.lines[0].spec, '50mm')
  assert.equal(draft.lines[0].unit, '米')
  assert.equal(draft.lines[0].totalUsage, '220')
})

test('BOM print reloads changed and cleared fields instead of reusing an earlier draft', async () => {
  const deps = fixture()
  let quantity = '100'
  deps.getBOMVersion = async () => ({
    product_id: 11,
    quantity_text: quantity,
    items: [{ material_id: 21, unit_id: 31, quantity: '2' }],
  })
  const first = await loadBOMPrintSnapshot(94, deps)
  quantity = ''
  const next = await loadBOMPrintSnapshot(94, deps)
  assert.equal(
    buildMaterialDetailDraftFromBOMVersion(first.detail, first).lines[0]
      .totalUsage,
    '200'
  )
  const draft = buildMaterialDetailDraftFromBOMVersion(next.detail, next)
  assert.equal(draft.quantityText, '')
  assert.equal(draft.lines[0].totalUsage, '')
})

test('BOM print stops on reference failures and missing linked records', async () => {
  for (const key of [
    'getBOMVersion',
    'getProduct',
    'listAllMaterials',
    'listAllUnits',
  ]) {
    const deps = fixture()
    deps[key] = async () => {
      throw new Error('读取失败')
    }
    await assert.rejects(loadBOMPrintSnapshot(94, deps), /读取失败/u)
  }
  for (const [key, value] of [
    ['getBOMVersion', null],
    ['getProduct', null],
    ['listAllMaterials', { materials: [] }],
    ['listAllUnits', { units: [] }],
  ]) {
    const deps = fixture()
    deps[key] = async () => value
    await assert.rejects(loadBOMPrintSnapshot(94, deps), /资料不完整/u)
  }
})

test('BOM print uses saved usage including zero, and recalculates only after invalidation', () => {
  const item = {
    quantity: '0.125',
    loss_rate: '0.08',
    total_usage_snapshot: '47.64',
  }
  const build = (item, quantity_text) =>
    buildMaterialDetailDraftFromBOMVersion({ items: [item], quantity_text })
      .lines[0].totalUsage
  assert.equal(build(item, ''), '47.64')
  assert.equal(build({ ...item, total_usage_snapshot: '0' }, '3030'), '0')
  const [changed] = invalidateBOMUsageSnapshots([item], {
    quantity_text: '3030',
  })
  assert.equal(build(changed, '3030'), '409.05')
  const [cleared] = invalidateBOMUsageSnapshots([item], { quantity_text: '' })
  assert.equal(build(cleared, ''), '')
})

test('BOM business drafts do not invent order numbers, dates, materials or sample references', () => {
  const version = { version: 'V1', items: [{ quantity: '1' }] }
  const material = buildMaterialDetailDraftFromBOMVersion(version)
  assert.equal(material.orderNo, '')
  assert.equal(material.dateText, '')
  assert.equal(material.lines[0].category, '')
  assert.equal(material.lines[0].materialName, '')
  assert.equal(material.lines[0].totalUsage, '')
  assert.equal(material.columnLabels.at(-1), '备注')
  assert.equal(buildColorCardDraftFromBOMVersion(version).dateText, '')
})
