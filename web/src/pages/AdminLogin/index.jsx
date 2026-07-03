import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Segmented,
  Space,
  Typography,
} from 'antd'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  AUTH_SCOPE,
  getStoredAdminProfile,
  logout,
  persistAuth,
} from '@/common/auth/auth'
import { useAuthCapabilities } from '@/common/auth/useAuthCapabilities'
import { getActiveERPBrand } from '@/common/consts/brand'
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
import { optionalMainlandMobilePhoneRule } from '@/erp/utils/contactValidation.mjs'
import { resolveAdminPostLoginPath } from './adminLoginRouting.mjs'
import {
  LOGIN_MODE,
  clearSMSLoginSession,
  readLoginModePreference,
  readSMSLoginSession,
  rememberLoginModePreference,
  rememberSMSLoginSession,
} from './adminLoginState.mjs'

const { Title } = Typography

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
    !requestingCode &&
    smsCooldownSeconds === 0

  const redirectTo = buildLocationPath(location.state?.from, '')
  let mobileRoleForRequest = ''
  if (entryTarget === ENTRY_TARGET.MOBILE_TASKS && fixedMobileRoleKey) {
    mobileRoleForRequest = fixedMobileRoleKey
  }
  const entryOptions = [
    canSelectDesktopEntry
      ? { label: '后台管理', value: ENTRY_TARGET.DESKTOP }
      : null,
    canSelectMobileEntry
      ? { label: '岗位任务端', value: ENTRY_TARGET.MOBILE_TASKS }
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
    if (!canRequestSMSCode) return

    setError('')
    setSmsHint('')
    setRequestingCode(true)

    try {
      const result = await authRpc.call('send_sms_code', {
        phone: smsPhone.trim(),
        scope: 'admin',
        mobile_role_key: mobileRoleForRequest,
      })
      const data = result?.data || {}
      const resendAfter = Number(data.resend_after || 0)
      let cooldownUntil = 0
      if (resendAfter > 0) {
        cooldownUntil = resendAfter * 1000
        setSmsCooldownUntil(cooldownUntil)
      }
      const nextHint =
        data.mock_delivery && data.mock_code
          ? `当前未接入短信运营商，临时验证码：${data.mock_code}`
          : '验证码已发送，请查看手机短信'
      setSmsHint(nextHint)
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
      setError(getActionErrorMessage(err, '获取验证码'))
    } finally {
      setRequestingCode(false)
    }
  }

  const onFinish = async (values) => {
    if (!entryTarget && entryOptions.length > 1) {
      setError('请选择登录入口。')
      return
    }
    if (activeLoginMode === LOGIN_MODE.SMS && !smsLoginEnabled) {
      setError('当前部署未启用短信登录。')
      return
    }

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
              phone: values.phone.trim(),
              code: values.code.trim(),
              scope: 'admin',
              mobile_role_key: mobileRoleForRequest,
            })

      persistAuth(result?.data, AUTH_SCOPE.ADMIN)
      const nextPath = resolvePostLoginPath(result?.data)
      if (!nextPath) {
        logout(AUTH_SCOPE.ADMIN)
        setError('该账号暂无当前入口权限，请联系管理员。')
        return
      }
      navigate(nextPath, { replace: true })
    } catch (err) {
      setError(getActionErrorMessage(err, '登录'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="erp-login-page">
      <div className="erp-login-page__bg" />
      <Card variant="borderless" className="erp-login-card">
        <ERPThemeToggle
          className="erp-login-card__theme-toggle"
          size="large"
          variant="menu"
        />
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="erp-login-logo" aria-label={activeBrand.companyName}>
            <span className="erp-admin-brand__logo-mark erp-login-logo__mark">
              {activeBrand.brandMark}
            </span>
            <div className="erp-login-logo__copy">
              <div className="erp-login-logo__title">
                {activeBrand.companyName}
              </div>
            </div>
          </div>

          <Title level={3} className="erp-login-card__title">
            {activeBrand.systemName}
          </Title>

          {error ? <Alert type="error" showIcon message={error} /> : null}
          {entryOptions.length === 0 ? (
            <Alert type="warning" showIcon message="当前部署未启用登录入口" />
          ) : null}

          <Form
            form={form}
            initialValues={{ phone: initialSMSLoginSession.phone }}
            layout="vertical"
            onFinish={onFinish}
          >
            {entryOptions.length > 1 ? (
              <Form.Item>
                <Segmented
                  aria-label="登录入口"
                  block
                  className={`erp-login-segmented ${
                    entryTarget === ENTRY_TARGET.MOBILE_TASKS
                      ? 'erp-login-segmented--right'
                      : 'erp-login-segmented--left'
                  }`}
                  value={entryTarget}
                  onChange={(value) => {
                    setEntryTarget(value)
                    rememberEntryChoice(value)
                    setError('')
                  }}
                  options={entryOptions}
                />
              </Form.Item>
            ) : null}

            {loginModeOptions.length > 1 ? (
              <Form.Item>
                <Segmented
                  block
                  className={`erp-login-segmented ${
                    activeLoginMode === LOGIN_MODE.SMS
                      ? 'erp-login-segmented--right'
                      : 'erp-login-segmented--left'
                  }`}
                  value={loginMode}
                  onChange={(value) => {
                    setLoginMode(value)
                    rememberLoginModePreference(value)
                    setError('')
                    setSmsHint('')
                  }}
                  options={loginModeOptions}
                />
              </Form.Item>
            ) : null}

            {activeLoginMode === LOGIN_MODE.PASSWORD ? (
              <>
                <Form.Item
                  label="管理员账号"
                  name="username"
                  rules={[{ required: true, message: '请输入管理员账号' }]}
                >
                  <Input
                    placeholder="请输入账号"
                    autoComplete="username"
                    size="large"
                  />
                </Form.Item>
                <Form.Item
                  label="密码"
                  name="password"
                  rules={[{ required: true, message: '请输入密码' }]}
                >
                  <Input.Password
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    size="large"
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
                <Form.Item label="验证码" required>
                  <Space.Compact
                    className="erp-login-sms-code-compact"
                    style={{ width: '100%' }}
                  >
                    <Form.Item
                      name="code"
                      noStyle
                      rules={[{ required: true, message: '请输入验证码' }]}
                    >
                      <Input
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
                      disabled={!canRequestSMSCode}
                      onClick={requestSMSCode}
                    >
                      {smsCooldownSeconds > 0
                        ? `${smsCooldownSeconds}s`
                        : '获取验证码'}
                    </Button>
                  </Space.Compact>
                </Form.Item>
                {smsHint ? (
                  <Alert
                    className="erp-login-sms-hint"
                    type="info"
                    showIcon
                    message={smsHint}
                  />
                ) : null}
              </>
            )}
            <Form.Item style={{ marginBottom: 4 }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={submitting}
              >
                登录
              </Button>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  )
}
