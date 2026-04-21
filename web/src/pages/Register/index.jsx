import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '@/common/components/layout/AppShell'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { AUTH_SCOPE, persistAuth } from '@/common/auth/auth'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'

export default function RegisterPage() {
  const navigate = useNavigate()
  const authRpc = useMemo(() => new JsonRpc({ url: 'auth' }), [])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const pwdHint =
    password && password.length < 6
      ? '密码至少 6 位'
      : password && password2 && password !== password2
        ? '两次密码不一致'
        : ''

  const canSubmit = useMemo(() => {
    if (submitting) return false
    if (!username.trim() || !password || !password2) return false
    if (password.length < 6) return false
    if (password !== password2) return false
    return true
  }, [username, password, password2, submitting])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return

    setErrMsg('')
    setSubmitting(true)

    try {
      const result = await authRpc.call('register', {
        username: username.trim(),
        password,
      })

      persistAuth(result?.data, AUTH_SCOPE.USER)
      navigate('/', { replace: true })
    } catch (err) {
      setErrMsg(getActionErrorMessage(err, '注册'))
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
          <div className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-100">
            协作账号
          </div>
          <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
            创建协作账号
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            这里只保留最小注册流程：用户名和密码。注册成功后会自动登录，后续用于员工协作端和移动端动作确认。
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
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
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
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
                  placeholder="至少 6 位"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-200/90">
                  确认密码
                </label>
                <input
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
                  placeholder="再输入一次"
                />
                {pwdHint ? (
                  <div className="mt-1 text-xs text-emerald-100/90">
                    {pwdHint}
                  </div>
                ) : null}
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
                    ? 'bg-emerald-300 text-slate-950 hover:bg-emerald-200 active:bg-emerald-400'
                    : 'cursor-not-allowed bg-emerald-300/20 text-slate-400'
                }`}
              >
                {submitting ? '注册中…' : '注册并登录'}
              </button>

              <div className="pt-1 text-sm text-slate-300">
                已有账号？{' '}
                <Link
                  className="font-medium text-emerald-200 underline underline-offset-4 transition hover:text-emerald-100"
                  to="/login"
                >
                  直接登录协作账号
                </Link>
              </div>
            </div>
          </form>
        </SurfacePanel>
      </div>
    </AppShell>
  )
}
