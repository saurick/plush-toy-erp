import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveBusinessAttachmentPanelState } from './businessAttachmentPanelState.mjs'

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
  assert.equal(state.uploadButtonText, '上传')
  assert.equal(state.panelDescription, '请先选择一条协同任务后上传附件。')
  assert.equal(state.emptyDescription, '请先选择一条协同任务')
})

test('businessAttachmentPanelState: 已有 owner 时恢复真实附件上传文案', () => {
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
  assert.equal(state.uploadButtonText, '上传')
  assert.equal(state.panelDescription, '上传现场证据')
  assert.equal(state.emptyDescription, '暂无附件')
})
