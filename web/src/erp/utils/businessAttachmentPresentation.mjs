import { formatUnixDateTime } from './masterDataOrderView.mjs'

export function resolveBusinessAttachmentAuditMeta(item = {}) {
  const username = String(item?.uploaded_by_username || '').trim()
  const createdAt = formatUnixDateTime(item?.created_at)

  return {
    uploaderLabel: username ? `上传账号：${username}` : '上传账号：未记录',
    uploadedAtLabel:
      createdAt === '-' ? '上传时间：未记录' : `上传时间：${createdAt}`,
  }
}
