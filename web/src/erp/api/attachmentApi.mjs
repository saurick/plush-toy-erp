import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { assertBusinessAttachmentUploadParams } from '../utils/businessAttachmentContract.mjs'

const attachmentRpc = new JsonRpc({
  url: 'attachment',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listBusinessAttachments(params = {}) {
  const result = await attachmentRpc.call('list_attachments', params)
  return dataOf(result)?.attachments || []
}

export async function uploadBusinessAttachment(params = {}) {
  assertBusinessAttachmentUploadParams(params)
  const result = await attachmentRpc.call('upload_attachment', params)
  return dataOf(result)?.attachment || null
}

export async function downloadBusinessAttachment(params = {}) {
  const result = await attachmentRpc.call('download_attachment', params)
  return dataOf(result)?.attachment || null
}
