import React, { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AppShell from '@/common/components/layout/AppShell'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { AUTH_SCOPE, persistAuth } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const from =
    (location.state?.from?.pathname || '/admin-menu') +
    (location.state?.from?.search || '') +
    (location.state?.from?.hash || '')

  const authRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'auth',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.length > 0 && !submitting,
    [username, password, submitting]
  )

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return

    setErrMsg('')
    setSubmitting(true)

    try {
      const result = await authRpc.call('admin_login', {
        username: username.trim(),
        password,
      })

      persistAuth(result?.data, AUTH_SCOPE.ADMIN)
      navigate(from, { replace: true })
    } catch (err) {
      setErrMsg(getActionErrorMessage(err, '登录'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell className="flex items-center justify-center px-4 py-6 sm:py-8 md:py-10">
      <div className="w-full max-w-[520px]">
        <div className="mb-4">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-slate-300 transition hover:text-slate-100"
          >
            返回首页
          </Link>
        </div>

        <div className="mb-4 text-center sm:mb-6">
          <div className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-amber-100">
            管理登录
          </div>
          <div className="mt-4 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
            管理控制台登录
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            用于访问后台账号目录和项目说明页。默认管理员可由服务端在启动时自动创建。
          </div>
        </div>

        <SurfacePanel className="p-3 sm:p-4 md:p-6">
          <form onSubmit={onSubmit} className="p-3 sm:p-4 md:p-6">
            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="mb-1 block text-xs text-slate-200/90 sm:text-sm">
                  管理员账号
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-base text-slate-100 outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20 sm:px-4 sm:py-3 sm:text-base"
                  placeholder="输入管理员账号"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-200/90 sm:text-sm">
                  密码
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-base text-slate-100 outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20 sm:px-4 sm:py-3 sm:text-base"
                  placeholder="输入密码"
                />
              </div>

              {errMsg ? (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100 sm:px-4 sm:py-3 sm:text-sm">
                  {errMsg}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className={`w-full rounded-2xl px-4 py-2.5 text-sm font-semibold tracking-wide transition sm:py-3 sm:text-base ${
                  canSubmit
                    ? 'bg-amber-300 text-slate-950 hover:bg-amber-200 active:bg-amber-400'
                    : 'cursor-not-allowed bg-amber-300/20 text-slate-400'
                }`}
              >
                {submitting ? '登录中…' : '登录'}
              </button>
            </div>
          </form>
        </SurfacePanel>
      </div>
    </AppShell>
  )
}
