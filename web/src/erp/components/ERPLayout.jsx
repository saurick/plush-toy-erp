import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  BarsOutlined,
  BookOutlined,
  CalculatorOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HomeOutlined,
  InboxOutlined,
  MenuOutlined,
  MobileOutlined,
  PrinterOutlined,
  QuestionCircleOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TagOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Breadcrumb,
  Button,
  Drawer,
  Layout,
  Menu,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { isAuthFailureCode } from '@/common/consts/errorCodes'
import {
  AUTH_SCOPE,
  getCurrentUser,
  getStoredAdminProfile,
  logout,
  persistAuthMeta,
} from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  normalizeMenuPermissions,
  resolveMenuPermissionKey,
} from '../config/menuPermissions.mjs'
import {
  getNavigationSections,
  navigationItemRegistry,
} from '../config/seedData.mjs'

const { Content, Header, Sider } = Layout
const { Paragraph, Text } = Typography

const navIconRegistry = {
  'workspace-home': <AppstoreOutlined />,
  'global-dashboard': <DashboardOutlined />,
  partners: <ApartmentOutlined />,
  products: <AppstoreOutlined />,
  'project-orders': <ScheduleOutlined />,
  quotations: <FileTextOutlined />,
  'material-bom': <BarsOutlined />,
  'accessories-purchase': <ShoppingCartOutlined />,
  'processing-contracts': <FileTextOutlined />,
  inbound: <InboxOutlined />,
  inventory: <HomeOutlined />,
  'shipping-release': <ScheduleOutlined />,
  outbound: <FileSearchOutlined />,
  'production-scheduling': <ScheduleOutlined />,
  'production-progress': <DashboardOutlined />,
  'production-exceptions': <AlertOutlined />,
  reconciliation: <WalletOutlined />,
  payables: <WalletOutlined />,
  'flow-overview': <ScheduleOutlined />,
  'source-readiness': <FileSearchOutlined />,
  'mobile-workbenches': <MobileOutlined />,
  'print-center': <PrinterOutlined />,
  'help-operation-flow-overview': <ApartmentOutlined />,
  'help-operation-guide': <BookOutlined />,
  'help-field-linkage-guide': <TagOutlined />,
  'help-calculation-guide': <CalculatorOutlined />,
  'help-center': <QuestionCircleOutlined />,
  'doc-system-init': <BookOutlined />,
  'doc-operation-playbook': <BookOutlined />,
  'doc-field-truth': <TagOutlined />,
  'doc-data-model': <BarsOutlined />,
  'doc-import-mapping': <FileTextOutlined />,
  'doc-mobile-roles': <MobileOutlined />,
  'doc-print-templates': <PrinterOutlined />,
  changes: <FileTextOutlined />,
  'permission-center': <SettingOutlined />,
}

const DEFAULT_DESKTOP_ENTRY = {
  label: '任务看板',
  path: '/erp/dashboard',
  description: '按任务状态看模块推进、资料缺口和桌面单入口边界。',
}

function buildCurrentEntry({ navigationSections, locationPath }) {
  const items = [
    ...navigationSections.flatMap((section) => section.items),
    navigationItemRegistry['help-center'],
  ].filter(Boolean)
  const exactMatch = items.find((item) => item.path === locationPath)
  if (exactMatch) {
    return exactMatch
  }

  const prefixMatch = items.find((item) =>
    locationPath.startsWith(`${item.path}/`)
  )
  if (prefixMatch) {
    return prefixMatch
  }

  return (
    items.find((item) => item.path === DEFAULT_DESKTOP_ENTRY.path) ||
    DEFAULT_DESKTOP_ENTRY
  )
}

export default function ERPLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const tokenAdmin = getCurrentUser(AUTH_SCOPE.ADMIN)
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [profileLoading, setProfileLoading] = useState(!getStoredAdminProfile())
  const [adminProfile, setAdminProfile] = useState(() =>
    getStoredAdminProfile()
  )

  const authRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'auth',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )
  const adminRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'admin',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

  const navigationSections = useMemo(() => getNavigationSections(), [])
  const currentEntry = useMemo(
    () =>
      buildCurrentEntry({
        navigationSections,
        locationPath: location.pathname,
      }),
    [location.pathname, navigationSections]
  )

  const loadProfile = useCallback(async () => {
    setProfileLoading(true)
    try {
      const result = await adminRpc.call('me', {})
      const nextProfile = result?.data || null
      if (nextProfile) {
        persistAuthMeta(
          {
            user_id: nextProfile.id,
            username: nextProfile.username,
            admin_level: nextProfile.level,
            menu_permissions: nextProfile.menu_permissions || [],
          },
          AUTH_SCOPE.ADMIN
        )
      }
      setAdminProfile(nextProfile)
    } catch (error) {
      if (!isAuthFailureCode(error?.code)) {
        message.error(getActionErrorMessage(error, '同步管理员权限'))
      }
    } finally {
      setProfileLoading(false)
    }
  }, [adminRpc])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const isSuperAdmin = adminProfile?.level === 0
  const allowedPermissions = useMemo(
    () => normalizeMenuPermissions(adminProfile?.menu_permissions || []),
    [adminProfile?.menu_permissions]
  )

  const visibleSections = useMemo(() => {
    if (isSuperAdmin) {
      return navigationSections
    }

    return navigationSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          allowedPermissions.includes(item.path)
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [allowedPermissions, isSuperAdmin, navigationSections])

  const currentPermissionKey = useMemo(
    () => resolveMenuPermissionKey(location.pathname),
    [location.pathname]
  )

  useEffect(() => {
    if (profileLoading || isSuperAdmin) {
      return
    }
    if (
      !currentPermissionKey ||
      allowedPermissions.includes(currentPermissionKey)
    ) {
      return
    }
    const fallbackPath = visibleSections[0]?.items[0]?.path || ''
    if (fallbackPath && fallbackPath !== location.pathname) {
      navigate(fallbackPath, { replace: true })
    }
  }, [
    allowedPermissions,
    currentPermissionKey,
    isSuperAdmin,
    location.pathname,
    navigate,
    profileLoading,
    visibleSections,
  ])

  const menuItems = useMemo(
    () =>
      visibleSections.map((section) => ({
        type: 'group',
        key: `group-${section.title}`,
        label: section.title,
        children: section.items.map((item) => ({
          key: item.path,
          icon: navIconRegistry[item.key] || <FileTextOutlined />,
          label: item.label,
        })),
      })),
    [visibleSections]
  )

  const selectedKeys = currentEntry?.path ? [currentEntry.path] : []
  const hidePageHead = currentEntry?.path === DEFAULT_DESKTOP_ENTRY.path

  const handleNavigate = (nextPath) => {
    if (!nextPath || nextPath === location.pathname) {
      setMobileNavOpen(false)
      return
    }
    navigate(nextPath)
    setMobileNavOpen(false)
  }

  const handleLogout = async () => {
    if (loggingOut) {
      return
    }

    setLoggingOut(true)
    try {
      await authRpc.call('logout')
    } catch (error) {
      console.warn('管理员 logout 失败', error)
    } finally {
      logout(AUTH_SCOPE.ADMIN)
      navigate('/admin-login', { replace: true })
    }
  }

  const handleRefreshCurrentPage = () => {
    window.location.reload()
  }

  const sideNav = (
    <div className="erp-admin-sider__body">
      <div className="erp-admin-brand">
        <div className="erp-admin-brand__logo">
          <span className="erp-admin-brand__logo-mark">P</span>
          <div className="erp-admin-brand__logo-copy">
            <div className="erp-admin-brand__logo-title">PLUSH ERP</div>
            <div className="erp-admin-brand__logo-subtitle">
              PLUSH TOY FACTORY CONSOLE
            </div>
          </div>
        </div>
      </div>

      <Menu
        mode="inline"
        selectedKeys={selectedKeys}
        items={menuItems}
        onClick={({ key }) => handleNavigate(String(key || ''))}
        className="erp-admin-menu"
      />
    </div>
  )

  const roleLabel = isSuperAdmin ? '超级管理员' : '普通管理员'
  const displayUsername =
    adminProfile?.username || tokenAdmin?.username || 'admin'
  const noVisibleMenus = !isSuperAdmin && visibleSections.length === 0

  if (profileLoading && !adminProfile) {
    return (
      <Layout className="erp-admin-shell">
        <div className="erp-layout-loading">
          <Space direction="vertical" align="center">
            <Spin size="large" />
            <Text type="secondary">正在同步管理员权限...</Text>
          </Space>
        </div>
      </Layout>
    )
  }

  return (
    <Layout className="erp-admin-shell">
      <Sider width={320} className="erp-admin-sider">
        {sideNav}
      </Sider>

      <Drawer
        placement="left"
        width={320}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        className="erp-admin-drawer"
      >
        {sideNav}
      </Drawer>

      <Layout>
        <Header className="erp-admin-header">
          <div className="erp-admin-header__row">
            <Space align="start" size={16} className="erp-admin-header__left">
              <Button
                icon={<MenuOutlined />}
                className="erp-admin-header__menu-button"
                onClick={() => setMobileNavOpen(true)}
              />
              <div>
                <div className="erp-admin-header__title">毛绒 ERP 管理后台</div>
              </div>
            </Space>

            <Space size={12} wrap className="erp-admin-header__right">
              <Button onClick={handleRefreshCurrentPage}>刷新当前页</Button>
              <div className="erp-admin-header__meta">
                <Tag color={isSuperAdmin ? 'gold' : 'blue'}>{roleLabel}</Tag>
                <Text className="erp-admin-header__user">
                  {displayUsername}
                </Text>
                <Button loading={loggingOut} onClick={handleLogout}>
                  退出
                </Button>
              </div>
            </Space>
          </div>
        </Header>

        <Content className="erp-admin-content">
          <div className="erp-admin-breadcrumb">
            <Breadcrumb
              items={[
                { title: 'ERP' },
                { title: currentEntry?.label || DEFAULT_DESKTOP_ENTRY.label },
              ]}
            />
          </div>

          {!hidePageHead ? (
            <div className="erp-admin-page-head">
              <div className="erp-admin-page-head__main">
                <div className="erp-admin-page-head__title">
                  {currentEntry?.label || DEFAULT_DESKTOP_ENTRY.label}
                </div>
                <Paragraph className="erp-admin-page-head__summary">
                  {currentEntry?.description ||
                    DEFAULT_DESKTOP_ENTRY.description}
                </Paragraph>
              </div>
            </div>
          ) : null}

          <div className="erp-admin-outlet">
            {noVisibleMenus ? (
              <Alert
                type="warning"
                showIcon
                message="当前账号暂无后台菜单权限"
                description="请联系超级管理员在“系统管理 / 权限管理”里为该账号分配菜单入口。"
              />
            ) : (
              <Outlet />
            )}
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
