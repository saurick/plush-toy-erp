import { createPrintAppendixImageSnapshot } from './printAppendixImages.mjs'

export const OUTSOURCING_ORDER_ATTACHMENT_OWNER_TYPE = 'outsourcing_order'
export const PRINT_APPENDIX_ATTACHMENT_TYPE = 'print_appendix'

const PRINTABLE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

const positiveInteger = (value) => {
  const number = Number(value || 0)
  return Number.isSafeInteger(number) && number > 0 ? number : 0
}

const normalizedText = (value) => String(value || '').trim()

export function selectBusinessAttachmentPrintAppendices(attachments, ownerID) {
  const normalizedOwnerID = positiveInteger(ownerID)
  if (!normalizedOwnerID) return []
  return (Array.isArray(attachments) ? attachments : [])
    .filter((attachment) => {
      const mimeType = normalizedText(attachment?.mime_type).toLowerCase()
      return (
        normalizedText(attachment?.owner_type).toLowerCase() ===
          OUTSOURCING_ORDER_ATTACHMENT_OWNER_TYPE &&
        positiveInteger(attachment?.owner_id) === normalizedOwnerID &&
        normalizedText(attachment?.attachment_type).toLowerCase() ===
          PRINT_APPENDIX_ATTACHMENT_TYPE &&
        positiveInteger(attachment?.id) > 0 &&
        !attachment?.withdrawn_at &&
        PRINTABLE_IMAGE_MIME_TYPES.has(mimeType)
      )
    })
    .sort((a, b) => positiveInteger(a?.id) - positiveInteger(b?.id))
}

function attachmentFile(attachment, downloaded) {
  const contentBase64 = normalizedText(downloaded?.content_base64)
  const mimeType = normalizedText(
    downloaded?.mime_type || attachment?.mime_type
  ).toLowerCase()
  if (!contentBase64 || !PRINTABLE_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error('合同附图内容无法用于打印')
  }
  const binary = atob(contentBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File(
    [bytes],
    normalizedText(downloaded?.file_name || attachment?.file_name) ||
      '合同附图',
    { type: mimeType }
  )
}

export async function loadBusinessAttachmentPrintAppendixSnapshots(
  ownerID,
  { listAttachments, downloadAttachment } = {}
) {
  const normalizedOwnerID = positiveInteger(ownerID)
  if (!normalizedOwnerID) {
    throw new Error('加工合同资料不完整，无法读取合同附图')
  }
  if (
    typeof listAttachments !== 'function' ||
    typeof downloadAttachment !== 'function'
  ) {
    throw new Error('合同附图读取能力暂不可用')
  }
  const attachments = await listAttachments({
    owner_type: OUTSOURCING_ORDER_ATTACHMENT_OWNER_TYPE,
    owner_id: normalizedOwnerID,
    attachment_type: PRINT_APPENDIX_ATTACHMENT_TYPE,
  })
  const selected = selectBusinessAttachmentPrintAppendices(
    attachments,
    normalizedOwnerID
  )
  return Promise.all(
    selected.map(async (attachment) => {
      const downloaded = await downloadAttachment({ id: attachment.id })
      const snapshot = await createPrintAppendixImageSnapshot(
        attachmentFile(attachment, downloaded)
      )
      return {
        ...snapshot,
        id: `business-attachment-${attachment.id}`,
      }
    })
  )
}
