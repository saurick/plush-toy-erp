import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  READ_USER_PERMISSION,
  READ_ROLE_PERMISSION,
  READ_PERMISSION_PERMISSION,
  hasPermission,
} from './permissionCenterModel.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError, JsonRpc } from '@/common/utils/jsonRpc'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'

export function usePermissionCenterData() {
  const beginLatestRequest = useLatestRequestCoordinator()

  const adminRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'admin',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

  const [loading, setLoading] = useState(false)

  const [currentAdmin, setCurrentAdmin] = useState(null)

  const [admins, setAdmins] = useState([])

  const [roles, setRoles] = useState([])

  const [permissions, setPermissions] = useState([])

  const [permissionMenuOptions, setPermissionMenuOptions] = useState([])

  const [warehouseScopeOptions, setWarehouseScopeOptions] = useState([])

  const loadData = useCallback(async () => {
    const request = beginLatestRequest('permission-center')
    setLoading(true)
    try {
      const meResult = await adminRpc.call('me', {}, { signal: request.signal })
      if (!request.isCurrent()) {
        return false
      }
      const nextCurrentAdmin = meResult?.data || null
      const shouldLoadAdmins = hasPermission(
        nextCurrentAdmin,
        READ_USER_PERMISSION
      )
      const shouldLoadRBACOptions =
        hasPermission(nextCurrentAdmin, READ_ROLE_PERMISSION) &&
        hasPermission(nextCurrentAdmin, READ_PERMISSION_PERMISSION)
      const [listResult, optionsResult] = await Promise.all([
        shouldLoadAdmins
          ? adminRpc.call('list', {}, { signal: request.signal })
          : Promise.resolve(null),
        shouldLoadRBACOptions
          ? adminRpc.call('rbac_options', {}, { signal: request.signal })
          : Promise.resolve(null),
      ])
      if (!request.isCurrent()) {
        return false
      }
      const nextRoles = Array.isArray(optionsResult?.data?.roles)
        ? optionsResult.data.roles
        : []
      setCurrentAdmin(nextCurrentAdmin)
      setAdmins(
        Array.isArray(listResult?.data?.admins) ? listResult.data.admins : []
      )
      setRoles(nextRoles)
      setPermissions(
        Array.isArray(optionsResult?.data?.permissions)
          ? optionsResult.data.permissions
          : []
      )
      setPermissionMenuOptions(
        Array.isArray(optionsResult?.data?.menus)
          ? optionsResult.data.menus
          : Array.isArray(optionsResult?.data?.menu_options)
            ? optionsResult.data.menu_options
            : []
      )
      setWarehouseScopeOptions(
        Array.isArray(optionsResult?.data?.warehouse_scope_options)
          ? optionsResult.data.warehouse_scope_options
          : []
      )
      return true
    } catch (err) {
      if (isRpcAbortError(err) || !request.isCurrent()) {
        return false
      }
      message.error(getActionErrorMessage(err, '加载岗位设置'))
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [adminRpc, beginLatestRequest])

  useEffect(() => {
    loadData()
  }, [loadData])
  return {
    beginLatestRequest,
    adminRpc,
    loading,
    currentAdmin,
    admins,
    roles,
    permissions,
    permissionMenuOptions,
    warehouseScopeOptions,
    loadData,
  }
}
