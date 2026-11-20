import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocumentProductPreviewLoader, DOCUMENT_PRODUCT_SOURCES, normalizeGalleryProducts } from './businessProductGallery.mjs'

test('gallery counts formal products, keeping SKU repeats and unlinked materials out', () => {
  const rows = normalizeGalleryProducts([
    { product_id: 9, product_name_snapshot: '蓝色小熊', product_code_snapshot: 'BEAR' },
    { product_id: 3, product_name_snapshot: '长耳兔' },
    { product_id: 9, product_sku_id: 4, product_name_snapshot: '蓝色小熊' },
    { requested_product_name: '待关联需求' }, { material_id: 9, material_name: '面料' },
  ])
  assert.deepEqual(rows.map((row) => row.productID), [3, 9])
  assert.equal(rows[1].name, '蓝色小熊')
  assert.equal(rows[1].code, 'BEAR')
  assert.deepEqual(normalizeGalleryProducts([{ product_id: 0, product_name_snapshot: '旧图残值' }]), [])
})

test('document references coalesce and bound batches without mixing sources', async () => {
  const calls = []
  const read = createDocumentProductPreviewLoader(async (params) => {
    calls.push(params)
    return params.document_ids.map((id) => ({ document_id: id, product_count: id % 2, product_id: id % 2 ? 7 : 0 }))
  })
  const one = read(DOCUMENT_PRODUCT_SOURCES.SALES_ORDER, 1)
  assert.equal(read(DOCUMENT_PRODUCT_SOURCES.SALES_ORDER, 1), one)
  const results = await Promise.all([
    ...Array.from({ length: 170 }, (_, i) => read(DOCUMENT_PRODUCT_SOURCES.SALES_ORDER, i + 1)),
    read(DOCUMENT_PRODUCT_SOURCES.PRODUCTION_ORDER, 1),
  ])
  assert.equal(results.length, 171)
  assert.equal(calls.filter((call) => call.source_type === DOCUMENT_PRODUCT_SOURCES.SALES_ORDER).length, 3)
  assert.equal(calls.filter((call) => call.source_type === DOCUMENT_PRODUCT_SOURCES.PRODUCTION_ORDER).length, 1)
  assert.equal(calls.every((call) => call.document_ids.length <= 80), true)
})

test('broken batches fail closed and manual retry rereads updated products', async () => {
  let response = []
  const read = createDocumentProductPreviewLoader(async () => response)
  const source = DOCUMENT_PRODUCT_SOURCES.OUTSOURCING_ORDER
  for (const rows of [[], [{ document_id: 8, product_count: 1, product_id: 7 }], [{ document_id: 7, product_count: 2, product_id: 0 }], [{ document_id: 7, product_count: -1, product_id: 7 }]]) {
    response = rows
    await assert.rejects(read(source, 7))
  }
  response = [{ document_id: 7, product_count: 0, product_id: 0 }]
  assert.equal((await read(source, 7)).product_count, 0)
  response = [{ document_id: 7, product_count: 1, product_id: 9 }]
  assert.equal((await read(source, 7)).product_id, 9)
  await assert.rejects(read('unknown', 7))
  await assert.rejects(read(source, -1))
})

test('a revised production order does not reuse an earlier in-flight product summary', async () => {
  const starts = [Promise.withResolvers(), Promise.withResolvers()]
  let callCount = 0
  const read = createDocumentProductPreviewLoader(({ document_ids: [id] }) => {
    const response = Promise.withResolvers()
    starts[callCount++].resolve(response.resolve)
    return response.promise.then((summary) => [{ document_id: id, ...summary }])
  })
  const source = DOCUMENT_PRODUCT_SOURCES.PRODUCTION_ORDER
  const before = read(source, 7, '1')
  const resolveBefore = await starts[0].promise
  const after = read(source, 7, '2')
  assert.notEqual(after, before)
  const resolveAfter = await starts[1].promise
  resolveBefore({ product_count: 1, product_id: 9, style_no: 'OLD' })
  assert.equal((await before).style_no, 'OLD')
  assert.equal(read(source, 7, '2'), after)
  resolveAfter({ product_count: 0, product_id: 0, style_no: '' })
  assert.equal((await after).style_no, '')
})
