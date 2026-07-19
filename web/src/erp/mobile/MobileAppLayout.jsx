import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import {
  AUTH_SCOPE,
  getLoginPath,
  getStoredAdminProfile,
  logout,
  persistAuthMeta,
} from '@/common/auth/auth'
import { authBus } from '@/common/auth/authBus'
import AppShell from '@/common/components/layout/AppShell'
import { Loading } from '@/common/components/loading'
import { getActiveERPBrand } from '@/common/consts/brand'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { getEffectiveSession } from '../api/customerConfigApi.mjs'
import {
  getEntryConfig,
  hasDesktopEntryAccess,
  isMobileRoleEntryEnabled,
  resolveMobileTasksPath,
} from '../config/entryConfig.mjs'
import { useERPWorkspace } from '../context/ERPWorkspaceProvider'
import {
  attachEffectiveSessionToAdminProfile,
  attachUnavailableEffectiveSessionToAdminProfile,
  canMountCustomerRuntime,
  getAdminProfileSyncErrorAction,
  isTransientProfileSyncError,
  loadProfileSyncReadWithRetry,
  resolveEffectiveSessionCustomerKey,
} from '../utils/adminProfileSync.mjs'
import { hasMobileRolePermission } from '../utils/mobileRolePermissions.mjs'

const PROFILE_BOOTSTRAP_RETRY_DELAYS_MS = [200, 600]
const PROFILE_SYNC_INTERVAL_MS = 60 * 1000

function MobileCustomerRuntimeBoundary({
  canReturnToEntries,
  handleBackToEntries,
  handleLogout,
  handleRetry,
  loggingOut,
  profileSyncing,
}) {
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
          当前账号的工作范围尚未准备完成。您可以重新连接；如仍无法进入，
          请选择其他工作入口或联系管理员。
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white disabled:cursor-wait disabled:opacity-60"
            onClick={handleRetry}
            disabled={profileSyncing || typeof handleRetry !== 'function'}
          >
            {profileSyncing ? '重新连接中' : '重新连接'}
          </button>
          {canReturnToEntries ? (
            <button
              type="button"
              className="rounded-xl border border-slate-300 px-4 py-3 text-base font-semibold text-slate-700"
              onClick={handleBackToEntries}
            >
              选择其他工作入口
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

function persistMobileAdminProfile(profile) {
  if (!profile) return
  persistAuthMeta(
    {
      user_id: profile.id,
      username: profile.username,
      is_super_admin: profile.is_super_admin === true,
      roles: profile.roles || [],
      permissions: profile.permissions || [],
      menus: profile.menus || [],
      erp_preferences: profile.erp_preferences || { column_orders: {} },
    },
    AUTH_SCOPE.ADMIN
  )
}

function isCurrentStoredAdmin(profile) {
  const storedProfile = getStoredAdminProfile()
  return Boolean(
    storedProfile &&
      profile &&
      String(storedProfile.id || '') === String(profile.id || '')
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
  const [profileSyncing, setProfileSyncing] = useState(false)
  const [profileSyncIssue, setProfileSyncIssue] = useState(false)
  const adminProfileRef = useRef(adminProfile)
  const profileSyncInFlightRef = useRef(null)
  const profileSyncActiveRef = useRef(false)
  const profileInitialSyncStartedRef = useRef(false)
  const profileSessionUnavailableHandledRef = useRef(false)
  const entryConfig = useMemo(() => getEntryConfig(), [])
  const mobileRoleEntryAvailable =
    Boolean(activeRole) && isMobileRoleEntryEnabled(activeRoleKey, entryConfig)
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
  const canReturnToEntries = hasDesktopEntryAccess(adminProfile, entryConfig)
  const authRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'auth',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )
  const adminRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'admin',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

  const loadProfile = useCallback(
    ({ showLoading = false } = {}) => {
      if (profileSyncInFlightRef.current) {
        return profileSyncInFlightRef.current
      }

      const isCurrentSync = () => profileSyncActiveRef.current
      const loadCurrentSyncRead = (load, retryDelaysMs) =>
        loadProfileSyncReadWithRetry(
          () => {
            if (!isCurrentSync()) {
              throw Object.assign(new Error('Profile sync inactive'), {
                isAbortError: true,
              })
            }
            return load()
          },
          { retryDelaysMs }
        )
      const syncPromise = (async () => {
        if (showLoading) {
          setProfileSyncCompleted(false)
        }
        setProfileSyncing(true)

        try {
          const bootstrapRetryDelays = showLoading
            ? PROFILE_BOOTSTRAP_RETRY_DELAYS_MS
            : []
          const result = await loadCurrentSyncRead(
            () => adminRpc.call('me', {}),
            bootstrapRetryDelays
          )
          if (!isCurrentSync()) return

          let nextProfile = result?.data || null
          if (!nextProfile) {
            throw new Error('Admin profile missing')
          }

          let nextSyncIssue = false
          const customerKey = resolveEffectiveSessionCustomerKey(activeBrand)
          if (!customerKey) {
            nextProfile =
              attachUnavailableEffectiveSessionToAdminProfile(nextProfile)
          } else {
            try {
              const effectiveSession = await loadCurrentSyncRead(
                () => getEffectiveSession({ customer_key: customerKey }),
                bootstrapRetryDelays
              )
              if (!isCurrentSync()) return
              nextProfile = attachEffectiveSessionToAdminProfile(
                nextProfile,
                effectiveSession
              )
            } catch (sessionError) {
              if (!isCurrentSync()) return
              if (
                getAdminProfileSyncErrorAction(sessionError, {
                  hasCachedProfile: Boolean(adminProfileRef.current),
                }) === 'reauth'
              ) {
                throw sessionError
              }
              console.warn(
                '手机待办工作范围刷新失败，保留上次有效范围',
                sessionError
              )
              nextSyncIssue = true
              const cachedSession =
                adminProfileRef.current?.effective_session || null
              nextProfile =
                isTransientProfileSyncError(sessionError) &&
                canMountCustomerRuntime(adminProfileRef.current)
                  ? attachEffectiveSessionToAdminProfile(
                      nextProfile,
                      cachedSession
                    )
                  : attachUnavailableEffectiveSessionToAdminProfile(nextProfile)
            }
          }

          if (!isCurrentSync()) return
          if (!isCurrentStoredAdmin(nextProfile)) {
            const currentStoredProfile = getStoredAdminProfile()
            const unavailableProfile = currentStoredProfile
              ? attachUnavailableEffectiveSessionToAdminProfile(
                  currentStoredProfile
                )
              : null
            adminProfileRef.current = unavailableProfile
            setAdminProfile(unavailableProfile)
            setProfileSyncIssue(true)
            return
          }
          persistMobileAdminProfile(nextProfile)
          adminProfileRef.current = nextProfile
          setAdminProfile(nextProfile)
          setProfileSyncIssue(nextSyncIssue)
          profileSessionUnavailableHandledRef.current = false
        } catch (error) {
          if (!isCurrentSync()) return
          const syncErrorAction = getAdminProfileSyncErrorAction(error, {
            hasCachedProfile: Boolean(adminProfileRef.current),
          })
          if (syncErrorAction === 'reauth') {
            if (profileSessionUnavailableHandledRef.current) return
            profileSessionUnavailableHandledRef.current = true
            logout(AUTH_SCOPE.ADMIN)
            adminProfileRef.current = null
            setAdminProfile(null)
            authBus.emitUnauthorized?.({
              from: {
                pathname: window.location.pathname,
                search: window.location.search,
                hash: window.location.hash,
              },
              message: getActionErrorMessage(error, '确认账号权限'),
              loginPath: getLoginPath(AUTH_SCOPE.ADMIN),
            })
            return
          }

          console.warn('手机待办账号权限刷新失败，保留上次有效信息', error)
          setProfileSyncIssue(true)
          const cachedProfile = adminProfileRef.current
          if (
            !cachedProfile ||
            !isTransientProfileSyncError(error) ||
            !canMountCustomerRuntime(cachedProfile)
          ) {
            const fallbackProfile = cachedProfile || getStoredAdminProfile()
            const unavailableProfile = fallbackProfile
              ? attachUnavailableEffectiveSessionToAdminProfile(fallbackProfile)
              : null
            adminProfileRef.current = unavailableProfile
            setAdminProfile(unavailableProfile)
          }
        } finally {
          if (isCurrentSync()) {
            setProfileSyncCompleted(true)
            setProfileSyncing(false)
          }
          if (profileSyncInFlightRef.current === syncPromise) {
            profileSyncInFlightRef.current = null
          }
        }
      })()

      profileSyncInFlightRef.current = syncPromise
      return syncPromise
    },
    [activeBrand, adminRpc]
  )

  useEffect(() => {
    profileSyncActiveRef.current = true
    if (!profileInitialSyncStartedRef.current) {
      profileInitialSyncStartedRef.current = true
      loadProfile({ showLoading: true })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadProfile()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    const profileSyncTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadProfile()
      }
    }, PROFILE_SYNC_INTERVAL_MS)

    return () => {
      profileSyncActiveRef.current = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(profileSyncTimer)
    }
  }, [loadProfile])

  useEffect(() => {
    adminProfileRef.current = adminProfile
  }, [adminProfile])

  useEffect(() => {
    if (!profileSyncCompleted || shouldBlockMissingCustomerRuntime) {
      return
    }
    if (canUseCurrentMobileRole) return
    if (!mobileRoleEntryAvailable) {
      navigate('/entry', { replace: true })
      return
    }
    navigate('/entry?reason=mobile-role-unavailable', {
      replace: true,
    })
  }, [
    activeRoleKey,
    canUseCurrentMobileRole,
    mobileRoleEntryAvailable,
    navigate,
    profileSyncCompleted,
    shouldBlockMissingCustomerRuntime,
  ])

  const handleBackToEntries = () => {
    navigate('/entry?reason=mobile-runtime-unavailable', { replace: true })
  }

  const handleRetry = () =>
    loadProfile({ showLoading: !canMountCustomerRuntime(adminProfile) })

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
      <div
        className={`mobile-app-layout mx-auto min-h-screen w-full max-w-[430px] md:max-w-[920px] ${
          profileSyncIssue && canUseCurrentMobileRole
            ? 'mobile-app-layout--sync-issue'
            : ''
        }`}
      >
        {!profileSyncCompleted ? (
          <Loading
            title="正在准备手机待办"
            description="正在确认您的岗位权限和工作范围，请稍候..."
            className="loading-page--erp"
          />
        ) : shouldBlockMissingCustomerRuntime ? (
          <MobileCustomerRuntimeBoundary
            canReturnToEntries={canReturnToEntries}
            handleBackToEntries={handleBackToEntries}
            handleLogout={handleLogout}
            handleRetry={handleRetry}
            loggingOut={loggingOut}
            profileSyncing={profileSyncing}
          />
        ) : canUseCurrentMobileRole ? (
          <>
            {profileSyncIssue ? (
              <div
                className="mobile-role-sync-banner mx-3 mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                role="status"
              >
                <span>连接暂未刷新，当前显示上次已确认的工作范围。</span>
                <button
                  type="button"
                  className="min-h-11 shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold disabled:cursor-wait disabled:opacity-60"
                  onClick={handleRetry}
                  disabled={profileSyncing}
                >
                  {profileSyncing ? '连接中' : '重试'}
                </button>
              </div>
            ) : null}
            <Outlet context={{ adminProfile, handleLogout, loggingOut }} />
          </>
        ) : null}
      </div>
    </AppShell>
  )
}
