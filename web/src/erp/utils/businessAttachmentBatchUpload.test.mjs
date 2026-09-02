import assert from 'node:assert/strict'
import test from 'node:test'

import { settleBusinessAttachmentBatchUpload } from './businessAttachmentBatchUpload.mjs'

test('businessAttachmentBatchUpload: 单个失败不会阻断后续附件', async () => {
  const attempted = []
  const items = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }]

  const result = await settleBusinessAttachmentBatchUpload(
    items,
    async (item) => {
      attempted.push(item.uid)
      if (item.uid === 'b') throw new Error('upload failed')
      return `saved-${item.uid}`
    }
  )

  assert.deepEqual(attempted, ['a', 'b', 'c'])
  assert.deepEqual(
    result.succeeded.map(({ item, value }) => [item.uid, value]),
    [
      ['a', 'saved-a'],
      ['c', 'saved-c'],
    ]
  )
  assert.deepEqual(
    result.failed.map(({ item, error }) => [item.uid, error.message]),
    [['b', 'upload failed']]
  )
})

test('businessAttachmentBatchUpload: 重试集合只包含上一轮失败项', async () => {
  const attempts = []
  const items = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }]
  const first = await settleBusinessAttachmentBatchUpload(
    items,
    async (item) => {
      attempts.push(`first-${item.uid}`)
      if (item.uid !== 'b') return item.uid
      throw new Error('temporary failure')
    }
  )

  const retry = await settleBusinessAttachmentBatchUpload(
    first.failed.map(({ item }) => item),
    async (item) => {
      attempts.push(`retry-${item.uid}`)
      return item.uid
    }
  )

  assert.deepEqual(attempts, ['first-a', 'first-b', 'first-c', 'retry-b'])
  assert.deepEqual(
    retry.succeeded.map(({ item }) => item.uid),
    ['b']
  )
  assert.deepEqual(retry.failed, [])
})

test('businessAttachmentBatchUpload: 空输入返回空结果', async () => {
  let called = false
  const result = await settleBusinessAttachmentBatchUpload(
    undefined,
    async () => {
      called = true
    }
  )

  assert.equal(called, false)
  assert.deepEqual(result, { succeeded: [], failed: [] })
})

test('businessAttachmentBatchUpload: 上传器必须是函数', async () => {
  await assert.rejects(
    settleBusinessAttachmentBatchUpload([], null),
    /uploadAttachment must be a function/u
  )
})
