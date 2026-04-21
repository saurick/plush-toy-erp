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
                    毛绒玩具 ERP 初始化底座
                  </h1>
                  <p className="text-sm leading-7 text-slate-300 sm:text-base">
                    当前项目已经切到毛绒工厂 ERP
                    的初始化阶段：先把后台主路由、角色工作台、流程总览、帮助中心、移动端页面和资料准备清单放进仓库，再继续接合同、Excel
                    和正式业务实体。
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-sm font-medium text-slate-100">
                    初始化范围
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    已完成后台壳层、帮助中心、文档页、角色工作台与移动端预览。
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-sm font-medium text-slate-100">
                    本轮不做
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    拍照扫码、PDA、正式 Excel 导入、合同打印模板和图片识别。
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-sm font-medium text-slate-100">
                    当前端口
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    前端 `5175`，后端 `8200`，数据库宿主机映射 `5435`，避免与
                    `trade-erp` 冲突。
                  </div>
                </div>
              </div>
            </div>
          </SurfacePanel>

          <div className="grid gap-6">
            <SessionCard
              badge="用户入口"
              title={user ? `已登录：${user.username}` : '员工账号登录 / 注册'}
              description={
                user
                  ? '当前用户已登录，可以继续进入业务首页、个人中心或工作台。'
                  : '普通员工账号当前只保留最小登录链路，便于后续接移动端协作动作。'
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
                      员工登录
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
                  。这轮还没单独开放员工端业务页面，后续会优先挂移动端确认动作。
                </div>
              ) : null}
            </SessionCard>

            <SessionCard
              badge="管理入口"
              title={admin ? `管理员：${admin.username}` : 'ERP 管理台'}
              description={
                admin
                  ? '管理员已登录，可以直接进入毛绒 ERP 初始化工作台。'
                  : '管理员通过独立入口进入 ERP 主路由、流程页、帮助中心和角色工作台。'
              }
              accentClass="border-amber-300/30 bg-amber-300/10 text-amber-100"
              actions={
                admin
                  ? [
                    <Link
                      key="admin-console"
                      to="/erp/dashboard"
                      className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                    >
                      进入 ERP 工作台
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
                  默认管理员账号只用于启动初始化链路。进入真实环境前，请替换正式后台账号、数据库密码与
                  JWT 密钥。
                </div>
              ) : null}
            </SessionCard>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
