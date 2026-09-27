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
  const uploadButtonText = '选择附件'

  if (missingOwner && canQueuePending) {
    panelDescription = '可先选择附件，保存业务记录后自动上传并绑定。'
    emptyDescription = '暂无附件，可先选择后随保存上传'
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

export function resolveBusinessAttachmentActionLabel({
  attachmentCount,
  canUpload = true,
  fallbackLabel = '附件',
  countLabel = '附件',
  emptyUploadLabel = '添加附件',
  emptyReadLabel = '查看附件',
} = {}) {
  const normalizedCount =
    attachmentCount === null || attachmentCount === undefined
      ? null
      : Number(attachmentCount)
  if (!Number.isSafeInteger(normalizedCount) || normalizedCount < 0) {
    return fallbackLabel
  }
  if (normalizedCount > 0) {
    return `${countLabel}（${normalizedCount}）`
  }
  return canUpload ? emptyUploadLabel : emptyReadLabel
}

export function isBusinessAttachmentImage(item) {
  return String(item?.mime_type || '').startsWith('image/')
}

export function mergeBusinessAttachmentSelection(currentItems, selectedItems) {
  const items = [...currentItems]
  const duplicates = []
  for (const selected of selectedItems) {
    const exists = items.some(
      (item) =>
        item.file_name === selected.file_name &&
        item.content_base64 === selected.content_base64 &&
        item.attachment_type === selected.attachment_type
    )
    if (exists) duplicates.push(selected)
    else items.push(selected)
  }
  return { items, duplicates }
}

export function selectBusinessAttachmentUploadItems(
  items,
  { retryOnly = false } = {}
) {
  return items.filter((item) =>
    retryOnly
      ? item.upload_status === 'failed'
      : !item.upload_status ||
        item.upload_status === 'pending' ||
        item.upload_status === 'failed'
  )
}
