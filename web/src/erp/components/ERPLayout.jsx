import React, { useMemo, useState } from 'react'
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import AppShell from '@/common/components/layout/AppShell'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { AUTH_SCOPE, getCurrentUser, logout } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  bootstrapChange,
  mobileDockItems,
  navigationSections,
} from '../config/seedData.mjs'
import '../styles/app.css'

function NavSection({ title, items }) {
  return (
    <div className="space-y-3">
      <div className="px-2 text-xs uppercase tracking-[0.24em] text-slate-400">
        {title}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <NavLink
            key={item.key}
            to={item.path}
            className={({ isActive }) =>
              `erp-nav-link ${isActive ? 'erp-nav-link-active' : ''}`
            }
          >
            <div className="text-sm font-medium text-slate-100">
              {item.label}
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-400">
              {item.description}
            </div>
          </NavLink>
        ))}
      </div>
    </div>
  )
}

function MobileNavStrip() {
  return (
    <div className="erp-mobile-strip lg:hidden">
      {mobileDockItems.map((item) => (
        <NavLink
          key={item.key}
          to={item.path}
          className={({ isActive }) =>
            `erp-mobile-strip-link ${isActive ? 'erp-mobile-strip-link-active' : ''}`
          }
        >
          {item.shortLabel}
        </NavLink>
      ))}
    </div>
  )
}

export default function ERPLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const admin = getCurrentUser(AUTH_SCOPE.ADMIN)
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

  const currentEntry =
    navigationSections
      .flatMap((section) => section.items)
      .find((item) => item.path === location.pathname) || null

  const handleLogout = async () => {
    if (loggingOut) {
      return
    }
    setLoggingOut(true)
    try {
      await authRpc.call('logout')
    } catch (error) {
      console.warn('管理员 logout 失败', error)
    } finally {
      logout(AUTH_SCOPE.ADMIN)
      navigate('/admin-login', { replace: true })
    }
  }

  return (
    <AppShell className="px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto max-w-[1600px]">
        <MobileNavStrip />

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <SurfacePanel className="erp-sidebar-panel p-5">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="inline-flex rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-fuchsia-100">
                    Plush ERP
                  </div>
                  <div>
                    <div className="text-2xl font-semibold tracking-tight text-slate-50">
                      毛绒 ERP 初始化框架
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      参考 trade-erp
                      的信息架构，但按本项目先收口流程、帮助中心、文档与移动端工作台。
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    当前管理员
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-50">
                    {admin?.username || 'admin'}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    当前变更记录：`{bootstrapChange.slug}
                    `。这轮先把结构和口径放稳，再接真实业务资料。
                  </div>
                </div>

                {navigationSections.map((section) => (
                  <NavSection
                    key={section.title}
                    title={section.title}
                    items={section.items}
                  />
                ))}

                <div className="grid gap-2">
                  <Link className="erp-secondary-button" to="/">
                    返回公共首页
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="erp-primary-button"
                  >
                    {loggingOut ? '退出中…' : '退出管理员登录'}
                  </button>
                </div>
              </div>
            </SurfacePanel>
          </aside>

          <main className="min-w-0">
            <SurfacePanel className="p-4 sm:p-5 lg:p-6">
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/[0.03] px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        当前页面
                      </div>
                      <div className="text-xl font-semibold text-slate-50">
                        {currentEntry?.label || '毛绒 ERP 初始化框架'}
                      </div>
                      <div className="text-sm leading-6 text-slate-300">
                        {currentEntry?.description ||
                          '本轮先把项目自己的 ERP 壳层、帮助中心、资料入口和移动端工作台放进仓库。'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className="erp-secondary-button"
                        to="/erp/docs/system-init"
                      >
                        查看初始化说明
                      </Link>
                      <Link
                        className="erp-secondary-button"
                        to="/erp/changes/current"
                      >
                        查看 changes slug
                      </Link>
                    </div>
                  </div>
                </div>

                <Outlet />
              </div>
            </SurfacePanel>
          </main>
        </div>
      </div>
    </AppShell>
  )
}
