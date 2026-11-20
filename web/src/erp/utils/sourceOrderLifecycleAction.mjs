const MAX_REASON_LENGTH = 255

function positiveInteger(value) {
  const normalized = Number(value || 0)
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0
}

export function normalizeSourceOrderLifecycleReason(action = {}, value = '') {
  const reason = String(value || '').trim()
  if ([...reason].length > MAX_REASON_LENGTH) {
    throw new Error('业务原因不能超过 255 个字')
  }
  if (action.requiresReason && !reason) {
    throw new Error('请填写业务原因')
  }
  return reason
}

export function prepareSourceOrderLifecycleAttempt({
  action,
  attemptStore,
  customerKey = '',
  reason = '',
  record,
} = {}) {
  if (!action?.sourceLifecycle || typeof attemptStore?.prepare !== 'function') {
    throw new Error('当前订单动作配置不完整，请刷新后重试')
  }
  const id = positiveInteger(record?.id)
  const expectedVersion = positiveInteger(record?.version)
  const sourceType = String(action.sourceType || '').trim()
  const commandKey = String(action.commandKey || '').trim()
  if (!id || !expectedVersion || !sourceType || !commandKey) {
    throw new Error('订单状态已变化，请刷新列表后重试')
  }

  const normalizedReason = normalizeSourceOrderLifecycleReason(action, reason)
  const closeMode = String(action.closeMode || '').trim()
  const payload = {
    id,
    expected_version: expectedVersion,
    ...(String(customerKey || '').trim()
      ? { customer_key: String(customerKey).trim() }
      : {}),
    ...(normalizedReason ? { reason: normalizedReason } : {}),
    ...(closeMode ? { close_mode: closeMode } : {}),
  }
  const scope = [
    'source-order-lifecycle',
    sourceType,
    id,
    commandKey,
    closeMode || 'none',
  ].join(':')
  return {
    scope,
    attempt: attemptStore.prepare(scope, payload),
  }
}
