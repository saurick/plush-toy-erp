import { normalizeApprovalCondition } from './approvalCondition.mjs'
import { isMutationResultUnknown } from './mutationAttempt.mjs'

const APPROVAL_SETTINGS_BLOCKER_LABELS = Object.freeze({
  approval_settings_not_published: '尚未发布审批责任',
  approval_disabled: '该审批事项已停用',
  no_eligible_approver: '没有符合岗位、账号和责任设置的办理人',
})

function normalizedItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.configurable !== false)
    .map((item) => {
      const itemEnabled = item.enabled === true
      return {
        approval_key: String(item.approval_key || '').trim(),
        enabled: itemEnabled,
        condition: normalizeApprovalCondition(
          item.approval_key,
          item.condition
        ),
        members: (Array.isArray(item.members) ? item.members : [])
          .map((member) => ({
            role_key: String(member.role_key || '').trim(),
            user_id: Number(member.user_id || 0),
            strategy: String(member.strategy || '').trim(),
            enabled: itemEnabled && member.enabled !== false,
          }))
          .sort((left, right) =>
            `${left.strategy}:${left.role_key}:${left.user_id}`.localeCompare(
              `${right.strategy}:${right.role_key}:${right.user_id}`
            )
          ),
      }
    })
    .sort((left, right) => left.approval_key.localeCompare(right.approval_key))
}

export function getApprovalSettingsBlockerLabel(code) {
  return (
    APPROVAL_SETTINGS_BLOCKER_LABELS[String(code || '').trim()] ||
    '当前设置不能启用'
  )
}

function invalidReadback(message) {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

function getApprovalSettingsBlockingItems(settings) {
  return (Array.isArray(settings?.items) ? settings.items : []).filter(
    (item) =>
      item?.configurable === true &&
      item.enabled === true &&
      Array.isArray(item.blocked_reasons) &&
      item.blocked_reasons.length > 0
  )
}

export function getApprovalSettingsBlockingMessage(settings) {
  return getApprovalSettingsBlockingItems(settings)
    .map(
      (item) =>
        `${item.label}：${item.blocked_reasons
          .map(getApprovalSettingsBlockerLabel)
          .join('、')}`
    )
    .join('；')
}

export function verifyAppliedApprovalSettings({
  readback,
  payload,
  receipt = null,
}) {
  const expectedCustomerKey = String(payload?.customer_key || '').trim()
  const expectedRevision = String(payload?.revision || '').trim()
  const sameIdentity =
    String(readback?.customer_key || '').trim() === expectedCustomerKey &&
    String(readback?.config_revision || '').trim() === expectedRevision &&
    String(readback?.source || '').trim() === 'active_customer_config' &&
    String(readback?.config_hash || '').trim() !== ''
  if (!sameIdentity) {
    throw invalidReadback('审批责任生效结果与本次保存不一致，请重新确认')
  }
  if (
    receipt &&
    (String(receipt.customer_key || '').trim() !== expectedCustomerKey ||
      String(receipt.revision || '').trim() !== expectedRevision ||
      String(receipt.config_hash || '').trim() !==
        String(readback.config_hash || '').trim() ||
      String(receipt.product_version || '').trim() !==
        String(readback.product_version || '').trim() ||
      String(receipt.status || '').trim() !== 'active')
  ) {
    throw invalidReadback('审批责任生效回执不完整，请重新确认')
  }
  if (
    JSON.stringify(normalizedItems(readback.items)) !==
    JSON.stringify(normalizedItems(payload?.items))
  ) {
    throw invalidReadback('审批责任生效内容与本次保存不一致，请重新确认')
  }
  return readback
}

export async function activateApprovalSettings({
  payload,
  receipt = null,
  retrying = false,
  preview,
  apply,
  readback,
}) {
  if (receipt || retrying) {
    try {
      const current = await readback()
      verifyAppliedApprovalSettings({
        readback: current,
        payload,
        receipt,
      })
      return { status: 'confirmed', readback: current }
    } catch (error) {
      if (receipt) {
        return {
          status: 'confirmation_pending',
          confirmationStage: 'existing_receipt',
          error,
          receipt,
        }
      }
    }
  }

  let checked = null
  if (!retrying) {
    checked = await preview(payload)
    const blockingMessage = getApprovalSettingsBlockingMessage(checked)
    if (blockingMessage) {
      return { status: 'blocked', preview: checked, blockingMessage }
    }
  }

  let appliedReceipt
  try {
    appliedReceipt = await apply(payload)
  } catch (error) {
    if (!isMutationResultUnknown(error)) throw error
    try {
      const current = await readback()
      verifyAppliedApprovalSettings({ readback: current, payload })
      return { status: 'confirmed', readback: current, preview: checked }
    } catch (readbackError) {
      return {
        status: 'submission_unknown',
        error: readbackError,
        preview: checked,
      }
    }
  }

  try {
    const current = await readback()
    verifyAppliedApprovalSettings({
      readback: current,
      payload,
      receipt: appliedReceipt,
    })
    return {
      status: 'confirmed',
      readback: current,
      preview: checked,
    }
  } catch (error) {
    return {
      status: 'confirmation_pending',
      confirmationStage: 'submitted',
      error,
      receipt: appliedReceipt,
      preview: checked,
    }
  }
}
