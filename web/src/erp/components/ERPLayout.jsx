import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  BarsOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HomeOutlined,
  InboxOutlined,
  MenuOutlined,
  PrinterOutlined,
  ReloadOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
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
  getLoginPath,
  getStoredAdminProfile,
  logout,
  persistAuthMeta,
} from '@/common/auth/auth'
import { authBus } from '@/common/auth/authBus'
import { getActiveERPBrand } from '@/common/consts/brand'
import { Loading } from '@/common/components/loading'
import ERPThemeToggle from '@/common/components/theme/ERPThemeToggle'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  getBusinessModule,
  isCustomerBusinessDataPageKey,
} from '../config/businessModules.mjs'
import { resolveMenuPermissionKey } from '../config/menuPermissions.mjs'
import {
  getNavigationSections,
  getProductCoreNavigationSections,
} from '../config/seedData.mjs'
import { getEffectiveSession } from '../api/customerConfigApi.mjs'
import {
  DEFAULT_DESKTOP_ENTRY,
  resolveCurrentNavigationEntry,
} from '../utils/currentNavigationEntry.mjs'
import {
  attachEffectiveSessionToAdminProfile,
  attachUnavailableEffectiveSessionToAdminProfile,
  buildEffectiveSessionDiagnosticSummary,
  filterNavigationSectionsByAdminProfile,
  getAdminProfileSyncErrorAction,
  resolveEffectiveSessionCustomerKey,
  shouldRedirectFromCurrentNavigation,
  shouldGuardCustomerBusinessPageRuntime,
} from '../utils/adminProfileSync.mjs'

const { Content, Header, Sider } = Layout
const { Paragraph, Text } = Typography
const PROFILE_SYNC_INTERVAL_MS = 60 * 1000

const navIconRegistry = {
  'workspace-home': <AppstoreOutlined />,
  'global-dashboard': <DashboardOutlined />,
  'task-board': <ScheduleOutlined />,
  'business-dashboard': <AppstoreOutlined />,
  customers: <ApartmentOutlined />,
  suppliers: <ApartmentOutlined />,
  products: <AppstoreOutlined />,
  materials: <InboxOutlined />,
  'sales-orders': <ScheduleOutlined />,
  'material-bom': <BarsOutlined />,
  'accessories-purchase': <ShoppingCartOutlined />,
  'processing-contracts': <FileTextOutlined />,
  inbound: <InboxOutlined />,
  inventory: <HomeOutlined />,
  'shipping-release': <ScheduleOutlined />,
  outbound: <FileSearchOutlined />,
  shipments: <FileTextOutlined />,
  'production-scheduling': <ScheduleOutlined />,
  'production-progress': <DashboardOutlined />,
  'production-exceptions': <AlertOutlined />,
  reconciliation: <WalletOutlined />,
  payables: <WalletOutlined />,
  'print-center': <PrinterOutlined />,
  'exception-flow': <AlertOutlined />,
  'permission-center': <SettingOutlined />,
  'system-audit-logs': <FileSearchOutlined />,
}

const productCoreReviewFallbackByPageKey = {
  'business-dashboard': {
    title: '业务看板',
    description: '业务看板汇总客户运行态的订单、库存、协同、出货和财务指标。',
    primaryEntity: 'dashboard_stats',
    factSource: 'business.dashboard_stats',
    currentScope: ['看板入口', '菜单权限', '指标分组', '客户运行态读模型边界'],
    boundary:
      'Product Core 只审阅看板能力和指标边界，不在无客户态读取 dashboard_stats。',
  },
  'exception-flow': {
    title: '异常 / 阻塞闭环',
    description: '异常闭环承接客户运行态的阻塞任务、处理动作、原因和后续跟进。',
    primaryEntity: 'workflow_tasks / workflow_task_events',
    factSource: 'workflow runtime',
    currentScope: ['异常入口', '责任角色', '阻塞状态', '处理动作边界'],
    boundary: 'Workflow 任务处理不等于库存、出货、财务或其他 Fact posted。',
  },
}

function ProductCoreCapabilityReview({ currentEntry }) {
  const pageKey = currentEntry?.pageKey || currentEntry?.key || ''
  const moduleDefinition =
    getBusinessModule(pageKey) || productCoreReviewFallbackByPageKey[pageKey]
  const pageLabel =
    moduleDefinition?.title ||
    moduleDefinition?.label ||
    currentEntry?.label ||
    DEFAULT_DESKTOP_ENTRY.label
  const currentScope =
    Array.isArray(moduleDefinition?.currentScope) &&
    moduleDefinition.currentScope.length > 0
      ? moduleDefinition.currentScope
      : ['菜单入口', '权限码', '字段策略', '动作边界']
  const sourceText =
    moduleDefinition?.factSource ||
    moduleDefinition?.primaryEntity ||
    '客户运行态业务 API'
  const boundaryText =
    moduleDefinition?.boundary ||
    'Product Core 只审阅页面能力、权限、字段和动作边界；客户业务记录需在客户运行态查看。'

  return (
    <div
      className="erp-product-core-capability-review"
      data-product-core-business-data-guard="true"
      data-product-core-capability-review="true"
    >
      <div className="erp-product-core-capability-review__header">
        <div>
          <Text type="secondary">Product Core</Text>
          <h2>{pageLabel} 能力审阅</h2>
          <Paragraph>
            {moduleDefinition?.description ||
              `${pageLabel} 当前作为产品核心已登记页面参与菜单、权限、字段和动作边界审阅。`}
          </Paragraph>
        </div>
        <Space size={8} wrap>
          <Tag color="blue">能力定义</Tag>
          <Tag color="geekblue">不挂载客户数据</Tag>
          <Tag>无客户运行态</Tag>
        </Space>
      </div>

      <div className="erp-product-core-capability-review__grid">
        <div className="erp-product-core-capability-review__panel">
          <Text type="secondary">当前模块</Text>
          <strong>{pageLabel}</strong>
          <span>{moduleDefinition?.sectionTitle || '产品核心能力目录'}</span>
        </div>
        <div className="erp-product-core-capability-review__panel">
          <Text type="secondary">数据真源</Text>
          <strong>{sourceText}</strong>
          <span>客户订单、库存、协同任务和财务记录只在客户运行态读取。</span>
        </div>
        <div className="erp-product-core-capability-review__panel erp-product-core-capability-review__panel--wide">
          <Text type="secondary">边界说明</Text>
          <strong>{boundaryText}</strong>
          <span>
            要查看真实业务记录，请切换到带 customer key 的客户运行环境。
          </span>
        </div>
      </div>

      <div className="erp-product-core-capability-review__scope">
        <Text type="secondary">已登记审阅范围</Text>
        <Space size={8} wrap>
          {currentScope.map((item) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </Space>
      </div>
    </div>
  )
}

const SELF_CONTAINED_PAGE_HEAD_PATHS = new Set([
  DEFAULT_DESKTOP_ENTRY.path,
  '/erp/task-board',
  '/erp/business-dashboard',
  '/erp/operations/exceptions',
  '/erp/print-center',
  '/erp/system/permissions',
  '/erp/system/audit-logs',
])

function normalizeMenuPaths(menus = []) {
  if (!Array.isArray(menus)) {
    return []
  }
  const selected = new Set()
  menus.forEach((menu) => {
    if (typeof menu === 'string') {
      const path = resolveMenuPermissionKey(menu)
      if (path) selected.add(path)
      return
    }
    const path = resolveMenuPermissionKey(menu?.path || '')
    if (path) selected.add(path)
  })
  return [...selected]
}

export default function ERPLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const tokenAdmin = getCurrentUser(AUTH_SCOPE.ADMIN)
  const activeBrand = useMemo(() => getActiveERPBrand(), [])
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [profileLoading, setProfileLoading] = useState(!getStoredAdminProfile())
  const [adminProfile, setAdminProfile] = useState(() =>
    getStoredAdminProfile()
  )
  const [profileSyncCompleted, setProfileSyncCompleted] = useState(false)
  const adminProfileRef = useRef(adminProfile)
  const profileSyncInFlightRef = useRef(null)
  const profileSyncErrorNotifiedRef = useRef(false)
  const profileSessionUnavailableHandledRef = useRef(false)
  const [refreshingCurrentPage, setRefreshingCurrentPage] = useState(false)
  const refreshingCurrentPageRef = useRef(false)
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

  const isSuperAdmin = adminProfile?.is_super_admin === true
  const effectiveSessionCustomerKey =
    typeof adminProfile?.effective_session?.customer?.key === 'string'
      ? adminProfile.effective_session.customer.key.trim()
      : ''
  const shouldUseProductCoreNavigation =
    isSuperAdmin && !effectiveSessionCustomerKey
  const routeNavigationSections = useMemo(
    () => getNavigationSections(isSuperAdmin ? null : undefined),
    [isSuperAdmin]
  )
  const menuNavigationSections = useMemo(
    () =>
      shouldUseProductCoreNavigation
        ? getProductCoreNavigationSections()
        : routeNavigationSections,
    [routeNavigationSections, shouldUseProductCoreNavigation]
  )
  const currentNavigationEntry = useMemo(
    () =>
      resolveCurrentNavigationEntry({
        navigationSections: routeNavigationSections,
        locationPath: location.pathname,
      }),
    [location.pathname, routeNavigationSections]
  )
  const currentEntry = currentNavigationEntry.entry

  const loadProfile = useCallback(
    ({ showLoading = false } = {}) => {
      if (profileSyncInFlightRef.current) {
        return profileSyncInFlightRef.current
      }

      const syncPromise = (async () => {
        if (showLoading) {
          setProfileSyncCompleted(false)
          setProfileLoading(true)
        }
        try {
          const result = await adminRpc.call('me', {})
          let nextProfile = result?.data || null
          if (nextProfile) {
            try {
              const effectiveSessionCustomerKey =
                resolveEffectiveSessionCustomerKey(activeBrand)
              if (!effectiveSessionCustomerKey) {
                nextProfile =
                  attachUnavailableEffectiveSessionToAdminProfile(nextProfile)
              } else {
                const effectiveSession = await getEffectiveSession({
                  customer_key: effectiveSessionCustomerKey,
                })
                nextProfile = attachEffectiveSessionToAdminProfile(
                  nextProfile,
                  effectiveSession
                )
              }
            } catch (sessionError) {
              const syncErrorAction = getAdminProfileSyncErrorAction(
                sessionError,
                {
                  hasCachedProfile: Boolean(
                    nextProfile || adminProfileRef.current
                  ),
                  alreadyNotified: profileSyncErrorNotifiedRef.current,
                }
              )
              if (syncErrorAction === 'reauth') {
                throw sessionError
              }
              console.warn(
                '客户有效配置同步失败，继续使用缓存投影或空投影',
                sessionError
              )
              const cachedEffectiveSession =
                adminProfileRef.current?.effective_session &&
                typeof adminProfileRef.current.effective_session === 'object'
                  ? adminProfileRef.current.effective_session
                  : null
              nextProfile = cachedEffectiveSession
                ? attachEffectiveSessionToAdminProfile(
                    nextProfile,
                    cachedEffectiveSession
                  )
                : attachUnavailableEffectiveSessionToAdminProfile(nextProfile)
            }
          }
          if (nextProfile) {
            persistAuthMeta(
              {
                user_id: nextProfile.id,
                username: nextProfile.username,
                is_super_admin: nextProfile.is_super_admin === true,
                roles: nextProfile.roles || [],
                permissions: nextProfile.permissions || [],
                menus: nextProfile.menus || [],
                erp_preferences: nextProfile.erp_preferences || {
                  column_orders: {},
                },
              },
              AUTH_SCOPE.ADMIN
            )
          }
          setAdminProfile(nextProfile)
          profileSyncErrorNotifiedRef.current = false
        } catch (error) {
          const syncErrorAction = getAdminProfileSyncErrorAction(error, {
            hasCachedProfile: Boolean(adminProfileRef.current),
            alreadyNotified: profileSyncErrorNotifiedRef.current,
          })
          if (syncErrorAction === 'reauth') {
            if (profileSessionUnavailableHandledRef.current) {
              return
            }
            profileSessionUnavailableHandledRef.current = true
            logout(AUTH_SCOPE.ADMIN)
            setAdminProfile(null)
            authBus.emitUnauthorized?.({
              from: {
                pathname: window.location.pathname,
                search: window.location.search,
                hash: window.location.hash,
              },
              message: getActionErrorMessage(error, '同步管理员权限'),
              loginPath: getLoginPath(AUTH_SCOPE.ADMIN),
            })
            return
          }
          if (syncErrorAction === 'keep_cached') {
            console.warn('管理员权限同步失败，继续使用本地缓存 profile', error)
            return
          }
          if (syncErrorAction === 'silent') {
            return
          }
          if (!isAuthFailureCode(error?.code)) {
            profileSyncErrorNotifiedRef.current = true
            message.error(getActionErrorMessage(error, '同步管理员权限'))
          }
        } finally {
          if (showLoading) {
            setProfileLoading(false)
          }
          setProfileSyncCompleted(true)
          if (profileSyncInFlightRef.current === syncPromise) {
            profileSyncInFlightRef.current = null
          }
        }
      })()

      profileSyncInFlightRef.current = syncPromise
      return syncPromise
    },
    [activeBrand, adminRpc]
  )

  useEffect(() => {
    loadProfile({ showLoading: true })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadProfile()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const profileSyncTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadProfile()
      }
    }, PROFILE_SYNC_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(profileSyncTimer)
    }
  }, [loadProfile])

  useEffect(() => {
    adminProfileRef.current = adminProfile
  }, [adminProfile])

  const allowedMenuPaths = useMemo(
    () => normalizeMenuPaths(adminProfile?.menus || []),
    [adminProfile?.menus]
  )

  const visibleSections = useMemo(() => {
    return filterNavigationSectionsByAdminProfile({
      navigationSections: menuNavigationSections,
      adminProfile,
      allowedMenuPaths,
      isSuperAdmin,
    })
  }, [adminProfile, allowedMenuPaths, isSuperAdmin, menuNavigationSections])

  const effectiveSessionDiagnostic = useMemo(
    () =>
      buildEffectiveSessionDiagnosticSummary({
        adminProfile,
        allowedMenuPaths,
        visibleSections,
        isSuperAdmin,
      }),
    [adminProfile, allowedMenuPaths, isSuperAdmin, visibleSections]
  )

  useEffect(() => {
    if (import.meta.env.DEV !== true || typeof window === 'undefined') {
      return undefined
    }
    window.__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__ =
      effectiveSessionDiagnostic
    return () => {
      delete window.__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__
    }
  }, [effectiveSessionDiagnostic])

  const currentMenuPath = useMemo(
    () => resolveMenuPermissionKey(location.pathname),
    [location.pathname]
  )

  const currentPageShouldRedirect = useMemo(
    () =>
      shouldRedirectFromCurrentNavigation({
        profileLoading,
        adminProfile,
        allowedMenuPaths,
        isSuperAdmin,
        currentMenuPath,
        currentPageKey: currentNavigationEntry.pageKey,
        currentNavigationMatched: currentNavigationEntry.matched,
      }),
    [
      profileLoading,
      adminProfile,
      allowedMenuPaths,
      isSuperAdmin,
      currentMenuPath,
      currentNavigationEntry.pageKey,
      currentNavigationEntry.matched,
    ]
  )

  useEffect(() => {
    if (!currentPageShouldRedirect) {
      return
    }
    const fallbackPath = visibleSections[0]?.items[0]?.path || ''
    if (fallbackPath && fallbackPath !== location.pathname) {
      navigate(fallbackPath, { replace: true })
    }
  }, [currentPageShouldRedirect, location.pathname, navigate, visibleSections])

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

  const selectedKeys =
    currentNavigationEntry.matched && currentEntry?.path
      ? [currentEntry.path]
      : []
  const hideCurrentEntryPageHead = [
    '/erp/master/',
    '/erp/sales/',
    '/erp/product/',
    '/erp/engineering/',
    '/erp/purchase/',
    '/erp/quality/',
    '/erp/inventory/',
    '/erp/production/',
    '/erp/warehouse/',
    '/erp/shipments/',
    '/erp/finance/',
  ].some((prefix) => currentEntry?.path?.startsWith(prefix))
  const hidePageHead =
    SELF_CONTAINED_PAGE_HEAD_PATHS.has(currentEntry?.path) ||
    hideCurrentEntryPageHead

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
          is_super_admin: nextProfile.is_super_admin === true,
          roles: nextProfile.roles || [],
          permissions: nextProfile.permissions || [],
          menus: nextProfile.menus || [],
          erp_preferences: nextProfile.erp_preferences,
        },
        AUTH_SCOPE.ADMIN
      )
      return nextProfile
    })
  }, [])

  const outletContext = useMemo(
    () => ({
      adminProfile,
      profileSyncCompleted,
      registerPageRefresh,
      updateAdminERPPreferences,
    }),
    [
      adminProfile,
      profileSyncCompleted,
      registerPageRefresh,
      updateAdminERPPreferences,
    ]
  )

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
    if (refreshingCurrentPageRef.current) {
      return
    }

    if (!pageRefreshHandler) {
      window.location.reload()
      return
    }

    refreshingCurrentPageRef.current = true
    setRefreshingCurrentPage(true)
    try {
      const refreshed = await pageRefreshHandler()
      if (refreshed !== false) {
        message.success('当前页面数据已刷新')
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '刷新当前页面数据'))
    } finally {
      refreshingCurrentPageRef.current = false
      setRefreshingCurrentPage(false)
    }
  }

  const handleNavigate = async (nextPath) => {
    if (!nextPath) {
      setMobileNavOpen(false)
      return
    }

    if (nextPath === location.pathname) {
      setMobileNavOpen(false)
      return
    }

    navigate(nextPath)
    setMobileNavOpen(false)
  }

  const sideNav = (
    <div className="erp-admin-sider__body">
      <div className="erp-admin-brand">
        <div className="erp-admin-brand__logo">
          <span className="erp-admin-brand__logo-mark">
            {activeBrand.brandMark}
          </span>
          <div className="erp-admin-brand__logo-copy">
            <div className="erp-admin-brand__logo-title">
              {activeBrand.companyName}
            </div>
            <div className="erp-admin-brand__logo-subtitle">
              {activeBrand.systemName}
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

  const roleLabel = isSuperAdmin
    ? '超级管理员'
    : (adminProfile?.roles || [])
        .map(
          (role) =>
            role?.name || (role?.role_key || role?.key ? '已配置角色' : '')
        )
        .filter(Boolean)
        .slice(0, 2)
        .join(' / ') || '普通管理员'
  const displayUsername =
    adminProfile?.username || tokenAdmin?.username || 'admin'
  const noVisibleMenus = visibleSections.length === 0
  const shouldBlockOutlet = noVisibleMenus && currentPageShouldRedirect
  const shouldGuardProductCoreBusinessData =
    shouldGuardCustomerBusinessPageRuntime({
      effectiveSessionDiagnostic,
      isCustomerBusinessDataPage: isCustomerBusinessDataPageKey(
        currentNavigationEntry.pageKey
      ),
    })

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
    <Layout
      className="erp-admin-shell"
      data-effective-session-source={effectiveSessionDiagnostic.source}
      data-effective-session-mode={effectiveSessionDiagnostic.visibilityMode}
      data-effective-session-data-scope={
        effectiveSessionDiagnostic.dataRuntimeScope
      }
    >
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
              <ERPThemeToggle
                className="erp-admin-header__theme-toggle"
                variant="menu"
              />
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
            {shouldBlockOutlet ? (
              <Alert
                type="warning"
                showIcon
                message="当前账号暂无可见后台入口"
                description="请确认账号角色权限和当前客户有效配置的页面清单；若客户配置同步失败，请稍后刷新或联系管理员复核当前有效配置版本。"
              />
            ) : shouldGuardProductCoreBusinessData ? (
              <ProductCoreCapabilityReview currentEntry={currentEntry} />
            ) : (
              <Outlet context={outletContext} />
            )}
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
