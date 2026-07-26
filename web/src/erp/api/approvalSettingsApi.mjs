import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const customerConfigRpc = new JsonRpc({
  url: 'customer_config',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

function requireApprovalSettings(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray(value.items) ||
    value.items.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        typeof item.configured !== 'boolean' ||
        typeof item.enabled !== 'boolean'
    )
  ) {
    throw new Error('审批责任数据不完整，请刷新后重试')
  }
  return value
}

function requirePublishedRevision(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !String(value.customer_key || '').trim() ||
    !String(value.revision || '').trim() ||
    !String(value.config_hash || '').trim() ||
    !String(value.product_version || '').trim()
  ) {
    throw new Error('审批责任发布结果不完整，请刷新后重试')
  }
  return value
}

function requireText(value, label) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label}不能为空`)
  return text
}

function normalizeMember(member = {}) {
  const userID = Number(member.user_id || 0)
  if (!Number.isSafeInteger(userID) || userID < 0) {
    throw new Error('审批成员无效')
  }
  return {
    role_key: requireText(member.role_key, '审批岗位'),
    user_id: userID,
    strategy: requireText(member.strategy, '审批责任'),
    enabled: member.enabled !== false,
  }
}

export function buildApprovalSettingsRevisionPayload(input = {}) {
  const items = Array.isArray(input.items)
    ? input.items.map((item) => ({
        approval_key: requireText(item.approval_key, '审批事项'),
        enabled: item.enabled === true,
        members: Array.isArray(item.members)
          ? item.members.map(normalizeMember)
          : [],
      }))
    : []
  if (!items.length) throw new Error('审批事项不能为空')
  return {
    customer_key: String(input.customer_key || '').trim() || undefined,
    revision: requireText(input.revision, '草稿版本'),
    expected_active_revision: requireText(
      input.expected_active_revision,
      '当前生效版本'
    ),
    expected_active_hash: requireText(
      input.expected_active_hash,
      '当前配置校验值'
    ),
    items,
  }
}

export async function getApprovalSettings(params = {}) {
  const result = await customerConfigRpc.call('get_approval_settings', params)
  return requireApprovalSettings(dataOf(result)?.approval_settings)
}

export async function previewApprovalSettings(input = {}) {
  const result = await customerConfigRpc.call(
    'preview_approval_settings',
    buildApprovalSettingsRevisionPayload(input)
  )
  return requireApprovalSettings(dataOf(result)?.approval_settings)
}

export async function publishApprovalSettings(input = {}) {
  const result = await customerConfigRpc.call(
    'publish_approval_settings',
    buildApprovalSettingsRevisionPayload(input)
  )
  return requirePublishedRevision(dataOf(result)?.revision)
}
