import { getRoleDisplayName } from './roleKeys.mjs'

const fieldLabelMap = {
  account_status: '账号状态',
  disabled: '账号状态',
  is_super_admin: '超级管理员',
  name: '岗位名称',
  display_name: '员工姓名',
  phone: '手机号',
  role_type: '岗位类型',
  role_keys: '岗位',
  permission_keys: '可用功能',
  password_reset: '密码',
  password_changed: '密码',
  reset_to_default: '重置方式',
  session_revoke_reason: '登录状态',
  status_reason: '状态说明',
  version: '岗位信息',
}

const visibleAuditChangeKeys = new Set(Object.keys(fieldLabelMap))

const accountStatusLabelMap = Object.freeze({
  ACTIVE: '正常使用',
  DISABLED: '已停用',
  REVOKED: '已注销',
})

const roleTypeLabelMap = Object.freeze({
  BUILTIN: '系统岗位',
  CUSTOM: '自定义岗位',
})

const technicalAuditValueKeys = new Set([
  'id',
  'actor_id',
  'target_id',
  'source_id',
  'source_line_id',
  'source_type',
  'owner_role_key',
  'task_status_key',
  'payload',
])

function isTechnicalAuditValueKey(key) {
  const normalized = String(key || '').trim()
  if (!normalized) return false
  return (
    technicalAuditValueKeys.has(normalized) ||
    /(?:^|_)(?:id|key)$/u.test(normalized)
  )
}

function compactValue(value, key) {
  if (value === null || value === undefined) {
    return '-'
  }
  if (key === 'role_keys' && Array.isArray(value)) {
    return value.length
      ? value.map((role) => getRoleDisplayName(role)).join('、')
      : '-'
  }
  if (key === 'phone') {
    return value
      ? String(value).replace(/(\d{3})\d{4}(\d{4})/gu, '$1****$2')
      : '-'
  }
  if (key === 'disabled') {
    return value ? '已禁用' : '已启用'
  }
  if (key === 'password_reset') {
    return value ? '已重置' : '未重置'
  }
  if (key === 'password_changed') {
    return value ? '本人已修改' : '修改前'
  }
  if (key === 'reset_to_default') {
    return value ? '默认密码' : '指定新密码'
  }
  if (key === 'account_status') {
    return accountStatusLabelMap[String(value || '').toUpperCase()] || '已更新'
  }
  if (key === 'role_type') {
    return roleTypeLabelMap[String(value || '').toUpperCase()] || '已更新'
  }
  if (key === 'status_reason' || key === 'session_revoke_reason') {
    return value ? '已填写' : '-'
  }
  if (key === 'version') {
    return value ? '已更新' : '-'
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length} 项` : '-'
  }
  if (typeof value === 'object') {
    return '已记录'
  }
  return isTechnicalAuditValueKey(key) ? '已记录' : String(value)
}

function getAuditFieldLabel(key) {
  return fieldLabelMap[key] || '字段变更'
}

export function getAuditChanges(payload = {}) {
  const before = payload.before || {}
  const after = payload.after || {}
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => visibleAuditChangeKeys.has(key))
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({
      key,
      label: getAuditFieldLabel(key),
      before: compactValue(before[key], key),
      after: compactValue(after[key], key),
    }))
}

export function summarizeChange(payload = {}, { limit } = {}) {
  const changes = getAuditChanges(payload)
  if (!changes.length) return '本次操作已记录'
  const displayed = limit ? changes.slice(0, limit) : changes
  const summary = displayed
    .map((change) => `${change.label}：${change.before} → ${change.after}`)
    .join('；')
  return displayed.length < changes.length
    ? `${summary}；另有 ${changes.length - displayed.length} 项变化`
    : summary
}
