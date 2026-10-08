import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AccountBookOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  DownOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  HomeOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  InteractionOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PrinterOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SwapOutlined,
  ToolOutlined,
  TruckOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Breadcrumb,
  Button,
  Drawer,
  Dropdown,
  Layout,
  Menu,
  Space,
  Tag,
  Typography,
} from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { RpcDomain } from '../../common/consts/rpcMethods.generated.mjs'
import BusinessModuleTabs from './BusinessModuleTabs.jsx'
import ModuleCatalogModal from './ModuleCatalogModal.jsx'
import {
  getBusinessModuleSidebarKey,
  getBusinessModuleTabs,
  groupSidebarNavigationSections,
  projectBusinessModuleSections,
  projectRoleGuidedModuleNavigation,
  rememberBusinessModuleLocation,
  resolveBusinessModuleMenuTarget,
} from '../utils/businessModuleGroups.mjs'
import { notifyProductImagesChanged } from '../utils/productImageReferences.mjs'
import useDesktopTaskCount from '../hooks/useDesktopTaskCount'
import NavigationCountBadge, { navigationCountDescription } from '@/common/components/navigation/NavigationCountBadge'
import './desktop-task-badge.css'
import { isAuthFailureCode } from '@/common/consts/errorCodes'
import {
  AUTH_SCOPE,
  getAuthMeta,
  getCurrentUser,
  getLoginPath,
  getStoredAdminProfile,
  getToken,
  logout,
  persistAuthMeta,
  persistAdminERPPreferences,
  mergeAdminERPPreferencesRead,
  subscribeAdminERPPreferences,
} from '@/common/auth/auth'
import { authBus } from '@/common/auth/authBus'
import { getActiveERPBrand } from '@/common/consts/brand'
import { Loading } from '@/common/components/loading'
import SystemVersionModal from '@/common/components/system-version/SystemVersionModal'
import ERPThemeToggle from '@/common/components/theme/ERPThemeToggle'
import useRuntimeBuildIdentity from '@/common/runtime/useRuntimeBuildIdentity'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc, pauseAuthenticatedRpcCalls } from '@/common/utils/jsonRpc'
import SessionRecoveryDialog from './SessionRecoveryDialog'
import AccountPasswordModal from './AccountPasswordModal.jsx'
import {
  getBusinessModule,
  isCustomerBusinessDataPageKey,
} from '../config/businessModules.mjs'
import {
  getActiveCustomerMenuConfig,
  getCustomerNavigationPresentation,
  getSidebarNavigationSections,
} from '../config/customerMenuConfig.mjs'
import {
  getEnabledMobileRoleKeys,
  getEntryConfig,
} from '../config/entryConfig.mjs'
import { resolveMenuPermissionKey } from '../config/menuPermissions.mjs'
import { buildRoleGuidedNavigation } from '../config/roleGuidedNavigation.mjs'
import {
  getAuthenticatedNavigationSections,
  getNavigationSections,
  getProductCoreNavigationSections,
} from '../config/seedData.mjs'
import { getEffectiveSession } from '../api/customerConfigApi.mjs'
import {
  DEFAULT_DESKTOP_ENTRY,
  resolveCurrentNavigationEntry,
  resolveDesktopHomeEntry,
} from '../utils/currentNavigationEntry.mjs'
import { formatAdminIdentity } from '../utils/adminIdentity.mjs'
import {
  CUSTOMER_RUNTIME_GATE,
  attachEffectiveSessionToAdminProfile,
  attachUnavailableEffectiveSessionToAdminProfile,
  buildEffectiveSessionDiagnosticSummary,
  filterNavigationSectionsByAdminProfile,
  getAdminProfileSyncErrorAction,
  getAdminProfileAccessKey,
  getProfileSyncFailure,
  hasExpectedDesktopCustomerSession,
  isLocalCustomerDesktopPreviewSession,
  loadProfileSyncReadWithRetry,
  resolveCustomerRuntimeGate,
  resolveEffectiveSessionCustomerKey,
  resolveEffectiveSessionPageAccess,
  shouldRedirectFromCurrentNavigation,
  shouldGuardCustomerBusinessPageRuntime,
} from '../utils/adminProfileSync.mjs'
import { getAllowedMobileRoleKeys } from '../utils/mobileRolePermissions.mjs'

const { Content, Header, Sider } = Layout
const { Paragraph, Text } = Typography
const PROFILE_SYNC_INTERVAL_MS = 60 * 1000
const PROFILE_BOOTSTRAP_RETRY_DELAYS_MS = [200, 600]
const ADMIN_AUTH_STORAGE_KEYS = new Set(['admin_access_token', 'admin_user_id'])

const navIconRegistry = {
  'workspace-home': <HomeOutlined aria-hidden />,
  'global-dashboard': <HomeOutlined aria-hidden />,
  'task-board': <ScheduleOutlined aria-hidden />,
  'business-dashboard': <BarChartOutlined aria-hidden />,
  'module:master': <DatabaseOutlined aria-hidden />,
  'module:sales': <ShoppingOutlined aria-hidden />,
  'module:engineering': <ApartmentOutlined aria-hidden />,
  'module:purchase': <ShoppingCartOutlined aria-hidden />,
  'module:outsourcing': <InteractionOutlined aria-hidden />,
  'module:production': <ToolOutlined aria-hidden />,
  'module:warehouse': <InboxOutlined aria-hidden />,
  'module:quality': <SafetyCertificateOutlined aria-hidden />,
  'module:shipment': <TruckOutlined aria-hidden />,
  'module:finance': <AccountBookOutlined aria-hidden />,
  'print-center': <PrinterOutlined aria-hidden />,
  'permission-center': <SettingOutlined aria-hidden />,
  'system-audit-logs': <FileSearchOutlined aria-hidden />,
  'history-records': <HistoryOutlined aria-hidden />,
  'help-center': <QuestionCircleOutlined aria-hidden />,
}

const productCoreReviewFallbackByPageKey = {
  'business-dashboard': {
    title: '进度看板',
    description: '进度看板按订单和生产单查看进展、交期与关联任务。',
    currentScope: ['订单交付', '生产执行', '进度追溯', '来源权限'],
    boundary: '当前只显示看板功能说明；连接客户业务数据后才会显示实际数字。',
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
      : ['菜单入口', '功能权限', '字段设置', '可用操作']
  const boundaryText =
    moduleDefinition?.boundary ||
    '当前只显示页面功能说明；连接客户业务数据后才能查看和办理实际业务。'

  return (
    <div
      className="erp-product-core-capability-review"
      data-product-core-business-data-guard="true"
      data-product-core-capability-review="true"
    >
      <div className="erp-product-core-capability-review__header">
        <div>
          <Text type="secondary">功能预览</Text>
          <h2>{pageLabel} 功能预览</h2>
          <Paragraph>
            {moduleDefinition?.description ||
              `${pageLabel} 已配置页面入口、功能权限、字段和可用操作。`}
          </Paragraph>
        </div>
        <Space size={8} wrap>
          <Tag color="blue">功能说明</Tag>
          <Tag color="geekblue">不显示客户数据</Tag>
          <Tag>尚未连接客户环境</Tag>
        </Space>
      </div>

      <div className="erp-product-core-capability-review__grid">
        <div className="erp-product-core-capability-review__panel">
          <Text type="secondary">当前功能</Text>
          <strong>{pageLabel}</strong>
          <span>{moduleDefinition?.sectionTitle || '系统功能目录'}</span>
        </div>
        <div className="erp-product-core-capability-review__panel">
          <Text type="secondary">数据状态</Text>
          <strong>尚未连接客户业务数据</strong>
          <span>连接后才能查看客户订单、库存、待办任务和财务记录。</span>
        </div>
        <div className="erp-product-core-capability-review__panel erp-product-core-capability-review__panel--wide">
          <Text type="secondary">使用说明</Text>
          <strong>{boundaryText}</strong>
          <span>要查看实际业务记录，请进入已经连接客户数据的环境。</span>
        </div>
      </div>

      <div className="erp-product-core-capability-review__scope">
        <Text type="secondary">可查看内容</Text>
        <Space size={8} wrap>
          {currentScope.map((item) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </Space>
      </div>
    </div>
  )
}

function CustomerRuntimeUnavailable({
  failure,
  retrying,
  loggingOut,
  onRetry,
  onLogout,
}) {
  return (
    <Layout className="erp-admin-shell" data-customer-runtime-boundary="true">
      <Content className="erp-admin-content">
        <div className="erp-admin-outlet">
          <Alert
            type={failure?.kind === 'service' ? 'warning' : 'error'}
            showIcon
            message={failure?.title || getProfileSyncFailure().title}
            description={
              failure?.description || getProfileSyncFailure().description
            }
            action={
              <Space size={8} wrap>
                <Button
                  icon={<ReloadOutlined aria-hidden="true" />}
                  className="erp-action-button"
                  loading={retrying}
                  onClick={onRetry}
                >
                  重试
                </Button>
                <Button loading={loggingOut} onClick={onLogout}>
                  退出登录
                </Button>
              </Space>
            }
          />
        </div>
      </Content>
    </Layout>
  )
}

const SELF_CONTAINED_PAGE_HEAD_PATHS = new Set([
  DEFAULT_DESKTOP_ENTRY.path,
  '/erp/task-board',
  '/erp/business-dashboard',
  '/erp/print-center',
  '/erp/system/permissions',
  '/erp/system/audit-logs',
  '/erp/history',
  '/erp/help-center',
])
const BUSINESS_PAGE_HEAD_PATH_PREFIXES = [
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
]
const LOCAL_CUSTOMER_PREVIEW_GUARDED_PAGE_KEYS = new Set([
  'global-dashboard',
  'task-board',
])

export function hasSelfContainedBusinessPageHead(path = '') {
  return BUSINESS_PAGE_HEAD_PATH_PREFIXES.some((prefix) =>
    String(path || '').startsWith(prefix)
  )
}

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

function buildUnavailableCachedAdminProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return null
  }
  return attachUnavailableEffectiveSessionToAdminProfile({
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    phone: profile.phone,
    is_super_admin: false,
    roles: [],
    permissions: [],
    menus: [],
    erp_preferences:
      profile.erp_preferences && typeof profile.erp_preferences === 'object'
        ? profile.erp_preferences
        : { column_orders: {} },
  })
}

export default function ERPLayout({ legalNotice }) {
  const navigate = useNavigate()
  const location = useLocation()
  const tokenAdmin = getCurrentUser(AUTH_SCOPE.ADMIN)
  const activeBrand = useMemo(() => getActiveERPBrand(), [])
  const entryConfig = useMemo(() => getEntryConfig(), [])
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false)
  const [moduleCatalogOpen, setModuleCatalogOpen] = useState(false)
  const [systemVersionOpen, setSystemVersionOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [profileLoading, setProfileLoading] = useState(!getStoredAdminProfile())
  const [adminProfile, setAdminProfile] = useState(() =>
    getStoredAdminProfile()
  )
  useEffect(
    () =>
      subscribeAdminERPPreferences((profile) => {
        setAdminProfile((current) =>
          current &&
          current.id === profile.id &&
          JSON.stringify(current.erp_preferences) !==
            JSON.stringify(profile.erp_preferences)
            ? { ...current, erp_preferences: profile.erp_preferences }
            : current
        )
      }),
    []
  )
  const [profileSyncCompleted, setProfileSyncCompleted] = useState(false)
  const [profileSyncFailure, setProfileSyncFailure] = useState(null)
  const [profileSyncing, setProfileSyncing] = useState(false)
  const [businessPageGeneration, setBusinessPageGeneration] = useState(0)
  const verifiedAccessKeyRef = useRef('')
  const recoveryPathRef = useRef('')
  const locationPathRef = useRef(location.pathname)
  locationPathRef.current = location.pathname
  const resumeRpcRef = useRef(null)
  const adminProfileRef = useRef(adminProfile)
  const profileSyncInFlightRef = useRef(null)
  const profileSyncGenerationRef = useRef(0)
  const profileSyncActiveRef = useRef(false)
  const profileInitialSyncStartedRef = useRef(false)
  const profileSyncErrorNotifiedRef = useRef(false)
  const profileSessionUnavailableHandledRef = useRef(false)
  const [refreshingCurrentPage, setRefreshingCurrentPage] = useState(false)
  const refreshingCurrentPageRef = useRef(false)
  const [pageRefreshHandler, setPageRefreshHandler] = useState(null)
  const [pageLeaveGuard, setPageLeaveGuard] = useState(null)
  const runtimeBuildIdentity = useRuntimeBuildIdentity()

  const authRpc = useMemo(
    () =>
      new JsonRpc({
        url: RpcDomain.AUTH,
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )
  const adminRpc = useMemo(
    () =>
      new JsonRpc({
        url: RpcDomain.ADMIN,
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

  const isSuperAdmin = adminProfile?.is_super_admin === true
  const canSwitchToMobileTasks = useMemo(
    () =>
      getAllowedMobileRoleKeys(
        adminProfile,
        getEnabledMobileRoleKeys(entryConfig)
      ).length > 0,
    [adminProfile, entryConfig]
  )
  const configuredCustomerKey = resolveEffectiveSessionCustomerKey(activeBrand)
  const requiresConfiguredCustomerRuntime = Boolean(configuredCustomerKey)
  const effectiveSessionCustomerKey =
    typeof adminProfile?.effective_session?.customer?.key === 'string'
      ? adminProfile.effective_session.customer.key.trim()
      : ''
  const hasConfiguredCustomerDesktopSession = hasExpectedDesktopCustomerSession(
    adminProfile,
    configuredCustomerKey,
    { isLocalDev: import.meta.env.DEV === true }
  )
  const isLocalCustomerDesktopPreview =
    import.meta.env.DEV === true &&
    isLocalCustomerDesktopPreviewSession(adminProfile, configuredCustomerKey)
  const customerRuntimeBootstrapPending =
    requiresConfiguredCustomerRuntime && !profileSyncCompleted
  const customerRuntimeUnavailable =
    requiresConfiguredCustomerRuntime &&
    profileSyncCompleted &&
    !hasConfiguredCustomerDesktopSession
  const shouldUseProductCoreNavigation =
    isSuperAdmin &&
    !requiresConfiguredCustomerRuntime &&
    !effectiveSessionCustomerKey
  const customerNavigationPresentation = useMemo(
    () => getCustomerNavigationPresentation(getActiveCustomerMenuConfig()),
    []
  )
  const routeNavigationSections = useMemo(
    () => [
      ...getNavigationSections(isSuperAdmin ? null : undefined),
      ...getAuthenticatedNavigationSections(),
    ],
    [isSuperAdmin]
  )
  const menuNavigationSections = useMemo(() => {
    if (!shouldUseProductCoreNavigation) {
      return routeNavigationSections
    }
    return [
      ...getProductCoreNavigationSections(),
      ...getAuthenticatedNavigationSections(),
    ]
  }, [routeNavigationSections, shouldUseProductCoreNavigation])
  const currentNavigationEntry = useMemo(
    () =>
      resolveCurrentNavigationEntry({
        navigationSections: routeNavigationSections,
        locationPath: location.pathname,
      }),
    [location.pathname, routeNavigationSections]
  )
  const currentEntry = currentNavigationEntry.entry
  const currentPageRequiresConfiguredCustomerRuntime =
    currentEntry?.access !== 'authenticated' &&
    resolveEffectiveSessionPageAccess(
      adminProfile,
      currentNavigationEntry.pageKey
    ).reason !== 'system_page_rbac_scope'
  const customerRuntimeGate = resolveCustomerRuntimeGate({
    bootstrapPending: customerRuntimeBootstrapPending,
    runtimeUnavailable: customerRuntimeUnavailable,
    pageRequiresCustomerRuntime: currentPageRequiresConfiguredCustomerRuntime,
  })
  const pageRequiresCustomerRuntimeRef = useRef(
    currentPageRequiresConfiguredCustomerRuntime
  )
  pageRequiresCustomerRuntimeRef.current =
    currentPageRequiresConfiguredCustomerRuntime

  const pauseBusinessRequests = useCallback(() => {
    if (!resumeRpcRef.current) {
      resumeRpcRef.current = pauseAuthenticatedRpcCalls(AUTH_SCOPE.ADMIN)
    }
  }, [])

  useLayoutEffect(() => {
    if (!profileSyncFailure && profileSyncCompleted) {
      resumeRpcRef.current?.()
      resumeRpcRef.current = null
    }
  }, [profileSyncFailure, profileSyncCompleted])

  useEffect(() => () => resumeRpcRef.current?.(), [])

  const loadProfile = useCallback(
    ({ showLoading = false } = {}) => {
      if (profileSyncInFlightRef.current) {
        return profileSyncInFlightRef.current
      }

      const syncGeneration = profileSyncGenerationRef.current
      const syncToken = getToken(AUTH_SCOPE.ADMIN)
      const preferencesBeforeRead = getAuthMeta(
        AUTH_SCOPE.ADMIN,
        'erp_preferences'
      )
      const isCurrentGeneration = () =>
        profileSyncActiveRef.current &&
        profileSyncGenerationRef.current === syncGeneration
      const isCurrentSync = () =>
        isCurrentGeneration() && getToken(AUTH_SCOPE.ADMIN) === syncToken
      const loadCurrentSyncRead = (load, retryDelaysMs) =>
        loadProfileSyncReadWithRetry(
          () => {
            if (!isCurrentSync()) {
              throw Object.assign(new Error('Profile sync inactive'), {
                isAbortError: true,
              })
            }
            return load()
          },
          { retryDelaysMs }
        )
      const syncPromise = (async () => {
        let verifiedProfile = null
        setProfileSyncing(true)
        if (showLoading) {
          if (!verifiedAccessKeyRef.current) setProfileSyncCompleted(false)
          setProfileLoading(true)
        }
        try {
          const bootstrapRetryDelays = showLoading
            ? PROFILE_BOOTSTRAP_RETRY_DELAYS_MS
            : []
          const result = await loadCurrentSyncRead(
            () => adminRpc.call('me', {}),
            bootstrapRetryDelays
          )
          if (!isCurrentSync()) {
            return
          }
          verifiedProfile = result?.data || null
          let nextProfile = verifiedProfile
          if (nextProfile) {
            try {
              const effectiveSessionCustomerKey =
                resolveEffectiveSessionCustomerKey(activeBrand)
              if (!effectiveSessionCustomerKey) {
                nextProfile =
                  attachUnavailableEffectiveSessionToAdminProfile(nextProfile)
              } else {
                const effectiveSession = await loadCurrentSyncRead(
                  () =>
                    getEffectiveSession({
                      customer_key: effectiveSessionCustomerKey,
                    }),
                  bootstrapRetryDelays
                )
                if (!isCurrentSync()) {
                  return
                }
                nextProfile = attachEffectiveSessionToAdminProfile(
                  nextProfile,
                  effectiveSession
                )
              }
            } catch (sessionError) {
              if (!isCurrentGeneration()) {
                return
              }
              console.warn(
                '客户有效配置同步失败，当前业务投影已停用',
                sessionError
              )
              throw sessionError
            }
          }
          if (!isCurrentSync()) {
            return
          }
          if (nextProfile) {
            nextProfile = {
              ...nextProfile,
              erp_preferences: mergeAdminERPPreferencesRead(
                nextProfile.erp_preferences,
                preferencesBeforeRead
              ),
            }
            persistAuthMeta(
              {
                user_id: nextProfile.id,
                username: nextProfile.username,
                display_name: nextProfile.display_name,
                phone: nextProfile.phone,
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
          const sessionVerified = hasExpectedDesktopCustomerSession(
            nextProfile,
            configuredCustomerKey,
            { isLocalDev: import.meta.env.DEV === true }
          )
          if (sessionVerified) {
            const accessKey = getAdminProfileAccessKey(nextProfile)
            if (
              verifiedAccessKeyRef.current &&
              verifiedAccessKeyRef.current !== accessKey
            ) {
              setBusinessPageGeneration((generation) => generation + 1)
            }
            verifiedAccessKeyRef.current = accessKey
          } else {
            verifiedAccessKeyRef.current = ''
          }
          recoveryPathRef.current = ''
          setProfileSyncFailure(
            configuredCustomerKey &&
              !sessionVerified &&
              pageRequiresCustomerRuntimeRef.current
              ? getProfileSyncFailure()
              : null
          )
          setAdminProfile(nextProfile)
          profileSyncErrorNotifiedRef.current = false
        } catch (error) {
          if (
            !isCurrentGeneration() ||
            (!isCurrentSync() &&
              !(isAuthFailureCode(error?.code) && !getToken(AUTH_SCOPE.ADMIN)))
          ) {
            return
          }
          const syncErrorAction = getAdminProfileSyncErrorAction(error, {
            hasCachedProfile: Boolean(adminProfileRef.current),
            alreadyNotified: profileSyncErrorNotifiedRef.current,
          })
          if (syncErrorAction === 'reauth') {
            if (profileSessionUnavailableHandledRef.current) {
              return
            }
            profileSessionUnavailableHandledRef.current = true
            verifiedAccessKeyRef.current = ''
            pauseBusinessRequests()
            setProfileSyncFailure(getProfileSyncFailure(error))
            logout(AUTH_SCOPE.ADMIN)
            setAdminProfile(null)
            setProfileLoading(false)
            setProfileSyncing(false)
            setProfileSyncCompleted(true)
            if (!isAuthFailureCode(error?.code)) {
              authBus.emitUnauthorized?.({
                from: {
                  pathname: window.location.pathname,
                  search: window.location.search,
                  hash: window.location.hash,
                },
                message: getActionErrorMessage(error, '加载账号权限'),
                loginPath: getLoginPath(AUTH_SCOPE.ADMIN),
              })
            }
            return
          }
          if (verifiedProfile && !pageRequiresCustomerRuntimeRef.current) {
            // 系统管理页沿用本次 me 的权限，不依赖客户业务配置。
            verifiedAccessKeyRef.current = ''
            recoveryPathRef.current = ''
            setAdminProfile(
              attachUnavailableEffectiveSessionToAdminProfile(verifiedProfile)
            )
            setProfileSyncFailure(null)
            return
          }
          const failure = getProfileSyncFailure(error)
          pauseBusinessRequests()
          const retainPage =
            failure.kind === 'service' &&
            Boolean(verifiedAccessKeyRef.current) &&
            (!recoveryPathRef.current ||
              recoveryPathRef.current === locationPathRef.current)
          recoveryPathRef.current ||= locationPathRef.current
          setProfileSyncFailure({
            ...failure,
            retainPage,
            path: recoveryPathRef.current,
          })
          if (retainPage) {
            console.warn('服务连接中断，当前页面和业务请求已暂停', error)
            return
          }
          verifiedAccessKeyRef.current = ''
          if (syncErrorAction === 'keep_cached') {
            console.warn('管理员权限同步失败，缓存授权已停用', error)
          } else if (
            syncErrorAction !== 'silent' &&
            !isAuthFailureCode(error?.code)
          ) {
            profileSyncErrorNotifiedRef.current = true
            message.error(getActionErrorMessage(error, '加载账号权限'))
          }
          const unavailableProfile = buildUnavailableCachedAdminProfile(
            adminProfileRef.current
          )
          if (unavailableProfile) {
            persistAuthMeta(
              {
                user_id: unavailableProfile.id,
                username: unavailableProfile.username,
                display_name: unavailableProfile.display_name,
                phone: unavailableProfile.phone,
                is_super_admin: false,
                roles: [],
                permissions: [],
                menus: [],
                erp_preferences: unavailableProfile.erp_preferences,
              },
              AUTH_SCOPE.ADMIN
            )
          }
          setAdminProfile(unavailableProfile)
        } finally {
          if (isCurrentSync()) {
            setProfileSyncing(false)
            if (showLoading) {
              setProfileLoading(false)
            }
            setProfileSyncCompleted(true)
          }
          if (profileSyncInFlightRef.current === syncPromise) {
            profileSyncInFlightRef.current = null
          }
        }
      })()

      profileSyncInFlightRef.current = syncPromise
      return syncPromise
    },
    [activeBrand, adminRpc, configuredCustomerKey, pauseBusinessRequests]
  )

  useEffect(() => {
    profileSyncActiveRef.current = true
    if (!profileInitialSyncStartedRef.current) {
      profileInitialSyncStartedRef.current = true
      loadProfile({ showLoading: true })
    }

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
      profileSyncActiveRef.current = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(profileSyncTimer)
    }
  }, [loadProfile])

  useEffect(() => {
    const handleAdminAuthStorageChange = (event) => {
      if (event.storageArea && event.storageArea !== window.localStorage) {
        return
      }
      if (event.key !== null && !ADMIN_AUTH_STORAGE_KEYS.has(event.key)) {
        return
      }

      setProfileSyncCompleted(false)
      setProfileLoading(true)
      verifiedAccessKeyRef.current = ''
      recoveryPathRef.current = ''
      pauseBusinessRequests()
      setProfileSyncFailure(null)
      setAdminProfile(null)
      profileSyncGenerationRef.current += 1
      profileSyncInFlightRef.current = null
      loadProfile({ showLoading: true })
    }

    window.addEventListener('storage', handleAdminAuthStorageChange)
    return () => {
      window.removeEventListener('storage', handleAdminAuthStorageChange)
    }
  }, [loadProfile, pauseBusinessRequests])

  useEffect(() => {
    adminProfileRef.current = adminProfile
  }, [adminProfile])

  const allowedMenuPaths = useMemo(
    () => normalizeMenuPaths(adminProfile?.menus || []),
    [adminProfile?.menus]
  )

  const visibleSections = useMemo(() => {
    const buildSectionsByAccess = (matchesAccess) =>
      menuNavigationSections
        .map((section) => ({
          ...section,
          items: (section.items || []).filter(matchesAccess),
        }))
        .filter((section) => section.items.length > 0)
    const permissionGovernedSections = buildSectionsByAccess(
      (item) => item.access !== 'authenticated'
    )
    const authenticatedSections = buildSectionsByAccess(
      (item) => item.access === 'authenticated'
    )
    return [
      ...(shouldUseProductCoreNavigation
        ? permissionGovernedSections
        : filterNavigationSectionsByAdminProfile({
            navigationSections: permissionGovernedSections,
            adminProfile,
            allowedMenuPaths,
            isSuperAdmin,
          })),
      ...authenticatedSections,
    ]
  }, [
    adminProfile,
    allowedMenuPaths,
    isSuperAdmin,
    menuNavigationSections,
    shouldUseProductCoreNavigation,
  ])

  const useRoleGuidedNavigation =
    customerNavigationPresentation === 'role_guided' &&
    !isSuperAdmin &&
    !shouldUseProductCoreNavigation
  const sidebarVisibleSections = useMemo(
    () => getSidebarNavigationSections(visibleSections),
    [visibleSections]
  )
  const moduleSidebarSections = useMemo(
    () => projectBusinessModuleSections(sidebarVisibleSections),
    [sidebarVisibleSections]
  )
  const roleGuidedNavigation = useMemo(
    () =>
      projectRoleGuidedModuleNavigation(
        buildRoleGuidedNavigation({
          visibleSections: sidebarVisibleSections,
          adminProfile,
        })
      ),
    [adminProfile, sidebarVisibleSections]
  )

  const permissionGovernedVisibleSections = useMemo(
    () =>
      visibleSections
        .map((section) => ({
          ...section,
          items: (section.items || []).filter(
            (item) => item.access !== 'authenticated'
          ),
        }))
        .filter((section) => section.items.length > 0),
    [visibleSections]
  )
  const desktopHomeEntry = useMemo(
    () =>
      resolveDesktopHomeEntry({
        navigationSections: sidebarVisibleSections,
      }),
    [sidebarVisibleSections]
  )
  const visibleMenuPaths = useMemo(
    () =>
      permissionGovernedVisibleSections.flatMap((section) =>
        (section.items || []).map((item) => item.path).filter(Boolean)
      ),
    [permissionGovernedVisibleSections]
  )

  const effectiveSessionDiagnostic = useMemo(
    () =>
      buildEffectiveSessionDiagnosticSummary({
        adminProfile,
        allowedMenuPaths,
        visibleSections: permissionGovernedVisibleSections,
        isSuperAdmin,
      }),
    [
      adminProfile,
      allowedMenuPaths,
      isSuperAdmin,
      permissionGovernedVisibleSections,
    ]
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

  const currentPageShouldRedirect = useMemo(() => {
    if (currentEntry?.access === 'authenticated') {
      return false
    }
    if (shouldUseProductCoreNavigation) {
      return currentNavigationEntry.matched !== true
    }
    return shouldRedirectFromCurrentNavigation({
      profileLoading,
      adminProfile,
      allowedMenuPaths,
      isSuperAdmin,
      currentMenuPath,
      currentPageKey: currentNavigationEntry.pageKey,
      currentNavigationMatched: currentNavigationEntry.matched,
    })
  }, [
    profileLoading,
    adminProfile,
    allowedMenuPaths,
    isSuperAdmin,
    currentMenuPath,
    currentNavigationEntry.pageKey,
    currentNavigationEntry.matched,
    currentEntry?.access,
    shouldUseProductCoreNavigation,
  ])

  useEffect(() => {
    if (
      customerRuntimeGate !== CUSTOMER_RUNTIME_GATE.READY ||
      !currentPageShouldRedirect
    ) {
      return
    }
    const fallbackPath = visibleSections[0]?.items[0]?.path || ''
    if (fallbackPath && fallbackPath !== location.pathname) {
      navigate(fallbackPath, { replace: true })
    }
  }, [
    currentPageShouldRedirect,
    customerRuntimeGate,
    location.pathname,
    navigate,
    visibleSections,
  ])

  const taskCount = useDesktopTaskCount({
    adminProfile,
    enabled: customerRuntimeGate === CUSTOMER_RUNTIME_GATE.READY &&
      !shouldUseProductCoreNavigation &&
      moduleSidebarSections.some((section) => section.items.some((item) => item.path === '/erp/task-board')),
    pathname: location.pathname,
  })

  const menuItems = useMemo(() => {
    const buildMenuLeaf = (item) => {
      const taskEntry = item.path === '/erp/task-board' && taskCount.enabled
      const icon = navIconRegistry[item.sidebarKey || item.key] || <AppstoreOutlined aria-hidden />
      return {
        key: item.sidebarKey || item.path,
        icon: taskEntry ? (
          <span className="erp-menu-task-icon">
            <span className="erp-menu-task-glyph">{icon}</span>
            <NavigationCountBadge {...taskCount} />
          </span>
        ) : icon,
        label: taskEntry ? (
          <span className="erp-menu-task-label"><span>{item.label}</span><NavigationCountBadge {...taskCount} /></span>
        ) : item.label,
        title: taskEntry ? `${item.label} · ${navigationCountDescription(taskCount)}` : item.label,
        'aria-label': item.label,
        'aria-description': taskEntry ? navigationCountDescription(taskCount) : undefined,
      }
    }
    const buildMenuGroup = (section) => ({
      type: 'group',
      key: `group-${section.key || section.title}`,
      label: section.title,
      children: section.items.map(buildMenuLeaf),
    })

    if (!useRoleGuidedNavigation) {
      const sections = shouldUseProductCoreNavigation
        ? moduleSidebarSections
        : groupSidebarNavigationSections(moduleSidebarSections)
      return sections.map((section) => buildMenuGroup(section))
    }

    const guidedItems = []
    if (roleGuidedNavigation.dashboardItems.length > 0) {
      guidedItems.push({
        type: 'group',
        key: 'group-role-dashboards',
        label: '工作中心',
        children: roleGuidedNavigation.dashboardItems.map(buildMenuLeaf),
      })
    }
    if (roleGuidedNavigation.primaryItems.length > 0) {
      guidedItems.push({
        type: 'group',
        key: 'group-role-primary',
        label: '常用工作',
        children: roleGuidedNavigation.primaryItems.map(buildMenuLeaf),
      })
    }
    guidedItems.push(
      ...roleGuidedNavigation.secondarySections.map((section) =>
        buildMenuGroup(section)
      )
    )
    return guidedItems
  }, [
    roleGuidedNavigation,
    moduleSidebarSections,
    useRoleGuidedNavigation,
    shouldUseProductCoreNavigation,
    taskCount,
  ])

  const currentSidebarPath = getBusinessModuleSidebarKey(
    currentEntry?.sidebarParentPath || currentNavigationEntry.menuPath
  )

  const selectedKeys =
    currentNavigationEntry.matched && currentSidebarPath
      ? [currentSidebarPath]
      : []
  const hideCurrentEntryPageHead = hasSelfContainedBusinessPageHead(
    currentEntry?.path
  )
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

  const registerPageLeaveGuard = useCallback((handler) => {
    if (typeof handler !== 'function') {
      setPageLeaveGuard(null)
      return () => {}
    }

    setPageLeaveGuard(() => handler)
    return () => {
      setPageLeaveGuard((current) => (current === handler ? null : current))
    }
  }, [])

  const updateAdminERPPreferences = useCallback((erpPreferences) => {
    const current = getStoredAdminProfile()
    if (!current) return
    persistAdminERPPreferences(
      {
        column_orders: erpPreferences?.column_orders || {},
        hidden_columns: erpPreferences?.hidden_columns || {},
      },
      { userID: current.id, token: getToken(AUTH_SCOPE.ADMIN) }
    )
  }, [])

  const pageUIState = useMemo(
    () => ({ generation: businessPageGeneration, values: new Map() }),
    [businessPageGeneration]
  )
  const moduleWorkspace = useMemo(
    () => getBusinessModuleTabs(location.pathname, visibleSections),
    [location.pathname, visibleSections]
  )
  useEffect(() => {
    if (!currentPageShouldRedirect) {
      rememberBusinessModuleLocation(pageUIState.values, location)
    }
  }, [currentPageShouldRedirect, location, pageUIState])

  const outletContext = useMemo(
    () => ({
      adminProfile,
      allowedMenuPaths,
      visibleMenuPaths,
      profileSyncCompleted,
      refreshAdminProfile: loadProfile,
      registerPageLeaveGuard,
      registerPageRefresh,
      updateAdminERPPreferences,
      pageUIState,
    }),
    [
      adminProfile,
      allowedMenuPaths,
      visibleMenuPaths,
      profileSyncCompleted,
      loadProfile,
      registerPageLeaveGuard,
      registerPageRefresh,
      updateAdminERPPreferences,
      pageUIState,
    ]
  )

  const handleLogout = async () => {
    if (loggingOut) {
      return
    }
    if (pageLeaveGuard && !(await pageLeaveGuard({ intent: 'logout' }))) return

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
    if (pageLeaveGuard && !(await pageLeaveGuard({ intent: 'refresh' }))) return

    if (!pageRefreshHandler) {
      window.location.reload()
      return
    }

    refreshingCurrentPageRef.current = true
    setRefreshingCurrentPage(true)
    try {
      const refreshed = await pageRefreshHandler()
      if (refreshed !== false) {
        notifyProductImagesChanged()
        taskCount.refresh()
        message.success('当前页面数据已刷新')
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '刷新当前页面数据'))
    } finally {
      refreshingCurrentPageRef.current = false
      setRefreshingCurrentPage(false)
    }
  }

  const handleNavigate = async (nextPath, navigateOptions) => {
    if (!nextPath) {
      setMobileNavOpen(false)
      return
    }
    if (nextPath === location.pathname || nextPath === `${location.pathname}${location.search}${location.hash}`) {
      setMobileNavOpen(false)
      return
    }

    if (pageLeaveGuard && !(await pageLeaveGuard())) {
      return
    }

    navigate(nextPath, navigateOptions)
    setMobileNavOpen(false)
  }

  const handleModuleMenuNavigate = (key) => {
    const items = useRoleGuidedNavigation
      ? [
          ...roleGuidedNavigation.dashboardItems,
          ...roleGuidedNavigation.primaryItems,
          ...roleGuidedNavigation.secondaryItems,
        ]
      : moduleSidebarSections.flatMap((section) => section.items)
    const item = items.find((entry) => (entry.sidebarKey || entry.path) === key)
    if (item) {
      if (item.path === '/erp/task-board' && taskCount.enabled) {
        if (taskCount.error) taskCount.refresh()
        handleNavigate('/erp/task-board?mode=todo')
        return
      }
      handleNavigate(
        resolveBusinessModuleMenuTarget(
          item, location, pageUIState.values, visibleMenuPaths
        )
      )
    }
  }

  const handleAccountMenuClick = async ({ key }) => {
    if (key === 'change-password') {
      if (pageLeaveGuard && !(await pageLeaveGuard({ intent: 'logout' }))) {
        return undefined
      }
      setPasswordModalOpen(true)
      return undefined
    }
    if (key === 'privacy-and-rules') {
      return handleNavigate('/legal/privacy', {
        state: {
          from: `${location.pathname}${location.search}${location.hash}`,
        },
      })
    }
    if (key === 'system-version') {
      setSystemVersionOpen(true)
      return undefined
    }
    if (key === 'switch-entry') {
      return handleNavigate('/entry')
    }
    if (key === 'logout') {
      return handleLogout()
    }
    return undefined
  }

  const renderSideNav = ({ collapsed = false, collapsible = false } = {}) => (
    <div className="erp-admin-sider__body">
      <div className="erp-admin-brand">
        {!collapsed ? (
          <button
            type="button"
            className="erp-admin-brand__home"
            aria-label={`返回首页：${desktopHomeEntry.label || DEFAULT_DESKTOP_ENTRY.label}`}
            title={`返回${desktopHomeEntry.label || DEFAULT_DESKTOP_ENTRY.label}`}
            data-testid="desktop-home-entry"
            onClick={() => handleNavigate(desktopHomeEntry.path)}
          >
            <div className="erp-admin-brand__logo">
              <span className="erp-admin-brand__logo-mark">
                {activeBrand.brandMark}
              </span>
              <div className="erp-admin-brand__logo-copy">
                <div className="erp-admin-brand__logo-title">
                  {activeBrand.companyName}
                </div>
              </div>
            </div>
          </button>
        ) : null}
        {collapsible ? (
          <Button
            type="text"
            icon={
              collapsed ? (
                <MenuUnfoldOutlined aria-hidden />
              ) : (
                <MenuFoldOutlined aria-hidden />
              )
            }
            className="erp-admin-brand__collapse"
            aria-label={collapsed ? '展开侧边菜单' : '收起侧边菜单'}
            title={collapsed ? '展开侧边菜单' : '收起侧边菜单'}
            onClick={() => setDesktopNavCollapsed((current) => !current)}
          />
        ) : null}
      </div>

      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        selectedKeys={selectedKeys}
        items={menuItems}
        onClick={({ key }) => handleModuleMenuNavigate(key)}
        className="erp-admin-menu"
        data-navigation-presentation={
          useRoleGuidedNavigation ? 'role_guided' : 'sectioned'
        }
      />
      <div className="erp-module-catalog-footer">
        <Button
          type="text"
          icon={<AppstoreOutlined aria-hidden />}
          className="erp-module-catalog-trigger"
          aria-label="全部模块"
          title={collapsed ? '全部模块' : undefined}
          onClick={() => setModuleCatalogOpen(true)}
        >
          {collapsed ? null : '全部模块'}
        </Button>
      </div>
    </div>
  )

  const roleLabel = isSuperAdmin
    ? '超级管理员'
    : (adminProfile?.roles || [])
        .map(
          (role) =>
            role?.name || (role?.role_key || role?.key ? '已配置岗位' : '')
        )
        .filter(Boolean)
        .slice(0, 2)
        .join(' / ') || '普通管理员'
  const displayAdminIdentity = formatAdminIdentity(
    adminProfile || tokenAdmin || {},
    { fallback: 'admin' }
  )
  const accountMenuItems = [
    {
      key: 'change-password',
      icon: <KeyOutlined />,
      label: '修改密码',
    },
    {
      key: 'privacy-and-rules',
      icon: <SafetyCertificateOutlined />,
      label: (
        <span data-testid="desktop-privacy-rules-entry">隐私与使用规则</span>
      ),
    },
    {
      key: 'system-version',
      icon: <InfoCircleOutlined />,
      label: <span data-testid="desktop-system-version-entry">系统信息</span>,
    },
    canSwitchToMobileTasks
      ? {
          key: 'switch-entry',
          icon: <SwapOutlined />,
          label: (
            <span data-testid="desktop-work-entry-switch">切换工作入口</span>
          ),
        }
      : null,
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: loggingOut ? '退出中' : '退出登录',
      disabled: loggingOut,
    },
  ].filter(Boolean)
  const noVisibleMenus =
    getSidebarNavigationSections(permissionGovernedVisibleSections).length === 0
  const shouldBlockOutlet = currentPageShouldRedirect
  const shouldGuardProductCoreBusinessData =
    shouldGuardCustomerBusinessPageRuntime({
      effectiveSessionDiagnostic,
      isCustomerBusinessDataPage: isCustomerBusinessDataPageKey(
        currentNavigationEntry.pageKey
      ),
    }) ||
    (isLocalCustomerDesktopPreview &&
      LOCAL_CUSTOMER_PREVIEW_GUARDED_PAGE_KEYS.has(
        currentNavigationEntry.pageKey
      ))

  if (profileLoading && !adminProfile) {
    return (
      <Loading
        title="账号权限加载中"
        description="正在确认当前账号的菜单和访问范围，请稍候..."
        fullscreen
        className="loading-page--erp"
      />
    )
  }

  if (customerRuntimeGate === CUSTOMER_RUNTIME_GATE.BOOTSTRAP) {
    return (
      <div data-customer-runtime-bootstrap="true">
        <Loading
          title="正在进入工作台"
          description="正在准备您的工作内容，请稍候..."
          fullscreen
          className="loading-page--erp"
        />
      </div>
    )
  }

  const retainingBusinessPage =
    profileSyncFailure?.retainPage &&
    profileSyncFailure.path === location.pathname
  if (
    customerRuntimeGate === CUSTOMER_RUNTIME_GATE.UNAVAILABLE ||
    (profileSyncFailure && !retainingBusinessPage)
  ) {
    return (
      <CustomerRuntimeUnavailable
        failure={profileSyncFailure}
        retrying={profileSyncing}
        loggingOut={loggingOut}
        onRetry={() => loadProfile({ showLoading: true })}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <>
      <SessionRecoveryDialog
        open={Boolean(retainingBusinessPage)}
        retrying={profileSyncing}
        onRetry={() => loadProfile({ showLoading: true })}
      />
      <Layout
        className="erp-admin-shell"
        data-effective-session-source={effectiveSessionDiagnostic.source}
        data-effective-session-mode={effectiveSessionDiagnostic.visibilityMode}
        data-effective-session-data-scope={
          effectiveSessionDiagnostic.dataRuntimeScope
        }
      >
        <Sider
          width={206}
          collapsedWidth={64}
          collapsed={desktopNavCollapsed}
          trigger={null}
          className="erp-admin-sider"
          data-sidebar-collapsed={desktopNavCollapsed}
        >
          {renderSideNav({
            collapsed: desktopNavCollapsed,
            collapsible: true,
          })}
        </Sider>

        <Drawer
          placement="left"
          width={240}
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          className="erp-admin-drawer"
        >
          {renderSideNav()}
        </Drawer>

        <Layout>
          <Header className="erp-admin-header">
            <div className="erp-admin-header__row">
              <Space
                align="center"
                size={10}
                className="erp-admin-header__left"
              >
                <Button
                  icon={<MenuOutlined />}
                  aria-label="打开导航菜单"
                  className="erp-admin-header__menu-button"
                  onClick={() => setMobileNavOpen(true)}
                />
                {!hideCurrentEntryPageHead ? (
                  <Breadcrumb
                    className="erp-admin-breadcrumb"
                    items={[
                      {
                        title: (
                          <strong>
                            {currentEntry?.label ||
                              DEFAULT_DESKTOP_ENTRY.label}
                          </strong>
                        ),
                      },
                    ]}
                  />
                ) : null}
              </Space>

              <Space size={7} className="erp-admin-header__right">
                <Button
                  icon={<ReloadOutlined />}
                  loading={refreshingCurrentPage}
                  onClick={handleRefreshCurrentPage}
                  aria-label="刷新当前页"
                >
                  <span className="erp-admin-header__refresh-label">刷新</span>
                </Button>
                <ERPThemeToggle
                  className="erp-admin-header__theme-toggle"
                />
                <div className="erp-admin-header__meta">
                  <Tag color={isSuperAdmin ? 'gold' : 'blue'}>{roleLabel}</Tag>
                  <Dropdown
                    destroyOnHidden
                    placement="bottomRight"
                    trigger={['click']}
                    menu={{
                      items: accountMenuItems,
                      onClick: handleAccountMenuClick,
                    }}
                  >
                    <Button
                      className="erp-admin-header__account"
                      icon={<UserOutlined />}
                      loading={loggingOut}
                      data-testid="desktop-account-menu-trigger"
                      aria-label={`账号菜单：${displayAdminIdentity}`}
                    >
                      <span className="erp-admin-header__account-name">
                        {displayAdminIdentity}
                      </span>
                      <DownOutlined />
                    </Button>
                  </Dropdown>
                </div>
              </Space>
            </div>
          </Header>

          <Content className="erp-admin-content">
            {!retainingBusinessPage ? legalNotice : null}
            {isLocalCustomerDesktopPreview ? (
              <Alert
                type="warning"
                showIcon
                data-local-customer-desktop-preview="true"
                message="本地功能预览"
                description="当前尚未启用客户业务设置，只能查看页面和功能；工作台、任务管理和业务数据暂时不能使用。"
              />
            ) : null}

            {!hidePageHead ? (
              <div className="erp-admin-page-head">
                <div className="erp-admin-page-head__main">
                  <div className="erp-admin-page-head__title">
                    {currentEntry?.label || DEFAULT_DESKTOP_ENTRY.label}
                  </div>
                </div>
              </div>
            ) : null}

            <div
              className={`erp-admin-outlet${
                moduleWorkspace && !shouldBlockOutlet && !shouldGuardProductCoreBusinessData
                  ? ' erp-admin-outlet--module'
                  : ''
              }`}
            >
              {!shouldBlockOutlet && !shouldGuardProductCoreBusinessData ? (
                <BusinessModuleTabs
                  workspace={moduleWorkspace}
                  cache={pageUIState.values}
                  onNavigate={handleNavigate}
                />
              ) : null}
              {shouldBlockOutlet ? (
                <Alert
                  type="warning"
                  showIcon
                  message={
                    noVisibleMenus ? '当前账号暂无可用页面' : '当前页面不可用'
                  }
                  description={
                    noVisibleMenus
                      ? '请确认当前账号已设置正确的岗位和可用页面。若刷新后仍无入口，请联系管理员。'
                      : '正在返回当前账号可用的页面。'
                  }
                />
              ) : shouldGuardProductCoreBusinessData ? (
                <ProductCoreCapabilityReview currentEntry={currentEntry} />
              ) : (
                <Outlet context={outletContext} key={businessPageGeneration} />
              )}
            </div>
          </Content>
        </Layout>
      </Layout>
      {passwordModalOpen ? (
        <AccountPasswordModal onClose={() => setPasswordModalOpen(false)} />
      ) : null}
      <SystemVersionModal
        buildIdentity={runtimeBuildIdentity}
        onClose={() => setSystemVersionOpen(false)}
        open={systemVersionOpen}
      />
      <ModuleCatalogModal
        open={moduleCatalogOpen}
        sections={
          shouldUseProductCoreNavigation
            ? sidebarVisibleSections
            : groupSidebarNavigationSections(sidebarVisibleSections, {
                pageCatalog: true,
              })
        }
        currentPath={
          currentEntry?.sidebarParentPath || currentNavigationEntry.menuPath
        }
        onClose={() => setModuleCatalogOpen(false)}
        onNavigate={(path) => {
          setModuleCatalogOpen(false)
          handleNavigate(path)
        }}
      />
    </>
  )
}
