import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Space, Typography } from 'antd'
import { DesktopOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AUTH_SCOPE, getStoredAdminProfile, logout } from '@/common/auth/auth'
import { getActiveERPBrand } from '@/common/consts/brand'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  ENTRY_TARGET,
  getEnabledMobileRoleKeys,
  getEntryConfig,
  hasDesktopEntryAccess,
  rememberEntryChoice,
  resolveMobileTasksPath,
} from '../config/entryConfig.mjs'
import { getAllowedMobileRoleKeys } from '../utils/mobileRolePermissions.mjs'

const { Title } = Typography

export default function EntrySelectionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loggingOut, setLoggingOut] = useState(false)
  const adminProfile = getStoredAdminProfile()
  const entryConfig = useMemo(() => getEntryConfig(), [])
  const activeBrand = useMemo(() => getActiveERPBrand(), [])
  const preferredTarget = searchParams.get('target')
  const entryReason = searchParams.get('reason')

  const desktopVisible =
    entryConfig.desktop === true &&
    hasDesktopEntryAccess(adminProfile, entryConfig)

  const allowedMobileRoleKeys = useMemo(
    () =>
      getAllowedMobileRoleKeys(
        adminProfile,
        getEnabledMobileRoleKeys(entryConfig)
      ),
    [adminProfile, entryConfig]
  )
  const mobileVisible =
    entryConfig.mobileTasks === true && allowedMobileRoleKeys.length > 0
  const defaultMobileRoleKey = allowedMobileRoleKeys[0] || ''
  const hasAnyEntry = desktopVisible || mobileVisible
  const authRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'auth',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

  const enterDesktop = () => {
    rememberEntryChoice(ENTRY_TARGET.DESKTOP)
    navigate('/erp/dashboard', { replace: true })
  }

  const enterMobileRole = (roleKey) => {
    const path = resolveMobileTasksPath(roleKey)
    if (!path) {
      return
    }
    rememberEntryChoice(ENTRY_TARGET.MOBILE_TASKS)
    navigate(path, { replace: true })
  }

  const enterMobileTasks = () => {
    if (defaultMobileRoleKey) {
      enterMobileRole(defaultMobileRoleKey)
    }
  }

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await authRpc.call('logout')
    } catch (error) {
      console.warn('工作入口 logout 失败', error)
    } finally {
      logout(AUTH_SCOPE.ADMIN)
      navigate('/admin-login', { replace: true })
    }
  }

  useEffect(() => {
    if (preferredTarget === ENTRY_TARGET.MOBILE_TASKS && mobileVisible) {
      rememberEntryChoice(ENTRY_TARGET.MOBILE_TASKS)
      navigate(resolveMobileTasksPath(defaultMobileRoleKey), { replace: true })
    }
  }, [defaultMobileRoleKey, mobileVisible, navigate, preferredTarget])

  return (
    <div className="erp-login-page erp-entry-page">
      <div className="erp-login-page__bg" />
      <Card variant="borderless" className="erp-login-card erp-entry-card">
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

          {!hasAnyEntry ? (
            <Alert
              type="warning"
              showIcon
              message="当前账号暂无可用入口"
              description="请联系管理员设置岗位和可用页面。"
            />
          ) : null}

          {entryReason === 'mobile-role-unavailable' ? (
            <Alert
              type="info"
              showIcon
              message="该岗位未向当前账号开放"
              description="登录状态已保留，请从下方选择当前账号可用的工作入口。"
            />
          ) : null}

          {entryReason === 'mobile-role-unassigned' ? (
            <Alert
              type="info"
              showIcon
              message="当前账号未分配业务岗位"
              description="手机待办只向明确分配的业务岗位开放。您可以进入电脑端后台，或联系管理员分配业务岗位。"
            />
          ) : null}

          {entryReason === 'mobile-runtime-unavailable' ? (
            <Alert
              type="info"
              showIcon
              message="手机待办暂时无法连接"
              description="登录状态已保留，您可以选择电脑端或退出后联系管理员。"
            />
          ) : null}

          {desktopVisible ? (
            <Button
              block
              size="large"
              icon={<DesktopOutlined />}
              onClick={enterDesktop}
              className="erp-entry-card__button"
            >
              电脑端
            </Button>
          ) : null}

          {mobileVisible ? (
            <Button
              block
              size="large"
              icon={<UnorderedListOutlined />}
              onClick={enterMobileTasks}
              className="erp-entry-card__button"
            >
              手机待办
            </Button>
          ) : null}

          <Button
            block
            size="large"
            onClick={handleLogout}
            loading={loggingOut}
            disabled={loggingOut}
          >
            退出登录
          </Button>
        </Space>
      </Card>
    </div>
  )
}
