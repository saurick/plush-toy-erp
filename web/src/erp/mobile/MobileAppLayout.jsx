import React, { useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { LogoutOutlined } from '@ant-design/icons'
import { AUTH_SCOPE, logout } from '@/common/auth/auth'
import AppShell from '@/common/components/layout/AppShell'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { mobileTheme } from './theme'

export default function MobileAppLayout() {
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const authRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'auth',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

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
      navigate('/admin-login', { replace: true })
    }
  }

  return (
    <AppShell className="px-3 py-4 sm:px-4 md:px-8">
      <div className="mobile-app-layout mx-auto max-w-[540px] space-y-4 md:max-w-[920px]">
        <SurfacePanel className="p-4 md:p-5">
          <h1 className={mobileTheme.pageTitle}>待办</h1>
        </SurfacePanel>

        <Outlet />

        <div className="flex justify-center pb-3">
          <button
            type="button"
            className={mobileTheme.logoutButton}
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogoutOutlined aria-hidden="true" />
            <span>{loggingOut ? '退出中' : '退出登录'}</span>
          </button>
        </div>
      </div>
    </AppShell>
  )
}
