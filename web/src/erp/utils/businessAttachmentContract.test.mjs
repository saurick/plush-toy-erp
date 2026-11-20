import assert from 'node:assert/strict'
import test from 'node:test'

import { assertBusinessAttachmentUploadParams } from './businessAttachmentContract.mjs'

test('workflow attachment upload fails closed without a positive safe version', () => {
  for (const expected_version of [undefined, 0, -1, 1.5, '1']) {
    assert.throws(
      () =>
        assertBusinessAttachmentUploadParams({
          owner_type: 'workflow_task',
          owner_id: 7,
          expected_version,
        }),
      /expected_version is required/u
    )
  }
  assert.doesNotThrow(() =>
    assertBusinessAttachmentUploadParams({
      owner_type: 'workflow_task',
      owner_id: 7,
      expected_version: 3,
    })
  )
  assert.doesNotThrow(() =>
    assertBusinessAttachmentUploadParams({
      owner_type: 'sales_order',
      owner_id: 7,
    })
  )
})
