import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Form, Input, Space } from 'antd'
import {
  DesktopOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  MobileOutlined,
} from '@ant-design/icons'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import {
  AUTH_SCOPE,
  getStoredAdminProfile,
  logout,
  persistAuth,
} from '@/common/auth/auth'
import { useAuthCapabilities } from '@/common/auth/useAuthCapabilities'
import { getActiveERPBrand } from '@/common/consts/brand'
import { applyERPFavicon } from '@/common/consts/favicon.mjs'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import ERPThemeToggle from '@/common/components/theme/ERPThemeToggle'
import {
  ENTRY_TARGET,
  getEntryConfig,
  getLastEntryTarget,
  isDesktopEntryEnabled,
  isMobileTasksEntryEnabled,
  parseMobileRoleFromPath,
  rememberEntryChoice,
  resolveDefaultEntryTarget,
} from '@/erp/config/entryConfig.mjs'
import { useERPWorkspace } from '@/erp/context/ERPWorkspaceProvider'
import {
  normalizeMainlandMobilePhone,
  optionalMainlandMobilePhoneRule,
} from '@/erp/utils/contactValidation.mjs'
import { resolveAdminPostLoginPath } from './adminLoginRouting.mjs'
import {
  LOGIN_MODE,
  clearSMSLoginSession,
  readLoginModePreference,
  readSMSLoginSession,
  rememberLoginModePreference,
  rememberSMSLoginSession,
} from './adminLoginState.mjs'

function buildLocationPath(locationLike, fallback = '') {
  if (!locationLike) {
    return fallback
  }
  return `${locationLike.pathname || fallback}${locationLike.search || ''}${
    locationLike.hash || ''
  }`
}

function pickSupportedEntryTarget(defaultTarget, supportedTargets) {
  if (
    defaultTarget === ENTRY_TARGET.DESKTOP &&
    supportedTargets.desktop === true
  ) {
    return defaultTarget
  }
  if (
    defaultTarget === ENTRY_TARGET.MOBILE_TASKS &&
    supportedTargets.mobileTasks === true
  ) {
    return defaultTarget
  }
  if (
    supportedTargets.desktop === true &&
    supportedTargets.mobileTasks !== true
  ) {
    return ENTRY_TARGET.DESKTOP
  }
  if (
    supportedTargets.mobileTasks === true &&
    supportedTargets.desktop !== true
  ) {
    return ENTRY_TARGET.MOBILE_TASKS
  }
  return ''
}

export default function AdminLoginPage({ defaultRedirect = '/erp/dashboard' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [form] = Form.useForm()
  const { isDesktopApp } = useERPWorkspace()
  const entryConfig = useMemo(() => getEntryConfig(), [])
  const activeBrand = useMemo(() => getActiveERPBrand(), [])
  const initialSMSLoginSession = useMemo(() => readSMSLoginSession(), [])
  const canSelectDesktopEntry =
    isDesktopApp && isDesktopEntryEnabled(entryConfig)
  const canSelectMobileEntry =
    isDesktopApp && isMobileTasksEntryEnabled(entryConfig)
  const admin = getStoredAdminProfile()
  const fromPathname = location.state?.from?.pathname || ''
  const fromMobileRoleKey = parseMobileRoleFromPath(fromPathname)
  const fixedMobileRoleKey = fromMobileRoleKey
  const shouldPreferRememberedEntry =
    !fromMobileRoleKey && !String(fromPathname || '').startsWith('/erp')
  const rememberedEntryTarget = shouldPreferRememberedEntry
    ? getLastEntryTarget()
    : ''
  const defaultEntryTarget = resolveDefaultEntryTarget({
    pathname: fromPathname,
    config: entryConfig,
  })
  const initialEntryTarget = pickSupportedEntryTarget(
    rememberedEntryTarget || defaultEntryTarget,
    {
      desktop: canSelectDesktopEntry,
      mobileTasks: canSelectMobileEntry,
    }
  )
  const [loginMode, setLoginMode] = useState(() => readLoginModePreference())
  const [entryTarget, setEntryTarget] = useState(initialEntryTarget)
  const [smsPhone, setSmsPhone] = useState(initialSMSLoginSession.phone)
  const [smsHint, setSmsHint] = useState(initialSMSLoginSession.hint)
  const [requestingCode, setRequestingCode] = useState(false)
  const [smsCooldownUntil, setSmsCooldownUntil] = useState(
    initialSMSLoginSession.cooldownUntil
  )
  const [smsNow, setSmsNow] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const pendingRequest = useRef(false)
  const mounted = useRef(true)
  const busy = submitting || requestingCode

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const authRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'auth',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
        withAuth: false,
      }),
    []
  )
  const authCapabilities = useAuthCapabilities(authRpc)
  const { authCapabilitiesLoaded, smsLoginEnabled, smsLoginMockDelivery } =
    authCapabilities

  const smsCooldownSeconds = Math.max(
    0,
    Math.ceil((smsCooldownUntil - smsNow) / 1000)
  )
  const canRequestSMSCode =
    smsLoginEnabled &&
    smsPhone.trim().length > 0 &&
    !submitting &&
    !requestingCode &&
    smsCooldownSeconds === 0

  const redirectTo = buildLocationPath(location.state?.from, '')
  let mobileRoleForRequest = ''
  if (entryTarget === ENTRY_TARGET.MOBILE_TASKS && fixedMobileRoleKey) {
    mobileRoleForRequest = fixedMobileRoleKey
  }
  const entryOptions = [
    canSelectDesktopEntry
      ? {
          label: '电脑版',
          icon: <DesktopOutlined aria-hidden="true" />,
          value: ENTRY_TARGET.DESKTOP,
        }
      : null,
    canSelectMobileEntry
      ? {
          label: '手机版',
          icon: <MobileOutlined aria-hidden="true" />,
          value: ENTRY_TARGET.MOBILE_TASKS,
        }
      : null,
  ].filter(Boolean)
  const loginModeOptions = [
    { label: '密码登录', value: LOGIN_MODE.PASSWORD },
    smsLoginEnabled || (!authCapabilitiesLoaded && loginMode === LOGIN_MODE.SMS)
      ? { label: '短信登录', value: LOGIN_MODE.SMS }
      : null,
  ].filter(Boolean)
  const activeLoginMode =
    loginMode === LOGIN_MODE.SMS && (smsLoginEnabled || !authCapabilitiesLoaded)
      ? LOGIN_MODE.SMS
      : LOGIN_MODE.PASSWORD

  useEffect(() => {
    applyERPFavicon(document, '/admin-login', {
      customerFaviconHref: activeBrand.faviconHref,
      customerMobileFaviconHref: activeBrand.mobileFaviconHref,
      isMobileExperience: entryTarget === ENTRY_TARGET.MOBILE_TASKS,
    })
  }, [activeBrand.faviconHref, activeBrand.mobileFaviconHref, entryTarget])

  useEffect(() => {
    if (!smsCooldownUntil) return undefined

    const tick = () => {
      const nextNow = Date.now()
      setSmsNow(nextNow)
      if (nextNow >= smsCooldownUntil) {
        setSmsCooldownUntil(0)
        clearSMSLoginSession()
      }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [smsCooldownUntil])

  useEffect(() => {
    if (
      authCapabilitiesLoaded &&
      !smsLoginEnabled &&
      loginMode === LOGIN_MODE.SMS
    ) {
      setLoginMode(LOGIN_MODE.PASSWORD)
      rememberLoginModePreference(LOGIN_MODE.PASSWORD)
      setSmsHint('')
      setError('')
    }
  }, [authCapabilitiesLoaded, loginMode, smsLoginEnabled])

  useEffect(() => {
    if (
      authCapabilitiesLoaded &&
      smsLoginEnabled &&
      !smsLoginMockDelivery &&
      smsHint.includes('临时验证码')
    ) {
      setSmsCooldownUntil(0)
      setSmsHint('')
      clearSMSLoginSession()
    }
  }, [authCapabilitiesLoaded, smsHint, smsLoginEnabled, smsLoginMockDelivery])

  const resolvePostLoginPath = (adminProfile, { shouldRemember = true } = {}) =>
    resolveAdminPostLoginPath({
      adminProfile,
      entryTarget,
      entryConfig,
      redirectTo,
      defaultRedirect,
      fromMobileRoleKey,
      fixedMobileRoleKey,
      shouldRemember,
      rememberChoice: rememberEntryChoice,
    })

  if (admin) {
    const loggedInRedirect = resolvePostLoginPath(admin, {
      shouldRemember: false,
    })
    if (loggedInRedirect) {
      return <Navigate to={loggedInRedirect} replace />
    }
  }

  const requestSMSCode = async () => {
    if (!canRequestSMSCode || pendingRequest.current || !entryTarget) return
    const requestLocation = window.location.href
    const isCurrentRequest = () =>
      mounted.current && window.location.href === requestLocation
    pendingRequest.current = true
    try {
      await form.validateFields(['phone'])
    } catch {
      pendingRequest.current = false
      return
    }
    if (!isCurrentRequest()) {
      pendingRequest.current = false
      return
    }

    setError('')
    setSmsHint('')
    setRequestingCode(true)

    try {
      const result = await authRpc.call('send_sms_code', {
        phone: normalizeMainlandMobilePhone(form.getFieldValue('phone')),
        scope: 'admin',
        mobile_role_key: mobileRoleForRequest,
      })
      if (!isCurrentRequest()) return
      const data = result?.data || {}
      const resendAfter = Number(data.resend_after || 0)
      let cooldownUntil = 0
      if (resendAfter > 0) {
        cooldownUntil = resendAfter * 1000
        setSmsCooldownUntil(cooldownUntil)
      }
      const nextHint =
        data.mock_delivery && data.mock_code
          ? `本次登录验证码：${data.mock_code}`
          : '验证码已发送，请查看手机短信'
      setSmsHint(nextHint)
      form.setFieldValue('code', '')
      if (data.mock_delivery && data.mock_code) {
        rememberSMSLoginSession({
          phone: smsPhone.trim(),
          cooldownUntil,
          hint: nextHint,
          mockDelivery: true,
        })
      } else if (cooldownUntil > Date.now()) {
        rememberSMSLoginSession({
          phone: smsPhone.trim(),
          cooldownUntil,
          hint: nextHint,
          mockDelivery: false,
        })
      }
    } catch (err) {
      if (isCurrentRequest()) setError(getActionErrorMessage(err, '获取验证码'))
    } finally {
      pendingRequest.current = false
      if (mounted.current) setRequestingCode(false)
    }
  }

  const onFinish = async (values) => {
    if (pendingRequest.current) return
    if (entryOptions.length === 0) return
    if (!entryTarget && entryOptions.length > 1) {
      setError('请选择工作方式。')
      return
    }
    if (activeLoginMode === LOGIN_MODE.SMS && !smsLoginEnabled) {
      setError('短信登录暂未开通，请使用密码登录。')
      return
    }

    // A lazy destination may keep this component mounted after the URL changes.
    const requestLocation = window.location.href
    const isCurrentRequest = () =>
      mounted.current && window.location.href === requestLocation
    pendingRequest.current = true
    setSubmitting(true)
    setError('')

    try {
      const result =
        activeLoginMode === LOGIN_MODE.PASSWORD
          ? await authRpc.call('admin_login', {
              username: values.username.trim(),
              password: values.password,
            })
          : await authRpc.call('sms_login', {
              phone: normalizeMainlandMobilePhone(values.phone),
              code: values.code.trim(),
              scope: 'admin',
              mobile_role_key: mobileRoleForRequest,
            })

      if (!isCurrentRequest()) return
      persistAuth(result?.data, AUTH_SCOPE.ADMIN)
      const nextPath = resolvePostLoginPath(result?.data)
      if (!nextPath) {
        logout(AUTH_SCOPE.ADMIN)
        setError('当前账号不能使用所选工作方式，请联系系统管理员。')
        return
      }
      navigate(nextPath, { replace: true })
    } catch (err) {
      if (isCurrentRequest()) setError(getActionErrorMessage(err, '登录'))
    } finally {
      pendingRequest.current = false
      if (mounted.current) setSubmitting(false)
    }
  }

  const changeLoginMode = (value) => {
    if (pendingRequest.current || value === activeLoginMode) return
    setLoginMode(value)
    rememberLoginModePreference(value)
    setPasswordVisible(false)
    setCapsLock(false)
    setError('')
    setSmsHint('')
    form.resetFields(['password', 'code'])
  }

  return (
    <main className="erp-login-page" aria-label="登录">
      <div className="erp-login-page__bg" aria-hidden="true" />
      <Card variant="borderless" className="erp-login-card">
        <header className="erp-login-brand-row">
          <div className="erp-login-logo">
            <span
              className="erp-admin-brand__logo-mark erp-login-logo__mark"
              aria-hidden="true"
            >
              {activeBrand.brandMark}
            </span>
            <h1 className="erp-login-logo__title">{activeBrand.companyName}</h1>
          </div>
          <ERPThemeToggle
            className="erp-login-card__theme-toggle"
            showDensity={false}
          />
        </header>
        <Form
          form={form}
          initialValues={{ phone: initialSMSLoginSession.phone }}
          layout="vertical"
          requiredMark={false}
          disabled={busy || entryOptions.length === 0}
          aria-busy={busy}
          onValuesChange={() => setError('')}
          onFinish={onFinish}
        >
          {entryOptions.length > 1 ? (
            <Segmented
              aria-label="工作方式"
              block
              className="erp-login-segmented"
              value={entryTarget}
              disabled={busy}
              onChange={(value) => {
                if (pendingRequest.current) return
                setEntryTarget(value)
                rememberEntryChoice(value)
                setError('')
              }}
              options={entryOptions}
            />
          ) : null}
          {loginModeOptions.length > 1 ? (
            <SlidingTabList className="erp-login-methods" aria-label="登录方式">
              {loginModeOptions.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`login-tab-${value}`}
                  aria-controls="login-fields"
                  aria-selected={activeLoginMode === value}
                  disabled={busy}
                  onClick={() => changeLoginMode(value)}
                >
                  {label}
                </button>
              ))}
            </SlidingTabList>
          ) : null}
          <div
            className="erp-login-fields"
            id="login-fields"
            role={loginModeOptions.length > 1 ? 'tabpanel' : 'group'}
            aria-labelledby={
              loginModeOptions.length > 1
                ? `login-tab-${activeLoginMode}`
                : undefined
            }
            aria-label={loginModeOptions.length > 1 ? undefined : '密码登录'}
          >
            {activeLoginMode === LOGIN_MODE.PASSWORD ? (
              <>
                <Form.Item
                  label="账号"
                  name="username"
                  rules={[
                    { required: true, whitespace: true, message: '请输入账号' },
                  ]}
                >
                  <Input
                    placeholder="请输入账号"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    size="large"
                  />
                </Form.Item>
                <Form.Item
                  label="密码"
                  name="password"
                  rules={[{ required: true, message: '请输入密码' }]}
                >
                  <Input
                    type={passwordVisible ? 'text' : 'password'}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    size="large"
                    onKeyDown={(event) =>
                      setCapsLock(event.getModifierState('CapsLock'))
                    }
                    onKeyUp={(event) =>
                      setCapsLock(event.getModifierState('CapsLock'))
                    }
                    onBlur={() => setCapsLock(false)}
                    suffix={
                      <button
                        className="erp-login-password-toggle"
                        type="button"
                        aria-label={passwordVisible ? '隐藏密码' : '显示密码'}
                        aria-pressed={passwordVisible}
                        disabled={busy || entryOptions.length === 0}
                        onClick={() => setPasswordVisible((value) => !value)}
                      >
                        {passwordVisible ? (
                          <EyeOutlined />
                        ) : (
                          <EyeInvisibleOutlined />
                        )}
                      </button>
                    }
                  />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item
                  label="手机号"
                  name="phone"
                  rules={[
                    { required: true, message: '请输入手机号' },
                    optionalMainlandMobilePhoneRule(),
                  ]}
                >
                  <Input
                    placeholder="请输入手机号"
                    autoComplete="tel"
                    inputMode="tel"
                    size="large"
                    onChange={(event) => {
                      const nextPhone = event.target.value
                      setSmsPhone(nextPhone)
                      setSmsHint('')
                      form.setFieldValue('code', '')
                      if (smsCooldownUntil > Date.now()) {
                        rememberSMSLoginSession({
                          phone: nextPhone,
                          cooldownUntil: smsCooldownUntil,
                          hint: '',
                          mockDelivery: smsLoginMockDelivery,
                        })
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item label="验证码" htmlFor="login-code" required>
                  <Space.Compact className="erp-login-sms-code-compact">
                    <Form.Item
                      name="code"
                      noStyle
                      rules={[{ required: true, message: '请输入验证码' }]}
                    >
                      <Input
                        id="login-code"
                        placeholder="请输入验证码"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        size="large"
                      />
                    </Form.Item>
                    <Button
                      htmlType="button"
                      size="large"
                      loading={requestingCode}
                      disabled={!canRequestSMSCode || !entryTarget}
                      onClick={requestSMSCode}
                    >
                      {smsCooldownSeconds > 0
                        ? `${smsCooldownSeconds}s`
                        : '获取验证码'}
                    </Button>
                  </Space.Compact>
                </Form.Item>
              </>
            )}
          </div>
          <div
            className="erp-login-feedback"
            aria-live="polite"
            aria-atomic="true"
          >
            {error ? <Alert type="error" showIcon message={error} /> : null}
            {entryOptions.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                message="暂时无法登录，请联系系统管理员"
              />
            ) : null}
            {capsLock && activeLoginMode === LOGIN_MODE.PASSWORD && !error ? (
              <p>大写锁定已开启</p>
            ) : null}
            {smsHint && activeLoginMode === LOGIN_MODE.SMS && !error ? (
              <Alert
                className="erp-login-sms-hint"
                type="info"
                showIcon
                message={smsHint}
              />
            ) : null}
          </div>
          <Button
            className="erp-login-submit"
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={submitting}
            disabled={busy || entryOptions.length === 0}
          >
            {submitting ? '正在登录…' : '登录'}
          </Button>
        </Form>
        <nav className="erp-login-legal-links" aria-label="隐私与使用规则">
          <Link to="/legal/privacy">个人信息处理规则</Link>
          <span aria-hidden="true">·</span>
          <Link to="/legal/system-rules">系统使用规则</Link>
        </nav>
      </Card>
    </main>
  )
}
