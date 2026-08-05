import { formatUnixDateTime } from './masterDataOrderView.mjs'

export function resolveBusinessAttachmentAuditMeta(item = {}) {
  const username = String(item?.uploaded_by_username || '').trim()
  const createdAt = formatUnixDateTime(item?.created_at)

  return {
    uploaderLabel: username ? `上传人：${username}` : '上传人：未记录',
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
  const username = String(item?.withdrawn_by_username || '').trim()
  const withdrawnAt = formatUnixDateTime(item?.withdrawn_at)
  const reason = String(item?.withdrawal_reason || '').trim()

  return {
    withdrawn,
    withdrawerLabel: username ? `撤销账号：${username}` : '撤销账号：未记录',
    withdrawnAtLabel:
      withdrawnAt === '-' ? '撤销时间：未记录' : `撤销时间：${withdrawnAt}`,
    withdrawalReasonLabel: reason ? `撤销原因：${reason}` : '撤销原因：未记录',
  }
}
