const MAX_REVISION_LENGTH = 64
const REVISION_SEPARATOR = '.approval.'
const REVISION_SUFFIX_LENGTH = 32
const REVISION_PREFIX_LENGTH =
  MAX_REVISION_LENGTH - REVISION_SEPARATOR.length - REVISION_SUFFIX_LENGTH

function secureRevisionSuffix(cryptoProvider) {
  if (typeof cryptoProvider?.randomUUID === 'function') {
    return cryptoProvider.randomUUID().replaceAll('-', '').toLowerCase()
  }
  if (typeof cryptoProvider?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    cryptoProvider.getRandomValues(bytes)
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(
      ''
    )
  }
  throw new Error('当前浏览器不能安全生成审批设置版本号')
}

export function nextApprovalSettingsRevision(
  activeRevision,
  cryptoProvider = globalThis.crypto
) {
  const prefix =
    String(activeRevision || 'approval')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '')
      .slice(0, REVISION_PREFIX_LENGTH) || 'approval'
  const suffix = secureRevisionSuffix(cryptoProvider)
  if (suffix.length !== REVISION_SUFFIX_LENGTH) {
    throw new Error('审批设置版本号随机后缀不完整')
  }
  return `${prefix}${REVISION_SEPARATOR}${suffix}`
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

export function freezeApprovalSettingsPayload({
  settings,
  revision,
  draftItems,
}) {
  const payload = {
    customer_key: String(settings?.customer_key || '').trim(),
    revision: String(revision || '').trim(),
    expected_active_revision: String(settings?.config_revision || '').trim(),
    expected_active_hash: String(settings?.config_hash || '').trim(),
    items: JSON.parse(JSON.stringify(Array.isArray(draftItems) ? draftItems : [])),
  }
  return deepFreeze(payload)
}
