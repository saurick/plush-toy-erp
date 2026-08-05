import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveBusinessAttachmentAuditMeta } from './businessAttachmentPresentation.mjs'

test('businessAttachmentPresentation: 已保存附件显示业务可读的上传人和时间', () => {
  const meta = resolveBusinessAttachmentAuditMeta({
    uploaded_by: 7,
    uploaded_by_username: ' demo_boss ',
    created_at: 1_750_000_000,
  })

  assert.equal(meta.uploaderLabel, '上传人：demo_boss')
  assert.match(meta.uploadedAtLabel, /^上传时间：/u)
  assert.notEqual(meta.uploadedAtLabel, '上传时间：未记录')
  assert(!meta.uploaderLabel.includes('7'))
})

test('businessAttachmentPresentation: 历史缺失身份不回退到数字账号或伪造时间', () => {
  assert.deepEqual(
    resolveBusinessAttachmentAuditMeta({
      uploaded_by: 7,
      uploaded_by_username: '   ',
      created_at: 0,
    }),
    {
      uploaderLabel: '上传人：未记录',
      uploadedAtLabel: '上传时间：未记录',
    }
  )
})
