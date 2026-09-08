import test from 'node:test'
import assert from 'node:assert/strict'
import { createTaskProductImageLoader } from './taskProductImage.mjs'
import { getWorkflowTaskIdentity } from './workflowTaskIdentity.mjs'

test('thumbnail reads deduplicate while originals and replacement images have independent reads', async () => {
  const calls = []
  const load = createTaskProductImageLoader(async (params) => {
    calls.push(params)
    return {
      id: params.id,
      owner_type: 'product',
      owner_id: 7,
      mime_type: 'image/png',
      content_base64: 'test',
    }
  })
  await Promise.all([
    load({ productID: 7, attachmentID: 8 }),
    load({ productID: 7, attachmentID: 8 }),
  ])
  await load({ productID: 7, attachmentID: 8, variant: '' })
  await load({ productID: 7, attachmentID: 9 })
  assert.deepEqual(calls, [
    { id: 8, variant: 'thumbnail' },
    { id: 8 },
    { id: 9, variant: 'thumbnail' },
  ])
})

test('wrong ownership and failed reads are rejected without poisoning a retry', async () => {
  let calls = 0
  const load = createTaskProductImageLoader(async () => {
    calls++
    return {
      id: 8,
      owner_type: 'product',
      owner_id: calls === 1 ? 9 : 7,
      mime_type: 'image/png',
      content_base64: 'test',
    }
  })
  await assert.rejects(load({ productID: 7, attachmentID: 8 }))
  assert.match(
    await load({ productID: 7, attachmentID: 8 }),
    /^data:image\/png/
  )
  assert.equal(calls, 2)
})

test('only source-projected product references may request images; empty and material identities never use payload image IDs', () => {
  const payload = {
    product_id: 7,
    image_attachment_id: 8,
    product_name: '旧产品',
  }
  assert.equal(
    getWorkflowTaskIdentity({ payload }).items[0].imageAttachmentID,
    undefined
  )
  const task = {
    payload,
    display_context: {
      available: true,
      items: [
        {
          kind: 'product',
          product_id: 7,
          image_attachment_id: 8,
          name: '小熊',
        },
      ],
    },
  }
  assert.equal(getWorkflowTaskIdentity(task).items[0].imageAttachmentID, 8)
  task.display_context.items[0].image_attachment_id = 0
  assert.equal(getWorkflowTaskIdentity(task).items[0].imageAttachmentID, 0)
  task.display_context.items[0].kind = 'material'
  assert.equal(
    getWorkflowTaskIdentity(task).items[0].imageAttachmentID,
    undefined
  )
})
