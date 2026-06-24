export function resolveBusinessAttachmentPanelState({
  ownerType,
  ownerId,
  canUpload = true,
  uploading = false,
  description,
  allowPendingAttachmentsWithoutOwner = true,
  missingOwnerDescription = '请先选择一条业务记录后上传附件。',
  missingOwnerEmptyText = '请先选择业务记录',
} = {}) {
  const normalizedOwnerId = Number(ownerId || 0)
  const missingOwner = !ownerType || normalizedOwnerId <= 0
  const canQueuePending =
    allowPendingAttachmentsWithoutOwner !== false && canUpload
  const uploadDisabled =
    !ownerType || !canUpload || uploading || (missingOwner && !canQueuePending)
  let panelDescription = description
  let emptyDescription = '暂无附件'
  let uploadButtonText = '上传'

  if (missingOwner && canQueuePending) {
    panelDescription = '可先选择附件，保存业务记录后自动上传并绑定。'
    emptyDescription = '暂无附件，可先选择后随保存上传'
    uploadButtonText = '选择附件'
  } else if (missingOwner) {
    panelDescription = missingOwnerDescription
    emptyDescription = missingOwnerEmptyText
  }

  return {
    normalizedOwnerId,
    missingOwner,
    canQueuePending,
    uploadDisabled,
    panelDescription,
    emptyDescription,
    uploadButtonText,
  }
}
