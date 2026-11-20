import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { AttachmentPolicy } from '../../common/consts/attachments.generated.mjs'
import { BUSINESS_ATTACHMENT_PHOTO_ACCEPT, fingerprintBusinessAttachmentFile } from './businessAttachmentFiles.mjs'

test('photo and camera selection accept supported images without accepting video', () => {
  const accepted = BUSINESS_ATTACHMENT_PHOTO_ACCEPT.split(',')
  for (const [extension, types] of Object.entries(AttachmentPolicy.fileTypes)) {
    assert.equal(accepted.includes(extension), types.every((type) => type.startsWith('image/')))
  }
  assert(!accepted.some((type) => type.startsWith('video/') || type === '*/*'))
  assert.equal(AttachmentPolicy.maxBytes, 200 * 1024 * 1024)
})

test('file selection fingerprints in bounded chunks and distinguishes same-size revisions', async () => {
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 13, 91)
  const slices = []
  const file = new Blob([bytes])
  const source = {
    size: file.size,
    slice(start, end) {
      slices.push([start, end])
      assert(end - start <= 1024 * 1024)
      return file.slice(start, end)
    },
  }
  const actual = await fingerprintBusinessAttachmentFile(source)
  assert.equal(actual, createHash('sha256').update(bytes).digest('hex'))
  assert.equal(slices.length, 3)
  bytes[bytes.length - 1] = 92
  assert.notEqual(await fingerprintBusinessAttachmentFile(new Blob([bytes])), actual)
})
