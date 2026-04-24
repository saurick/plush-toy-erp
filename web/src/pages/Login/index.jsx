import React, { useEffect, useMemo, useState } from 'react'
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

  const [loginMode, setLoginMode] = useState('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [requestingCode, setRequestingCode] = useState(false)
  const [smsHint, setSmsHint] = useState('')
  const [smsCooldownUntil, setSmsCooldownUntil] = useState(0)
  const [smsNow, setSmsNow] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const smsCooldownSeconds = Math.max(
    0,
    Math.ceil((smsCooldownUntil - smsNow) / 1000)
  )

  const canSubmit = useMemo(
    () =>
      loginMode === 'password'
        ? username.trim().length > 0 && password.length > 0 && !submitting
        : phone.trim().length > 0 && smsCode.trim().length > 0 && !submitting,
    [loginMode, username, password, phone, smsCode, submitting]
  )

  const canRequestSMSCode =
    phone.trim().length > 0 && !requestingCode && smsCooldownSeconds === 0
  let smsCodeButtonText = '获取验证码'
  if (smsCooldownSeconds > 0) {
    smsCodeButtonText = `${smsCooldownSeconds}s`
  }
  if (requestingCode) {
    smsCodeButtonText = '发送中'
  }

  useEffect(() => {
    if (!smsCooldownUntil) return undefined

    const tick = () => {
      const nextNow = Date.now()
      setSmsNow(nextNow)
      if (nextNow >= smsCooldownUntil) {
        setSmsCooldownUntil(0)
      }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [smsCooldownUntil])

  const requestSMSCode = async () => {
    if (!canRequestSMSCode) return

    setErrMsg('')
    setSmsHint('')
    setRequestingCode(true)

    try {
      const result = await authRpc.call('send_sms_code', {
        phone: phone.trim(),
        scope: 'user',
      })
      const data = result?.data || {}
      const resendAfter = Number(data.resend_after || 0)
      if (resendAfter > 0) {
        setSmsCooldownUntil(resendAfter * 1000)
      }
      if (data.mock_delivery && data.mock_code) {
        const code = String(data.mock_code)
        setSmsCode(code)
        setSmsHint(`当前未接入短信运营商，临时验证码：${code}`)
      } else {
        setSmsHint('验证码已发送，请查看手机短信')
      }
    } catch (err) {
      setErrMsg(getActionErrorMessage(err, '获取验证码'))
    } finally {
      setRequestingCode(false)
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return

    setErrMsg('')
    setSubmitting(true)

    try {
      const result =
        loginMode === 'password'
          ? await authRpc.call('login', {
              username: username.trim(),
              password,
            })
          : await authRpc.call('sms_login', {
              phone: phone.trim(),
              code: smsCode.trim(),
              scope: 'user',
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
            员工登录
          </div>
          <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
            协作账号登录
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            使用已有账号继续访问毛绒 ERP
            的协作入口。当前普通用户链路支持密码和短信验证码登录，后续再逐步挂接移动端动作。
          </div>
        </div>

        <SurfacePanel className="p-4 sm:p-6">
          <form onSubmit={onSubmit} className="p-4 sm:p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
                {[
                  ['password', '密码登录'],
                  ['sms', '短信登录'],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setLoginMode(mode)
                      setErrMsg('')
                    }}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                      loginMode === mode
                        ? 'bg-cyan-300 text-slate-950'
                        : 'text-slate-300 hover:bg-white/[0.06] hover:text-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {loginMode === 'password' ? (
                <>
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
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm text-slate-200/90">
                      手机号
                    </label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel"
                      autoComplete="tel"
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                      placeholder="输入手机号"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm text-slate-200/90">
                      验证码
                    </label>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        value={smsCode}
                        onChange={(e) => setSmsCode(e.target.value)}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                        placeholder="输入验证码"
                      />
                      <button
                        type="button"
                        onClick={requestSMSCode}
                        disabled={!canRequestSMSCode}
                        className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                          canRequestSMSCode
                            ? 'bg-white/[0.09] text-cyan-100 hover:bg-white/[0.14]'
                            : 'cursor-not-allowed bg-white/[0.04] text-slate-500'
                        }`}
                      >
                        {smsCodeButtonText}
                      </button>
                    </div>
                    {smsHint ? (
                      <div className="mt-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                        {smsHint}
                      </div>
                    ) : null}
                  </div>
                </>
              )}

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
                  当前系统不会自动创建普通员工账号。{' '}
                  <Link
                    className="font-medium text-cyan-200 underline underline-offset-4 transition hover:text-cyan-100"
                    to="/register"
                  >
                    先去注册协作账号
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
