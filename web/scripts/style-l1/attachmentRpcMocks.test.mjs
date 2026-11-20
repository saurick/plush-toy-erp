import assert from 'node:assert/strict'
import test from 'node:test'

import { installAttachmentRpcMocks } from './attachmentRpcMocks.mjs'

async function createAttachmentMockSession() {
  let handler
  await installAttachmentRpcMocks(
    {
      async route(pattern, nextHandler) {
        assert.equal(pattern, '**/rpc/attachment')
        handler = nextHandler
      },
    },
    { nowUnix: () => 1_750_000_000 }
  )
  return async (method, params = {}) => {
    let response
    await handler({
      request: () => ({
        postDataJSON: () => ({ id: method, method, params }),
      }),
      fulfill: async ({ body }) => {
        response = JSON.parse(body)
      },
    })
    return response
  }
}

async function attachmentMockCall(method, params = {}) {
  const call = await createAttachmentMockSession()
  return call(method, params)
}

test('attachment style mock only accepts canonical evidence methods', async () => {
  for (const method of [
    'list_attachments',
    'upload_attachment',
    'download_attachment',
    'withdraw_attachment',
    'clear_product_image',
  ]) {
    const response = await attachmentMockCall(method)
    assert.equal(response.result.code, 0, method)
  }
  for (const method of [
    'listAttachments',
    'uploadAttachment',
    'downloadAttachment',
    'get_attachment_content',
    'getAttachmentContent',
    'delete_attachment',
    'deleteAttachment',
    'withdrawAttachment',
    'unknown_attachment_method',
  ]) {
    const response = await attachmentMockCall(method)
    assert.equal(response.result.code, 40010, method)
  }
})

test('attachment style mock provides readable uploader audit metadata for workflow tasks', async () => {
  const response = await attachmentMockCall('list_attachments', {
    owner_type: 'workflow_task',
    owner_id: 42,
  })
  assert.equal(response.result.code, 0)
  assert.equal(response.result.data.attachments.length, 1)
  assert.equal(
    response.result.data.attachments[0].uploaded_by_username,
    'demo_boss'
  )
  assert.equal(response.result.data.attachments[0].created_at, 1_750_000_000)
})

test('attachment style mock returns controlled withdrawal audit metadata', async () => {
  const response = await attachmentMockCall('withdraw_attachment', {
    id: 1,
    reason: ' 上传错误 ',
  })
  assert.equal(response.result.code, 0)
  assert.equal(response.result.data.attachment.withdrawn_at, 1_750_000_000)
  assert.equal(
    response.result.data.attachment.withdrawn_by_username,
    'demo_boss'
  )
  assert.equal(response.result.data.attachment.withdrawal_reason, '上传错误')
})

test('attachment style mock keeps workflow evidence isolated and withdrawal stateful', async () => {
  const call = await createAttachmentMockSession()
  const uploadResponse = await call('upload_attachment', {
    owner_type: 'product',
    owner_id: 7,
    attachment_type: 'product_image',
    slot_key: 'primary',
    file_name: 'product.png',
    mime_type: 'image/png',
  })
  assert.equal(uploadResponse.result.code, 0)
  assert.equal(uploadResponse.result.data.attachment.file_name, 'product.png')

  const listResponse = await call('list_attachments', {
    owner_type: 'workflow_task',
    owner_id: 42,
  })
  assert.equal(listResponse.result.code, 0)
  assert.equal(listResponse.result.data.attachments.length, 1)
  assert.equal(
    listResponse.result.data.attachments[0].file_name,
    'style-l1-evidence.txt'
  )
  assert.equal(
    listResponse.result.data.attachments[0].owner_type,
    'workflow_task'
  )

  const withdrawalResponse = await call('withdraw_attachment', {
    id: 1,
    reason: ' 浏览器验收：上传了错误版本 ',
  })
  assert.equal(withdrawalResponse.result.code, 0)
  assert.equal(
    withdrawalResponse.result.data.attachment.withdrawal_reason,
    '浏览器验收：上传了错误版本'
  )
  const downloadResponse = await call('download_attachment', { id: 1 })
  assert.equal(downloadResponse.result.code, 40010)
  assert.equal(downloadResponse.result.message, '附件已撤销，不能预览或下载')
})
