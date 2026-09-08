import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWorkflowTaskIdentity,
  getWorkflowTaskIdentityCode,
  retainWorkflowTaskIdentity,
} from './workflowTaskIdentity.mjs'

test('source projection owns identity, including clear and missing source', () => {
  const task = {
    payload: { product_name: '旧产品', style_no: '旧款号' },
    display_context: { available: true, source_no: 'SO-2', items: [] },
  }
  assert.deepEqual(getWorkflowTaskIdentity(task), {
    available: true,
    sourceNo: 'SO-2',
    items: [],
  })
  task.display_context.available = false
  assert.equal(getWorkflowTaskIdentity(task).available, false)
  assert.equal(getWorkflowTaskIdentity(task).items.length, 0)
})

test('product number and supplier item number are distinct from internal identifiers', () => {
  const task = {
    display_context: {
      available: true,
      items: [
        { kind: 'product', name: '泰迪熊', code: 'P-001', style_no: '' },
        { kind: 'material', name: '短毛绒', code: 'M-001', style_no: '' },
      ],
    },
  }
  const identity = getWorkflowTaskIdentity(task)
  assert.equal(identity.items.length, 2)
  assert.equal(getWorkflowTaskIdentityCode(identity.items[0]), '产品编号 P-001')
  assert.equal(getWorkflowTaskIdentityCode(identity.items[1]), '款号未填写')
})

test('unlinked task snapshots keep all named products without inventing identifiers', () => {
  const identity = getWorkflowTaskIdentity({
    payload: { product_names: ['泰迪熊', '长耳兔', '泰迪熊', null, {}] },
  })
  assert.deepEqual(
    identity.items.map((item) => item.name),
    ['泰迪熊', '长耳兔']
  )
  assert.ok(identity.items.every((item) => item.styleNo === ''))
})

test('supplier references keep merchant names and symbols and never fall back after clearing', () => {
  const supplierItemNo = '示例织造AB-001#-02#米白'
  const task = {
    payload: { material_name: '旧面料', supplier_item_no: '旧厂商XX-1#' },
    display_context: {
      available: true,
      items: [
        {
          kind: 'material',
          name: '短毛绒',
          code: 'MAT-1',
          supplier_item_no: supplierItemNo,
        },
      ],
    },
  }
  assert.equal(
    getWorkflowTaskIdentityCode(getWorkflowTaskIdentity(task).items[0]),
    `款号 ${supplierItemNo}`
  )
  task.display_context.items[0].supplier_item_no = ''
  assert.equal(
    getWorkflowTaskIdentityCode(getWorkflowTaskIdentity(task).items[0]),
    '款号未填写'
  )
  task.display_context.items = [
    {
      kind: 'product',
      name: '小熊',
      code: '',
      style_no: 'STYLE-1',
      supplier_item_no: supplierItemNo,
    },
  ]
  const product = getWorkflowTaskIdentity(task).items[0]
  assert.equal(product.supplierItemNo, '')
  assert.equal(getWorkflowTaskIdentityCode(product), '产品编号未填写')
})

test('status receipt retains read context only for the identical source binding', () => {
  const before = {
    id: 1,
    source_type: 'sales_order',
    source_id: 8,
    source_no: 'SO-8',
    process_instance_id: 9,
    display_context: { available: true, items: [] },
  }
  const after = { ...before, task_status_key: 'done', display_context: null }
  assert.equal(
    retainWorkflowTaskIdentity(before, after).display_context,
    before.display_context
  )
  assert.equal(
    retainWorkflowTaskIdentity(before, { ...after, source_id: 10 })
      .display_context,
    null
  )
  assert.equal(
    retainWorkflowTaskIdentity(before, { ...after, process_instance_id: null })
      .display_context,
    null
  )
  const fresh = { ...after, display_context: { available: true, items: [] } }
  assert.equal(retainWorkflowTaskIdentity(before, fresh), fresh)
})
