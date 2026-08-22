import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isBusinessAttachmentWithdrawn,
  normalizeBusinessAttachmentWithdrawalReason,
  resolveBusinessAttachmentWithdrawalMeta,
} from './businessAttachmentPresentation.mjs'

test('businessAttachmentWithdrawal: 撤销原因去首尾空白并限制 1 到 255 个字', () => {
  assert.deepEqual(
    normalizeBusinessAttachmentWithdrawalReason('  上传错误  '),
    {
      reason: '上传错误',
      valid: true,
      length: 4,
    }
  )
  assert.equal(normalizeBusinessAttachmentWithdrawalReason('   ').valid, false)
  assert.equal(
    normalizeBusinessAttachmentWithdrawalReason('错'.repeat(255)).valid,
    true
  )
  assert.equal(
    normalizeBusinessAttachmentWithdrawalReason('错'.repeat(256)).valid,
    false
  )
  assert.equal(
    normalizeBusinessAttachmentWithdrawalReason('😀'.repeat(255)).valid,
    true
  )
})

test('businessAttachmentWithdrawal: 只以 withdrawn_at 派生撤销状态', () => {
  assert.equal(
    isBusinessAttachmentWithdrawn({ withdrawn_at: 1_750_000_000 }),
    true
  )
  assert.equal(
    isBusinessAttachmentWithdrawn({
      withdrawn_by: 7,
      withdrawal_reason: '残缺旧值',
    }),
    false
  )
})

test('businessAttachmentWithdrawal: 撤销审计显示业务可读账号时间和原因', () => {
  const meta = resolveBusinessAttachmentWithdrawalMeta({
    withdrawn_at: 1_750_000_000,
    withdrawn_by: 7,
    withdrawn_by_username: ' demo_admin ',
    withdrawn_by_display_name: ' 系统管理员 ',
    withdrawal_reason: ' 上传了错误版本 ',
  })

  assert.equal(meta.withdrawn, true)
  assert.equal(meta.withdrawerLabel, '撤销人：系统管理员（demo_admin）')
  assert.match(meta.withdrawnAtLabel, /^撤销时间：/u)
  assert.equal(meta.withdrawalReasonLabel, '撤销原因：上传了错误版本')
  assert(!meta.withdrawerLabel.includes('7'))
})

test('businessAttachmentWithdrawal: 历史缺失撤销身份不回退内部数字账号', () => {
  const meta = resolveBusinessAttachmentWithdrawalMeta({
    withdrawn_at: 1_750_000_000,
    withdrawn_by: 7,
    withdrawn_by_username: '   ',
    withdrawal_reason: '',
  })

  assert.equal(meta.withdrawerLabel, '撤销人：未记录')
  assert.equal(meta.withdrawalReasonLabel, '撤销原因：未记录')
})
