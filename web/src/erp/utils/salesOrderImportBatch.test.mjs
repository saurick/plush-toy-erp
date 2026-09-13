import assert from 'node:assert/strict'
import test from 'node:test'
import { sha256 } from 'js-sha256'
import {
  salesOrderImportIssues,
  reviewSalesOrderImportEntries,
  saveSalesOrderImportBatch,
} from './salesOrderImportBatch.mjs'

const customers = [
  { id: 1, code: 'C-IMPORT', name: '模拟客户', is_active: true },
]
const units = [{ id: 1, precision: 0, is_active: true }]
const makeEntries = () =>
  [1, 2].map((number) => ({
    key: number,
    status: 'pending',
    images: [],
    uploadStates: {},
    values: {
      order_no: `SO-IMPORT-${number}`,
      customer_id: 1,
      currency: 'CNY',
      order_date: '2026-09-01',
      items: [1, 2].map((line) => ({
        requested_product_name: `模拟产品${line}`,
        ordered_quantity: '100',
        pre_shipment_sample_quantity: '2',
        unit_id: 1,
      })),
    },
  }))
const errorMessage = (_error, action) => `${action}失败`
const defaults = {
  customers,
  errorMessage,
  uploadImage: async () => assert.fail('unexpected image upload'),
  listAttachments: async () => [],
  reconcileOrder: async () => null,
}

test('batch preflight identifies missing references, currencies and unit precision without inventing defaults', () => {
  const { values } = makeEntries()[0]
  assert.deepEqual(salesOrderImportIssues(values, { customers, units }), [])
  assert.match(
    salesOrderImportIssues(
      { ...values, customer_id: undefined, currency: '' },
      { customers, units }
    )
      .flatMap((issue) => issue.errors)
      .join(' '),
    /客户.*币种/u
  )
  values.items[1].ordered_quantity = '0.1'
  assert.deepEqual(salesOrderImportIssues(values, { customers, units }), [
    {
      name: ['items', 1, 'ordered_quantity'],
      errors: ['订单数量不符合单位精度'],
    },
  ])
})

test('batch review deduplicates each field and preserves distinct line and optional form errors', () => {
  const entries = makeEntries()
  const first = entries[0]
  first.values.customer_id = undefined
  first.values.currency = undefined
  first.values.items.forEach((item) => {
    item.unit_id = undefined
  })
  first.formErrors = [
    { name: ['customer_id'], errors: ['请选择客户'] },
    { name: ['currency'], errors: ['请选择币种'] },
    { name: ['items', 0, 'unit_id'], errors: ['请选择单位'] },
    { name: ['items', 1, 'unit_id'], errors: ['请选择单位'] },
    { name: ['contact_email'], errors: ['请输入正确的邮箱地址'] },
  ]
  let reviewed = reviewSalesOrderImportEntries(entries, { customers, units })
  assert.equal(reviewed[0].issues.length, 5)
  assert.equal(
    reviewed[0].errors.filter((error) => error.includes('客户')).length,
    1
  )
  assert.deepEqual(reviewed[0].errors.slice(2), [
    '第 1 条明细：请选择单位',
    '第 2 条明细：请选择单位',
    '请输入正确的邮箱地址',
  ])
  assert.equal(reviewed[1].status, 'pending')

  reviewed[0].values = makeEntries()[0].values
  reviewed[0].formErrors = []
  reviewed = reviewSalesOrderImportEntries(reviewed, { customers, units })
  assert.equal(reviewed[0].status, 'pending')
  assert.deepEqual(reviewed[0].errors, [])
  reviewed[0].values.customer_id = undefined
  reviewed = reviewSalesOrderImportEntries(reviewed, { customers, units })
  assert.equal(reviewed[0].status, 'invalid')
  assert.equal(reviewed[0].issues.length, 1)
})

test('duplicate-number review updates both drafts and respects completed and uncertain orders', () => {
  const entries = makeEntries()
  entries[1].values.order_no = ` ${entries[0].values.order_no} `
  let reviewed = reviewSalesOrderImportEntries(entries, { customers, units })
  assert.deepEqual(
    reviewed.map((entry) => entry.status),
    ['invalid', 'invalid']
  )
  assert.ok(reviewed.every((entry) => entry.issues[0].name[0] === 'order_no'))
  reviewed[1].values.order_no = 'SO-CORRECTED'
  reviewed = reviewSalesOrderImportEntries(reviewed, { customers, units })
  assert.deepEqual(
    reviewed.map((entry) => entry.status),
    ['pending', 'pending']
  )

  for (const locked of [
    { status: 'complete', savedOrder: { id: 1 } },
    { status: 'unconfirmed', uncertainOrder: true },
  ]) {
    entries[0] = { ...entries[0], ...locked, errors: ['保留处理结果'] }
    entries[1].values.order_no = entries[0].values.order_no
    const next = reviewSalesOrderImportEntries(entries, { customers, units })
    assert.equal(next[0], entries[0])
    assert.equal(next[1].status, 'invalid')
  }
})

test('saves every order with all its lines and retries only failed orders', async () => {
  const calls = []
  const saveOrder = async (params) => {
    calls.push(params.order_no)
    assert.equal(params.id, undefined)
    assert.equal(params.items.length, 2)
    assert.deepEqual(
      params.items.map((item) => item.line_no),
      [1, 2]
    )
    if (params.order_no.endsWith('2') && calls.length === 2) {
      throw Object.assign(new Error('invalid request'), { code: 400 })
    }
    return { sales_order: { id: calls.length, order_no: params.order_no } }
  }
  let result = await saveSalesOrderImportBatch(makeEntries(), {
    ...defaults,
    saveOrder,
  })
  assert.deepEqual(
    result.map((entry) => entry.status),
    ['complete', 'failed']
  )
  result = await saveSalesOrderImportBatch(result, { ...defaults, saveOrder })
  assert.deepEqual(
    result.map((entry) => entry.status),
    ['complete', 'complete']
  )
  assert.deepEqual(calls, ['SO-IMPORT-1', 'SO-IMPORT-2', 'SO-IMPORT-2'])
})

test('unknown order result reconciles before any further write and freezes the original request', async () => {
  let calls = 0
  const saveOrder = async () => {
    calls += 1
    throw Object.assign(new Error('unknown'), { isInvalidResponse: true })
  }
  let result = await saveSalesOrderImportBatch(makeEntries().slice(0, 1), {
    ...defaults,
    saveOrder,
  })
  assert.equal(result[0].status, 'unconfirmed')
  result = await saveSalesOrderImportBatch(result, { ...defaults, saveOrder })
  assert.equal(calls, 1)
  result = await saveSalesOrderImportBatch(result, {
    ...defaults,
    saveOrder,
    reconcileOrder: async (params) => ({ id: 10, order_no: params.order_no }),
  })
  assert.equal(result[0].status, 'complete')
  assert.equal(calls, 1)
})

test('image failure retains the saved order and retries only missing images', async () => {
  const entries = makeEntries().slice(0, 1)
  const image = {
    fileName: '订单图片.png',
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'image/png',
  }
  entries[0].images = [image]
  entries[0].values.items[0].import_source = { image_files: [image.fileName] }
  let saves = 0
  let uploads = 0
  const deps = {
    ...defaults,
    saveOrder: async (params) => {
      saves += 1
      return { sales_order: { id: 1, order_no: params.order_no } }
    },
    uploadImage: async (params) => {
      uploads += 1
      assert.equal(params.owner_id, 1)
      if (uploads === 1) {
        throw Object.assign(new Error('invalid request'), { code: 400 })
      }
      return { id: 100 }
    },
  }
  let result = await saveSalesOrderImportBatch(entries, deps)
  assert.equal(result[0].status, 'attachments_pending')
  result = await saveSalesOrderImportBatch(result, deps)
  assert.equal(result[0].status, 'complete')
  assert.equal(saves, 1)
  assert.equal(uploads, 2)
})

test('unknown image result is checked by file name and bytes without uploading it again', async () => {
  const entries = makeEntries().slice(0, 1)
  const image = {
    fileName: '订单图片.png',
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'image/png',
  }
  entries[0].images = [image]
  entries[0].values.items[0].import_source = { image_files: [image.fileName] }
  let uploads = 0
  const deps = {
    ...defaults,
    saveOrder: async (params) => ({
      sales_order: { id: 1, order_no: params.order_no },
    }),
    uploadImage: async () => {
      uploads += 1
      throw Object.assign(new Error('unknown'), { isInvalidResponse: true })
    },
  }
  let result = await saveSalesOrderImportBatch(entries, deps)
  result = await saveSalesOrderImportBatch(result, {
    ...deps,
    saveOrder: async () => assert.fail('saved order was recreated'),
  })
  assert.equal(result[0].status, 'attachments_pending')
  assert.equal(uploads, 1)
  result = await saveSalesOrderImportBatch(result, {
    ...deps,
    listAttachments: async () => [
      { id: 100, file_name: image.fileName, sha256: sha256(image.bytes) },
    ],
  })
  assert.equal(result[0].status, 'complete')
  assert.equal(uploads, 1)
})
