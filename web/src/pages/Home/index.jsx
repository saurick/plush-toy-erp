import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '@/common/components/layout/AppShell'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { AUTH_SCOPE, getCurrentUser, logout } from '@/common/auth/auth'

function SessionCard({
  badge,
  title,
  description,
  actions,
  accentClass,
  children = null,
}) {
  return (
    <SurfacePanel className="h-full p-5 sm:p-6">
      <div className="space-y-5">
        <div className="space-y-3">
          <div
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] ${accentClass}`}
          >
            {badge}
          </div>
          <div className="space-y-2">
            <div className="text-xl font-semibold text-slate-50">{title}</div>
            <div className="text-sm leading-6 text-slate-300">
              {description}
            </div>
          </div>
          {children}
        </div>
        <div className="flex flex-wrap gap-3">{actions}</div>
      </div>
    </SurfacePanel>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  // 根首页统一感知两类登录态，后续替换成业务首页时仍可复用这套入口判定。
  const user = getCurrentUser(AUTH_SCOPE.USER)
  const admin = getCurrentUser(AUTH_SCOPE.ADMIN)

  const handleLogout = (scope, nextPath) => {
    logout(scope)
    navigate(nextPath, { replace: true })
  }

  return (
    <AppShell className="px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <SurfacePanel className="p-6 sm:p-8 lg:p-10">
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
                  Plush Toy ERP
                </div>
                <div className="max-w-2xl space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl lg:text-5xl">
                    毛绒玩具业务链路，从账号入口开始
                  </h1>
                  <p className="text-sm leading-7 text-slate-300 sm:text-base">
                    当前先保留用户登录、注册和管理入口，方便把基础鉴权、后台账号目录和最小工作流跑通，再继续扩展订单、库存和供应链页面。
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-sm font-medium text-slate-100">
                    用户使用
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    默认不预置账号。首次使用先注册，注册成功后会自动登录。
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-sm font-medium text-slate-100">
                    管理后台
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    管理员使用独立登录入口，便于区分前台与后台流程。
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-sm font-medium text-slate-100">
                    项目调整
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    项目名、首页内容、后台菜单和示例文案都已经收口到当前仓库口径，后续按真实
                    ERP 场景继续细化。
                  </div>
                </div>
              </div>
            </div>
          </SurfacePanel>

          <div className="grid gap-6">
            <SessionCard
              badge="用户入口"
              title={user ? `已登录：${user.username}` : '用户登录 / 注册'}
              description={
                user
                  ? '当前用户已登录，可以继续进入业务首页、个人中心或工作台。'
                  : '普通用户默认没有预置账号，首次使用请先注册；注册成功后会自动登录。'
              }
              accentClass="border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
              actions={
                user
                  ? [
                    <button
                      key="user-logout"
                      type="button"
                      onClick={() => handleLogout(AUTH_SCOPE.USER, '/login')}
                      className="border-white/14 hover:bg-white/8 rounded-full border px-4 py-2 text-sm font-medium text-slate-100 transition"
                    >
                      退出用户登录
                    </button>,
                    ]
                  : [
                    <Link
                      key="user-login"
                      to="/login"
                      className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                    >
                      用户登录
                    </Link>,
                    <Link
                      key="user-register"
                      to="/register"
                      className="border-white/14 hover:bg-white/8 rounded-full border px-4 py-2 text-sm font-medium text-slate-100 transition"
                    >
                      注册账号
                    </Link>,
                    ]
              }
            >
              {user ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                  当前登录用户 ID：{user.id}
                </div>
              ) : null}
            </SessionCard>

            <SessionCard
              badge="管理入口"
              title={admin ? `管理员：${admin.username}` : '管理控制台'}
              description={
                admin
                  ? '管理员已登录，可以继续进入后台控制台。'
                  : '管理员通过独立入口登录，用于访问后台账号目录和后续 ERP 后台模块。'
              }
              accentClass="border-amber-300/30 bg-amber-300/10 text-amber-100"
              actions={
                admin
                  ? [
                    <Link
                      key="admin-console"
                      to="/admin-menu"
                      className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                    >
                      进入管理控制台
                    </Link>,
                    <button
                      key="admin-logout"
                      type="button"
                      onClick={() =>
                          handleLogout(AUTH_SCOPE.ADMIN, '/admin-login')
                        }
                      className="border-white/14 hover:bg-white/8 rounded-full border px-4 py-2 text-sm font-medium text-slate-100 transition"
                    >
                      退出管理员登录
                    </button>,
                    ]
                  : [
                    <Link
                      key="admin-login"
                      to="/admin-login"
                      className="border-white/14 hover:bg-white/8 rounded-full border px-4 py-2 text-sm font-medium text-slate-100 transition"
                    >
                      管理员登录
                    </Link>,
                    ]
              }
            >
              {!admin ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                  默认管理员账号只用于启动基线链路，进入真实环境前请替换为正式后台账号。
                </div>
              ) : null}
            </SessionCard>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
