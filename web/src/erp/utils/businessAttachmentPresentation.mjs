import { formatUnixDateTime } from './masterDataOrderView.mjs'
import { formatAdminIdentity } from './adminIdentity.mjs'

export function resolveBusinessAttachmentAuditMeta(item = {}) {
  const uploader = formatAdminIdentity(
    {
      display_name: item?.uploaded_by_display_name,
      username: item?.uploaded_by_username,
    },
    { fallback: '' }
  )
  const createdAt = formatUnixDateTime(item?.created_at)

  return {
    uploaderLabel: uploader ? `上传人：${uploader}` : '上传人：未记录',
    uploadedAtLabel:
      createdAt === '-' ? '上传时间：未记录' : `上传时间：${createdAt}`,
  }
}

export function isBusinessAttachmentWithdrawn(item = {}) {
  return Number(item?.withdrawn_at || 0) > 0
}

export function normalizeBusinessAttachmentWithdrawalReason(raw = '') {
  const reason = String(raw || '').trim()
  const { length } = Array.from(reason)
  return {
    reason,
    valid: length > 0 && length <= 255,
    length,
  }
}

export function resolveBusinessAttachmentWithdrawalMeta(item = {}) {
  const withdrawn = isBusinessAttachmentWithdrawn(item)
  const withdrawer = formatAdminIdentity(
    {
      display_name: item?.withdrawn_by_display_name,
      username: item?.withdrawn_by_username,
    },
    { fallback: '' }
  )
  const withdrawnAt = formatUnixDateTime(item?.withdrawn_at)
  const reason = String(item?.withdrawal_reason || '').trim()

  return {
    withdrawn,
    withdrawerLabel: withdrawer ? `撤销人：${withdrawer}` : '撤销人：未记录',
    withdrawnAtLabel:
      withdrawnAt === '-' ? '撤销时间：未记录' : `撤销时间：${withdrawnAt}`,
    withdrawalReasonLabel: reason ? `撤销原因：${reason}` : '撤销原因：未记录',
  }
}
