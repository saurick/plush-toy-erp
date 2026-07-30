import assert from 'node:assert/strict'
import test from 'node:test'

import { installAttachmentRpcMocks } from './attachmentRpcMocks.mjs'

async function attachmentMockCall(method, params = {}) {
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

test('attachment style mock only accepts canonical evidence methods', async () => {
  for (const method of [
    'list_attachments',
    'upload_attachment',
    'download_attachment',
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
