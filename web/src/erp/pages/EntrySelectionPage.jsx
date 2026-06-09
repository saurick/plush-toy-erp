import React, { useEffect, useMemo } from 'react'
import { Alert, Button, Card, Space, Typography } from 'antd'
import { DesktopOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getStoredAdminProfile } from '@/common/auth/auth'
import { getActiveERPBrand } from '@/common/consts/brand'
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
  const adminProfile = getStoredAdminProfile()
  const entryConfig = useMemo(() => getEntryConfig(), [])
  const activeBrand = useMemo(() => getActiveERPBrand(), [])
  const preferredTarget = searchParams.get('target')

  const desktopVisible =
    entryConfig.desktop === true && hasDesktopEntryAccess(adminProfile)

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
            <Alert type="warning" showIcon message="当前账号暂无可用入口权限" />
          ) : null}

          {desktopVisible ? (
            <Button
              block
              size="large"
              icon={<DesktopOutlined />}
              onClick={enterDesktop}
              className="erp-entry-card__button"
            >
              后台管理
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
              岗位任务端
            </Button>
          ) : null}
        </Space>
      </Card>
    </div>
  )
}
