import { PermissionLabel } from '../../common/consts/permissions.generated.mjs'
import { RpcErrorCode } from '../../common/consts/errorCodes.generated.js'
import { hasActionPermission } from './masterDataOrderView.mjs'

export function sourceActionAccess(profile, action) {
  const authorized = hasActionPermission(profile, action.permission)
  const missing = [...new Set([
    ...action.sourcePermissions,
    ...action.preparationPermissions,
    ...action.sensitivePermissions,
  ])].filter((permission) => !hasActionPermission(profile, permission))
  const blocked = authorized && missing.length > 0
  return {
    authorized,
    allowed: authorized && !blocked,
    blocked,
    missing,
    reason: blocked
      ? `${action.label}还需：${missing.map((key) => PermissionLabel[key]).join('、')}。请联系管理员按岗位补齐权限。`
      : authorized ? '' : `当前岗位不能${action.label}`,
  }
}

export function isSourceActionPermissionDenied(error) {
  return Number(error?.code) === RpcErrorCode.PERMISSION_DENIED || Number(error?.httpStatus) === 403
}

export const SOURCE_ACCESS_REVOKED_MESSAGE = '当前权限已变化，来源窗口已关闭；请刷新权限后重新选择来源。'
