import React, { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { AUTH_SCOPE, getStoredAdminProfile, logout } from '@/common/auth/auth'
import AppShell from '@/common/components/layout/AppShell'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  isMobileRoleEntryEnabled,
  resolveMobileTasksPath,
} from '../config/entryConfig.mjs'
import { useERPWorkspace } from '../context/ERPWorkspaceProvider'
import { hasMobileRolePermission } from '../utils/mobileRolePermissions.mjs'

export default function MobileAppLayout() {
  const navigate = useNavigate()
  const { activeRole, activeRoleKey } = useERPWorkspace()
  const [loggingOut, setLoggingOut] = useState(false)
  const adminProfile = getStoredAdminProfile()
  const mobileRoleEntryAvailable =
    Boolean(activeRole) && isMobileRoleEntryEnabled(activeRoleKey)
  const canUseCurrentMobileRole =
    mobileRoleEntryAvailable &&
    hasMobileRolePermission(adminProfile, activeRoleKey)
  const authRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'auth',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

  useEffect(() => {
    if (canUseCurrentMobileRole) return
    if (!mobileRoleEntryAvailable) {
      navigate('/entry', { replace: true })
      return
    }
    logout(AUTH_SCOPE.ADMIN)
    navigate('/admin-login', {
      replace: true,
      state: {
        from: {
          pathname: resolveMobileTasksPath(activeRoleKey) || '/entry',
        },
      },
    })
  }, [
    activeRoleKey,
    canUseCurrentMobileRole,
    mobileRoleEntryAvailable,
    navigate,
  ])

  const handleLogout = async () => {
    if (loggingOut) {
      return
    }

    setLoggingOut(true)
    try {
      await authRpc.call('logout')
    } catch (error) {
      console.warn('移动端 logout 失败', error)
    } finally {
      logout(AUTH_SCOPE.ADMIN)
      navigate('/admin-login', {
        replace: true,
        state: {
          from: {
            pathname: resolveMobileTasksPath(activeRoleKey) || '/entry',
          },
        },
      })
    }
  }

  return (
    <AppShell className="px-0 py-0 md:px-8 md:py-4">
      <div className="mobile-app-layout mx-auto min-h-screen w-full max-w-[430px] md:max-w-[920px]">
        {canUseCurrentMobileRole ? (
          <Outlet context={{ adminProfile, handleLogout, loggingOut }} />
        ) : null}
      </div>
    </AppShell>
  )
}
