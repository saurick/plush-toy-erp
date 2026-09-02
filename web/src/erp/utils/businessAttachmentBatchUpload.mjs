export async function settleBusinessAttachmentBatchUpload(
  items,
  uploadAttachment
) {
  if (typeof uploadAttachment !== 'function') {
    throw new TypeError('uploadAttachment must be a function')
  }

  const succeeded = []
  const failed = []
  for (const item of Array.isArray(items) ? items : []) {
    try {
      const value = await uploadAttachment(item)
      succeeded.push({ item, value })
    } catch (error) {
      failed.push({ item, error })
    }
  }

  return {
    succeeded,
    failed,
  }
}
