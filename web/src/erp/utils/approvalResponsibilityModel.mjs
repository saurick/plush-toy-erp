import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { formatAdminIdentity } from './adminIdentity.mjs'
import {
  approvalConditionSummary,
  normalizeApprovalCondition,
} from './approvalCondition.mjs'
import { getRoleDisplayName, ROLE_DISPLAY_NAMES } from './roleKeys.mjs'

const APPROVAL_KEYS = ['sales_order', 'purchase_order', 'shipment_finance']
export const STRATEGIES = Object.freeze([
  {
    key: 'primary',
    shortLabel: '主办',
    fieldLabel: '主要由谁审批',
  },
  {
    key: 'backup',
    shortLabel: '备用',
    fieldLabel: '主办无人可处理时',
  },
  {
    key: 'escalation',
    shortLabel: '升级',
    fieldLabel: '超时或需要升级时',
  },
])
export const EDITOR_MEMBER_FIELDS = STRATEGIES.flatMap(({ key }) => [
  `${key}_role`,
  `${key}_mode`,
  `${key}_user`,
])
const MISSING_ADMIN_IDENTITY_LABEL = '人员信息待核对'

const APPROVAL_ROLE_KEYS = new Set(Object.keys(ROLE_DISPLAY_NAMES))

function roleKeyOf(role = {}) {
  return String(role.role_key || role.key || '').trim()
}

function adminRoleKeys(admin = {}) {
  return Array.from(
    new Set(
      (Array.isArray(admin.roles) ? admin.roles : [])
        .map(roleKeyOf)
        .filter(Boolean)
    )
  )
}

export function adminIsActive(admin = {}) {
  const status = String(admin.account_status || '').trim()
  return (
    admin.disabled !== true &&
    admin.revoked !== true &&
    !admin.revoked_at &&
    (!status || status === 'active')
  )
}

export function adminHasRole(admin = {}, roleKey = '') {
  return adminRoleKeys(admin).includes(String(roleKey || '').trim())
}

export function strategyShortLabel(strategyKey) {
  return (
    STRATEGIES.find((strategy) => strategy.key === strategyKey)?.shortLabel ||
    '其他'
  )
}

function responsibilityIdentity(values = {}, strategyKey = '') {
  const roleKey = String(values[`${strategyKey}_role`] || '').trim()
  if (!roleKey) return ''
  if (values[`${strategyKey}_mode`] === 'user') {
    const userID = Number(values[`${strategyKey}_user`] || 0)
    return userID > 0 ? `${roleKey}:${userID}` : ''
  }
  return `${roleKey}:0`
}

export function conflictingStrategy(
  values = {},
  strategyKey = '',
  identity = ''
) {
  if (!identity) return ''
  return (
    STRATEGIES.find(
      ({ key }) =>
        key !== strategyKey && responsibilityIdentity(values, key) === identity
    )?.key || ''
  )
}

function defaultMembers(approvalKey) {
  const primaryRole = {
    sales_order: 'sales',
    purchase_order: 'purchase',
    shipment_finance: 'finance',
  }[approvalKey]
  return [
    {
      role_key: primaryRole,
      user_id: 0,
      strategy: 'primary',
      enabled: true,
    },
    {
      role_key: 'boss',
      user_id: 0,
      strategy: 'escalation',
      enabled: true,
    },
  ].filter((member) => member.role_key)
}

export function normalizeDraftItems(
  items = [],
  { initializeUnconfigured = true } = {}
) {
  return APPROVAL_KEYS.map((approvalKey) => {
    const item = (Array.isArray(items) ? items : []).find(
      (candidate) =>
        candidate?.configurable === true &&
        candidate.approval_key === approvalKey
    )
    const configured = item?.configured === true
    const shouldInitialize = !configured && initializeUnconfigured
    return {
      approval_key: approvalKey,
      condition: normalizeApprovalCondition(approvalKey, item?.condition),
      configured,
      enabled: shouldInitialize ? true : item?.enabled === true,
      members:
        Array.isArray(item?.members) && item.members.length > 0
          ? item.members.map((member) => ({
              role_key: String(member.role_key || '').trim(),
              user_id: Number(member.user_id || 0),
              strategy: String(member.strategy || '').trim(),
              enabled: member.enabled !== false,
            }))
          : shouldInitialize
            ? defaultMembers(approvalKey)
            : [],
    }
  })
}

export function draftSignature(items = []) {
  return JSON.stringify(
    items.map((item) => ({
      ...item,
      configured: undefined,
      members: [...item.members].sort((left, right) =>
        `${left.strategy}:${left.role_key}:${left.user_id}`.localeCompare(
          `${right.strategy}:${right.role_key}:${right.user_id}`
        )
      ),
    }))
  )
}

export function memberLabel(member, adminByID) {
  const strategy =
    STRATEGIES.find((item) => item.key === member.strategy)?.shortLabel ||
    '责任'
  const role = getRoleDisplayName(member.role_key)
  const userID = Number(member.user_id || 0)
  if (userID <= 0) return `${strategy} · ${role}`
  return `${strategy} · ${role} · ${formatAdminIdentity(
    adminByID.get(userID) || {},
    { fallback: MISSING_ADMIN_IDENTITY_LABEL }
  )}`
}

export function buildApprovalRoleOptions({
  admins = [],
  currentAdmin = null,
  draftItems = [],
  roles = [],
}) {
  const currentAdminRoleSet = new Set(adminRoleKeys(currentAdmin || {}))
  const roleByKey = new Map(
    roles
      .map((role) => [roleKeyOf(role), role])
      .filter(([key]) => key && !['admin', 'debug_operator'].includes(key))
  )
  const savedRoleKeys = new Set(
    draftItems.flatMap((item) =>
      (item.members || []).map((member) => String(member.role_key || '').trim())
    )
  )
  savedRoleKeys.forEach((key) => {
    if (key && !roleByKey.has(key)) {
      roleByKey.set(key, { role_key: key, missing: true })
    }
  })

  return Array.from(roleByKey.entries()).map(([key, role]) => {
    const displayLabel = getRoleDisplayName(key)
    const protectedOwnRole =
      currentAdmin?.is_super_admin !== true && currentAdminRoleSet.has(key)
    const activeEmployeeCount = admins.filter(
      (admin) => adminIsActive(admin) && adminHasRole(admin, key)
    ).length
    let reason = ''
    let validationMessage = ''
    if (role.missing === true) {
      reason = '岗位已不存在，请重新选择'
      validationMessage = '当前岗位已不存在，请重新选择'
    } else if (!APPROVAL_ROLE_KEYS.has(key)) {
      reason = '不支持审批责任'
      validationMessage = '当前岗位不支持审批责任，请重新选择'
    } else if (role.disabled === true) {
      reason = '岗位已停用'
      validationMessage = '当前岗位已停用，请重新选择'
    } else if (
      !Array.isArray(role.permissions) ||
      !role.permissions.includes(PermissionCode.WORKFLOW_TASK_APPROVE)
    ) {
      reason = '未开启审批功能'
      validationMessage = '当前岗位未开启审批功能，请先在岗位设置中开启'
    } else if (activeEmployeeCount === 0) {
      reason = '暂无启用员工'
      validationMessage = '当前岗位暂无启用员工，请先启用员工'
    } else if (protectedOwnRole) {
      reason = '不能配置本人岗位'
      validationMessage = '不能通过审批责任配置本人岗位'
    }
    return {
      value: key,
      displayLabel,
      label: reason ? `${displayLabel}（${reason}）` : displayLabel,
      disabled: Boolean(reason),
      eligible: !reason,
      reason,
      validationMessage,
    }
  })
}

export function roleOptionsForStrategy({
  roleOptions,
  editorValues,
  strategyKey,
}) {
  return roleOptions.map((option) => {
    if (option.disabled || editorValues[`${strategyKey}_mode`] === 'user') {
      return option
    }
    const occupiedBy = conflictingStrategy(
      editorValues,
      strategyKey,
      `${option.value}:0`
    )
    if (!occupiedBy) return option
    return {
      ...option,
      label: `${option.displayLabel}（已用于${strategyShortLabel(
        occupiedBy
      )}责任）`,
      disabled: true,
    }
  })
}

export function usersForApprovalRole({
  admins,
  currentAdmin,
  editorValues,
  roleKey,
  selectedUserID = 0,
  strategyKey = '',
}) {
  const candidates = admins
    .filter(
      (admin) =>
        adminHasRole(admin, roleKey) ||
        Number(admin.id) === Number(selectedUserID)
    )
    .map((admin) => ({ ...admin, missing: false }))
  if (
    selectedUserID > 0 &&
    !candidates.some((admin) => Number(admin.id) === Number(selectedUserID))
  ) {
    candidates.push({ id: selectedUserID, missing: true })
  }
  return candidates.map((admin) => {
    const adminID = Number(admin.id)
    const protectedSelf =
      currentAdmin?.is_super_admin !== true &&
      adminID === Number(currentAdmin?.id)
    const occupiedBy = conflictingStrategy(
      editorValues,
      strategyKey,
      `${roleKey}:${adminID}`
    )
    let reason = ''
    if (admin.missing === true || admin.account_status === 'revoked') {
      reason = '账号不存在或已离职'
    } else if (!adminHasRole(admin, roleKey)) {
      reason = '已不属于该岗位'
    } else if (!adminIsActive(admin)) {
      reason = '账号已停用'
    } else if (protectedSelf) {
      reason = '不能指定本人'
    } else if (occupiedBy) {
      reason = `已用于${strategyShortLabel(occupiedBy)}责任`
    }
    const displayLabel = formatAdminIdentity(admin, {
      fallback: admin.phone || MISSING_ADMIN_IDENTITY_LABEL,
    })
    return {
      value: adminID,
      label: reason ? `${displayLabel}（${reason}）` : displayLabel,
      disabled: Boolean(reason),
      reason,
    }
  })
}

export function buildApprovalDisplayItems({ settings, draftItems, preview }) {
  const baseByKey = new Map(
    (settings?.items || [])
      .filter((item) => item?.configurable)
      .map((item) => [item.approval_key, item])
  )
  const draftByKey = new Map(
    draftItems.map((item) => [item.approval_key, item])
  )
  const previewByKey = new Map(
    (preview?.items || []).map((item) => [item.approval_key, item])
  )
  return APPROVAL_KEYS.map((key) => ({
    ...(baseByKey.get(key) || { approval_key: key, label: key }),
    ...(draftByKey.get(key) || {}),
    ...(previewByKey.get(key) || {}),
    members:
      previewByKey.get(key)?.members ||
      draftByKey.get(key)?.members ||
      baseByKey.get(key)?.members ||
      [],
  }))
}

export function selectedUnavailableApprovalRoles({
  editorValues,
  roleOptionByKey,
}) {
  const seen = new Set()
  return STRATEGIES.flatMap(({ key }) => {
    const roleKey = String(editorValues[`${key}_role`] || '').trim()
    const option = roleOptionByKey.get(roleKey)
    if (!roleKey || !option?.disabled || seen.has(roleKey)) return []
    seen.add(roleKey)
    return [option]
  })
}

export function approvalEditorEligibilityNotice({
  selectableRoleOptions,
  selectedUnavailableRoles,
}) {
  const onlyOption = selectableRoleOptions[0]
  const availabilityCopy =
    selectableRoleOptions.length === 0
      ? '当前没有具备审批资格的岗位。请先在“岗位设置”中启用岗位、开启审批功能，并至少保留一名启用员工。'
      : selectableRoleOptions.length === 1
        ? `当前只有“${onlyOption.displayLabel}”具备审批资格。备用和升级可以留空；同一岗位的“岗位内任一员工”选项或同一指定员工不能重复设置，如需调整主办，请先清空与其重复的备用或升级责任。`
        : ''
  if (selectedUnavailableRoles.length > 0) {
    return {
      type: 'warning',
      message: '当前设置包含不可用岗位',
      description: `${selectedUnavailableRoles
        .map(
          (option) => `${option.displayLabel}：${option.reason || '当前不可用'}`
        )
        .join('；')}。${availabilityCopy || '请重新选择具备审批资格的岗位。'}`,
    }
  }
  if (availabilityCopy) {
    return {
      type: selectableRoleOptions.length === 0 ? 'warning' : 'info',
      message:
        selectableRoleOptions.length === 0
          ? '当前没有可承接岗位'
          : '当前只有一个可承接岗位',
      description: availabilityCopy,
    }
  }
  return null
}

export function editorValuesForApproval(approvalKey, draftItems) {
  const draft = draftItems.find(
    (candidate) => candidate.approval_key === approvalKey
  ) || { enabled: false, members: [] }
  const condition = normalizeApprovalCondition(approvalKey, draft.condition)
  const values = {
    enabled: draft.enabled,
    approval_mode: condition.mode,
    approval_amount: condition.amount || undefined,
    approval_currency: condition.currency || 'CNY',
  }
  STRATEGIES.forEach(({ key }) => {
    const member = draft.members.find((candidate) => candidate.strategy === key)
    values[`${key}_role`] = member?.role_key
    values[`${key}_mode`] = member?.user_id > 0 ? 'user' : 'role'
    values[`${key}_user`] = member?.user_id || undefined
  })
  return values
}

export function draftItemFromEditor(approvalKey, values) {
  let condition
  try {
    condition = normalizeApprovalCondition(approvalKey, {
      mode: values.approval_mode,
      amount: values.approval_amount,
      currency: values.approval_currency,
    })
  } catch {
    throw new Error('审批条件不完整，请核对金额与币种')
  }
  const members = STRATEGIES.filter(({ key }) => values[`${key}_role`]).map(
    ({ key }) => ({
      role_key: values[`${key}_role`],
      user_id:
        values[`${key}_mode`] === 'user'
          ? Number(values[`${key}_user`] || 0)
          : 0,
      strategy: key,
      enabled: true,
    })
  )
  const memberIdentities = new Set()
  for (const member of values.enabled ? members : []) {
    const identity = `${member.role_key}:${member.user_id}`
    if (memberIdentities.has(identity)) {
      throw new Error(
        '同一岗位的“岗位内任一员工”选项或同一指定员工不能重复承担多个责任层级'
      )
    }
    memberIdentities.add(identity)
  }
  return {
    enabled: values.enabled === true,
    members,
    condition,
  }
}

export function approvalSettingsNeedInitialization(settings) {
  return (settings?.items || []).some(
    (item) => item?.configurable === true && item.configured !== true
  )
}

export { approvalConditionSummary, normalizeApprovalCondition }
