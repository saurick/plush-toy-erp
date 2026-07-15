import React, { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { AUTH_SCOPE, getStoredAdminProfile, logout } from '@/common/auth/auth'
import AppShell from '@/common/components/layout/AppShell'
import { Loading } from '@/common/components/loading'
import { getActiveERPBrand } from '@/common/consts/brand'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { getEffectiveSession } from '../api/customerConfigApi.mjs'
import {
  ENTRY_TARGET,
  isMobileRoleEntryEnabled,
  rememberEntryChoice,
  resolveMobileTasksPath,
} from '../config/entryConfig.mjs'
import { useERPWorkspace } from '../context/ERPWorkspaceProvider'
import {
  attachEffectiveSessionToAdminProfile,
  attachUnavailableEffectiveSessionToAdminProfile,
  canMountCustomerRuntime,
  resolveEffectiveSessionCustomerKey,
} from '../utils/adminProfileSync.mjs'
import { hasMobileRolePermission } from '../utils/mobileRolePermissions.mjs'

function MobileCustomerRuntimeBoundary({
  adminProfile,
  handleBackToProductCore,
  handleLogout,
  loggingOut,
}) {
  const canReturnToProductCore = adminProfile?.is_super_admin === true

  return (
    <div
      className="mobile-role-runtime-boundary surface-panel bg-white text-slate-950 md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl"
      data-mobile-customer-runtime-guard="true"
    >
      <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-emerald-700">访问提示</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">
          暂时无法进入手机待办
        </h1>
        <p className="mt-3 text-base leading-7 text-slate-600">
          当前账号的工作范围尚未准备完成。请退出后重新登录；如仍无法进入，
          请联系管理员。
        </p>
        <div className="mt-5 flex flex-col gap-3">
          {canReturnToProductCore ? (
            <button
              type="button"
              className="rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white"
              onClick={handleBackToProductCore}
            >
              返回电脑端
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-xl border border-slate-300 px-4 py-3 text-base font-semibold text-slate-700"
            onClick={handleLogout}
            disabled={loggingOut || typeof handleLogout !== 'function'}
          >
            {loggingOut ? '退出中' : '退出登录'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default function MobileAppLayout() {
  const navigate = useNavigate()
  const { activeRole, activeRoleKey } = useERPWorkspace()
  const [loggingOut, setLoggingOut] = useState(false)
  const activeBrand = useMemo(() => getActiveERPBrand(), [])
  const [adminProfile, setAdminProfile] = useState(() =>
    getStoredAdminProfile()
  )
  const [profileSyncCompleted, setProfileSyncCompleted] = useState(false)
  const mobileRoleEntryAvailable =
    Boolean(activeRole) && isMobileRoleEntryEnabled(activeRoleKey)
  const mobileRolePermissionAllowed =
    mobileRoleEntryAvailable &&
    hasMobileRolePermission(adminProfile, activeRoleKey)
  const customerRuntimeAvailable = canMountCustomerRuntime(adminProfile)
  const shouldBlockMissingCustomerRuntime =
    profileSyncCompleted &&
    mobileRolePermissionAllowed &&
    !customerRuntimeAvailable
  const canUseCurrentMobileRole =
    mobileRolePermissionAllowed && customerRuntimeAvailable
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
    let cancelled = false

    async function syncEffectiveSession() {
      const storedProfile = getStoredAdminProfile()
      if (!storedProfile) {
        if (!cancelled) {
          setAdminProfile(null)
          setProfileSyncCompleted(true)
        }
        return
      }

      const customerKey = resolveEffectiveSessionCustomerKey(activeBrand)
      try {
        const nextProfile = customerKey
          ? attachEffectiveSessionToAdminProfile(
              storedProfile,
              await getEffectiveSession({ customer_key: customerKey })
            )
          : attachUnavailableEffectiveSessionToAdminProfile(storedProfile)
        if (!cancelled) {
          setAdminProfile(nextProfile)
          setProfileSyncCompleted(true)
        }
      } catch (error) {
        console.warn('手机待办工作范围同步失败，暂不加载任务数据', error)
        if (!cancelled) {
          setAdminProfile(
            attachUnavailableEffectiveSessionToAdminProfile(storedProfile)
          )
          setProfileSyncCompleted(true)
        }
      }
    }

    setProfileSyncCompleted(false)
    syncEffectiveSession()

    return () => {
      cancelled = true
    }
  }, [activeBrand])

  useEffect(() => {
    if (!profileSyncCompleted || shouldBlockMissingCustomerRuntime) {
      return
    }
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
    profileSyncCompleted,
    shouldBlockMissingCustomerRuntime,
  ])

  const handleBackToProductCore = () => {
    rememberEntryChoice(ENTRY_TARGET.DESKTOP)
    navigate('/erp/dashboard', { replace: true })
  }

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
        {!profileSyncCompleted ? (
          <Loading
            title="正在准备手机待办"
            description="正在确认您的岗位权限和工作范围，请稍候..."
            className="loading-page--erp"
          />
        ) : shouldBlockMissingCustomerRuntime ? (
          <MobileCustomerRuntimeBoundary
            adminProfile={adminProfile}
            handleBackToProductCore={handleBackToProductCore}
            handleLogout={handleLogout}
            loggingOut={loggingOut}
          />
        ) : canUseCurrentMobileRole ? (
          <Outlet context={{ adminProfile, handleLogout, loggingOut }} />
        ) : null}
      </div>
    </AppShell>
  )
}
