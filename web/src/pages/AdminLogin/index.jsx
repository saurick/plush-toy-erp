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
  isDesktopEntryEnabled,
  isMobileTasksEntryEnabled,
  parseMobileRoleFromPath,
  rememberEntryChoice,
  resolveDefaultEntryTarget,
} from '@/erp/config/entryConfig.mjs'
import { useERPWorkspace } from '@/erp/context/ERPWorkspaceProvider'
import { resolveAdminPostLoginPath } from './adminLoginRouting.mjs'

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
  const { isDesktopApp, isMobileApp, activeRoleKey } = useERPWorkspace()
  const entryConfig = useMemo(() => getEntryConfig(), [])
  const activeBrand = useMemo(() => getActiveERPBrand(), [])
  const canSelectDesktopEntry =
    isDesktopApp && isDesktopEntryEnabled(entryConfig)
  const canSelectMobileEntry =
    (isDesktopApp || isMobileApp) && isMobileTasksEntryEnabled(entryConfig)
  const admin = getStoredAdminProfile()
  const fromPathname = location.state?.from?.pathname || ''
  const fromMobileRoleKey = parseMobileRoleFromPath(fromPathname)
  const fixedMobileRoleKey = isMobileApp ? activeRoleKey : fromMobileRoleKey
  const defaultEntryTarget = resolveDefaultEntryTarget({
    pathname: fromPathname,
    config: entryConfig,
  })
  const initialEntryTarget = pickSupportedEntryTarget(defaultEntryTarget, {
    desktop: canSelectDesktopEntry,
    mobileTasks: canSelectMobileEntry,
  })
  const [loginMode, setLoginMode] = useState('password')
  const [entryTarget, setEntryTarget] = useState(initialEntryTarget)
  const [smsPhone, setSmsPhone] = useState('')
  const [smsHint, setSmsHint] = useState('')
  const [requestingCode, setRequestingCode] = useState(false)
  const [smsCooldownUntil, setSmsCooldownUntil] = useState(0)
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
  const { smsLoginEnabled } = authCapabilities

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
  } else if (isMobileApp) {
    mobileRoleForRequest = activeRoleKey
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
    { label: '密码登录', value: 'password' },
    smsLoginEnabled ? { label: '短信登录', value: 'sms' } : null,
  ].filter(Boolean)

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

  useEffect(() => {
    if (!smsLoginEnabled && loginMode === 'sms') {
      setLoginMode('password')
      setSmsHint('')
      setError('')
    }
  }, [loginMode, smsLoginEnabled])

  const resolvePostLoginPath = (adminProfile, { shouldRemember = true } = {}) =>
    resolveAdminPostLoginPath({
      adminProfile,
      entryTarget,
      entryConfig,
      redirectTo,
      defaultRedirect,
      fromMobileRoleKey,
      fixedMobileRoleKey,
      isMobileApp,
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
      if (resendAfter > 0) {
        setSmsCooldownUntil(resendAfter * 1000)
      }
      if (data.mock_delivery && data.mock_code) {
        setSmsHint(`当前未接入短信运营商，临时验证码：${data.mock_code}`)
      } else {
        setSmsHint('验证码已发送，请查看手机短信')
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
    if (loginMode === 'sms' && !smsLoginEnabled) {
      setError('当前部署未启用短信登录。')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const result =
        loginMode === 'password'
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

          <Form layout="vertical" onFinish={onFinish}>
            {entryOptions.length > 1 ? (
              <Form.Item label="登录入口">
                <Segmented
                  block
                  value={entryTarget}
                  onChange={(value) => {
                    setEntryTarget(value)
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
                  value={loginMode}
                  onChange={(value) => {
                    setLoginMode(value)
                    setError('')
                    setSmsHint('')
                  }}
                  options={loginModeOptions}
                />
              </Form.Item>
            ) : null}

            {loginMode === 'password' ? (
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
                  rules={[{ required: true, message: '请输入手机号' }]}
                >
                  <Input
                    placeholder="请输入手机号"
                    autoComplete="tel"
                    inputMode="tel"
                    size="large"
                    onChange={(event) => {
                      setSmsPhone(event.target.value)
                      setSmsHint('')
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
                  <Alert type="info" showIcon message={smsHint} />
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
