import { sha256 } from 'js-sha256'
import { AttachmentPolicy } from '../../common/consts/attachments.generated.mjs'

export const BUSINESS_ATTACHMENT_PHOTO_ACCEPT = Object.entries(AttachmentPolicy.fileTypes)
  .filter(([, types]) => types.every((type) => type.startsWith('image/')))
  .flatMap(([extension, types]) => [extension, ...types])
  .join(',')

export async function fingerprintBusinessAttachmentFile(file) {
  const hash = sha256.create()
  const chunkBytes = 1024 * 1024
  for (let offset = 0; offset < file.size; offset += chunkBytes) {
    hash.update(await file.slice(offset, offset + chunkBytes).arrayBuffer())
  }
  return hash.hex()
}
