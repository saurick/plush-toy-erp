import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadProductPrintImageSnapshots,
  resolveSharedProductIDForPrintImages,
  selectProductPrintImageAttachments,
} from './productPrintImages.mjs'

test('productPrintImages: no configured product images is a valid empty snapshot', async () => {
  const listCalls = []
  let downloadCount = 0
  const snapshots = await loadProductPrintImageSnapshots(17, {
    listAttachments: async (params) => {
      listCalls.push(params)
      return []
    },
    downloadAttachment: async () => {
      downloadCount += 1
      return null
    },
  })

  assert.deepEqual(listCalls, [
    {
      owner_type: 'product',
      owner_id: 17,
      attachment_type: 'product_image',
    },
  ])
  assert.deepEqual(snapshots, {})
  assert.equal(downloadCount, 0)
})

test('productPrintImages: only primary and secondary product image slots become frozen print snapshots', async () => {
  const attachments = [
    {
      id: 101,
      owner_type: 'product',
      owner_id: 17,
      attachment_type: 'product_image',
      slot_key: 'primary',
      file_name: 'primary-new.jpg',
      mime_type: 'image/jpeg',
    },
    {
      id: 99,
      owner_type: 'product',
      owner_id: 17,
      attachment_type: 'product_image',
      slot_key: 'primary',
      file_name: 'primary-old.jpg',
      mime_type: 'image/jpeg',
    },
    {
      id: 102,
      owner_type: 'product',
      owner_id: 17,
      attachment_type: 'product_image',
      slot_key: 'secondary',
      file_name: 'secondary.png',
      mime_type: 'image/png',
    },
    {
      id: 103,
      owner_type: 'product',
      owner_id: 17,
      attachment_type: 'evidence',
      slot_key: 'secondary',
      file_name: 'unrelated.png',
      mime_type: 'image/png',
    },
    {
      id: 104,
      owner_type: 'product',
      owner_id: 18,
      attachment_type: 'product_image',
      slot_key: 'primary',
      file_name: 'other-product.png',
      mime_type: 'image/png',
    },
  ]
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(selectProductPrintImageAttachments(attachments, 17)).map(
        ([slotKey, attachment]) => [slotKey, attachment.id]
      )
    ),
    { primary: 101, secondary: 102 }
  )

  const downloadCalls = []
  const snapshots = await loadProductPrintImageSnapshots(17, {
    listAttachments: async () => attachments,
    downloadAttachment: async ({ id }) => {
      downloadCalls.push(id)
      return id === 101
        ? {
            file_name: 'primary-new.jpg',
            mime_type: 'image/jpeg',
            content_base64: 'cHJpbWFyeQ==',
          }
        : {
            file_name: 'secondary.png',
            mime_type: 'image/png',
            content_base64: 'c2Vjb25kYXJ5',
          }
    },
  })

  assert.deepEqual(downloadCalls, [101, 102])
  assert.deepEqual(snapshots.primary, {
    name: 'primary-new.jpg',
    dataURL: 'data:image/jpeg;base64,cHJpbWFyeQ==',
    mimeType: 'image/jpeg',
    crop: null,
    layout: null,
    annotations: [],
  })
  assert.equal(
    snapshots.secondary.dataURL,
    'data:image/png;base64,c2Vjb25kYXJ5'
  )
})

test('productPrintImages: a selected image download failure blocks snapshot creation', async () => {
  await assert.rejects(
    loadProductPrintImageSnapshots(17, {
      listAttachments: async () => [
        {
          id: 101,
          owner_type: 'product',
          owner_id: 17,
          attachment_type: 'product_image',
          slot_key: 'primary',
        },
      ],
      downloadAttachment: async () => {
        throw new Error('download failed')
      },
    }),
    /download failed/u
  )
})

test('productPrintImages: outsourcing auto-images require one complete shared product id', () => {
  assert.deepEqual(
    resolveSharedProductIDForPrintImages([
      { product_id: 7 },
      { product_id: '7' },
    ]),
    { productID: 7, reason: 'single' }
  )
  assert.deepEqual(
    resolveSharedProductIDForPrintImages([
      { product_id: 7 },
      { product_id: 8 },
    ]),
    { productID: 0, reason: 'multiple' }
  )
  assert.deepEqual(
    resolveSharedProductIDForPrintImages([
      { product_id: 7 },
      { product_id: null },
    ]),
    { productID: 0, reason: 'missing' }
  )
})
