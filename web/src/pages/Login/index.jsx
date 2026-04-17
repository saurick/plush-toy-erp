import React, { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AppShell from '@/common/components/layout/AppShell'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { AUTH_SCOPE, persistAuth } from '@/common/auth/auth'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const from =
    (location.state?.from?.pathname || '/') +
    (location.state?.from?.search || '') +
    (location.state?.from?.hash || '')

  const authRpc = useMemo(() => new JsonRpc({ url: 'auth' }), [])

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
      const result = await authRpc.call('login', {
        username: username.trim(),
        password,
      })

      persistAuth(result?.data, AUTH_SCOPE.USER)
      navigate(from, { replace: true })
    } catch (err) {
      setErrMsg(getActionErrorMessage(err, '登录'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell className="flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[560px]">
        <div className="mb-4">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-slate-300 transition hover:text-slate-100"
          >
            返回首页
          </Link>
        </div>

        <div className="mb-6 text-center sm:mb-8">
          <div className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
            用户登录
          </div>
          <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
            欢迎登录
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            使用已有账号继续访问当前项目；如果是首次使用，请先注册普通用户账号。
          </div>
        </div>

        <SurfacePanel className="p-4 sm:p-6">
          <form onSubmit={onSubmit} className="p-4 sm:p-6">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-slate-200/90">
                  用户名
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                  placeholder="输入用户名"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-200/90">
                  密码
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                  placeholder="输入密码"
                />
              </div>

              {errMsg ? (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {errMsg}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold tracking-wide transition sm:text-base ${
                  canSubmit
                    ? 'bg-cyan-300 text-slate-950 hover:bg-cyan-200 active:bg-cyan-400'
                    : 'cursor-not-allowed bg-cyan-300/20 text-slate-400'
                }`}
              >
                {submitting ? '登录中…' : '登录'}
              </button>

              <div className="flex items-center justify-between pt-1 text-sm text-slate-300">
                <div>
                  当前系统不会自动创建普通用户账号。{' '}
                  <Link
                    className="font-medium text-cyan-200 underline underline-offset-4 transition hover:text-cyan-100"
                    to="/register"
                  >
                    先去注册
                  </Link>
                </div>
              </div>
            </div>
          </form>
        </SurfacePanel>
      </div>
    </AppShell>
  )
}
