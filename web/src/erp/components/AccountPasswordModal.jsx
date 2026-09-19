import React, { useEffect, useRef, useState } from 'react'
import { Alert, Form, Input } from 'antd'
import { useNavigate } from 'react-router-dom'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import { AUTH_SCOPE, getLoginPath, getToken, logout } from '@/common/auth/auth'
import { RpcErrorCode } from '@/common/consts/errorCodes'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { adminPasswordPolicyRule } from '../utils/adminPasswordPolicy.mjs'

const accountRpc = new JsonRpc({ url: 'admin', basePath: ADMIN_BASE_PATH })

export default function AccountPasswordModal({ onClose }) {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')
  const savingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const changePassword = async ({ old_password, new_password }) => {
    if (savingRef.current) return
    const requestToken = getToken(AUTH_SCOPE.ADMIN)
    savingRef.current = true
    setSaving(true)
    setFailure('')
    try {
      await accountRpc.call('change_password', { old_password, new_password })
      if (!mountedRef.current || getToken(AUTH_SCOPE.ADMIN) !== requestToken) {
        return
      }
      form.resetFields()
      logout(AUTH_SCOPE.ADMIN)
      message.success('密码已修改，请使用新密码重新登录')
      navigate(getLoginPath(AUTH_SCOPE.ADMIN), { replace: true })
    } catch (error) {
      if (!mountedRef.current || getToken(AUTH_SCOPE.ADMIN) !== requestToken) {
        return
      }
      if (Number(error?.code) === RpcErrorCode.AUTH_INVALID_PASSWORD) {
        form.setFields([{ name: 'old_password', errors: ['旧密码不正确'] }])
      } else {
        setFailure(
          error?.isNetworkError || error?.isInvalidResponse
            ? '未能确认密码是否修改成功，请重新登录确认；若旧密码不可用，请尝试新密码。'
            : getActionErrorMessage(error, '修改密码')
        )
      }
    } finally {
      savingRef.current = false
      if (mountedRef.current) setSaving(false)
    }
  }

  return (
    <BusinessModal
      className="erp-account-password-modal"
      title="修改密码"
      open
      centered
      size="confirm"
      onCancel={() => {
        if (!savingRef.current) onClose()
      }}
      onOk={() => form.submit()}
      okText="修改并重新登录"
      cancelText="取消"
      confirmLoading={saving}
      cancelButtonProps={{ disabled: saving }}
      closable={!saving}
      keyboard={!saving}
      maskClosable={!saving}
    >
      <p>修改后，所有设备上的当前登录都会失效。</p>
      {failure ? <Alert type="error" showIcon message={failure} /> : null}
      <Form
        form={form}
        name="account-password"
        layout="vertical"
        onFinish={changePassword}
        disabled={saving}
      >
        <Form.Item
          label="旧密码"
          name="old_password"
          rules={[{ required: true, message: '请输入旧密码' }]}
        >
          <Input.Password autoComplete="current-password" autoFocus />
        </Form.Item>
        <Form.Item
          label="新密码"
          name="new_password"
          dependencies={['old_password']}
          rules={[
            { required: true, message: '请输入新密码' },
            adminPasswordPolicyRule(),
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                value && value === getFieldValue('old_password')
                  ? Promise.reject(new Error('新密码不能与旧密码相同'))
                  : Promise.resolve(),
            }),
          ]}
        >
          <Input.Password
            autoComplete="new-password"
            placeholder="8 到 20 位"
          />
        </Form.Item>
        <Form.Item
          label="确认新密码"
          name="confirm_password"
          dependencies={['new_password']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                value && value !== getFieldValue('new_password')
                  ? Promise.reject(new Error('两次输入的新密码不一致'))
                  : Promise.resolve(),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </BusinessModal>
  )
}
