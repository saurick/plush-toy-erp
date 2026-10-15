import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveBusinessAttachmentActionLabel,
  resolveBusinessAttachmentPanelState,
  isBusinessAttachmentImage,
  selectBusinessAttachmentUploadItems,
  mergeBusinessAttachmentSelection,
} from './businessAttachmentPanelState.mjs'

const selectedAttachment = (overrides = {}) => ({
  uid: 'selected',
  file_name: '采购订单.csv',
  file_size: 7,
  content_base64: 'Y29udGVudA==',
  attachment_type: 'evidence',
  upload_status: 'pending',
  ...overrides,
})

test('attachment selection: repeated files in one selection or later selections keep one queue item', () => {
  const original = selectedAttachment({ uid: 'original' })
  const duplicate = selectedAttachment({ uid: 'duplicate' })
  const first = mergeBusinessAttachmentSelection([], [original, duplicate])
  assert.deepEqual(first.items, [original])
  assert.deepEqual(first.duplicates, [duplicate])

  const nextFile = selectedAttachment({ uid: 'next', file_name: '新资料.csv' })
  const next = mergeBusinessAttachmentSelection(first.items, [
    duplicate,
    nextFile,
  ])
  assert.deepEqual(next.items, [original, nextFile])
  assert.deepEqual(next.duplicates, [duplicate])
  assert.deepEqual(first.items, [original], '合并不能修改原队列')
})

test('attachment selection: same-name revisions with the same size and different attachment purposes remain distinct', () => {
  const original = selectedAttachment()
  const revision = selectedAttachment({ content_base64: 'cmV2aXNpbw==' })
  const printImage = selectedAttachment({ attachment_type: 'print_appendix' })
  const result = mergeBusinessAttachmentSelection(
    [original],
    [revision, printImage]
  )
  assert.deepEqual(result.items, [original, revision, printImage])
  assert.deepEqual(result.duplicates, [])
})

test('attachment selection: reselecting failed or unconfirmed files preserves their retry restrictions', () => {
  for (const upload_status of ['failed', 'unconfirmed']) {
    const original = selectedAttachment({ upload_status, retry_owner_id: 12 })
    const result = mergeBusinessAttachmentSelection(
      [original],
      [selectedAttachment()]
    )
    assert.deepEqual(result.items, [original])
    assert.equal(result.duplicates.length, 1)
  }
})

test('attachment selection: a removed file can be selected again', () => {
  const item = selectedAttachment()
  const result = mergeBusinessAttachmentSelection([], [item])
  assert.deepEqual(result, { items: [item], duplicates: [] })
})

test('attachment queue: only queued and explicitly failed items may be submitted', () => {
  const items = [
    { uid: 'new' },
    { uid: 'pending', upload_status: 'pending' },
    { uid: 'failed', upload_status: 'failed' },
    { uid: 'uncertain', upload_status: 'unconfirmed' },
    { uid: 'busy', upload_status: 'uploading' },
    { uid: 'done', upload_status: 'done' },
  ]
  assert.deepEqual(
    selectBusinessAttachmentUploadItems(items).map((item) => item.uid),
    ['new', 'pending', 'failed']
  )
  assert.deepEqual(
    selectBusinessAttachmentUploadItems(items, { retryOnly: true }).map(
      (item) => item.uid
    ),
    ['failed']
  )
  assert.equal(isBusinessAttachmentImage({ mime_type: 'image/heic' }), true)
  assert.equal(
    isBusinessAttachmentImage({ mime_type: 'application/pdf' }),
    false
  )
  assert.equal(isBusinessAttachmentImage({}), false)
})

test('businessAttachmentPanelState: 表单内缺 owner 时允许先选附件并随保存绑定', () => {
  const state = resolveBusinessAttachmentPanelState({
    ownerType: 'sales_order',
    ownerId: undefined,
    canUpload: true,
    description: '上传客户 PO',
  })

  assert.equal(state.missingOwner, true)
  assert.equal(state.canQueuePending, true)
  assert.equal(state.uploadDisabled, false)
  assert.equal(state.uploadButtonText, '选择附件')
  assert.equal(
    state.panelDescription,
    '可先选择附件，保存业务记录后自动上传并绑定。'
  )
  assert.equal(state.emptyDescription, '暂无附件，可先选择后随保存上传')
})

test('businessAttachmentPanelState: 页面级缺 owner 时禁用上传并提示先选择记录', () => {
  const state = resolveBusinessAttachmentPanelState({
    ownerType: 'workflow_task',
    ownerId: 0,
    canUpload: true,
    description: '上传现场证据',
    allowPendingAttachmentsWithoutOwner: false,
    missingOwnerDescription: '请先选择一条协同任务后上传附件。',
    missingOwnerEmptyText: '请先选择一条协同任务',
  })

  assert.equal(state.missingOwner, true)
  assert.equal(state.canQueuePending, false)
  assert.equal(state.uploadDisabled, true)
  assert.equal(state.uploadButtonText, '选择附件')
  assert.equal(state.panelDescription, '请先选择一条协同任务后上传附件。')
  assert.equal(state.emptyDescription, '请先选择一条协同任务')
})

test('businessAttachmentPanelState: 已有 owner 时保持同一选择附件按钮文案', () => {
  const state = resolveBusinessAttachmentPanelState({
    ownerType: 'workflow_task',
    ownerId: 12,
    canUpload: true,
    description: '上传现场证据',
    allowPendingAttachmentsWithoutOwner: false,
  })

  assert.equal(state.missingOwner, false)
  assert.equal(state.canQueuePending, false)
  assert.equal(state.uploadDisabled, false)
  assert.equal(state.uploadButtonText, '选择附件')
  assert.equal(state.panelDescription, '上传现场证据')
  assert.equal(state.emptyDescription, '暂无附件')
})

test('businessAttachmentPanelState: 附件动作按未知、空态和已有数量生成低密度文案', () => {
  assert.equal(
    resolveBusinessAttachmentActionLabel({
      attachmentCount: null,
      fallbackLabel: '任务附件',
    }),
    '任务附件'
  )
  assert.equal(
    resolveBusinessAttachmentActionLabel({ attachmentCount: 0 }),
    '添加附件'
  )
  assert.equal(
    resolveBusinessAttachmentActionLabel({
      attachmentCount: 0,
      canUpload: false,
    }),
    '查看附件'
  )
  assert.equal(
    resolveBusinessAttachmentActionLabel({ attachmentCount: 3 }),
    '附件（3）'
  )
})
