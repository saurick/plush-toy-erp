import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OUTSOURCING_ORDER_ATTACHMENT_OWNER_TYPE,
  PRINT_APPENDIX_ATTACHMENT_TYPE,
  selectBusinessAttachmentPrintAppendices,
} from './businessAttachmentPrintAppendix.mjs'

test('businessAttachmentPrintAppendix: selects only active printable contract images in upload order', () => {
  const selected = selectBusinessAttachmentPrintAppendices(
    [
      {
        id: 3,
        owner_type: OUTSOURCING_ORDER_ATTACHMENT_OWNER_TYPE,
        owner_id: 7,
        attachment_type: PRINT_APPENDIX_ATTACHMENT_TYPE,
        mime_type: 'image/jpeg',
      },
      {
        id: 1,
        owner_type: OUTSOURCING_ORDER_ATTACHMENT_OWNER_TYPE,
        owner_id: 7,
        attachment_type: PRINT_APPENDIX_ATTACHMENT_TYPE,
        mime_type: 'image/png',
      },
      {
        id: 2,
        owner_type: OUTSOURCING_ORDER_ATTACHMENT_OWNER_TYPE,
        owner_id: 7,
        attachment_type: 'evidence',
        mime_type: 'image/png',
      },
      {
        id: 4,
        owner_type: OUTSOURCING_ORDER_ATTACHMENT_OWNER_TYPE,
        owner_id: 7,
        attachment_type: PRINT_APPENDIX_ATTACHMENT_TYPE,
        mime_type: 'image/webp',
        withdrawn_at: 1_786_320_000,
      },
      {
        id: 5,
        owner_type: OUTSOURCING_ORDER_ATTACHMENT_OWNER_TYPE,
        owner_id: 8,
        attachment_type: PRINT_APPENDIX_ATTACHMENT_TYPE,
        mime_type: 'image/png',
      },
    ],
    7
  )
  assert.deepEqual(
    selected.map((item) => item.id),
    [1, 3]
  )
})
