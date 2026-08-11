import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Modal, Space, Typography } from 'antd'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AUTH_SCOPE, getStoredAdminProfile, logout } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  acknowledgeLegalNotice,
  getLegalNoticeStatus,
} from './legalNoticeApi.mjs'
import {
  getLegalNoticeBundle,
  getLegalNoticeIdentity,
} from './legalNoticeConfig.mjs'
import './legal.css'

const acknowledgedInSession = new Set()

export default function LegalNoticeGate({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const bundle = useMemo(() => getLegalNoticeBundle(), [])
  const identity = useMemo(() => getLegalNoticeIdentity(bundle), [bundle])
  const adminID = String(getStoredAdminProfile()?.id || '')
  const sessionKey = `${adminID}:${identity.noticeVersion}:${identity.contentFingerprint}`
  const [status, setStatus] = useState(() =>
    acknowledgedInSession.has(sessionKey) ? 'acknowledged' : 'loading'
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const authRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'auth',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

  const loadStatus = useCallback(async () => {
    if (acknowledgedInSession.has(sessionKey)) {
      setStatus('acknowledged')
      setError('')
      return
    }
    setStatus('loading')
    setError('')
    try {
      const data = await getLegalNoticeStatus(identity)
      if (data.acknowledged === true) {
        acknowledgedInSession.add(sessionKey)
        setStatus('acknowledged')
      } else {
        setStatus('required')
      }
    } catch (requestError) {
      setStatus('unavailable')
      setError(getActionErrorMessage(requestError, '核对规则知悉状态'))
    }
  }, [identity, sessionKey])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleAcknowledge = async () => {
    setSubmitting(true)
    setError('')
    try {
      const data = await acknowledgeLegalNotice(identity)
      if (data.acknowledged !== true) {
        throw new Error('acknowledgement not confirmed')
      }
      acknowledgedInSession.add(sessionKey)
      setStatus('acknowledged')
    } catch (requestError) {
      setError(getActionErrorMessage(requestError, '保存知悉记录'))
      setStatus('required')
    } finally {
      setSubmitting(false)
    }
  }

  const handleExit = async () => {
    setSubmitting(true)
    try {
      await authRpc.call('logout')
    } catch {
      // Local credential cleanup remains required even when the server is unreachable.
    } finally {
      logout(AUTH_SCOPE.ADMIN)
      navigate('/admin-login', { replace: true })
    }
  }

  const fromPath = `${location.pathname}${location.search}${location.hash}`

  return (
    <>
      {children}
      {status === 'unavailable' ? (
        <Alert
          className="legal-notice-status-banner"
          type="warning"
          showIcon
          message="暂时无法核对规则知悉状态"
          description={error}
          action={
            <Space wrap>
              <Link to="/legal/privacy" state={{ from: fromPath }}>
                查看规则
              </Link>
              <Button size="small" onClick={loadStatus}>
                重新核对
              </Button>
            </Space>
          }
        />
      ) : null}
      <Modal
        className="legal-notice-gate-modal"
        data-testid="legal-notice-gate"
        open={status === 'required'}
        title="请先了解个人信息处理与系统使用规则"
        closable={false}
        keyboard={false}
        maskClosable={false}
        width={620}
        footer={
          <Space wrap>
            <Button onClick={handleExit} disabled={submitting}>
              暂不使用并退出
            </Button>
            <Button
              type="primary"
              onClick={handleAcknowledge}
              loading={submitting}
              data-testid="legal-notice-acknowledge"
            >
              我已阅读并知悉
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph>
          本系统会为身份核验、岗位授权、业务办理和安全审计处理必要信息。这里的“知悉”是告知送达记录，不是把所有处理统一变成个人同意。
        </Typography.Paragraph>
        <ul className="legal-notice-gate-links">
          <li>
            <Link to="/legal/privacy" target="_blank" rel="noreferrer">
              打开《个人信息处理规则》
            </Link>
          </li>
          <li>
            <Link to="/legal/system-rules" target="_blank" rel="noreferrer">
              打开《系统使用规则》
            </Link>
          </li>
        </ul>
        <Typography.Paragraph type="secondary">
          当前版本 {bundle.noticeVersion}，生效日期 {bundle.effectiveDate}
          。规则内容或客户处理配置实质变化后，系统会再次提示。
        </Typography.Paragraph>
        {error ? <Alert type="error" showIcon message={error} /> : null}
      </Modal>
    </>
  )
}
