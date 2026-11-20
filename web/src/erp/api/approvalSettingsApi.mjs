import { RpcMethod, RpcDomain } from '../../common/consts/rpcMethods.generated.mjs'
import { normalizeApprovalCondition } from '../utils/approvalCondition.mjs'
import { AUTH_SCOPE } from '../../common/auth/auth.js'
import { ADMIN_BASE_PATH } from '../../common/utils/adminRpc.js'
import {
  JsonRpc,
  requireRpcData as dataOf,
} from '../../common/utils/jsonRpc.js'

const customerConfigRpc = new JsonRpc({
  url: RpcDomain.CUSTOMER_CONFIG,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function invalidApprovalSettingsResponse(message) {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
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
    throw invalidApprovalSettingsResponse('审批责任数据不完整，请刷新后重试')
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
    throw invalidApprovalSettingsResponse(
      '审批责任发布结果不完整，请刷新后重试'
    )
  }
  return value
}

function requireAppliedRevision(value) {
  const revision = requirePublishedRevision(value)
  if (String(revision.status || '').trim() !== 'active') {
    throw invalidApprovalSettingsResponse('审批责任生效回执不完整，请重新确认')
  }
  return revision
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
        condition: normalizeApprovalCondition(
          item.approval_key,
          item.condition
        ),
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
  const result = await customerConfigRpc.call(RpcMethod.customer_config.GET_APPROVAL_SETTINGS, params)
  return requireApprovalSettings(
    dataOf(result, '审批责任数据不完整，请刷新后重试').approval_settings
  )
}

export async function previewApprovalSettings(input = {}) {
  const result = await customerConfigRpc.call(
    RpcMethod.customer_config.PREVIEW_APPROVAL_SETTINGS,
    buildApprovalSettingsRevisionPayload(input)
  )
  return requireApprovalSettings(
    dataOf(result, '审批责任数据不完整，请刷新后重试').approval_settings
  )
}

export async function publishApprovalSettings(input = {}) {
  const result = await customerConfigRpc.call(
    RpcMethod.customer_config.PUBLISH_APPROVAL_SETTINGS,
    buildApprovalSettingsRevisionPayload(input)
  )
  return requirePublishedRevision(
    dataOf(result, '审批责任发布结果不完整，请刷新后重试').revision
  )
}

export async function applyApprovalSettings(input = {}) {
  const result = await customerConfigRpc.call(
    RpcMethod.customer_config.APPLY_APPROVAL_SETTINGS,
    buildApprovalSettingsRevisionPayload(input)
  )
  return requireAppliedRevision(
    dataOf(result, '审批责任生效回执不完整，请重新确认').revision
  )
}
