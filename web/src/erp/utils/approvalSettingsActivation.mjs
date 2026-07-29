function normalizedItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.configurable !== false)
    .map((item) => {
      const itemEnabled = item.enabled === true
      return {
        approval_key: String(item.approval_key || '').trim(),
        enabled: itemEnabled,
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

function invalidReadback(message) {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

export function approvalSettingsMutationMayHaveSucceeded(error) {
  const httpStatus = Number(error?.httpStatus || 0)
  return Boolean(
    error?.isNetworkError ||
      error?.isAbortError ||
      error?.isInvalidResponse ||
      httpStatus === 408 ||
      httpStatus >= 500 ||
      Number(error?.code || 0) >= 50000
  )
}

export function getApprovalSettingsBlockingItems(settings) {
  return (Array.isArray(settings?.items) ? settings.items : []).filter(
    (item) =>
      item?.configurable === true &&
      item.enabled === true &&
      Array.isArray(item.blocked_reasons) &&
      item.blocked_reasons.length > 0
  )
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
