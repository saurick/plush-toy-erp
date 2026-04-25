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
import {
  ERP_ADMIN_SYSTEM_NAME,
  ERP_BRAND_MARK,
  ERP_COMPANY_NAME,
} from '@/common/consts/brand'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { useERPWorkspace } from '@/erp/context/ERPWorkspaceProvider'
import { hasMobileRolePermission } from '@/erp/utils/mobileRolePermissions.mjs'

const { Title } = Typography

export default function AdminLoginPage({ defaultRedirect = '/erp/dashboard' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobileApp, activeRoleKey, activeRole } = useERPWorkspace()
  const admin = getStoredAdminProfile()
  const [loginMode, setLoginMode] = useState('password')
  const [smsPhone, setSmsPhone] = useState('')
  const [smsHint, setSmsHint] = useState('')
  const [requestingCode, setRequestingCode] = useState(false)
  const [smsCooldownUntil, setSmsCooldownUntil] = useState(0)
  const [smsNow, setSmsNow] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const smsCooldownSeconds = Math.max(
    0,
    Math.ceil((smsCooldownUntil - smsNow) / 1000)
  )
  const canRequestSMSCode =
    smsPhone.trim().length > 0 && !requestingCode && smsCooldownSeconds === 0

  const redirectTo =
    (location.state?.from?.pathname || defaultRedirect) +
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

  const canUseCurrentMobileRole =
    !isMobileApp || hasMobileRolePermission(admin, activeRoleKey)

  if (admin && canUseCurrentMobileRole) {
    return <Navigate to={redirectTo} replace />
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
        mobile_role_key: isMobileApp ? activeRoleKey : '',
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
              mobile_role_key: isMobileApp ? activeRoleKey : '',
            })

      persistAuth(result?.data, AUTH_SCOPE.ADMIN)
      if (
        isMobileApp &&
        !hasMobileRolePermission(result?.data, activeRoleKey)
      ) {
        logout(AUTH_SCOPE.ADMIN)
        setError(
          `该账号暂无${activeRole?.label || '当前角色'}移动端登录权限，请联系管理员。`
        )
        return
      }
      navigate(redirectTo, { replace: true })
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
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="erp-login-logo" aria-label={ERP_COMPANY_NAME}>
            <span className="erp-admin-brand__logo-mark erp-login-logo__mark">
              {ERP_BRAND_MARK}
            </span>
            <div className="erp-login-logo__copy">
              <div className="erp-login-logo__title">{ERP_COMPANY_NAME}</div>
            </div>
          </div>

          <Title level={3} className="erp-login-card__title">
            {ERP_ADMIN_SYSTEM_NAME}
          </Title>

          {error ? <Alert type="error" showIcon message={error} /> : null}

          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item>
              <Segmented
                block
                value={loginMode}
                onChange={(value) => {
                  setLoginMode(value)
                  setError('')
                  setSmsHint('')
                }}
                options={[
                  { label: '密码登录', value: 'password' },
                  { label: '短信登录', value: 'sms' },
                ]}
              />
            </Form.Item>

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
