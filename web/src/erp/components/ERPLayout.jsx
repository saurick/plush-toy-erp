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
  ReloadOutlined,
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
import {
  ERP_ADMIN_SYSTEM_NAME,
  ERP_BRAND_MARK,
  ERP_COMPANY_NAME,
} from '@/common/consts/brand'
import { Loading } from '@/common/components/loading'
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
import { businessModuleDefinitions } from '../config/businessModules.mjs'

const { Content, Header, Sider } = Layout
const { Paragraph, Text } = Typography

const navIconRegistry = {
  'workspace-home': <AppstoreOutlined />,
  'global-dashboard': <DashboardOutlined />,
  'business-dashboard': <AppstoreOutlined />,
  partners: <ApartmentOutlined />,
  products: <AppstoreOutlined />,
  'project-orders': <ScheduleOutlined />,
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
  'help-role-collaboration-guide': <ApartmentOutlined />,
  'help-role-page-document-matrix': <BarsOutlined />,
  'help-task-document-mapping': <ScheduleOutlined />,
  'help-workflow-status-guide': <DashboardOutlined />,
  'help-workflow-schema-draft': <FileTextOutlined />,
  'help-task-flow-v1': <ScheduleOutlined />,
  'help-role-permission-matrix-v1': <BarsOutlined />,
  'help-notification-alert-v1': <AlertOutlined />,
  'help-finance-v1': <WalletOutlined />,
  'help-warehouse-quality-v1': <InboxOutlined />,
  'help-log-trace-audit-v1': <FileSearchOutlined />,
  'help-desktop-role-guide': <AppstoreOutlined />,
  'help-mobile-role-guide': <MobileOutlined />,
  'help-field-linkage-guide': <TagOutlined />,
  'help-calculation-guide': <CalculatorOutlined />,
  'help-print-snapshot-guide': <PrinterOutlined />,
  'help-exception-handling-guide': <AlertOutlined />,
  'help-current-boundaries': <QuestionCircleOutlined />,
  'qa-acceptance-overview': <DashboardOutlined />,
  'qa-business-chain-debug': <FileSearchOutlined />,
  'qa-workflow-task-debug': <ScheduleOutlined />,
  'qa-field-linkage-coverage': <TagOutlined />,
  'qa-run-records': <ScheduleOutlined />,
  'qa-reports': <FileTextOutlined />,
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
  description: '按协同任务状态看待处理、处理中、阻塞、退回和超时任务。',
}
const BUSINESS_MODULE_PATHS = new Set(
  businessModuleDefinitions.map((moduleItem) => moduleItem.path)
)

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
  const [refreshingCurrentPage, setRefreshingCurrentPage] = useState(false)
  const [pageRefreshHandler, setPageRefreshHandler] = useState(null)

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
            erp_preferences: nextProfile.erp_preferences || {
              column_orders: {},
            },
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
  const isBusinessModulePage =
    BUSINESS_MODULE_PATHS.has(location.pathname) ||
    BUSINESS_MODULE_PATHS.has(currentEntry?.path)
  const hidePageHead =
    isBusinessModulePage ||
    currentEntry?.path === DEFAULT_DESKTOP_ENTRY.path ||
    currentEntry?.path === '/erp/business-dashboard' ||
    location.pathname.startsWith('/erp/docs/') ||
    location.pathname.startsWith('/erp/qa/')

  const registerPageRefresh = useCallback((handler) => {
    if (typeof handler !== 'function') {
      setPageRefreshHandler(null)
      return () => {}
    }

    setPageRefreshHandler(() => handler)
    return () => {
      setPageRefreshHandler((current) => (current === handler ? null : current))
    }
  }, [])

  const updateAdminERPPreferences = useCallback((erpPreferences) => {
    const normalizedERPPreferences =
      erpPreferences && typeof erpPreferences === 'object'
        ? erpPreferences
        : { column_orders: {} }

    setAdminProfile((current) => {
      if (!current) {
        return current
      }
      const nextProfile = {
        ...current,
        erp_preferences: normalizedERPPreferences,
      }
      persistAuthMeta(
        {
          user_id: nextProfile.id,
          username: nextProfile.username,
          admin_level: nextProfile.level,
          menu_permissions: nextProfile.menu_permissions || [],
          erp_preferences: nextProfile.erp_preferences,
        },
        AUTH_SCOPE.ADMIN
      )
      return nextProfile
    })
  }, [])

  const outletContext = useMemo(
    () => ({ adminProfile, registerPageRefresh, updateAdminERPPreferences }),
    [adminProfile, registerPageRefresh, updateAdminERPPreferences]
  )

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

  const handleRefreshCurrentPage = async () => {
    if (refreshingCurrentPage) {
      return
    }

    if (!pageRefreshHandler) {
      window.location.reload()
      return
    }

    setRefreshingCurrentPage(true)
    try {
      const refreshed = await pageRefreshHandler()
      if (refreshed !== false) {
        message.success('当前页面数据已刷新')
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '刷新当前页面数据'))
    } finally {
      setRefreshingCurrentPage(false)
    }
  }

  const sideNav = (
    <div className="erp-admin-sider__body">
      <div className="erp-admin-brand">
        <div className="erp-admin-brand__logo">
          <span className="erp-admin-brand__logo-mark">{ERP_BRAND_MARK}</span>
          <div className="erp-admin-brand__logo-copy">
            <div className="erp-admin-brand__logo-title">
              {ERP_COMPANY_NAME}
            </div>
            <div className="erp-admin-brand__logo-subtitle">
              {ERP_ADMIN_SYSTEM_NAME}
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
      <Loading
        title="管理员权限同步中"
        description="正在确认当前账号的菜单和访问范围，请稍候..."
        fullscreen
        className="loading-page--erp"
      />
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
              <Button
                icon={<ReloadOutlined />}
                loading={refreshingCurrentPage}
                onClick={handleRefreshCurrentPage}
              >
                刷新当前页
              </Button>
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
              <Outlet context={outletContext} />
            )}
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
