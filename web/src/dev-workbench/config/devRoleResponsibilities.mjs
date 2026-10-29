import { DEV_FLOW_STATE_CATALOG } from './devFlowStateCatalog.mjs'
import { buildFulfillmentRelations } from './devFulfillmentRelations.mjs'
import { getPermissionRelationshipContext } from './devPermissionRelationshipGraph.mjs'
import {
  getPermissionCenterRoleKey,
  getPermissionCenterRoleName,
  getMatchingRoleAccess,
} from '../../erp/utils/permissionCenterAccess.mjs'
import {
  ADMIN_ACCOUNT_STATUS,
  getAdminAccountStatus,
} from '../../erp/utils/permissionCenterSearch.mjs'
import { getPermissionModuleTitle } from '../../erp/utils/permissionModuleLabels.mjs'
import { readRolePermissionPolicy } from '../../erp/utils/rolePermissionPolicy.mjs'

const stages = buildFulfillmentRelations(DEV_FLOW_STATE_CATALOG)
const unique = (values) => [...new Set(values)]
const activeAccounts = (accounts, key) =>
  accounts.filter(
    (account) =>
      !account.is_super_admin &&
      getAdminAccountStatus(account) === ADMIN_ACCOUNT_STATUS.ACTIVE &&
      account.roles?.some((role) => getPermissionCenterRoleKey(role) === key)
  )

export function buildRoleResponsibilityModel({
  permissions = [],
  moduleKey = 'all',
  ...contextInput
} = {}) {
  const context = getPermissionRelationshipContext(contextInput)
  const permissionByKey = new Map(
    permissions.map((item) => [item.permission_key, item])
  )
  const inModule = (key) =>
    moduleKey === 'all' || permissionByKey.get(key)?.module === moduleKey
  const roles = context.roles.map((role) => {
    const key = getPermissionCenterRoleKey(role)
    const policy = readRolePermissionPolicy(role)
    const access = getMatchingRoleAccess(
      role,
      contextInput.accessByRoleKey?.[key]
    )
    const known = context.ready && !context.blocked && !role.disabled
    const decisions = new Map(
      (access?.permissions || []).map((item) => [item.permission_key, item])
    )
    const describe = (permissionKey) => ({
      key: permissionKey,
      label: permissionByKey.get(permissionKey)?.name || permissionKey,
      module: getPermissionModuleTitle(
        permissionByKey.get(permissionKey)?.module_name
      ),
      status:
        role.disabled || context.blocked
          ? '已停用'
          : !known
            ? '待核对'
            : !role.permissions.includes(permissionKey)
              ? '未启用'
              : decisions.get(permissionKey)?.effective === true
                ? '可用'
                : '受限',
    })
    const core = policy.required.filter(inModule).map(describe)
    const optional = policy.optional.filter(inModule).map(describe)
    const duties = stages.flatMap(({ stage, actions }) => {
      const matching = actions.filter(
        (action) =>
          action.roleKeys.includes(key) &&
          (moduleKey === 'all' || action.permissionKeys.some(inModule))
      )
      if (!matching.length) return []
      return [
        {
          key: `${key}/${stage.stage}`,
          roleKey: key,
          stageKey: stage.stage,
          label: stage.label,
          actions: matching,
        },
      ]
    })
    return {
      key,
      name: getPermissionCenterRoleName(role),
      description: role.description,
      policy,
      core,
      optional,
      duties,
      activeAccounts: activeAccounts(contextInput.accounts || [], key).length,
    }
  })

  // These are configuration observations, not task assignments or an execution
  // decision. Approval pools and individual documents retain their own guards.
  const gaps = (contextInput.roles || []).flatMap((role) => {
    const key = getPermissionCenterRoleKey(role)
    const policy = readRolePermissionPolicy(role)
    if (!policy.registered) return []
    const access = getMatchingRoleAccess(
      role,
      contextInput.accessByRoleKey?.[key]
    )
    const reasons = []
    if (role.disabled) reasons.push('岗位已停用')
    else if (!activeAccounts(contextInput.accounts || [], key).length) {
      reasons.push('未分配启用账号')
    }
    if (policy.missing.length) {
      reasons.push(`缺少 ${policy.missing.length} 项核心功能`)
    }
    if (policy.outside.length) {
      reasons.push(`${policy.outside.length} 项功能超出模板`)
    }
    if (!role.disabled) {
      if (!access || access.is_final !== true || access.is_preview === true) {
        reasons.push('最终权限尚待核对')
      } else {
        const restricted = policy.required.filter(
          (permissionKey) =>
            role.permissions.includes(permissionKey) &&
            access.permissions?.find(
              (item) => item.permission_key === permissionKey
            )?.effective !== true
        )
        if (restricted.length) {
          reasons.push(`${restricted.length} 项核心功能受客户设置限制`)
        }
      }
    }
    return reasons.length
      ? [
          {
            key,
            name: getPermissionCenterRoleName(role),
            reasons,
            stageLabels: unique(
              stages
                .filter(({ actions }) =>
                  actions.some((action) => action.roleKeys.includes(key))
                )
                .map(({ stage }) => stage.label)
            ),
          },
        ]
      : []
  })
  return {
    context,
    roles,
    duties: roles.flatMap((role) => role.duties),
    gaps,
    registered:
      roles.length > 0 && roles.every((role) => role.policy.registered),
  }
}
