import assert from 'node:assert/strict'
import test from 'node:test'
import { createProductImageReferenceLoader } from './productImageReferences.mjs'

test('visible references batch and deduplicate; large lists are bounded', async () => {
  const calls = []
  const read = createProductImageReferenceLoader(
    async ({ product_ids: ids }) => {
      calls.push(ids)
      return ids.map((id) => ({ product_id: id, image_attachment_id: id * 10 }))
    }
  )
  const one = read(1)
  assert.equal(read(1), one)
  const result = await Promise.all(
    Array.from({ length: 170 }, (_, i) => read(i + 1))
  )
  assert.equal(calls.length, 3)
  assert.ok(calls.every((ids) => ids.length <= 80))
  assert.equal(result[169], 1700)
  assert.equal(await read(0), 0)
  assert.equal(await read(-1), 0)
})

test('missing primary is distinct from a broken batch; failure can retry', async () => {
  let rows = []
  const read = createProductImageReferenceLoader(async () => rows)
  await assert.rejects(read(7))
  rows = [{ product_id: 8, image_attachment_id: 88 }]
  await assert.rejects(read(7))
  rows = [{ product_id: 7, image_attachment_id: 0 }]
  assert.equal(await read(7), 0)
  rows = [{ product_id: 7, image_attachment_id: 72 }]
  assert.equal(await read(7), 72)
})

test('replacement can reread while the previous media request is in flight', async () => {
  let started
  let release
  const ready = new Promise((resolve) => {
    started = resolve
  })
  const read = createProductImageReferenceLoader(async () => {
    if (!release) {
      return new Promise((resolve) => {
        release = resolve
        started()
      })
    }
    return [{ product_id: 7, image_attachment_id: 72 }]
  })
  const before = read(7)
  await ready
  read.invalidate(7)
  const after = read(7)
  assert.notEqual(before, after)
  assert.equal(await after, 72)
  release([{ product_id: 7, image_attachment_id: 71 }])
  assert.equal(await before, 71)
})
