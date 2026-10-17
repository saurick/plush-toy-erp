import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWorkflowTaskIdentity,
  getWorkflowTaskIdentityCode,
  getWorkflowTaskIdentityPresentation,
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
    sourceLineCount: null,
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

test('purchase task summary counts source lines instead of mixing material and product identities', () => {
  const display_context = {
    available: true,
    source_no: 'PO-2',
    source_line_count: 2,
    items: [
      { kind: 'material', name: '浅黄填充棉', code: 'MAT-1' },
      { kind: 'product', name: '奶咖钥匙圈', code: 'P-1' },
      { kind: 'material', name: '米白填充棉', code: 'MAT-2' },
      { kind: 'product', name: '浅咖钥匙圈', code: 'P-2' },
    ],
  }
  for (const source_type of [
    'purchase_order',
    'purchase-order',
    'accessories-purchase',
  ]) {
    const summary = getWorkflowTaskIdentityPresentation({
      source_type,
      display_context,
    })
    assert.equal(summary.first.name, '浅黄填充棉')
    assert.equal(summary.compactCountLabel, '共 2 条采购明细')
    assert.equal(summary.remainingItems.length, 3)
  }
})

test('purchase task summary omits an unknown line count instead of reviving the mixed identity count', () => {
  const summary = getWorkflowTaskIdentityPresentation({
    source_type: 'purchase_order',
    display_context: {
      available: true,
      items: [
        { kind: 'material', name: '浅黄丝带' },
        { kind: 'product', name: '奶咖钥匙圈' },
      ],
    },
  })
  assert.equal(summary.compactCountLabel, '')
})

test('non-purchase task summary makes the combined count explicit', () => {
  const summary = getWorkflowTaskIdentityPresentation({
    source_type: 'sales_order',
    display_context: {
      available: true,
      items: [
        { kind: 'product', name: '奶咖钥匙圈' },
        { kind: 'product', name: '浅咖钥匙圈' },
      ],
    },
  })
  assert.equal(summary.compactCountLabel, '共 2 项关联内容')
})

test('search selects a matching product and its own image, counts styles and restores source order on clear', () => {
  const task = {
    source_type: 'sales_order',
    display_context: {
      available: true,
      source_no: 'SO-DEER',
      items: [
        { kind: 'product', name: '雪花小鹿', code: 'DEER-1', product_id: 14, image_attachment_id: 114 },
        { kind: 'product', name: '饼干小熊', code: 'BEAR-1', product_id: 17, image_attachment_id: 117 },
        { kind: 'product', name: '云朵小熊', code: 'BEAR-2', product_id: 1, image_attachment_id: 101 },
        { kind: 'product', name: '云朵小熊', code: 'BEAR-2', product_id: 1, image_attachment_id: 101, order_no: 'SO-OTHER' },
      ],
    },
  }
  const original = structuredClone(task)
  const searched = getWorkflowTaskIdentityPresentation(task, '  熊  ')
  assert.equal(searched.first.name, '饼干小熊')
  assert.equal(searched.first.productID, 17)
  assert.equal(searched.first.imageAttachmentID, 117)
  assert.equal(searched.compactCountLabel, '命中 2 款，共 3 款')
  assert.equal(searched.remainingItems.length, 3)
  assert.equal(getWorkflowTaskIdentityPresentation(task, 'bEaR-2').first.name, '云朵小熊')
  for (const keyword of ['', 'SO-DEER', '不存在']) {
    const summary = getWorkflowTaskIdentityPresentation(task, keyword)
    assert.equal(summary.first.name, '雪花小鹿')
    assert.equal(summary.compactCountLabel, '共 4 项关联内容')
  }
  assert.deepEqual(task, original)
})

test('style searches and material searches use the matched kind instead of a mixed denominator', () => {
  const task = {
    source_type: 'purchase_order',
    display_context: {
      available: true,
      source_line_count: 5,
      items: [
        { kind: 'material', name: '绒布', supplier_item_no: 'FABRIC-01' },
        { kind: 'material', name: '填充棉', supplier_item_no: 'COTTON#02' },
        { kind: 'product', name: '雪花小鹿', style_no: 'STYLE-DEER' },
        { kind: 'product', name: '云朵小熊', style_no: 'STYLE-BEAR' },
      ],
    },
  }
  const product = getWorkflowTaskIdentityPresentation(task, 'style-bear')
  assert.equal(product.first.name, '云朵小熊')
  assert.equal(product.compactCountLabel, '命中 1 款，共 2 款')
  const material = getWorkflowTaskIdentityPresentation(task, 'cotton#02')
  assert.equal(material.first.name, '填充棉')
  assert.equal(material.compactCountLabel, '命中 1 种物料，共 2 种物料')
  assert.equal(getWorkflowTaskIdentityPresentation(task, '').first.name, '绒布')
})

test('an empty or unavailable source never highlights stale payload matches', () => {
  for (const context of [{ available: true, items: [] }, { available: false, items: [] }]) {
    const summary = getWorkflowTaskIdentityPresentation({ payload: { product_name: '旧小熊' }, display_context: context }, '熊')
    assert.equal(summary.first, undefined)
    assert.equal(summary.compactCountLabel, '')
  }
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
