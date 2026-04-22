import React, { useMemo, useState } from 'react'
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AUTH_SCOPE, getCurrentUser, persistAuth } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'

const { Title } = Typography

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const admin = getCurrentUser(AUTH_SCOPE.ADMIN)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const redirectTo =
    (location.state?.from?.pathname || '/erp/dashboard') +
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

  if (admin) {
    return <Navigate to={redirectTo} replace />
  }

  const onFinish = async (values) => {
    setSubmitting(true)
    setError('')

    try {
      const result = await authRpc.call('admin_login', {
        username: values.username.trim(),
        password: values.password,
      })

      persistAuth(result?.data, AUTH_SCOPE.ADMIN)
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
          <div className="erp-login-logo" aria-label="东莞市永绅玩具有限公司">
            <span className="erp-admin-brand__logo-mark erp-login-logo__mark">
              永
            </span>
            <div className="erp-login-logo__copy">
              <div className="erp-login-logo__title">
                东莞市永绅玩具有限公司
              </div>
            </div>
          </div>

          <Title level={3} className="erp-login-card__title">
            毛绒 ERP 管理后台
          </Title>

          {error ? <Alert type="error" showIcon message={error} /> : null}

          <Form layout="vertical" onFinish={onFinish}>
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
