import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import {
  JsonRpc,
  requireRpcData as dataOf,
  requireRpcArray,
  requireRpcEntity,
} from '@/common/utils/jsonRpc'
import { assertBusinessAttachmentUploadParams } from '../utils/businessAttachmentContract.mjs'
import { notifyProductImagesChanged } from '../utils/productImageReferences.mjs'

const attachmentRpc = new JsonRpc({
  url: 'attachment',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function listBusinessAttachments(params = {}) {
  const result = await attachmentRpc.call('list_attachments', params)
  return requireRpcArray(
    result,
    'attachments',
    '附件列表数据不完整，请重新读取'
  )
}

export async function uploadBusinessAttachment(params = {}) {
  assertBusinessAttachmentUploadParams(params)
  const result = await attachmentRpc.call('upload_attachment', params)
  return requireRpcEntity(
    result,
    'attachment',
    '附件上传结果不完整，请重新读取'
  )
}

export async function downloadBusinessAttachment(params = {}) {
  const result = await attachmentRpc.call('download_attachment', params)
  return requireRpcEntity(result, 'attachment', '附件下载结果不完整，请重试')
}

export async function withdrawBusinessAttachment(params = {}) {
  const result = await attachmentRpc.call('withdraw_attachment', params)
  return requireRpcEntity(
    result,
    'attachment',
    '附件撤回结果不完整，请重新读取'
  )
}

export async function listProductImages(params = {}) {
  const { product_id: productID, ...rest } = params
  return listBusinessAttachments({
    ...rest,
    owner_type: 'product',
    owner_id: productID,
  })
}

export async function listProductImageReferences(params = {}) {
  const result = await attachmentRpc.call(
    'list_product_image_references',
    params
  )
  return requireRpcArray(result, 'images', '产品图片数据不完整，请重新读取')
}

export async function uploadProductImage(params = {}) {
  const { product_id: productID, ...rest } = params
  const image = await uploadBusinessAttachment({
    ...rest,
    owner_type: 'product',
    owner_id: productID,
    attachment_type: 'product_image',
  })
  notifyProductImagesChanged(productID)
  return image
}

export async function clearProductImage(params = {}) {
  const { product_id: productID, ...rest } = params
  const result = await attachmentRpc.call('clear_product_image', {
    ...rest,
    owner_id: productID,
  })
  const data = dataOf(result, '产品图片清除结果不完整，请重新读取')
  if (data.cleared !== true) {
    const error = new Error('产品图片清除结果不完整，请重新读取')
    error.isInvalidResponse = true
    throw error
  }
  notifyProductImagesChanged(productID)
  return true
}
