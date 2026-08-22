import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  MenuOutlined,
  QuestionCircleOutlined,
  RightOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Popover,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { Loading } from '@/common/components/loading'
import { RpcErrorCode } from '@/common/consts/errorCodes'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError, JsonRpc } from '@/common/utils/jsonRpc'
import {
  ADMIN_ACCOUNT_STATUS,
  ADMIN_STATUS_FILTERS,
  filterAdminRecords,
  getAdminAccountStatus,
} from '../utils/permissionCenterSearch.mjs'
import {
  isValidMainlandMobilePhone,
  optionalMainlandMobilePhoneRule,
} from '../utils/contactValidation.mjs'
import { adminPasswordPolicyRule } from '../utils/adminPasswordPolicy.mjs'
import {
  ADMIN_USERNAME_MAX_LENGTH,
  ADMIN_USERNAME_RULE_TEXT,
  getAdminUsernameValidationMessage,
} from '../utils/adminUsername.mjs'
import {
  findAdminsWithDisplayName,
  formatAdminIdentity,
  getAdminDisplayName,
} from '../utils/adminIdentity.mjs'
import {
  getPermissionModuleTitle,
  UNCLASSIFIED_PERMISSION_MODULE_TITLE,
} from '../utils/permissionModuleLabels.mjs'
import {
  buildAssignableRoleOptions,
  filterAssignableBusinessPermissions,
  getAdminControlTargetBlockReason,
  getAdminProfileTargetBlockReason,
  getPermissionCenterRoleVersion,
  getRoleAssignmentBlockReason,
  getRolePermissionReadOnlyReason,
  getRoleTypeLabel,
  isSameAdminAccount,
  normalizePermissionUsage,
} from '../utils/permissionCenterAccess.mjs'
import {
  createPermissionCenterAdminDialogState,
  nextPermissionCenterAdminPagination,
  PERMISSION_CENTER_ADMIN_DIALOG,
  permissionCenterAdminDialogReducer,
} from '../utils/permissionCenterAdminDialog.mjs'
import {
  buildLocalPermissionDraftAccess,
  getMenuPlacementMap,
  getPermissionMenuLinks,
  menuRequirementsSatisfied,
  normalizePermissionMenuOptions,
  reconcilePermissionSelection,
} from '../utils/permissionMenuProjection.mjs'
import { getRoleDisplayName } from '../utils/roleKeys.mjs'
import {
  getAuthenticatedNavigationSections,
  getNavigationSections,
} from '../config/seedData.mjs'
import {
  buildRoleGuidedNavigationPreview,
  buildRoleGuidedSecondarySections,
  isRoleNavigationCustomizablePath,
  MAX_ROLE_PRIMARY_LIMIT,
  normalizeRoleNavigationSettings,
  reconcileRoleNavigationPaths,
  ROLE_NAVIGATION_MODES,
} from '../config/roleGuidedNavigation.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import ApprovalResponsibilityPanel from './ApprovalResponsibilityPanel.jsx'

const { Paragraph, Text, Title } = Typography

const TABLE_PAGE_SIZE_OPTIONS = ['8', '10', '20', '50', '100']
const DEFAULT_TABLE_PAGE_SIZE = 8
const IS_PRODUCTION_BUILD = import.meta.env.PROD === true
const READ_USER_PERMISSION = 'system.user.read'
const READ_ROLE_PERMISSION = 'system.role.read'
const READ_PERMISSION_PERMISSION = 'system.permission.read'
const READ_CUSTOMER_CONFIG_PERMISSION = 'customer_config.read'
const PUBLISH_CUSTOMER_CONFIG_PERMISSION = 'customer_config.publish'
const ACTIVATE_CUSTOMER_CONFIG_PERMISSION = 'customer_config.activate'
const MANAGE_ROLE_PERMISSION = 'system.role.permission.manage'
const UPDATE_USER_PERMISSION = 'system.user.update'
const ASSIGN_USER_ROLE_PERMISSION = 'system.user.role.assign'
const CREATE_USER_PERMISSION = 'system.user.create'
const DISABLE_USER_PERMISSION = 'system.user.disable'
const REVOKE_USER_PERMISSION = 'system.user.revoke'
const PERMISSION_CENTER_TAB_KEYS = {
  ROLES: 'roles',
  ADMINS: 'admins',
  APPROVALS: 'approvals',
}
const ROLE_NAVIGATION_VIEW_KEYS = {
  LAYOUT: 'layout',
  ACCESS: 'access',
}
const ROLE_PAGE_ACCESS_FILTERS = {
  ALL: 'all',
  EFFECTIVE: 'effective',
  BLOCKED: 'blocked',
}

const adminStatusOptions = [
  { label: '全部状态', value: ADMIN_STATUS_FILTERS.ALL },
  { label: '启用', value: ADMIN_STATUS_FILTERS.ACTIVE },
  { label: '临时停用', value: ADMIN_STATUS_FILTERS.SUSPENDED },
  { label: '已注销', value: ADMIN_STATUS_FILTERS.REVOKED },
  { label: '超级管理员', value: ADMIN_STATUS_FILTERS.SUPER },
]

function normalizeStringList(values = []) {
  return Array.isArray(values)
    ? values.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function buildPermissionSignature(values = []) {
  return normalizeStringList(values).sort().join('\n')
}

function getRoleWarehouseScope(role = {}) {
  const scope = (Array.isArray(role?.data_scopes) ? role.data_scopes : []).find(
    (item) => item?.resource_type === 'warehouse'
  )
  const mode = ['ALL', 'ASSIGNED', 'NONE'].includes(scope?.mode)
    ? scope.mode
    : 'NONE'
  const warehouseIds = Array.isArray(scope?.resource_ids)
    ? [...new Set(scope.resource_ids.map(Number).filter((id) => id > 0))].sort(
        (left, right) => left - right
      )
    : []
  return {
    mode: mode === 'ASSIGNED' && warehouseIds.length === 0 ? 'NONE' : mode,
    warehouseIds: mode === 'ASSIGNED' ? warehouseIds : [],
  }
}

function buildWarehouseScopeSignature(mode, warehouseIds = []) {
  return `${mode}:${warehouseIds
    .map(Number)
    .filter((id) => id > 0)
    .sort((a, b) => a - b)
    .join(',')}`
}

function buildRoleNavigationSignature(
  mode,
  primaryMenuPaths = [],
  secondaryMenuPaths = []
) {
  const normalizedMode =
    mode === ROLE_NAVIGATION_MODES.CUSTOM
      ? ROLE_NAVIGATION_MODES.CUSTOM
      : ROLE_NAVIGATION_MODES.RECOMMENDED
  const normalizedPaths =
    normalizedMode === ROLE_NAVIGATION_MODES.CUSTOM
      ? normalizeStringList(primaryMenuPaths)
      : []
  const normalizedSecondaryPaths =
    normalizedMode === ROLE_NAVIGATION_MODES.CUSTOM
      ? normalizeStringList(secondaryMenuPaths)
      : []
  return `${normalizedMode}:${normalizedPaths.join('\n')}:${normalizedSecondaryPaths.join('\n')}`
}

function getEffectiveRoleNavigationPathSet(access = null) {
  return new Set(
    (Array.isArray(access?.pages) ? access.pages : [])
      .filter(
        (page) =>
          page?.effective === true &&
          isRoleNavigationCustomizablePath(page?.path)
      )
      .map((page) => String(page?.path || '').trim())
      .filter(Boolean)
  )
}

function buildRoleNavigationOptions(access = null, selectedPaths = []) {
  const navigationItems = [
    ...getNavigationSections(),
    ...getAuthenticatedNavigationSections(),
  ].flatMap((section, sectionIndex) =>
    (Array.isArray(section?.items) ? section.items : []).map((item) => ({
      ...item,
      navigationSectionKey:
        String(section?.key || '').trim() ||
        String(item?.navigationSectionKey || item?.sectionKey || '').trim(),
      navigationSectionTitle:
        String(section?.title || '').trim() ||
        String(item?.navigationSectionTitle || item?.sectionTitle || '').trim(),
      navigationSectionOrder: sectionIndex,
    }))
  )
  const itemByPath = new Map(
    navigationItems
      .filter((item) => isRoleNavigationCustomizablePath(item?.path))
      .map((item) => [item.path, item])
  )
  const effectivePaths = getEffectiveRoleNavigationPathSet(access)
  const paths = [
    ...effectivePaths,
    ...normalizeStringList(selectedPaths).filter(
      (path) => !effectivePaths.has(path)
    ),
  ]
  return paths.map((path) => {
    const item = itemByPath.get(path)
    const effective = effectivePaths.has(path)
    return {
      value: path,
      label: item?.label || path,
      effective,
      menuItem: item || {
        path,
        label: path,
        navigationSectionTitle: '其他功能',
      },
    }
  })
}

function getRoleKey(role = {}) {
  return String(role?.role_key || role?.key || '').trim()
}

function RoleNavigationEditor({
  mode = ROLE_NAVIGATION_MODES.RECOMMENDED,
  primaryMenuPaths = [],
  secondaryMenuPaths = [],
  options = [],
  disabled = false,
  unavailablePaths = [],
  onModeChange,
  onPrimaryMenuPathsChange,
  onSecondaryMenuPathsChange,
  onViewPageAccess,
}) {
  const optionMap = new Map(options.map((option) => [option.value, option]))
  const customDisabled = disabled || mode !== ROLE_NAVIGATION_MODES.CUSTOM
  const [announcement, setAnnouncement] = useState('')
  const buildSecondaryItem = (path) => {
    const option = optionMap.get(path)
    return {
      ...(option?.menuItem || {}),
      path,
      label: option?.label || path,
    }
  }
  const buildSecondaryPathGroups = (paths = []) =>
    buildRoleGuidedSecondarySections(paths.map(buildSecondaryItem)).map(
      (section) => ({
        ...section,
        paths: section.items.map((item) => item.path),
      })
    )
  const secondaryPathGroups = buildSecondaryPathGroups(secondaryMenuPaths)
  const normalizeSecondaryPaths = (paths = []) =>
    buildSecondaryPathGroups(paths).flatMap((section) => section.paths)
  const updateSecondaryPaths = (paths = []) =>
    onSecondaryMenuPathsChange?.(normalizeSecondaryPaths(paths))

  const moveWithin = (
    paths,
    onChange,
    path,
    offset,
    groupLabel,
    groupPaths = paths
  ) => {
    const currentGroupIndex = groupPaths.indexOf(path)
    const nextGroupIndex = currentGroupIndex + offset
    if (
      currentGroupIndex < 0 ||
      nextGroupIndex < 0 ||
      nextGroupIndex >= groupPaths.length
    ) {
      return
    }
    const targetPath = groupPaths[nextGroupIndex]
    const currentIndex = paths.indexOf(path)
    const targetIndex = paths.indexOf(targetPath)
    if (currentIndex < 0 || targetIndex < 0) {
      return
    }
    const nextPaths = [...paths]
    ;[nextPaths[currentIndex], nextPaths[targetIndex]] = [
      nextPaths[targetIndex],
      nextPaths[currentIndex],
    ]
    onChange?.(nextPaths)
    const label = optionMap.get(path)?.label || path
    setAnnouncement(`${label}已在${groupLabel}${offset < 0 ? '上移' : '下移'}`)
  }

  const moveToSecondary = (path) => {
    if (primaryMenuPaths.length <= 1) {
      return
    }
    onPrimaryMenuPathsChange?.(primaryMenuPaths.filter((item) => item !== path))
    updateSecondaryPaths([...secondaryMenuPaths, path])
    setAnnouncement(`${optionMap.get(path)?.label || path}已移到更多功能`)
  }

  const moveToPrimary = (path) => {
    if (primaryMenuPaths.length >= MAX_ROLE_PRIMARY_LIMIT) {
      message.warning(`常用工作最多选择 ${MAX_ROLE_PRIMARY_LIMIT} 个页面`)
      return
    }
    updateSecondaryPaths(secondaryMenuPaths.filter((item) => item !== path))
    onPrimaryMenuPathsChange?.([...primaryMenuPaths, path])
    setAnnouncement(`${optionMap.get(path)?.label || path}已移到常用工作`)
  }

  const renderOrderedList = ({
    key,
    title,
    description,
    paths,
    onChange,
    moveLabel,
    onMove,
    moveDisabled,
    pathGroups = [],
  }) => {
    const renderedGroups =
      pathGroups.length > 0
        ? pathGroups
        : [{ key: `${key}-all`, title: '', paths }]
    return (
      <section
        className="erp-role-navigation-editor__column"
        data-navigation-group={key}
        aria-label={title}
      >
        <div className="erp-role-navigation-editor__column-head">
          <div>
            <Text strong>{title}</Text>
            <Text type="secondary">{description}</Text>
          </div>
          <Tag>{paths.length} 项</Tag>
        </div>
        <div className="erp-role-navigation-editor__order">
          {paths.length > 0 ? (
            renderedGroups.map((pathGroup) => (
              <div
                key={pathGroup.key}
                className="erp-role-navigation-editor__order-group"
                role={pathGroup.title ? 'group' : undefined}
                aria-label={pathGroup.title || undefined}
              >
                {pathGroup.title ? (
                  <div className="erp-role-navigation-editor__order-group-title">
                    <Text strong>{pathGroup.title}</Text>
                    <Text type="secondary">{pathGroup.paths.length} 项</Text>
                  </div>
                ) : null}
                {pathGroup.paths.map((path, index) => {
                  const option = optionMap.get(path)
                  const label = option?.label || path
                  return (
                    <div
                      key={path}
                      className="erp-role-navigation-editor__order-item"
                      data-navigation-path={path}
                    >
                      <span>
                        <Text strong>{index + 1}</Text>
                        <Text>{label}</Text>
                        {option?.effective === false ? (
                          <Tag color="orange">当前不可进入</Tag>
                        ) : null}
                      </span>
                      <Space size={4}>
                        <Button
                          size="small"
                          disabled={customDisabled || index === 0}
                          aria-label={`上移 ${label}`}
                          onClick={() =>
                            moveWithin(
                              paths,
                              onChange,
                              path,
                              -1,
                              pathGroup.title || title,
                              pathGroup.paths
                            )
                          }
                        >
                          上移
                        </Button>
                        <Button
                          size="small"
                          disabled={
                            customDisabled ||
                            index === pathGroup.paths.length - 1
                          }
                          aria-label={`下移 ${label}`}
                          onClick={() =>
                            moveWithin(
                              paths,
                              onChange,
                              path,
                              1,
                              pathGroup.title || title,
                              pathGroup.paths
                            )
                          }
                        >
                          下移
                        </Button>
                        <Button
                          size="small"
                          disabled={
                            customDisabled ||
                            option?.effective === false ||
                            moveDisabled
                          }
                          aria-label={`${moveLabel} ${label}`}
                          onClick={() => onMove(path)}
                        >
                          {moveLabel}
                        </Button>
                      </Space>
                    </div>
                  )
                })}
              </div>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前没有页面"
            />
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="erp-role-navigation-editor">
      <div className="erp-role-navigation-editor__head">
        <div>
          <Text strong>设置岗位菜单布局</Text>
          <Paragraph type="secondary">
            页面和操作权限决定“能不能用”；这里把每个最终可进入页面放入常用工作或更多功能，更多功能与管理员菜单使用相同模块分组。
          </Paragraph>
        </div>
        <Select
          aria-label="岗位导航排列方式"
          value={mode}
          disabled={disabled}
          onChange={onModeChange}
          options={[
            {
              value: ROLE_NAVIGATION_MODES.RECOMMENDED,
              label: '系统推荐',
            },
            {
              value: ROLE_NAVIGATION_MODES.CUSTOM,
              label: '自定义布局',
            },
          ]}
        />
      </div>
      {mode === ROLE_NAVIGATION_MODES.RECOMMENDED ? (
        <Alert
          type="info"
          showIcon
          message="系统按岗位推荐高频页面"
          description="财务默认显示应收、应付、发票和对账；其他岗位默认显示约 3 个高频页面，其余页面按系统顺序进入更多功能。看板始终在最前，岗位帮助始终在最后。"
        />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            常用工作需保留 1–{MAX_ROLE_PRIMARY_LIMIT}{' '}
            项；使用按钮可仅靠键盘完成跨区移动，更多功能只调整同一菜单分组内的顺序。
          </Text>
          {unavailablePaths.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message="有菜单入口已不在当前最终权限中"
              description="请移除标记为“当前不可进入”的页面后再保存；系统运行时也不会显示这些入口。"
              action={
                <Button size="small" onClick={onViewPageAccess}>
                  查看不可进入原因
                </Button>
              }
            />
          ) : null}
          <div className="erp-role-navigation-editor__columns">
            {renderOrderedList({
              key: 'primary',
              title: '常用工作',
              description: `最多 ${MAX_ROLE_PRIMARY_LIMIT} 项`,
              paths: primaryMenuPaths,
              onChange: onPrimaryMenuPathsChange,
              moveLabel: '移到更多',
              onMove: moveToSecondary,
              moveDisabled: primaryMenuPaths.length <= 1,
            })}
            {renderOrderedList({
              key: 'secondary',
              title: '更多功能',
              description: '其余页面沿用管理员菜单分组',
              paths: secondaryMenuPaths,
              onChange: updateSecondaryPaths,
              moveLabel: '移到常用',
              onMove: moveToPrimary,
              moveDisabled: primaryMenuPaths.length >= MAX_ROLE_PRIMARY_LIMIT,
              pathGroups: secondaryPathGroups,
            })}
          </div>
          <span className="erp-sr-only" aria-live="polite">
            {announcement}
          </span>
        </Space>
      )}
    </div>
  )
}

function getRoleVisibleName(role = {}) {
  const name = String(role?.name || '').trim()
  if (name) {
    return name
  }
  return getRoleDisplayName(getRoleKey(role), '已配置岗位')
}

function getPermissionKey(permission = {}) {
  return String(
    permission?.permission_key || permission?.key || permission || ''
  ).trim()
}

function getPermissionVisibleName(permission = {}) {
  const name = String(permission?.name || '').trim()
  return name || '其他功能'
}

function roleKeysForAdmin(admin = {}) {
  return normalizeStringList((admin.roles || []).map(getRoleKey))
}

function permissionKeysForRole(role = {}) {
  return normalizeStringList(role.permissions || [])
}

function hasPermission(admin = {}, permissionKey = '') {
  if (admin?.is_super_admin === true) {
    return true
  }
  return normalizeStringList(admin?.permissions || []).includes(permissionKey)
}

function buildPermissionGroups(permissions = [], menuOptions = []) {
  const groups = new Map()
  const sourcePermissions = Array.isArray(permissions) ? permissions : []
  sourcePermissions.forEach((permission) => {
    const permissionKey = getPermissionKey(permission)
    if (!permissionKey) {
      return
    }
    const rawModuleKey =
      String(permission.module || 'unclassified').trim() || 'unclassified'
    const moduleTitle = getPermissionModuleTitle(permission.module_name)
    const moduleKey =
      moduleTitle === UNCLASSIFIED_PERMISSION_MODULE_TITLE
        ? 'unclassified'
        : rawModuleKey
    const group = groups.get(moduleKey) || {
      key: moduleKey,
      title: moduleTitle,
      items: [],
    }
    group.items.push({
      key: permissionKey,
      label: getPermissionVisibleName(permission),
      description: permission.description || '',
      action: String(permission.action || '').trim(),
      usage: normalizePermissionUsage(permission.usage || {}),
      menuLinks: getPermissionMenuLinks(permission, menuOptions),
    })
    groups.set(moduleKey, group)
  })
  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((left, right) => left.key.localeCompare(right.key)),
  }))
}

function buildPermissionDetailMap(permissions = [], menuOptions = []) {
  const detailMap = new Map()
  const sourcePermissions = Array.isArray(permissions) ? permissions : []
  sourcePermissions.forEach((permission) => {
    const permissionKey = getPermissionKey(permission)
    if (!permissionKey) {
      return
    }
    detailMap.set(permissionKey, {
      key: permissionKey,
      label: getPermissionVisibleName(permission),
      module: String(permission.module || 'other').trim() || 'other',
      action: String(permission.action || '').trim(),
      resource: String(permission.resource || '').trim(),
      usage: normalizePermissionUsage(permission.usage || {}),
      menuLinks: getPermissionMenuLinks(permission, menuOptions),
    })
  })
  return detailMap
}

function PermissionImpactMap({ permissions = [], permissionKeys = [] }) {
  const selected = normalizeStringList(permissionKeys)
    .map((key) => permissions.find((item) => item.key === key))
    .filter(Boolean)
  const rows = selected.map((permission, index) => ({
    ...permission,
    rowID: `permission-impact-${index + 1}`,
    pages: Array.isArray(permission.usage?.pages) ? permission.usage.pages : [],
  }))

  const uniqueLabels = (values = []) => [
    ...new Set(values.map((item) => String(item || '').trim()).filter(Boolean)),
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="页面可进入，不等于页面内所有操作都可用"
        description="查看、创建、修改、审核、过账和取消分别控制；最终还要结合公司当前启用范围、数据范围、单据状态和任务负责人。"
      />
      <Table
        rowKey="rowID"
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: <Empty description="当前岗位尚未选择功能" /> }}
        columns={[
          { title: '功能', dataIndex: 'label', width: 220 },
          {
            title: '适用页面',
            dataIndex: 'pages',
            render: (items, record) => {
              const pageLabels = uniqueLabels(
                items.map((item) => item.pageLabel)
              )
              if (pageLabels.length === 0) {
                return record.usage?.backendOnly ? (
                  <Text type="secondary">不对应单独页面</Text>
                ) : (
                  <Text type="secondary">尚未登记明确页面</Text>
                )
              }
              return (
                <Space wrap size={[4, 4]}>
                  {pageLabels.map((label) => (
                    <Tag key={label}>{label}</Tag>
                  ))}
                </Space>
              )
            },
          },
          {
            title: '页面区域',
            width: 180,
            render: (_, record) => {
              const sectionLabels = uniqueLabels(
                record.pages.map((item) => item.sectionLabel)
              )
              return sectionLabels.length > 0
                ? sectionLabels.join('、')
                : '页面通用区域'
            },
          },
          {
            title: '可用操作',
            width: 190,
            render: (_, record) => {
              const actionLabels = uniqueLabels(
                record.pages.map((item) => item.actionLabel)
              )
              return (
                actionLabels.join('、') ||
                record.usage?.defaultActionLabel ||
                '进入页面后可使用'
              )
            },
          },
          {
            title: '使用限制',
            render: (_, record) => (
              <Text type="secondary">
                {record.usage?.restrictions?.length > 0
                  ? record.usage.restrictions.join('；')
                  : '以公司当前设置、业务状态和任务负责人为准'}
              </Text>
            ),
          },
        ]}
      />
    </Space>
  )
}

function EffectiveRoleAccessOverview({ access = null, loading = false }) {
  const [pageFilter, setPageFilter] = useState(ROLE_PAGE_ACCESS_FILTERS.ALL)
  const pages = Array.isArray(access?.pages) ? access.pages : []
  const effectiveCount = pages.filter((item) => item?.effective === true).length
  const blockedCount = pages.length - effectiveCount
  const pageRows = pages
    .map((item, index) => ({
      ...item,
      rowID: `effective-page-${index + 1}`,
    }))
    .filter((item) => {
      if (pageFilter === ROLE_PAGE_ACCESS_FILTERS.EFFECTIVE) {
        return item.effective === true
      }
      if (pageFilter === ROLE_PAGE_ACCESS_FILTERS.BLOCKED) {
        return item.effective !== true
      }
      return true
    })
  const sourceLabel =
    access?.source === 'local_permission_draft'
      ? '岗位菜单草稿'
      : access?.is_preview === true
        ? '未保存岗位草稿'
        : access?.source === 'active_customer_config_revision'
          ? '当前客户已启用版本'
          : access?.source === 'control_plane_rbac'
            ? '系统管理权限'
            : access?.source === 'builtin_rbac_fallback'
              ? '产品默认权限预览'
              : access?.source === 'role_disabled'
                ? '岗位已停用'
                : '缺少当前客户启用版本'

  return (
    <Space
      className="erp-role-effective-access"
      direction="vertical"
      size={12}
      style={{ width: '100%' }}
    >
      <Alert
        type={access?.is_final === true ? 'success' : 'warning'}
        showIcon
        message={`${sourceLabel}：${effectiveCount} 个最终可进入页面`}
        description={
          access?.is_preview === true
            ? '已按公司当前启用设置核对；这是未保存草稿，保存后才生效。页面内每项操作仍会单独校验。'
            : access?.config_revision
              ? '已按公司当前启用设置核对。可进入只表示具备页面入口，页面内每项操作仍会单独校验。'
              : '这里不会把岗位基础权限或未保存的勾选冒充为客户最终权限。'
        }
        action={
          access?.config_revision ? (
            <Popover
              title="当前配置版本"
              content={
                <div className="erp-role-effective-access__revision">
                  <Text copyable={{ text: access.config_revision }}>
                    {access.config_revision}
                  </Text>
                </div>
              }
              trigger="click"
            >
              <Button size="small">查看配置版本</Button>
            </Popover>
          ) : null
        }
      />
      <div className="erp-role-effective-access__toolbar">
        <Segmented
          aria-label="筛选页面可用范围"
          value={pageFilter}
          onChange={setPageFilter}
          options={[
            {
              label: `全部 ${pages.length}`,
              value: ROLE_PAGE_ACCESS_FILTERS.ALL,
            },
            {
              label: `可进入 ${effectiveCount}`,
              value: ROLE_PAGE_ACCESS_FILTERS.EFFECTIVE,
            },
            {
              label: `不可进入 ${blockedCount}`,
              value: ROLE_PAGE_ACCESS_FILTERS.BLOCKED,
            },
          ]}
        />
        <Text type="secondary">
          当前显示 {pageRows.length} / {pages.length} 个页面
        </Text>
      </div>
      <Table
        rowKey="rowID"
        className="erp-role-effective-access__table"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={pageRows}
        scroll={{ x: 720 }}
        locale={{ emptyText: <Empty description="暂无最终权限解释" /> }}
        columns={[
          { title: '页面', dataIndex: 'label', width: 190 },
          {
            title: '岗位已选功能',
            dataIndex: 'rbac_granted',
            width: 130,
            render: (value) =>
              value === true ? (
                <Tag color="blue">已具备</Tag>
              ) : (
                <Tag>未具备</Tag>
              ),
          },
          {
            title: '当前页面结果',
            dataIndex: 'effective',
            width: 130,
            render: (value) =>
              value === true ? (
                <Tag color="green">可进入</Tag>
              ) : (
                <Tag color="red">不可进入</Tag>
              ),
          },
          {
            title: '原因',
            dataIndex: 'reasons',
            render: (reasons = []) =>
              Array.isArray(reasons) && reasons.length > 0
                ? reasons
                    .map((reason) => reason?.label)
                    .filter(Boolean)
                    .join('；')
                : '已符合公司当前设置和岗位功能要求',
          },
        ]}
      />
    </Space>
  )
}

function NavigationPlacementOverview({
  access = null,
  roleKey = '',
  navigationMode = ROLE_NAVIGATION_MODES.RECOMMENDED,
  primaryMenuPaths = [],
  secondaryMenuPaths = [],
  dirty = false,
  loading = false,
}) {
  const normalizedRoleKey = String(roleKey || '').trim()
  const accessRoleKey = String(access?.role_key || '').trim()
  if (
    loading ||
    (normalizedRoleKey && accessRoleKey && normalizedRoleKey !== accessRoleKey)
  ) {
    return (
      <Alert
        type="info"
        showIcon
        message="正在读取已保存的导航位置"
        description="读取完成后再按该岗位当前草稿的页面权限生成预览。"
      />
    )
  }

  if (access?.is_final !== true) {
    return (
      <Alert
        type="warning"
        showIcon
        message="暂不能生成岗位导航预览"
        description="需要先核对公司当前启用范围，完成后会显示岗位导航预览。"
      />
    )
  }

  const placement = buildRoleGuidedNavigationPreview({
    navigationSections: [
      ...getNavigationSections(),
      ...getAuthenticatedNavigationSections(),
    ],
    effectiveAccess: access,
    roleKey,
    navigationMode,
    primaryMenuPaths,
    secondaryMenuPaths,
  })
  const moreItems = placement.secondaryItems
  const groups = [
    {
      key: 'dashboards',
      title: '看板中心',
      description: '每天开始工作的统一入口',
      items: placement.dashboardItems,
    },
    {
      key: 'primary',
      title: '常用工作',
      description: '岗位高频业务',
      items: placement.primaryItems,
    },
    {
      key: 'more',
      title: `更多功能（${moreItems.length}）`,
      description: '其余页面沿用管理员菜单分组，岗位帮助固定在最后',
      items: moreItems,
      sections: placement.secondarySections,
    },
  ]
  const moreItemOrder = new Map(
    placement.secondarySections
      .flatMap((section) => section.items)
      .map((item, index) => [item.path, index + 1])
  )

  return (
    <div className="erp-role-navigation-preview">
      <div className="erp-role-navigation-preview__head">
        <div>
          <Text strong>导航位置预览</Text>
          <Paragraph type="secondary">
            看板固定在最前；常用入口只从当前最终可进入页面中排列，更多功能沿用管理员菜单分组且不会增加权限。
          </Paragraph>
        </div>
        <Tag
          color={
            navigationMode === ROLE_NAVIGATION_MODES.CUSTOM ? 'purple' : 'green'
          }
        >
          {navigationMode === ROLE_NAVIGATION_MODES.CUSTOM
            ? '自定义布局'
            : '系统推荐'}
        </Tag>
      </div>
      {dirty ? (
        <Alert
          type="warning"
          showIcon
          message="当前显示尚未保存的布局草稿"
          description="功能权限、常用入口和顺序都会立即预览；保存岗位设置后才会对相关账号生效。"
        />
      ) : null}
      <div className="erp-role-navigation-preview__grid">
        {groups.map((group) => (
          <div key={group.key} className="erp-role-navigation-preview__group">
            <Text strong>{group.title}</Text>
            <Text type="secondary">{group.description}</Text>
            {group.key === 'more' && group.sections.length > 0 ? (
              <div className="erp-role-navigation-preview__subgroups">
                {group.sections.map((section) => (
                  <div
                    key={section.key}
                    className="erp-role-navigation-preview__subgroup"
                    data-navigation-section={section.key}
                  >
                    <Text strong>{section.title}</Text>
                    <div className="erp-role-navigation-preview__items">
                      {section.items.map((item) => (
                        <Tag key={item.path}>
                          {moreItemOrder.get(item.path)}. {item.label}
                        </Tag>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="erp-role-navigation-preview__items">
                {group.items.length > 0 ? (
                  group.items.map((item, index) => (
                    <Tag key={item.path} color="blue">
                      {index + 1}. {item.label}
                    </Tag>
                  ))
                ) : (
                  <Text type="secondary">当前没有可显示页面</Text>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DataScopeOverview({
  mode,
  warehouseIds,
  warehouseOptions,
  disabled,
  onModeChange,
  onWarehouseIdsChange,
}) {
  return (
    <div className="erp-role-policy-boundary">
      <Alert
        type="info"
        showIcon
        message="仓库与库存查看范围已生效"
        description="可选择全部仓库、指定仓库或不允许查看；选择指定仓库但未勾选具体仓库时，将按不允许查看处理。"
      />
      <div className="erp-role-policy-boundary__grid">
        <div>
          <Text strong>仓库范围模式</Text>
          <Select
            value={mode}
            disabled={disabled}
            style={{ width: '100%' }}
            options={[
              { value: 'ALL', label: '全部仓库' },
              { value: 'ASSIGNED', label: '指定仓库' },
              { value: 'NONE', label: '不允许查看' },
            ]}
            onChange={onModeChange}
          />
        </div>
        <div>
          <Text strong>允许的仓库</Text>
          <Select
            mode="multiple"
            value={warehouseIds}
            disabled={disabled || mode !== 'ASSIGNED'}
            style={{ width: '100%' }}
            placeholder="请选择仓库"
            options={warehouseOptions}
            onChange={onWarehouseIdsChange}
          />
        </div>
        <div>
          <Text strong>任务范围</Text>
          <Tag color="green">按负责人限制</Tag>
          <Text type="secondary">继续由责任岗位、责任池或指定处理人控制</Text>
        </div>
        <div>
          <Text strong>其他业务单据</Text>
          <Tag color="gold">按可用功能</Tag>
          <Text type="secondary">本轮不虚构本人、部门或客户集合范围</Text>
        </div>
      </div>
    </div>
  )
}

function SensitiveFieldOverview({ permissionKeys = [] }) {
  const selected = new Set(normalizeStringList(permissionKeys))
  const groups = [
    ['field.party_private.read', '客商隐私', '电话、地址、税号和账户'],
    ['field.sales_commercial.read', '销售商业', '销售单价、折扣和金额'],
    [
      'field.procurement_commercial.read',
      '采购商业',
      '采购与委外单价、折扣和金额',
    ],
    [
      'field.finance_settlement.read',
      '财务结算',
      '应收、应付、发票、核销和结算账户',
    ],
  ]
  return (
    <div className="erp-role-policy-boundary">
      <Alert
        type="info"
        showIcon
        message="敏感字段由独立权限控制"
        description="电话、地址、单价、金额和结算资料会按岗位统一控制，列表、相关单据和打印保持一致。请在“可用功能”中勾选对应字段组。"
      />
      <div className="erp-role-policy-boundary__grid">
        {groups.map(([key, label, description]) => (
          <div key={key}>
            <Text strong>{label}</Text>
            <Tag color={selected.has(key) ? 'green' : 'default'}>
              {selected.has(key) ? '允许查看' : '不可查看'}
            </Tag>
            <Text type="secondary">{description}</Text>
          </div>
        ))}
      </div>
    </div>
  )
}

function isHighRiskPermission(permission = {}) {
  if (!permission?.key) {
    return false
  }
  if (permission.module === 'system' || permission.module === 'mobile') {
    return true
  }
  if (permission.module === 'debug') {
    return true
  }
  return [
    'activate',
    'approve',
    'cancel',
    'clear',
    'cleanup',
    'confirm',
    'disable',
    'handle',
    'manage',
    'reject',
    'seed',
    'ship',
  ].includes(permission.action)
}

function adminsForRole(admins = [], roleKey = '') {
  const normalizedRoleKey = String(roleKey || '').trim()
  if (!normalizedRoleKey || !Array.isArray(admins)) {
    return []
  }
  return admins.filter((admin) =>
    roleKeysForAdmin(admin).includes(normalizedRoleKey)
  )
}

const ASSOCIATED_ADMIN_STATUS_ORDER = Object.freeze({
  [ADMIN_ACCOUNT_STATUS.ACTIVE]: 0,
  [ADMIN_ACCOUNT_STATUS.SUSPENDED]: 1,
  [ADMIN_ACCOUNT_STATUS.REVOKED]: 2,
})

function compareAssociatedAdmins(left = {}, right = {}) {
  const leftOrder =
    ASSOCIATED_ADMIN_STATUS_ORDER[getAdminAccountStatus(left)] ?? 3
  const rightOrder =
    ASSOCIATED_ADMIN_STATUS_ORDER[getAdminAccountStatus(right)] ?? 3
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }
  const nameOrder = getAdminDisplayName(left).localeCompare(
    getAdminDisplayName(right),
    'zh-CN'
  )
  return (
    nameOrder ||
    String(left.username || '').localeCompare(
      String(right.username || ''),
      'zh-CN'
    )
  )
}

function renderAssociatedAdminStatus(admin = {}) {
  if (admin.is_super_admin) {
    return <Tag color="gold">始终启用</Tag>
  }
  switch (getAdminAccountStatus(admin)) {
    case ADMIN_ACCOUNT_STATUS.ACTIVE:
      return <Tag color="green">启用</Tag>
    case ADMIN_ACCOUNT_STATUS.SUSPENDED:
      return <Tag color="red">临时停用</Tag>
    case ADMIN_ACCOUNT_STATUS.REVOKED:
      return <Tag>已注销</Tag>
    default:
      return <Tag color="gold">状态待刷新</Tag>
  }
}

function getAdminPhoneSuffix(phone = '') {
  const digits = String(phone || '').replace(/\D/gu, '')
  return digits.length >= 4 ? digits.slice(-4) : ''
}

function DuplicateAdminNameWarning({ matches = [], style }) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return null
  }

  const sortedMatches = [...matches].sort(compareAssociatedAdmins)
  const visibleMatches = sortedMatches.slice(0, 3)
  const hiddenCount = sortedMatches.length - visibleMatches.length
  const hasRevokedAccount = sortedMatches.some(
    (admin) => getAdminAccountStatus(admin) === ADMIN_ACCOUNT_STATUS.REVOKED
  )

  return (
    <Alert
      type="warning"
      showIcon
      style={style}
      message={`发现 ${sortedMatches.length} 个同名账号，请先核对`}
      description={
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Text>
            同一个人兼任多个岗位，请维护原账号；确为同名不同人可以继续本次操作。
          </Text>
          {visibleMatches.map((admin) => {
            const roleLabels = [
              ...new Set(
                (Array.isArray(admin.roles) ? admin.roles : [])
                  .map(getRoleVisibleName)
                  .filter(Boolean)
              ),
            ]
            const phoneSuffix = getAdminPhoneSuffix(admin.phone)
            return (
              <Space key={admin.id || admin.username} wrap size={[4, 4]}>
                <Text strong>{formatAdminIdentity(admin)}</Text>
                {renderAssociatedAdminStatus(admin)}
                {roleLabels.map((roleLabel) => (
                  <Tag key={`${admin.id || admin.username}-${roleLabel}`}>
                    {roleLabel}
                  </Tag>
                ))}
                {phoneSuffix ? (
                  <Text type="secondary">手机号尾号 {phoneSuffix}</Text>
                ) : null}
              </Space>
            )
          })}
          {hiddenCount > 0 ? (
            <Text type="secondary">另有 {hiddenCount} 个同名账号</Text>
          ) : null}
          {hasRevokedAccount ? (
            <Text type="secondary">
              已注销账号不可恢复；如果是员工返聘，请按新账号办理。
            </Text>
          ) : null}
        </Space>
      }
    />
  )
}

function RoleAssociatedAccounts({
  admins = [],
  currentRoleKey = '',
  canReadUsers = false,
  onOpenAdminAccounts,
}) {
  if (!canReadUsers) {
    return (
      <Alert
        type="info"
        showIcon
        message="您不能查看关联账号"
        description="当前账号没有员工账号查看权限，不能据此判断该岗位是否无人使用。"
      />
    )
  }

  const sortedAdmins = [...admins].sort(compareAssociatedAdmins)
  const columns = [
    {
      title: '关联员工',
      dataIndex: 'display_name',
      width: 220,
      render: (_, record) => formatAdminIdentity(record),
    },
    {
      title: '状态',
      dataIndex: 'account_status',
      width: 140,
      render: (_, record) => renderAssociatedAdminStatus(record),
    },
    {
      title: '同时拥有的其他岗位',
      dataIndex: 'roles',
      render: (_, record) => {
        if (record.is_super_admin) {
          return <Tag color="gold">超级管理员</Tag>
        }
        const otherRoles = (Array.isArray(record.roles) ? record.roles : [])
          .filter((role) => getRoleKey(role) !== currentRoleKey)
          .filter((role) => getRoleKey(role))
        if (otherRoles.length === 0) {
          return <Text type="secondary">仅当前岗位</Text>
        }
        return (
          <Space wrap size={[4, 6]}>
            {otherRoles.map((role) => (
              <Tag key={getRoleKey(role)}>{getRoleVisibleName(role)}</Tag>
            ))}
          </Space>
        )
      },
    },
  ]

  return (
    <div className="erp-role-associated-accounts">
      <div className="erp-role-associated-accounts__head">
        <div>
          <Text strong>当前岗位账号</Text>
          <Text type="secondary">只读核对；岗位设置保存后对这些账号生效。</Text>
        </div>
        <Button onClick={onOpenAdminAccounts}>去员工账号管理</Button>
      </div>
      <Table
        rowKey="id"
        className="erp-role-associated-accounts__table"
        columns={columns}
        dataSource={sortedAdmins}
        size="small"
        pagination={
          sortedAdmins.length > DEFAULT_TABLE_PAGE_SIZE
            ? {
                pageSize: DEFAULT_TABLE_PAGE_SIZE,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 个账号`,
              }
            : false
        }
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前岗位暂无关联账号"
            />
          ),
        }}
        scroll={{ x: 640 }}
      />
    </div>
  )
}

function summarizeRolePermissions(
  permissionKeys,
  permissionDetailMap = new Map()
) {
  return {
    total: normalizeStringList(permissionKeys).filter((permissionKey) =>
      permissionDetailMap.has(permissionKey)
    ).length,
  }
}

function getPermissionLabel(permissionDetailMap, permissionKey) {
  return (
    permissionDetailMap.get(String(permissionKey || '').trim())?.label ||
    '对应页面入口功能'
  )
}

function getMenuEntryPermissionKeys(menu = {}) {
  return [
    ...new Set([
      ...normalizeStringList(menu.requiredAny),
      ...normalizeStringList(menu.requiredAll),
    ]),
  ]
}

function getPermissionEntryMenu(item = {}) {
  return (item.menuLinks || []).find((menu) =>
    getMenuEntryPermissionKeys(menu).includes(item.key)
  )
}

function describeMenuDependency(menu, permissionDetailMap) {
  const requiredAnyLabels = normalizeStringList(menu?.requiredAny).map(
    (permissionKey) => getPermissionLabel(permissionDetailMap, permissionKey)
  )
  const requiredAllLabels = normalizeStringList(menu?.requiredAll).map(
    (permissionKey) => getPermissionLabel(permissionDetailMap, permissionKey)
  )
  if (requiredAnyLabels.length > 0 && requiredAllLabels.length > 0) {
    return `需先开启：${requiredAnyLabels.join(' / ')}（任选一项），以及 ${requiredAllLabels.join('、')}`
  }
  if (requiredAnyLabels.length > 1) {
    return `需先开启：${requiredAnyLabels.join(' / ')}（任选一项）`
  }
  const labels = [...requiredAnyLabels, ...requiredAllLabels]
  return labels.length > 0 ? `需先开启：${labels.join('、')}` : ''
}

function describeMenuEntryCondition(menu, permissionDetailMap) {
  const requiredAnyLabels = normalizeStringList(menu?.requiredAny).map(
    (permissionKey) => getPermissionLabel(permissionDetailMap, permissionKey)
  )
  const requiredAllLabels = normalizeStringList(menu?.requiredAll).map(
    (permissionKey) => getPermissionLabel(permissionDetailMap, permissionKey)
  )
  const requirementCount = requiredAnyLabels.length + requiredAllLabels.length
  if (requirementCount <= 1) {
    return ''
  }
  const requiredAnyDescription =
    requiredAnyLabels.length > 1
      ? `${requiredAnyLabels.join(' / ')}（任选一项）`
      : requiredAnyLabels[0] || ''
  const descriptions = [
    requiredAnyDescription,
    requiredAllLabels.length > 0 ? requiredAllLabels.join('、') : '',
  ].filter(Boolean)
  return `入口条件：${descriptions.join('，并开启 ')}`
}

function getPermissionOtherMenuLabels(item = {}, primaryMenu = null) {
  return [
    ...new Set(
      (item.menuLinks || [])
        .filter((menu) => menu?.key && menu.key !== primaryMenu?.key)
        .map((menu) => menu.label)
        .filter(Boolean)
    ),
  ]
}

function PermissionRow({
  item,
  permissionKeys,
  permissionDetailMap,
  accessPageByKey,
  placementByPath,
}) {
  const entryMenu = getPermissionEntryMenu(item)
  const primaryMenu = entryMenu || item.menuLinks?.[0] || null
  const detail = permissionDetailMap.get(item.key) || item
  const otherMenuLabels = getPermissionOtherMenuLabels(item, primaryMenu)

  if (entryMenu) {
    const locallyVisible = menuRequirementsSatisfied(entryMenu, permissionKeys)
    const accessPage = accessPageByKey.get(entryMenu.key)
    const effective =
      locallyVisible &&
      (accessPage ? accessPage.effective === true : locallyVisible)
    const placement = effective
      ? placementByPath.get(entryMenu.path) || '可从导航进入'
      : ''
    const placementColor =
      placement === '常用工作'
        ? 'blue'
        : placement === '看板中心'
          ? 'purple'
          : undefined
    const entryCondition = describeMenuEntryCondition(
      entryMenu,
      permissionDetailMap
    )
    const rowNotes = [
      entryCondition,
      otherMenuLabels.length > 0 ? `另影响：${otherMenuLabels.join('、')}` : '',
    ].filter(Boolean)

    return (
      <span
        className="erp-permission-row__content"
        data-menu-key={entryMenu.key}
        data-permission-key={item.key}
        data-permission-kind="menu"
      >
        <span className="erp-permission-row__main">
          <MenuOutlined
            className="erp-permission-row__icon"
            aria-hidden="true"
          />
          <span className="erp-permission-row__label">{item.label}</span>
          <span className="erp-permission-row__tags">
            <Tag>菜单入口</Tag>
            <Tag color={effective ? 'green' : undefined}>
              {entryMenu.label}
              {effective ? '显示' : '不显示'}
            </Tag>
            {placement ? <Tag color={placementColor}>{placement}</Tag> : null}
          </span>
        </span>
        {rowNotes.length > 0 ? (
          <span className="erp-permission-row__note">
            {rowNotes.join('；')}
          </span>
        ) : null}
      </span>
    )
  }

  const dependencyDescription = primaryMenu
    ? describeMenuDependency(primaryMenu, permissionDetailMap)
    : ''

  return (
    <span
      className="erp-permission-row__content"
      data-permission-key={item.key}
      data-permission-kind="action"
    >
      <span className="erp-permission-row__main">
        <SettingOutlined
          className="erp-permission-row__icon"
          aria-hidden="true"
        />
        <span className="erp-permission-row__label">{item.label}</span>
        <span className="erp-permission-row__tags">
          <Tag>页内操作</Tag>
          {isHighRiskPermission(detail) ? <Tag>敏感操作</Tag> : null}
        </span>
      </span>
      {dependencyDescription || otherMenuLabels.length > 0 ? (
        <span className="erp-permission-row__note">
          {dependencyDescription}
          {dependencyDescription && otherMenuLabels.length > 0 ? '；' : ''}
          {otherMenuLabels.length > 0
            ? `另影响：${otherMenuLabels.join('、')}`
            : ''}
        </span>
      ) : null}
    </span>
  )
}

function PermissionChecklist({
  groups,
  access = null,
  accessLoading = false,
  placementByPath = new Map(),
  permissionDetailMap = new Map(),
  value = [],
  onChange,
  disabled = false,
}) {
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const [activeGroupKey, setActiveGroupKey] = useState('')
  const sectionNodesRef = useRef(new Map())
  const navigationLockUntilRef = useRef(0)
  const normalizedValue = useMemo(() => normalizeStringList(value), [value])
  const selectedKeySet = useMemo(
    () => new Set(normalizedValue),
    [normalizedValue]
  )
  const accessPageByKey = useMemo(
    () =>
      new Map(
        (Array.isArray(access?.pages) ? access.pages : []).map((page) => [
          String(page?.key || '').trim(),
          page,
        ])
      ),
    [access]
  )
  const visibleGroups = useMemo(() => {
    if (!showSelectedOnly) {
      return groups
    }
    return groups
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => selectedKeySet.has(item.key)),
      }))
      .filter((section) => section.items.length > 0)
  }, [groups, selectedKeySet, showSelectedOnly])
  const categoryItems = useMemo(
    () =>
      visibleGroups.map((section) => {
        const originalSection =
          groups.find((item) => item.key === section.key) || section
        const permissionKeys = originalSection.items.map((item) => item.key)
        return {
          key: section.key,
          title: section.title,
          selectedCount: permissionKeys.filter((item) =>
            selectedKeySet.has(item)
          ).length,
          total: permissionKeys.length,
        }
      }),
    [groups, selectedKeySet, visibleGroups]
  )

  useEffect(() => {
    const visibleKeys = new Set(categoryItems.map((item) => item.key))
    setActiveGroupKey((current) =>
      visibleKeys.has(current) ? current : categoryItems[0]?.key || ''
    )
  }, [categoryItems])

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.IntersectionObserver !== 'function'
    ) {
      return undefined
    }
    const visibleEntries = new Map()
    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const key = String(entry.target?.dataset?.permissionModule || '')
          if (!key) return
          if (entry.isIntersecting) {
            visibleEntries.set(key, entry)
          } else {
            visibleEntries.delete(key)
          }
        })
        if (Date.now() < navigationLockUntilRef.current) {
          return
        }
        const nextEntry = [...visibleEntries.values()].sort(
          (left, right) =>
            Math.abs(left.boundingClientRect.top - 24) -
              Math.abs(right.boundingClientRect.top - 24) ||
            left.boundingClientRect.left - right.boundingClientRect.left
        )[0]
        const nextKey = String(
          nextEntry?.target?.dataset?.permissionModule || ''
        )
        if (nextKey) {
          setActiveGroupKey((current) =>
            current === nextKey ? current : nextKey
          )
        }
      },
      {
        root: null,
        rootMargin: '-320px 0px -25% 0px',
        threshold: [0, 0.01],
      }
    )
    categoryItems.forEach((item) => {
      const node = sectionNodesRef.current.get(item.key)
      if (node) observer.observe(node)
    })
    return () => observer.disconnect()
  }, [categoryItems])

  const jumpToGroup = useCallback((groupKey) => {
    const normalizedKey = String(groupKey || '').trim()
    const target = sectionNodesRef.current.get(normalizedKey)
    if (!target) return
    navigationLockUntilRef.current = Date.now() + 1600
    setActiveGroupKey(normalizedKey)
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [])

  const handleSectionChange = (sectionKeys, nextSectionValues) => {
    const next = [
      ...normalizedValue.filter((item) => !sectionKeys.includes(item)),
      ...(nextSectionValues || []),
    ]
    onChange?.([...new Set(next)])
  }

  return (
    <div className="erp-permission-checklist-shell" aria-busy={accessLoading}>
      <nav className="erp-permission-category-nav" aria-label="功能分类导航">
        <div className="erp-permission-category-nav__head">
          <span className="erp-permission-category-nav__title">
            <Text strong className="erp-permission-category-nav__label">
              功能分类
            </Text>
            <Text className="erp-permission-category-nav__selected">
              已选 {normalizedValue.length} 项
            </Text>
          </span>
          <label className="erp-permission-checklist-filter">
            <Switch
              size="small"
              checked={showSelectedOnly}
              onChange={setShowSelectedOnly}
            />
            <span>只看已选</span>
          </label>
        </div>
        {categoryItems.length > 0 ? (
          <>
            <div className="erp-permission-category-nav__desktop">
              {categoryItems.map((item) => {
                const active = activeGroupKey === item.key
                return (
                  <button
                    type="button"
                    className={`erp-permission-category-nav__item${
                      active ? ' erp-permission-category-nav__item--active' : ''
                    }`}
                    aria-current={active ? 'location' : undefined}
                    key={item.key}
                    onClick={() => jumpToGroup(item.key)}
                  >
                    <span>{item.title}</span>
                    <span className="erp-permission-category-nav__count">
                      {item.selectedCount}/{item.total}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="erp-permission-category-nav__mobile">
              <Select
                aria-label="跳到功能分类"
                value={activeGroupKey || undefined}
                options={categoryItems.map((item) => ({
                  value: item.key,
                  label: `${item.title} ${item.selectedCount}/${item.total}`,
                }))}
                onChange={jumpToGroup}
                placeholder="跳到功能分类"
                style={{ width: '100%' }}
              />
            </div>
          </>
        ) : null}
      </nav>
      <div className="erp-permission-checklist">
        {visibleGroups.map((section) => {
          const originalSection =
            groups.find((item) => item.key === section.key) || section
          const sectionKeys = section.items.map((item) => item.key)
          const originalSectionKeys = originalSection.items.map(
            (item) => item.key
          )
          const selectedKeys = normalizedValue.filter((item) =>
            sectionKeys.includes(item)
          )
          const selectedOriginalKeys = normalizedValue.filter((item) =>
            originalSectionKeys.includes(item)
          )
          const allOriginalSelected =
            originalSectionKeys.length > 0 &&
            originalSectionKeys.every((item) => selectedKeySet.has(item))
          return (
            <section
              className="erp-permission-checklist__section"
              data-permission-module={section.key}
              key={section.key}
              ref={(node) => {
                if (node) {
                  sectionNodesRef.current.set(section.key, node)
                } else {
                  sectionNodesRef.current.delete(section.key)
                }
              }}
            >
              <div className="erp-permission-checklist__header">
                <span className="erp-permission-checklist__title">
                  <Text strong>{section.title}</Text>
                  <Text type="secondary">
                    {showSelectedOnly
                      ? `显示 ${section.items.length}/${originalSection.items.length}，已选 ${selectedOriginalKeys.length}`
                      : `${selectedOriginalKeys.length}/${originalSection.items.length}`}
                  </Text>
                </span>
                <span className="erp-permission-checklist__actions">
                  <Button
                    size="small"
                    type="text"
                    disabled={disabled || allOriginalSelected}
                    onClick={() =>
                      handleSectionChange(
                        originalSectionKeys,
                        originalSectionKeys
                      )
                    }
                  >
                    全选本组
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    disabled={disabled || selectedOriginalKeys.length === 0}
                    onClick={() => handleSectionChange(originalSectionKeys, [])}
                  >
                    清空
                  </Button>
                </span>
              </div>
              <Checkbox.Group
                value={selectedKeys}
                disabled={disabled}
                onChange={(nextValues) =>
                  handleSectionChange(sectionKeys, nextValues)
                }
                className="erp-permission-list"
              >
                {section.items.map((item) => (
                  <Checkbox
                    className="erp-permission-row"
                    key={item.key}
                    value={item.key}
                  >
                    <PermissionRow
                      item={item}
                      permissionKeys={normalizedValue}
                      permissionDetailMap={permissionDetailMap}
                      accessPageByKey={accessPageByKey}
                      placementByPath={placementByPath}
                    />
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </section>
          )
        })}
      </div>
      {visibleGroups.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            showSelectedOnly ? '当前岗位暂无已选功能' : '暂无可配置功能'
          }
        />
      ) : null}
    </div>
  )
}

export default function PermissionCenterPage() {
  const outletContext = useOutletContext()
  const beginLatestRequest = useLatestRequestCoordinator()
  const adminRpc = useMemo(
    () =>
      new JsonRpc({
        url: 'admin',
        basePath: ADMIN_BASE_PATH,
        authScope: AUTH_SCOPE.ADMIN,
      }),
    []
  )

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [statusUpdatingAdminID, setStatusUpdatingAdminID] = useState(null)
  const [currentAdmin, setCurrentAdmin] = useState(null)
  const [admins, setAdmins] = useState([])
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [permissionMenuOptions, setPermissionMenuOptions] = useState([])
  const [warehouseScopeOptions, setWarehouseScopeOptions] = useState([])
  const [effectiveRoleAccess, setEffectiveRoleAccess] = useState(null)
  const [effectiveRoleAccessLoading, setEffectiveRoleAccessLoading] =
    useState(false)
  const [permissionDraftAccess, setPermissionDraftAccess] = useState(null)
  const permissionDraftAccessRequestRef = useRef(0)
  const [permissionDraftAccessLoading, setPermissionDraftAccessLoading] =
    useState(false)
  const [permissionDraftAccessError, setPermissionDraftAccessError] =
    useState('')
  const [adminSearchKeyword, setAdminSearchKeyword] = useState('')
  const [adminStatusFilter, setAdminStatusFilter] = useState(
    ADMIN_STATUS_FILTERS.ALL
  )
  const [tablePagination, setTablePagination] = useState({
    current: 1,
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
  })
  const [adminDialog, dispatchAdminDialog] = useReducer(
    permissionCenterAdminDialogReducer,
    undefined,
    createPermissionCenterAdminDialogState
  )
  const createModalOpen =
    adminDialog.kind === PERMISSION_CENTER_ADMIN_DIALOG.CREATE
  const editModalOpen =
    adminDialog.kind === PERMISSION_CENTER_ADMIN_DIALOG.EDIT_ROLES
  const profileModalOpen =
    adminDialog.kind === PERMISSION_CENTER_ADMIN_DIALOG.EDIT_PROFILE
  const resetModalOpen =
    adminDialog.kind === PERMISSION_CENTER_ADMIN_DIALOG.RESET_PASSWORD
  const statusModalOpen =
    adminDialog.kind === PERMISSION_CENTER_ADMIN_DIALOG.CHANGE_STATUS
  const revokeModalOpen =
    adminDialog.kind === PERMISSION_CENTER_ADMIN_DIALOG.REVOKE
  const editingAdmin = editModalOpen ? adminDialog.admin : null
  const profileAdmin = profileModalOpen ? adminDialog.admin : null
  const resettingAdmin = resetModalOpen ? adminDialog.admin : null
  const statusActionAdmin = statusModalOpen ? adminDialog.admin : null
  const statusActionDisabled = statusModalOpen
    ? adminDialog.statusDisabled
    : false
  const revokingAdmin = revokeModalOpen ? adminDialog.admin : null
  const editingDisplayName = profileModalOpen ? adminDialog.displayName : ''
  const setEditingDisplayName = useCallback((displayName) => {
    dispatchAdminDialog({ type: 'set_display_name', displayName })
  }, [])
  const editingPhone = profileModalOpen ? adminDialog.phone : ''
  const setEditingPhone = useCallback((phone) => {
    dispatchAdminDialog({ type: 'set_phone', phone })
  }, [])
  const [selectedRoleKeys, setSelectedRoleKeys] = useState([])
  const [selectedRoleKey, setSelectedRoleKey] = useState('')
  const [selectedRolePermissionKeys, setSelectedRolePermissionKeys] = useState(
    []
  )
  const [selectedRoleNavigationDraft, setSelectedRoleNavigationDraft] =
    useState(() => ({
      roleKey: '',
      roleVersion: 0,
      mode: ROLE_NAVIGATION_MODES.RECOMMENDED,
      primaryMenuPaths: [],
      secondaryMenuPaths: [],
    }))
  const [selectedWarehouseScopeMode, setSelectedWarehouseScopeMode] =
    useState('NONE')
  const [selectedWarehouseScopeIDs, setSelectedWarehouseScopeIDs] = useState([])
  const [roleSaveConflict, setRoleSaveConflict] = useState(null)
  const [activeTabKey, setActiveTabKey] = useState(
    PERMISSION_CENTER_TAB_KEYS.ROLES
  )
  const [roleNavigationViewKey, setRoleNavigationViewKey] = useState(
    ROLE_NAVIGATION_VIEW_KEYS.LAYOUT
  )
  const [approvalResponsibilityDirty, setApprovalResponsibilityDirty] =
    useState(false)
  const [approvalDiscardVersion, setApprovalDiscardVersion] = useState(0)
  const [approvalRefreshVersion, setApprovalRefreshVersion] = useState(0)
  const [createForm] = Form.useForm()
  const [resetForm] = Form.useForm()
  const [statusForm] = Form.useForm()
  const [revokeForm] = Form.useForm()
  const createDisplayName = Form.useWatch('display_name', createForm)
  const createDuplicateNameAdmins = useMemo(
    () => findAdminsWithDisplayName(admins, createDisplayName),
    [admins, createDisplayName]
  )
  const profileDuplicateNameAdmins = useMemo(
    () =>
      findAdminsWithDisplayName(admins, editingDisplayName, {
        excludeAdminID: profileAdmin?.id,
      }),
    [admins, editingDisplayName, profileAdmin?.id]
  )

  const roleOptions = useMemo(
    () =>
      buildAssignableRoleOptions(roles, {
        isProduction: IS_PRODUCTION_BUILD,
      }),
    [roles]
  )
  const assignablePermissions = useMemo(
    () =>
      filterAssignableBusinessPermissions(permissions, {
        isProduction: IS_PRODUCTION_BUILD,
      }),
    [permissions]
  )
  const assignablePermissionKeySet = useMemo(
    () => new Set(assignablePermissions.map(getPermissionKey)),
    [assignablePermissions]
  )
  const normalizedPermissionMenus = useMemo(
    () => normalizePermissionMenuOptions(permissionMenuOptions),
    [permissionMenuOptions]
  )
  const permissionGroups = useMemo(
    () =>
      buildPermissionGroups(assignablePermissions, normalizedPermissionMenus),
    [assignablePermissions, normalizedPermissionMenus]
  )
  const permissionDetailMap = useMemo(
    () =>
      buildPermissionDetailMap(
        assignablePermissions,
        normalizedPermissionMenus
      ),
    [assignablePermissions, normalizedPermissionMenus]
  )
  const selectedRole = useMemo(
    () => roles.find((role) => getRoleKey(role) === selectedRoleKey) || null,
    [roles, selectedRoleKey]
  )
  const selectedRoleSavedPermissionKeys = useMemo(
    () =>
      permissionKeysForRole(selectedRole || {}).filter((permissionKey) =>
        assignablePermissionKeySet.has(permissionKey)
      ),
    [assignablePermissionKeySet, selectedRole]
  )
  const rolePermissionsDirty =
    buildPermissionSignature(selectedRolePermissionKeys) !==
    buildPermissionSignature(selectedRoleSavedPermissionKeys)
  const selectedRolePermissionSignature = useMemo(
    () => buildPermissionSignature(selectedRolePermissionKeys),
    [selectedRolePermissionKeys]
  )
  const selectedRoleSavedNavigation = useMemo(
    () => normalizeRoleNavigationSettings(selectedRole || {}),
    [selectedRole]
  )
  const selectedRoleVersion = Number(selectedRole?.version || 0)
  const roleNavigationDraftMatchesSelectedRole =
    selectedRoleNavigationDraft.roleKey === selectedRoleKey &&
    (selectedRoleNavigationDraft.roleVersion === selectedRoleVersion ||
      roleSaveConflict?.roleKey === selectedRoleKey)
  const selectedRoleNavigationMode = roleNavigationDraftMatchesSelectedRole
    ? selectedRoleNavigationDraft.mode
    : selectedRoleSavedNavigation.mode
  const selectedRolePrimaryMenuPaths = roleNavigationDraftMatchesSelectedRole
    ? selectedRoleNavigationDraft.primaryMenuPaths
    : selectedRoleSavedNavigation.primaryMenuPaths
  const selectedRoleSecondaryMenuPaths = roleNavigationDraftMatchesSelectedRole
    ? selectedRoleNavigationDraft.secondaryMenuPaths
    : selectedRoleSavedNavigation.secondaryMenuPaths
  const roleNavigationDirty =
    buildRoleNavigationSignature(
      selectedRoleNavigationMode,
      selectedRolePrimaryMenuPaths,
      selectedRoleSecondaryMenuPaths
    ) !==
    buildRoleNavigationSignature(
      selectedRoleSavedNavigation.mode,
      selectedRoleSavedNavigation.primaryMenuPaths,
      selectedRoleSavedNavigation.secondaryMenuPaths
    )
  const selectedRoleSavedWarehouseScope = useMemo(
    () => getRoleWarehouseScope(selectedRole || {}),
    [selectedRole]
  )
  const roleDataScopeDirty =
    buildWarehouseScopeSignature(
      selectedWarehouseScopeMode,
      selectedWarehouseScopeIDs
    ) !==
    buildWarehouseScopeSignature(
      selectedRoleSavedWarehouseScope.mode,
      selectedRoleSavedWarehouseScope.warehouseIds
    )
  const roleConfigurationDirty =
    rolePermissionsDirty || roleDataScopeDirty || roleNavigationDirty
  const roleDataScopeInvalid =
    selectedWarehouseScopeMode === 'ASSIGNED' &&
    selectedWarehouseScopeIDs.length === 0
  const canReadEffectiveRoleAccess =
    hasPermission(currentAdmin, READ_ROLE_PERMISSION) &&
    hasPermission(currentAdmin, READ_PERMISSION_PERMISSION) &&
    hasPermission(currentAdmin, READ_CUSTOMER_CONFIG_PERMISSION)
  const warehouseScopeSelectOptions = useMemo(
    () =>
      warehouseScopeOptions
        .map((warehouse) => ({
          value: Number(warehouse?.id),
          label: [warehouse?.code, warehouse?.name].filter(Boolean).join(' · '),
        }))
        .filter((option) => option.value > 0),
    [warehouseScopeOptions]
  )
  const localPermissionDraftAccess = useMemo(
    () =>
      buildLocalPermissionDraftAccess({
        menuOptions: normalizedPermissionMenus,
        permissionKeys: selectedRolePermissionKeys,
        roleKey: selectedRoleKey,
      }),
    [normalizedPermissionMenus, selectedRoleKey, selectedRolePermissionKeys]
  )
  const matchingPermissionDraftAccess =
    permissionDraftAccess?.roleKey === selectedRoleKey &&
    permissionDraftAccess?.signature === selectedRolePermissionSignature
      ? permissionDraftAccess.access
      : null
  const roleAccessForCurrentDraft = rolePermissionsDirty
    ? matchingPermissionDraftAccess || localPermissionDraftAccess
    : effectiveRoleAccess
  const roleAccessForCurrentDraftLoading = rolePermissionsDirty
    ? permissionDraftAccessLoading && !matchingPermissionDraftAccess
    : effectiveRoleAccessLoading
  const effectiveRolePageCount = useMemo(
    () =>
      (Array.isArray(roleAccessForCurrentDraft?.pages)
        ? roleAccessForCurrentDraft.pages
        : []
      ).filter((page) => page?.effective === true).length,
    [roleAccessForCurrentDraft]
  )
  const effectiveRoleNavigationPathSet = useMemo(
    () => getEffectiveRoleNavigationPathSet(roleAccessForCurrentDraft),
    [roleAccessForCurrentDraft]
  )
  const roleNavigationOptions = useMemo(
    () =>
      buildRoleNavigationOptions(roleAccessForCurrentDraft, [
        ...selectedRolePrimaryMenuPaths,
        ...selectedRoleSecondaryMenuPaths,
      ]),
    [
      roleAccessForCurrentDraft,
      selectedRolePrimaryMenuPaths,
      selectedRoleSecondaryMenuPaths,
    ]
  )
  const unavailableRoleNavigationPaths = useMemo(
    () =>
      roleAccessForCurrentDraft?.is_final === true
        ? [
            ...selectedRolePrimaryMenuPaths,
            ...selectedRoleSecondaryMenuPaths,
          ].filter((path) => !effectiveRoleNavigationPathSet.has(path))
        : [],
    [
      roleAccessForCurrentDraft?.is_final,
      effectiveRoleNavigationPathSet,
      selectedRolePrimaryMenuPaths,
      selectedRoleSecondaryMenuPaths,
    ]
  )
  const recommendedRoleNavigationPlacement = useMemo(() => {
    if (roleAccessForCurrentDraft?.is_final !== true || !selectedRoleKey) {
      return null
    }
    return buildRoleGuidedNavigationPreview({
      navigationSections: [
        ...getNavigationSections(),
        ...getAuthenticatedNavigationSections(),
      ],
      effectiveAccess: roleAccessForCurrentDraft,
      roleKey: selectedRoleKey,
      navigationMode: ROLE_NAVIGATION_MODES.RECOMMENDED,
    })
  }, [roleAccessForCurrentDraft, selectedRoleKey])
  const recommendedRoleNavigationPaths = useMemo(
    () => ({
      primaryMenuPaths:
        recommendedRoleNavigationPlacement?.primaryItems.map(
          (item) => item.path
        ) || [],
      secondaryMenuPaths:
        recommendedRoleNavigationPlacement?.secondarySections
          .flatMap((section) => section.items)
          .map((item) => item.path)
          .filter(isRoleNavigationCustomizablePath) || [],
    }),
    [recommendedRoleNavigationPlacement]
  )
  const recommendedRolePrimaryMenuPaths =
    recommendedRoleNavigationPaths.primaryMenuPaths
  const recommendedRoleSecondaryMenuPaths =
    recommendedRoleNavigationPaths.secondaryMenuPaths
  const roleNavigationPlacement = useMemo(
    () =>
      buildRoleGuidedNavigationPreview({
        navigationSections: [
          ...getNavigationSections(),
          ...getAuthenticatedNavigationSections(),
        ],
        effectiveAccess: roleAccessForCurrentDraft,
        roleKey: selectedRoleKey,
        navigationMode: selectedRoleNavigationMode,
        primaryMenuPaths: selectedRolePrimaryMenuPaths,
        secondaryMenuPaths: selectedRoleSecondaryMenuPaths,
      }),
    [
      roleAccessForCurrentDraft,
      selectedRoleKey,
      selectedRoleNavigationMode,
      selectedRolePrimaryMenuPaths,
      selectedRoleSecondaryMenuPaths,
    ]
  )
  const permissionMenuPlacementByPath = useMemo(
    () => getMenuPlacementMap(roleNavigationPlacement),
    [roleNavigationPlacement]
  )
  const configuredRoleNavigationPathSet = new Set([
    ...selectedRolePrimaryMenuPaths,
    ...selectedRoleSecondaryMenuPaths,
  ])
  const roleNavigationInvalid =
    selectedRoleNavigationMode === ROLE_NAVIGATION_MODES.CUSTOM &&
    (roleAccessForCurrentDraft?.is_final !== true ||
      selectedRolePrimaryMenuPaths.length === 0 ||
      selectedRolePrimaryMenuPaths.length > MAX_ROLE_PRIMARY_LIMIT ||
      unavailableRoleNavigationPaths.length > 0 ||
      configuredRoleNavigationPathSet.size !==
        selectedRolePrimaryMenuPaths.length +
          selectedRoleSecondaryMenuPaths.length ||
      configuredRoleNavigationPathSet.size !==
        effectiveRoleNavigationPathSet.size)

  const confirmDiscardRoleChanges = useCallback(
    ({ title, content, onDiscard, onKeepEditing }) => {
      if (!roleConfigurationDirty) {
        onDiscard?.()
        return
      }
      modal.confirm({
        centered: true,
        title,
        content,
        okText: '放弃修改',
        cancelText: '继续编辑',
        onOk: () => {
          setSelectedRolePermissionKeys(selectedRoleSavedPermissionKeys)
          setSelectedRoleNavigationDraft({
            roleKey: selectedRoleKey,
            roleVersion: selectedRoleVersion,
            mode: selectedRoleSavedNavigation.mode,
            primaryMenuPaths: selectedRoleSavedNavigation.primaryMenuPaths,
            secondaryMenuPaths: selectedRoleSavedNavigation.secondaryMenuPaths,
          })
          setSelectedWarehouseScopeMode(selectedRoleSavedWarehouseScope.mode)
          setSelectedWarehouseScopeIDs(
            selectedRoleSavedWarehouseScope.warehouseIds
          )
          setRoleSaveConflict(null)
          onDiscard?.()
        },
        onCancel: onKeepEditing,
      })
    },
    [
      roleConfigurationDirty,
      selectedRoleKey,
      selectedRoleSavedPermissionKeys,
      selectedRoleSavedNavigation,
      selectedRoleSavedWarehouseScope,
      selectedRoleVersion,
    ]
  )

  const confirmDiscardApprovalChanges = useCallback(
    ({ title, content, onDiscard, onKeepEditing }) => {
      if (!approvalResponsibilityDirty) {
        onDiscard?.()
        return
      }
      modal.confirm({
        centered: true,
        title,
        content,
        okText: '放弃调整',
        cancelText: '继续处理',
        onOk: () => {
          setApprovalDiscardVersion((current) => current + 1)
          setApprovalResponsibilityDirty(false)
          onDiscard?.()
        },
        onCancel: onKeepEditing,
      })
    },
    [approvalResponsibilityDirty]
  )

  const confirmLeavePermissionCenter = useCallback(
    () =>
      new Promise((resolve) => {
        if (
          activeTabKey === PERMISSION_CENTER_TAB_KEYS.APPROVALS &&
          approvalResponsibilityDirty
        ) {
          confirmDiscardApprovalChanges({
            title: '离开前要放弃审批责任调整吗？',
            content:
              '尚未发布的调整或已经发布但尚未启用的新设置，离开后需要重新处理。',
            onDiscard: () => resolve(true),
            onKeepEditing: () => resolve(false),
          })
          return
        }
        confirmDiscardRoleChanges({
          title: '离开前要放弃未保存的修改吗？',
          content: '离开权限管理后，当前岗位尚未保存的功能调整会丢失。',
          onDiscard: () => resolve(true),
          onKeepEditing: () => resolve(false),
        })
      }),
    [
      activeTabKey,
      approvalResponsibilityDirty,
      confirmDiscardApprovalChanges,
      confirmDiscardRoleChanges,
    ]
  )
  const roleSummaries = useMemo(
    () =>
      roles.map((role) => {
        const roleKey = getRoleKey(role)
        const rolePermissionKeys = permissionKeysForRole(role)
        const permissionSummary = summarizeRolePermissions(
          rolePermissionKeys,
          permissionDetailMap
        )
        return {
          key: roleKey,
          adminCount: adminsForRole(admins, roleKey).length,
          permissionSummary,
        }
      }),
    [admins, permissionDetailMap, roles]
  )
  const selectedRoleAdmins = useMemo(
    () => adminsForRole(admins, selectedRoleKey),
    [admins, selectedRoleKey]
  )
  const selectedRolePermissionSummary = useMemo(
    () =>
      summarizeRolePermissions(selectedRolePermissionKeys, permissionDetailMap),
    [permissionDetailMap, selectedRolePermissionKeys]
  )
  const canReadUsers = hasPermission(currentAdmin, READ_USER_PERMISSION)
  const canReadRoleTemplates =
    hasPermission(currentAdmin, READ_ROLE_PERMISSION) &&
    hasPermission(currentAdmin, READ_PERMISSION_PERMISSION)
  const canCreateUsers = hasPermission(currentAdmin, CREATE_USER_PERMISSION)
  const canManageUsers = hasPermission(currentAdmin, UPDATE_USER_PERMISSION)
  const canAssignUserRoles = hasPermission(
    currentAdmin,
    ASSIGN_USER_ROLE_PERMISSION
  )
  const canDisableUsers = hasPermission(currentAdmin, DISABLE_USER_PERMISSION)
  const canRevokeUsers = hasPermission(currentAdmin, REVOKE_USER_PERMISSION)
  const canManageRolePermissions = hasPermission(
    currentAdmin,
    MANAGE_ROLE_PERMISSION
  )
  const canReadApprovalResponsibilities =
    canReadUsers &&
    canReadRoleTemplates &&
    hasPermission(currentAdmin, READ_CUSTOMER_CONFIG_PERMISSION)
  const canManageApprovalResponsibilities =
    canReadApprovalResponsibilities &&
    hasPermission(currentAdmin, PUBLISH_CUSTOMER_CONFIG_PERMISSION) &&
    hasPermission(currentAdmin, ACTIVATE_CUSTOMER_CONFIG_PERMISSION)
  const approvalReadOnlyReason = !canReadApprovalResponsibilities
    ? '当前账号不能同时读取员工、岗位和审批责任。'
    : !hasPermission(currentAdmin, PUBLISH_CUSTOMER_CONFIG_PERMISSION) ||
        !hasPermission(currentAdmin, ACTIVATE_CUSTOMER_CONFIG_PERMISSION)
      ? '调整审批责任需要同时具备发布和启用客户设置的权限。'
      : ''
  const selectedRoleReadOnlyReason = getRolePermissionReadOnlyReason(
    selectedRole || {},
    { isProduction: IS_PRODUCTION_BUILD, currentAdmin }
  )
  const selectedRoleReadOnly = Boolean(selectedRoleReadOnlyReason)
  const selectedRoleConflict =
    roleSaveConflict?.roleKey === selectedRoleKey ? roleSaveConflict : null
  const permissionWarningMessages = [
    !canReadRoleTemplates ? '您不能查看岗位设置' : '',
    !canReadUsers ? '您不能查看员工账号' : '',
    !canManageRolePermissions ? '您不能调整岗位的可用功能' : '',
    !canAssignUserRoles ? '您不能给员工账号分配岗位' : '',
    !canManageUsers ? '您不能修改手机号或重置密码' : '',
    !canDisableUsers ? '您不能启用或停用员工账号' : '',
    !canRevokeUsers ? '您不能办理员工账号离职注销' : '',
    !canCreateUsers ? '您不能创建员工账号' : '',
  ].filter(Boolean)
  const filteredAdmins = useMemo(
    () =>
      filterAdminRecords(admins, {
        keyword: adminSearchKeyword,
        status: adminStatusFilter,
      }),
    [adminSearchKeyword, adminStatusFilter, admins]
  )
  const hasAdminFilter = Boolean(
    String(adminSearchKeyword || '').trim() ||
      adminStatusFilter !== ADMIN_STATUS_FILTERS.ALL
  )

  const loadData = useCallback(async () => {
    const request = beginLatestRequest('permission-center')
    setLoading(true)
    try {
      const meResult = await adminRpc.call('me', {}, { signal: request.signal })
      if (!request.isCurrent()) {
        return false
      }
      const nextCurrentAdmin = meResult?.data || null
      const shouldLoadAdmins = hasPermission(
        nextCurrentAdmin,
        READ_USER_PERMISSION
      )
      const shouldLoadRBACOptions =
        hasPermission(nextCurrentAdmin, READ_ROLE_PERMISSION) &&
        hasPermission(nextCurrentAdmin, READ_PERMISSION_PERMISSION)
      const [listResult, optionsResult] = await Promise.all([
        shouldLoadAdmins
          ? adminRpc.call('list', {}, { signal: request.signal })
          : Promise.resolve(null),
        shouldLoadRBACOptions
          ? adminRpc.call('rbac_options', {}, { signal: request.signal })
          : Promise.resolve(null),
      ])
      if (!request.isCurrent()) {
        return false
      }
      const nextRoles = Array.isArray(optionsResult?.data?.roles)
        ? optionsResult.data.roles
        : []
      setCurrentAdmin(nextCurrentAdmin)
      setAdmins(
        Array.isArray(listResult?.data?.admins) ? listResult.data.admins : []
      )
      setRoles(nextRoles)
      setPermissions(
        Array.isArray(optionsResult?.data?.permissions)
          ? optionsResult.data.permissions
          : []
      )
      setPermissionMenuOptions(
        Array.isArray(optionsResult?.data?.menus)
          ? optionsResult.data.menus
          : Array.isArray(optionsResult?.data?.menu_options)
            ? optionsResult.data.menu_options
            : []
      )
      setWarehouseScopeOptions(
        Array.isArray(optionsResult?.data?.warehouse_scope_options)
          ? optionsResult.data.warehouse_scope_options
          : []
      )
      setSelectedRoleKey((current) => current || getRoleKey(nextRoles[0]))
      return true
    } catch (err) {
      if (isRpcAbortError(err) || !request.isCurrent()) {
        return false
      }
      message.error(getActionErrorMessage(err, '加载岗位设置'))
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [adminRpc, beginLatestRequest])

  const loadEffectiveRoleAccess = useCallback(
    async (roleKey) => {
      const request = beginLatestRequest('effective-role-access')
      const normalizedRoleKey = getRoleKey({ role_key: roleKey })
      if (!normalizedRoleKey || !canReadEffectiveRoleAccess) {
        setEffectiveRoleAccess(null)
        setEffectiveRoleAccessLoading(false)
        request.finish()
        return false
      }
      setEffectiveRoleAccessLoading(true)
      try {
        const result = await adminRpc.call(
          'effective_role_access',
          {
            role_key: normalizedRoleKey,
          },
          { signal: request.signal }
        )
        if (!request.isCurrent()) {
          return false
        }
        setEffectiveRoleAccess(result?.data?.effective_access || null)
        return true
      } catch (err) {
        if (isRpcAbortError(err) || !request.isCurrent()) {
          return false
        }
        setEffectiveRoleAccess(null)
        message.error(getActionErrorMessage(err, '加载岗位最终权限'))
        return false
      } finally {
        if (request.isCurrent()) {
          setEffectiveRoleAccessLoading(false)
          request.finish()
        }
      }
    },
    [adminRpc, beginLatestRequest, canReadEffectiveRoleAccess]
  )

  const changeSelectedRolePermissions = useCallback(
    (requestedPermissionKeys = []) => {
      const result = reconcilePermissionSelection({
        previousKeys: selectedRolePermissionKeys,
        requestedKeys: requestedPermissionKeys,
        permissions: assignablePermissions,
        menuOptions: normalizedPermissionMenus,
      })
      setSelectedRolePermissionKeys(result.permissionKeys)

      const menuByKey = new Map(
        normalizedPermissionMenus.map((menu) => [menu.key, menu])
      )
      const autoAddedLabels = result.autoAdded.map((item) => {
        const menuLabel = menuByKey.get(item.menuKey)?.label || '对应页面'
        const permissionLabel = getPermissionLabel(
          permissionDetailMap,
          item.permissionKey
        )
        return `“${menuLabel}”入口（${permissionLabel}）`
      })
      const autoRemovedLabels = result.autoRemoved.map((item) => {
        const menuLabel = menuByKey.get(item.menuKey)?.label || '对应页面'
        const permissionLabel = getPermissionLabel(
          permissionDetailMap,
          item.permissionKey
        )
        return `“${menuLabel}”操作（${permissionLabel}）`
      })
      const notices = []
      if (autoAddedLabels.length > 0) {
        notices.push(
          `为避免有操作却进不了页面，已同时开启${autoAddedLabels.join('、')}`
        )
      }
      if (autoRemovedLabels.length > 0) {
        notices.push(
          `关闭页面入口后，已同时取消仅在该页使用的${autoRemovedLabels.join('、')}`
        )
      }
      if (notices.length > 0) {
        message.info(notices.join('；'))
      }
    },
    [
      assignablePermissions,
      normalizedPermissionMenus,
      permissionDetailMap,
      selectedRolePermissionKeys,
    ]
  )

  const selectRoleTemplate = (roleKey) => {
    const nextRoleKey = getRoleKey({ role_key: roleKey })
    if (!nextRoleKey || nextRoleKey === selectedRoleKey) {
      return
    }
    confirmDiscardRoleChanges({
      title: '放弃未保存的岗位调整？',
      content:
        '切换岗位会丢弃当前未保存的勾选结果。请先保存，或确认放弃本次调整。',
      onDiscard: () => {
        setRoleSaveConflict(null)
        setSelectedRoleKey(nextRoleKey)
      },
    })
  }

  const refreshConflictedRole = async () => {
    if (!selectedRoleConflict) return
    const loaded = await loadData()
    if (!loaded) return
    setRoleSaveConflict((current) =>
      current?.roleKey === selectedRoleKey
        ? { ...current, refreshed: true }
        : current
    )
  }

  const changePermissionCenterTab = (nextTabKey) => {
    if (nextTabKey === activeTabKey) {
      return
    }
    if (
      activeTabKey === PERMISSION_CENTER_TAB_KEYS.APPROVALS &&
      approvalResponsibilityDirty
    ) {
      confirmDiscardApprovalChanges({
        title: '切换前要放弃审批责任调整吗？',
        content:
          '尚未发布的调整或已经发布但尚未启用的新设置，切换后需要重新处理。',
        onDiscard: () => setActiveTabKey(nextTabKey),
      })
      return
    }
    confirmDiscardRoleChanges({
      title: '切换页面前要放弃未保存的修改吗？',
      content: '切换后，当前岗位尚未保存的功能调整会丢失。',
      onDiscard: () => setActiveTabKey(nextTabKey),
    })
  }

  const openSelectedRoleAdminAccounts = () => {
    confirmDiscardRoleChanges({
      title: '切换页面前要放弃未保存的修改吗？',
      content: '切换到员工账号后，当前岗位尚未保存的功能调整会丢失。',
      onDiscard: () => {
        setAdminSearchKeyword(getRoleVisibleName(selectedRole || {}))
        setAdminStatusFilter(ADMIN_STATUS_FILTERS.ALL)
        setTablePagination((current) => ({ ...current, current: 1 }))
        setActiveTabKey(PERMISSION_CENTER_TAB_KEYS.ADMINS)
      },
    })
  }

  const refreshPermissionCenter = useCallback(
    () =>
      new Promise((resolve) => {
        const refresh = async () => {
          const loaded = await loadData()
          if (loaded) {
            setApprovalRefreshVersion((current) => current + 1)
          }
          resolve(loaded)
        }
        if (
          activeTabKey === PERMISSION_CENTER_TAB_KEYS.APPROVALS &&
          approvalResponsibilityDirty
        ) {
          confirmDiscardApprovalChanges({
            title: '刷新前要放弃审批责任调整吗？',
            content:
              '刷新会重新读取当前生效设置，未发布或尚未启用的调整需要重新处理。',
            onDiscard: refresh,
            onKeepEditing: () => resolve(false),
          })
          return
        }
        confirmDiscardRoleChanges({
          title: '刷新前要放弃未保存的修改吗？',
          content: '刷新会重新加载权限数据，当前岗位尚未保存的功能调整会丢失。',
          onDiscard: refresh,
          onKeepEditing: () => resolve(false),
        })
      }),
    [
      activeTabKey,
      approvalResponsibilityDirty,
      confirmDiscardApprovalChanges,
      confirmDiscardRoleChanges,
      loadData,
    ]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPermissionCenter)
  }, [outletContext, refreshPermissionCenter])

  useEffect(() => {
    return outletContext?.registerPageLeaveGuard?.(
      roleConfigurationDirty || approvalResponsibilityDirty
        ? confirmLeavePermissionCenter
        : null
    )
  }, [
    approvalResponsibilityDirty,
    confirmLeavePermissionCenter,
    outletContext,
    roleConfigurationDirty,
  ])

  useEffect(() => {
    if (!roleConfigurationDirty && !approvalResponsibilityDirty) {
      return undefined
    }
    const warnBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [approvalResponsibilityDirty, roleConfigurationDirty])

  useEffect(() => {
    if (
      activeTabKey === PERMISSION_CENTER_TAB_KEYS.APPROVALS &&
      !canReadApprovalResponsibilities
    ) {
      setApprovalDiscardVersion((current) => current + 1)
      setApprovalResponsibilityDirty(false)
      setActiveTabKey(PERMISSION_CENTER_TAB_KEYS.ROLES)
    }
  }, [activeTabKey, canReadApprovalResponsibilities])

  useEffect(() => {
    if (!selectedRole) {
      setSelectedRolePermissionKeys([])
      setSelectedRoleNavigationDraft({
        roleKey: '',
        roleVersion: 0,
        mode: ROLE_NAVIGATION_MODES.RECOMMENDED,
        primaryMenuPaths: [],
        secondaryMenuPaths: [],
      })
      return
    }
    if (roleSaveConflict?.roleKey === selectedRoleKey) {
      return
    }
    setSelectedRolePermissionKeys(selectedRoleSavedPermissionKeys)
    setSelectedRoleNavigationDraft({
      roleKey: selectedRoleKey,
      roleVersion: selectedRoleVersion,
      mode: selectedRoleSavedNavigation.mode,
      primaryMenuPaths: selectedRoleSavedNavigation.primaryMenuPaths,
      secondaryMenuPaths: selectedRoleSavedNavigation.secondaryMenuPaths,
    })
    setSelectedWarehouseScopeMode(selectedRoleSavedWarehouseScope.mode)
    setSelectedWarehouseScopeIDs(selectedRoleSavedWarehouseScope.warehouseIds)
  }, [
    roleSaveConflict,
    selectedRole,
    selectedRoleKey,
    selectedRoleSavedPermissionKeys,
    selectedRoleSavedNavigation,
    selectedRoleSavedWarehouseScope,
    selectedRoleVersion,
  ])

  useEffect(() => {
    if (
      selectedRoleNavigationMode !== ROLE_NAVIGATION_MODES.CUSTOM ||
      roleAccessForCurrentDraft?.is_final !== true
    ) {
      return
    }
    if (selectedRolePrimaryMenuPaths.length === 0) {
      const savedCustomLayout =
        selectedRoleSavedNavigation.mode === ROLE_NAVIGATION_MODES.CUSTOM
      const primaryMenuPaths = savedCustomLayout
        ? selectedRoleSavedNavigation.primaryMenuPaths
        : recommendedRolePrimaryMenuPaths
      const secondaryMenuPaths = savedCustomLayout
        ? selectedRoleSavedNavigation.secondaryMenuPaths
        : recommendedRoleSecondaryMenuPaths
      if (primaryMenuPaths.length > 0) {
        setSelectedRoleNavigationDraft((current) => {
          if (
            current.roleKey !== selectedRoleKey ||
            current.roleVersion !== selectedRoleVersion ||
            current.mode !== ROLE_NAVIGATION_MODES.CUSTOM
          ) {
            return current
          }
          return {
            ...current,
            primaryMenuPaths,
            secondaryMenuPaths,
          }
        })
      }
      return
    }
    const effectivePaths = roleNavigationOptions
      .filter((option) => option.effective)
      .map((option) => option.value)
    const reconciled = reconcileRoleNavigationPaths({
      effectivePaths,
      primaryMenuPaths: selectedRolePrimaryMenuPaths,
      secondaryMenuPaths: selectedRoleSecondaryMenuPaths,
    })
    const primaryChanged =
      reconciled.primaryMenuPaths.join('\n') !==
      selectedRolePrimaryMenuPaths.join('\n')
    const secondaryChanged =
      reconciled.secondaryMenuPaths.join('\n') !==
      selectedRoleSecondaryMenuPaths.join('\n')
    if (primaryChanged || secondaryChanged) {
      setSelectedRoleNavigationDraft((current) => {
        if (
          current.roleKey !== selectedRoleKey ||
          current.roleVersion !== selectedRoleVersion ||
          current.mode !== ROLE_NAVIGATION_MODES.CUSTOM
        ) {
          return current
        }
        return {
          ...current,
          primaryMenuPaths: reconciled.primaryMenuPaths,
          secondaryMenuPaths: reconciled.secondaryMenuPaths,
        }
      })
    }
  }, [
    roleAccessForCurrentDraft?.is_final,
    recommendedRolePrimaryMenuPaths,
    recommendedRoleSecondaryMenuPaths,
    roleNavigationOptions,
    selectedRoleKey,
    selectedRoleNavigationMode,
    selectedRolePrimaryMenuPaths,
    selectedRoleSavedNavigation,
    selectedRoleSecondaryMenuPaths,
    selectedRoleVersion,
  ])

  useEffect(() => {
    if (roles.length === 0) {
      setSelectedRoleKey('')
      return
    }
    if (roles.some((role) => getRoleKey(role) === selectedRoleKey)) {
      return
    }
    setSelectedRoleKey(getRoleKey(roles[0]))
  }, [roles, selectedRoleKey])

  useEffect(() => {
    loadEffectiveRoleAccess(selectedRoleKey)
  }, [loadEffectiveRoleAccess, selectedRoleKey])

  useEffect(() => {
    const requestID = permissionDraftAccessRequestRef.current + 1
    permissionDraftAccessRequestRef.current = requestID
    setPermissionDraftAccessError('')
    if (
      !rolePermissionsDirty ||
      !selectedRoleKey ||
      !canReadEffectiveRoleAccess
    ) {
      setPermissionDraftAccessLoading(false)
      if (!rolePermissionsDirty) {
        setPermissionDraftAccess(null)
      }
      return undefined
    }

    setPermissionDraftAccessLoading(true)
    const signature = selectedRolePermissionSignature
    const timer = window.setTimeout(async () => {
      try {
        const result = await adminRpc.call('effective_role_access', {
          role_key: selectedRoleKey,
          permission_keys: normalizeStringList(selectedRolePermissionKeys),
        })
        if (permissionDraftAccessRequestRef.current === requestID) {
          setPermissionDraftAccess({
            roleKey: selectedRoleKey,
            signature,
            access: result?.data?.effective_access || null,
          })
        }
      } catch (err) {
        if (permissionDraftAccessRequestRef.current === requestID) {
          setPermissionDraftAccessError(
            getActionErrorMessage(err, '核对岗位菜单草稿')
          )
        }
      } finally {
        if (permissionDraftAccessRequestRef.current === requestID) {
          setPermissionDraftAccessLoading(false)
        }
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      if (permissionDraftAccessRequestRef.current === requestID) {
        permissionDraftAccessRequestRef.current += 1
      }
    }
  }, [
    adminRpc,
    canReadEffectiveRoleAccess,
    rolePermissionsDirty,
    selectedRoleKey,
    selectedRolePermissionKeys,
    selectedRolePermissionSignature,
  ])

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(filteredAdmins.length / tablePagination.pageSize)
    )
    if (tablePagination.current <= totalPages) {
      return
    }
    setTablePagination((prev) => ({
      ...prev,
      current: totalPages,
    }))
  }, [filteredAdmins.length, tablePagination])

  const closeCreateModal = () => {
    dispatchAdminDialog({ type: 'close' })
    createForm.resetFields()
  }

  const openCreateModal = () => {
    createForm.setFieldsValue({ role_keys: [] })
    dispatchAdminDialog({
      type: 'open',
      kind: PERMISSION_CENTER_ADMIN_DIALOG.CREATE,
    })
  }

  const openEditModal = (admin) => {
    if (!admin || admin.is_super_admin) {
      return
    }
    const blockReason = canAssignUserRoles
      ? getRoleAssignmentBlockReason({
          currentAdmin,
          targetAdmin: admin,
          roles,
          isProduction: IS_PRODUCTION_BUILD,
        })
      : '当前账号不能分配岗位'
    if (blockReason) {
      message.info(blockReason)
      return
    }
    setSelectedRoleKeys(roleKeysForAdmin(admin))
    dispatchAdminDialog({
      type: 'open',
      kind: PERMISSION_CENTER_ADMIN_DIALOG.EDIT_ROLES,
      admin,
    })
  }

  const closeEditModal = () => {
    dispatchAdminDialog({ type: 'close' })
    setSelectedRoleKeys([])
  }

  const openProfileModal = (admin) => {
    const accountStatus = getAdminAccountStatus(admin)
    if (
      !admin ||
      !accountStatus ||
      accountStatus === ADMIN_ACCOUNT_STATUS.REVOKED
    ) {
      return
    }
    const blockReason = getAdminProfileTargetBlockReason({
      currentAdmin,
      targetAdmin: admin,
      roles,
    })
    if (blockReason) {
      message.info(blockReason)
      return
    }
    dispatchAdminDialog({
      type: 'open',
      kind: PERMISSION_CENTER_ADMIN_DIALOG.EDIT_PROFILE,
      admin,
      displayName: admin.display_name || '',
      phone: admin.phone || '',
    })
  }

  const closeProfileModal = () => {
    dispatchAdminDialog({ type: 'close' })
  }

  const openResetModal = (admin) => {
    const accountStatus = getAdminAccountStatus(admin)
    if (
      !admin ||
      admin.is_super_admin ||
      !accountStatus ||
      accountStatus === ADMIN_ACCOUNT_STATUS.REVOKED
    ) {
      return
    }
    const blockReason = getAdminControlTargetBlockReason({
      currentAdmin,
      targetAdmin: admin,
      roles,
    })
    if (blockReason) {
      message.info(blockReason)
      return
    }
    resetForm.resetFields()
    dispatchAdminDialog({
      type: 'open',
      kind: PERMISSION_CENTER_ADMIN_DIALOG.RESET_PASSWORD,
      admin,
    })
  }

  const closeResetModal = () => {
    dispatchAdminDialog({ type: 'close' })
    resetForm.resetFields()
  }

  const handleTableChange = useCallback((pagination) => {
    setTablePagination((prev) => {
      const nextPageSize =
        Number(pagination?.pageSize) || DEFAULT_TABLE_PAGE_SIZE
      return {
        pageSize: nextPageSize,
        current:
          nextPageSize === prev.pageSize ? Number(pagination?.current) || 1 : 1,
      }
    })
  }, [])

  const createAdmin = async (values) => {
    setCreating(true)
    try {
      const payload = {
        display_name: String(values.display_name || '').trim(),
        username: String(values.username || '').trim(),
        password: values.password,
        phone: String(values.phone || '').trim(),
        role_keys: canAssignUserRoles
          ? normalizeStringList(values.role_keys || [])
          : [],
      }
      const result = await adminRpc.call('create', payload)
      const createdAdmin = result?.data?.admin
      message.success(
        createdAdmin?.username
          ? `${formatAdminIdentity(createdAdmin)} 已创建`
          : '员工账号已创建'
      )
      closeCreateModal()
      setTablePagination((prev) =>
        nextPermissionCenterAdminPagination(prev, 'create')
      )
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '创建员工账号'))
    } finally {
      setCreating(false)
    }
  }

  const saveAdminRoles = async () => {
    if (!editingAdmin?.id) {
      return
    }
    const blockReason = canAssignUserRoles
      ? getRoleAssignmentBlockReason({
          currentAdmin,
          targetAdmin: editingAdmin,
          roles,
          isProduction: IS_PRODUCTION_BUILD,
        })
      : '当前账号不能分配岗位'
    if (blockReason) {
      message.info(blockReason)
      return
    }
    setSaving(true)
    try {
      await adminRpc.call('set_roles', {
        id: editingAdmin.id,
        role_keys: normalizeStringList(selectedRoleKeys),
      })
      message.success('员工岗位已更新')
      closeEditModal()
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '更新员工岗位'))
    } finally {
      setSaving(false)
    }
  }

  const saveAdminProfile = async () => {
    const accountStatus = getAdminAccountStatus(profileAdmin)
    if (
      !profileAdmin?.id ||
      !accountStatus ||
      accountStatus === ADMIN_ACCOUNT_STATUS.REVOKED
    ) {
      return
    }
    const nextDisplayName = String(editingDisplayName || '').trim()
    if (!nextDisplayName) {
      message.warning('请输入员工姓名')
      return
    }
    if (Array.from(nextDisplayName).length > 64) {
      message.warning('员工姓名不能超过 64 个字符')
      return
    }
    const nextPhone = String(editingPhone || '').trim()
    if (nextPhone && !isValidMainlandMobilePhone(nextPhone)) {
      message.warning('请输入有效手机号')
      return
    }
    if (
      nextDisplayName === String(profileAdmin.display_name || '').trim() &&
      nextPhone === String(profileAdmin.phone || '').trim()
    ) {
      closeProfileModal()
      return
    }
    setSaving(true)
    try {
      await adminRpc.call('set_profile', {
        id: profileAdmin.id,
        display_name: nextDisplayName,
        phone: nextPhone,
      })
      if (Number(outletContext.adminProfile?.id) === Number(profileAdmin.id)) {
        await outletContext.refreshAdminProfile?.()
      }
      message.success('员工资料已更新')
      closeProfileModal()
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '更新员工资料'))
    } finally {
      setSaving(false)
    }
  }

  const saveRolePermissions = async () => {
    const expectedVersion = getPermissionCenterRoleVersion(selectedRole || {})
    if (
      !selectedRoleKey ||
      selectedRoleReadOnly ||
      !expectedVersion ||
      !roleConfigurationDirty ||
      roleNavigationInvalid
    ) {
      if (selectedRoleReadOnlyReason) {
        message.info(selectedRoleReadOnlyReason)
      }
      return
    }
    setSaving(true)
    try {
      const result = await adminRpc.call('set_role_settings', {
        role_key: selectedRoleKey,
        permission_keys: normalizeStringList(selectedRolePermissionKeys),
        data_scopes: [
          {
            resource_type: 'warehouse',
            mode: selectedWarehouseScopeMode,
            resource_ids:
              selectedWarehouseScopeMode === 'ASSIGNED'
                ? selectedWarehouseScopeIDs
                : [],
          },
        ],
        navigation_mode: selectedRoleNavigationMode,
        primary_menu_paths:
          selectedRoleNavigationMode === ROLE_NAVIGATION_MODES.CUSTOM
            ? selectedRolePrimaryMenuPaths
            : [],
        secondary_menu_paths:
          selectedRoleNavigationMode === ROLE_NAVIGATION_MODES.CUSTOM
            ? selectedRoleSecondaryMenuPaths
            : [],
        expected_version: expectedVersion,
      })
      const nextVersion = Number(result?.data?.role?.version || 0)
      if (nextVersion !== expectedVersion + 1) {
        throw new Error('岗位版本回读失败')
      }
      message.success('岗位设置已更新，相关账号刷新后生效')
      setRoleSaveConflict(null)
      await loadData()
      await loadEffectiveRoleAccess(selectedRoleKey)
    } catch (err) {
      if (Number(err?.code) === RpcErrorCode.RESOURCE_VERSION_CONFLICT) {
        setRoleSaveConflict({
          roleKey: selectedRoleKey,
          refreshed: false,
        })
        message.warning(
          '该岗位已被其他人修改，当前勾选已保留，请刷新最新岗位后核对再保存'
        )
        return
      }
      message.error(getActionErrorMessage(err, '更新岗位设置'))
    } finally {
      setSaving(false)
    }
  }

  const applyAdminStatus = async (values) => {
    const admin = statusActionAdmin
    const disabled = statusActionDisabled
    const accountStatus = getAdminAccountStatus(admin)
    if (
      !admin?.id ||
      admin.is_super_admin ||
      !accountStatus ||
      accountStatus === ADMIN_ACCOUNT_STATUS.REVOKED ||
      isSameAdminAccount(currentAdmin, admin)
    ) {
      if (isSameAdminAccount(currentAdmin, admin)) {
        message.info('当前登录账号不能临时停用自己')
      }
      return
    }
    const controlTargetBlockReason = getAdminControlTargetBlockReason({
      currentAdmin,
      targetAdmin: admin,
      roles,
    })
    if (controlTargetBlockReason) {
      message.info(controlTargetBlockReason)
      return
    }

    setStatusUpdatingAdminID(admin.id)
    try {
      await adminRpc.call('set_disabled', {
        id: admin.id,
        disabled,
        reason: String(values?.reason || '').trim(),
      })
      message.success(
        disabled
          ? `已临时停用 ${formatAdminIdentity(admin)}`
          : `已启用 ${formatAdminIdentity(admin)}`
      )
      await loadData()
      dispatchAdminDialog({ type: 'close' })
      statusForm.resetFields()
    } catch (err) {
      message.error(getActionErrorMessage(err, '更新员工账号状态'))
    } finally {
      setStatusUpdatingAdminID(null)
    }
  }

  const resetAdminPassword = async (values) => {
    const accountStatus = getAdminAccountStatus(resettingAdmin)
    if (
      !resettingAdmin?.id ||
      !accountStatus ||
      accountStatus === ADMIN_ACCOUNT_STATUS.REVOKED
    ) {
      return
    }
    setSaving(true)
    try {
      await adminRpc.call('reset_password', {
        id: resettingAdmin.id,
        password: values.password,
      })
      message.success(`已重置 ${formatAdminIdentity(resettingAdmin)} 的密码`)
      closeResetModal()
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '重置员工账号密码'))
    } finally {
      setSaving(false)
    }
  }

  const onToggleAdminStatus = (admin, checkedEnabled) => {
    const accountStatus = getAdminAccountStatus(admin)
    if (!accountStatus || accountStatus === ADMIN_ACCOUNT_STATUS.REVOKED) {
      message.info('账号状态尚未完整加载，请刷新后再操作')
      return
    }
    const controlTargetBlockReason = getAdminControlTargetBlockReason({
      currentAdmin,
      targetAdmin: admin,
      roles,
    })
    if (controlTargetBlockReason) {
      message.info(controlTargetBlockReason)
      return
    }
    if (isSameAdminAccount(currentAdmin, admin)) {
      message.info('当前登录账号不能临时停用自己')
      return
    }
    const nextDisabled = !checkedEnabled
    statusForm.setFieldsValue({ reason: '' })
    dispatchAdminDialog({
      type: 'open',
      kind: PERMISSION_CENTER_ADMIN_DIALOG.CHANGE_STATUS,
      admin,
      statusDisabled: nextDisabled,
    })
  }

  const revokeAdminAccount = async (values) => {
    if (!revokingAdmin?.id) return
    const accountStatus = getAdminAccountStatus(revokingAdmin)
    if (!accountStatus || accountStatus === ADMIN_ACCOUNT_STATUS.REVOKED) {
      message.info('该账号已经注销或状态尚未刷新，不能重复办理注销')
      return
    }
    const controlTargetBlockReason = getAdminControlTargetBlockReason({
      currentAdmin,
      targetAdmin: revokingAdmin,
      roles,
    })
    if (controlTargetBlockReason) {
      message.info(controlTargetBlockReason)
      return
    }
    if (isSameAdminAccount(currentAdmin, revokingAdmin)) {
      message.info('当前登录账号不能办理自己的离职注销')
      return
    }
    setSaving(true)
    try {
      const result = await adminRpc.call('revoke', {
        id: revokingAdmin.id,
        reason: String(values?.reason || '').trim(),
      })
      const released = Number(result?.data?.released_task_count || 0)
      message.success(
        released > 0
          ? `账号已注销，${released} 项未完成待办已退回原岗位`
          : '账号已注销并保留历史记录'
      )
      dispatchAdminDialog({ type: 'close' })
      revokeForm.resetFields()
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '注销员工账号'))
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: '姓名 / 账号',
      dataIndex: 'display_name',
      width: 210,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{getAdminDisplayName(record, '未填写姓名')}</Text>
          {record.display_name ? (
            <Text type="secondary">账号：{record.username}</Text>
          ) : (
            <Text type="warning">姓名待补录 · 账号：{record.username}</Text>
          )}
        </Space>
      ),
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 150,
      render: (phone) => phone || <Text type="secondary">未录入</Text>,
    },
    {
      title: '岗位',
      dataIndex: 'roles',
      render: (_, record) => {
        if (record.is_super_admin) {
          return <Tag color="gold">超级管理员</Tag>
        }
        const assignedRoles = Array.isArray(record.roles) ? record.roles : []
        if (assignedRoles.length === 0) {
          return <Tag color="default">未分配岗位</Tag>
        }
        return (
          <Space wrap size={[4, 6]}>
            {assignedRoles.map((role) => (
              <Tag key={getRoleKey(role)}>{getRoleVisibleName(role)}</Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: '可用功能',
      dataIndex: 'permission_count',
      width: 120,
      render: (_, record) => {
        if (record.is_super_admin) {
          return <Tag color="gold">全部功能</Tag>
        }
        const rawCount = Number(record.permission_count)
        const count =
          Number.isSafeInteger(rawCount) && rawCount > 0 ? rawCount : 0
        return count > 0 ? (
          <Tag color="blue">{count} 项</Tag>
        ) : (
          <Tag color="default">暂无功能</Tag>
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'account_status',
      width: 150,
      render: (_, record) => {
        if (record.is_super_admin) {
          return <Tag color="gold">始终启用</Tag>
        }
        const accountStatus = getAdminAccountStatus(record)
        if (accountStatus === ADMIN_ACCOUNT_STATUS.REVOKED) {
          return (
            <Space direction="vertical" size={2}>
              <Tag color="default">已注销</Tag>
              {record.status_reason ? (
                <Text
                  type="secondary"
                  ellipsis={{ tooltip: record.status_reason }}
                  style={{ maxWidth: 120 }}
                >
                  {record.status_reason}
                </Text>
              ) : null}
              <Text type="secondary">不可恢复；如需重新使用，请创建新账号</Text>
            </Space>
          )
        }
        if (!accountStatus) {
          return (
            <Space direction="vertical" size={2}>
              <Tag color="gold">状态待刷新</Tag>
              <Text type="secondary" role="note" tabIndex={0}>
                刷新账号资料后再操作
              </Text>
            </Space>
          )
        }
        const suspended = accountStatus === ADMIN_ACCOUNT_STATUS.SUSPENDED
        if (!canDisableUsers) {
          return (
            <Space direction="vertical" size={2}>
              <Tag color={suspended ? 'red' : 'green'}>
                {suspended ? '临时停用' : '启用'}
              </Tag>
              <Text type="secondary" role="note" tabIndex={0}>
                您不能启用或停用员工账号
              </Text>
            </Space>
          )
        }
        const currentAccount = isSameAdminAccount(currentAdmin, record)
        const controlTargetBlockReason = getAdminControlTargetBlockReason({
          currentAdmin,
          targetAdmin: record,
          roles,
        })
        return (
          <Space direction="vertical" size={2}>
            <Switch
              checked={accountStatus === ADMIN_ACCOUNT_STATUS.ACTIVE}
              checkedChildren="启用"
              unCheckedChildren="临时停用"
              loading={statusUpdatingAdminID === record.id}
              disabled={currentAccount || Boolean(controlTargetBlockReason)}
              onChange={(checked) => onToggleAdminStatus(record, checked)}
            />
            {currentAccount ? (
              <Text type="secondary" role="note" tabIndex={0}>
                当前登录账号不能停用自己
              </Text>
            ) : null}
            {!currentAccount && controlTargetBlockReason ? (
              <Text type="secondary" role="note" tabIndex={0}>
                {controlTargetBlockReason}
              </Text>
            ) : null}
            {record.status_reason ? (
              <Text
                type="secondary"
                ellipsis={{ tooltip: record.status_reason }}
                style={{ maxWidth: 120 }}
              >
                {record.status_reason}
              </Text>
            ) : null}
          </Space>
        )
      },
    },
    {
      title: '操作',
      width: 240,
      render: (_, record) => {
        const accountStatus = getAdminAccountStatus(record)
        const revoked = accountStatus === ADMIN_ACCOUNT_STATUS.REVOKED
        const statusUnavailable = !accountStatus
        const currentAccount = isSameAdminAccount(currentAdmin, record)
        const controlTargetBlockReason = getAdminControlTargetBlockReason({
          currentAdmin,
          targetAdmin: record,
          roles,
        })
        const roleBlockReason = !canAssignUserRoles
          ? '当前账号不能分配岗位'
          : getRoleAssignmentBlockReason({
              currentAdmin,
              targetAdmin: record,
              roles,
              isProduction: IS_PRODUCTION_BUILD,
            })
        const profileBlockReason = revoked
          ? '已注销账号不可修改资料；如需重新使用，请创建新账号'
          : statusUnavailable
            ? '账号状态尚未完整加载，请刷新后再操作'
            : !canManageUsers
              ? '当前账号不能修改员工资料'
              : getAdminProfileTargetBlockReason({
                  currentAdmin,
                  targetAdmin: record,
                  roles,
                })
        const passwordBlockReason = revoked
          ? '已注销账号不可重置密码；如需重新使用，请创建新账号'
          : statusUnavailable
            ? '账号状态尚未完整加载，请刷新后再操作'
            : !canManageUsers
              ? '当前账号不能重置密码'
              : controlTargetBlockReason
        const revokeBlockReason = revoked
          ? '账号已注销且不可恢复；如需重新使用，请创建新账号'
          : statusUnavailable
            ? '账号状态尚未完整加载，请刷新后再操作'
            : currentAccount
              ? '当前登录账号不能办理自己的离职注销'
              : controlTargetBlockReason ||
                (!canRevokeUsers ? '当前账号不能办理离职注销' : '')
        const operationBlockReasons = [
          roleBlockReason,
          profileBlockReason,
          passwordBlockReason,
          revokeBlockReason,
        ].filter(
          (reason, index, reasons) =>
            reason && reasons.indexOf(reason) === index
        )
        return (
          <Space direction="vertical" size={4}>
            <Space wrap size={[8, 8]}>
              <Button
                size="small"
                disabled={Boolean(roleBlockReason)}
                onClick={() => openEditModal(record)}
              >
                分配岗位
              </Button>
              <Button
                size="small"
                disabled={Boolean(profileBlockReason)}
                onClick={() => openProfileModal(record)}
              >
                修改资料
              </Button>
              <Button
                size="small"
                disabled={Boolean(passwordBlockReason)}
                onClick={() => openResetModal(record)}
              >
                重置密码
              </Button>
              <Button
                danger
                size="small"
                disabled={Boolean(revokeBlockReason)}
                onClick={() => {
                  if (currentAccount) return
                  revokeForm.resetFields()
                  dispatchAdminDialog({
                    type: 'open',
                    kind: PERMISSION_CENTER_ADMIN_DIALOG.REVOKE,
                    admin: record,
                  })
                }}
              >
                {revoked ? '已注销' : '离职注销'}
              </Button>
            </Space>
            {record.is_super_admin ? (
              <Text type="secondary">仅允许本人修改姓名和手机号</Text>
            ) : null}
            {operationBlockReasons.length > 0 ? (
              <Text type="secondary" role="note" tabIndex={0}>
                操作受限：{operationBlockReasons.join('；')}
              </Text>
            ) : null}
          </Space>
        )
      },
    },
  ]

  const emptyText = !canReadUsers ? (
    <Empty description="无权查看员工账号" />
  ) : loading ? (
    <Empty description="加载中..." />
  ) : hasAdminFilter ? (
    <Empty description="没有匹配的员工账号" />
  ) : (
    <Empty description="暂无员工账号" />
  )

  if (loading && admins.length === 0 && !currentAdmin) {
    return (
      <Loading
        title="岗位设置加载中"
        description="正在加载员工账号和岗位，请稍候..."
      />
    )
  }

  const roleTemplateTab = (
    <Card
      className="erp-permission-section erp-permission-section--roles"
      variant="borderless"
    >
      <div className="erp-role-center-layout">
        <aside className="erp-role-center-sidebar" aria-label="岗位列表">
          {roles.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无岗位"
            />
          ) : (
            roles.map((role) => {
              const roleKey = getRoleKey(role)
              const summary =
                roleSummaries.find((item) => item.key === roleKey) || {}
              const selected = roleKey === selectedRoleKey
              return (
                <button
                  key={roleKey}
                  type="button"
                  className={`erp-role-template-card${
                    selected ? ' erp-role-template-card--active' : ''
                  }`}
                  aria-pressed={selected}
                  onClick={() => selectRoleTemplate(roleKey)}
                >
                  <span className="erp-role-template-card__main">
                    <Text strong>{getRoleVisibleName(role)}</Text>
                    <RightOutlined aria-hidden="true" />
                  </span>
                  <span className="erp-role-template-card__meta">
                    <Text type="secondary">
                      {summary.permissionSummary?.total || 0} 项功能
                      {canReadUsers
                        ? ` · ${summary.adminCount || 0} 个账号`
                        : ''}
                    </Text>
                    {role.disabled ? <Tag>已停用</Tag> : null}
                  </span>
                </button>
              )
            })
          )}
        </aside>

        <section className="erp-role-center-detail">
          {selectedRole ? (
            <>
              <div className="erp-role-center-detail__head">
                <div className="erp-role-center-detail__identity">
                  <Space size={8} wrap>
                    <Title level={5} style={{ margin: 0 }}>
                      {getRoleVisibleName(selectedRole)}
                    </Title>
                    <Tag
                      color={
                        selectedRole.role_type === 'system' ? 'cyan' : 'blue'
                      }
                    >
                      {getRoleTypeLabel(selectedRole)}
                    </Tag>
                  </Space>
                  <Text type="secondary">
                    {selectedRolePermissionSummary.total} 项功能
                    {canReadUsers
                      ? ` · ${selectedRoleAdmins.length} 个账号`
                      : ''}
                  </Text>
                </div>
                <div className="erp-role-center-actions">
                  <Popover
                    placement="bottomRight"
                    trigger={['hover', 'focus', 'click']}
                    rootClassName="erp-permission-help-popover"
                    content={
                      <div className="erp-permission-help">
                        <Text strong>菜单与操作</Text>
                        <Text>
                          查看类功能决定菜单是否出现；办理类功能决定进入页面后能做什么。
                        </Text>
                        <Text strong>操作如何生效</Text>
                        <Text>
                          岗位可用操作 = 系统允许 ∩ 模块已启用 ∩ 当前版本已开放
                          − 岗位撤销
                        </Text>
                        <Text type="secondary">
                          “∩”表示这些条件必须同时满足，“−”表示从结果中明确扣除。
                        </Text>
                        <Text type="secondary">
                          员工有多个岗位时，系统先分别计算每个岗位，再合并结果；某一岗位撤销的操作，不会删掉另一个岗位正式拥有的操作。
                        </Text>
                        <Text type="secondary">
                          具体办理时还会继续检查数据范围、负责岗位、单据状态和前置审批等条件。
                        </Text>
                        <Text type="secondary">
                          当前调整仅预览，保存岗位设置后生效。
                        </Text>
                      </div>
                    }
                  >
                    <Button
                      type="text"
                      shape="circle"
                      icon={<QuestionCircleOutlined />}
                      aria-label="菜单与操作说明"
                      className="erp-permission-help-trigger"
                    />
                  </Popover>
                  <Tag color={roleConfigurationDirty ? 'orange' : 'green'}>
                    {roleConfigurationDirty ? '有未保存调整' : '已保存'}
                  </Tag>
                  <Button
                    type="primary"
                    className="erp-role-center-save"
                    loading={saving}
                    disabled={
                      !canManageRolePermissions ||
                      !selectedRoleKey ||
                      !roleConfigurationDirty ||
                      roleDataScopeInvalid ||
                      roleNavigationInvalid ||
                      selectedRoleReadOnly
                    }
                    onClick={saveRolePermissions}
                  >
                    保存岗位设置
                  </Button>
                </div>
              </div>

              {selectedRoleConflict ? (
                <Alert
                  type="warning"
                  showIcon
                  message={
                    selectedRoleConflict.refreshed
                      ? '已载入最新岗位，当前勾选仍为你的草稿'
                      : '该岗位已被其他人修改'
                  }
                  description={
                    selectedRoleConflict.refreshed
                      ? '请核对当前勾选与最新岗位设置的差异，确认后可再次保存；页面没有覆盖你的草稿。'
                      : '当前勾选已经保留。请先刷新最新岗位资料，再核对并重新保存，避免覆盖他人的调整。'
                  }
                  action={
                    <Button size="small" onClick={refreshConflictedRole}>
                      刷新并保留当前勾选
                    </Button>
                  }
                />
              ) : null}

              {selectedRoleReadOnly ? (
                <Alert
                  type="warning"
                  showIcon
                  message={
                    selectedRole.role_type === 'system'
                      ? '系统内置岗位只能查看'
                      : '当前岗位只能查看'
                  }
                  description={selectedRoleReadOnlyReason}
                />
              ) : null}

              <Tabs
                className="erp-role-policy-tabs"
                defaultActiveKey="functions"
                items={[
                  {
                    key: 'functions',
                    label: '可用功能',
                    children: (
                      <div className="erp-role-policy-tab-content">
                        {permissionDraftAccessError ? (
                          <Alert
                            type="warning"
                            showIcon
                            message="公司当前启用范围暂时核对失败"
                            description={`${permissionDraftAccessError}。页面先按当前岗位权限显示，保存前请重试。`}
                          />
                        ) : null}
                        <PermissionChecklist
                          groups={permissionGroups}
                          access={roleAccessForCurrentDraft}
                          accessLoading={roleAccessForCurrentDraftLoading}
                          placementByPath={permissionMenuPlacementByPath}
                          permissionDetailMap={permissionDetailMap}
                          value={selectedRolePermissionKeys}
                          disabled={
                            !canManageRolePermissions ||
                            !selectedRoleKey ||
                            selectedRoleReadOnly
                          }
                          onChange={changeSelectedRolePermissions}
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'data-scope',
                    label: '数据范围',
                    children: (
                      <DataScopeOverview
                        mode={selectedWarehouseScopeMode}
                        warehouseIds={selectedWarehouseScopeIDs}
                        warehouseOptions={warehouseScopeSelectOptions}
                        disabled={
                          !canManageRolePermissions || selectedRoleReadOnly
                        }
                        onModeChange={(nextMode) => {
                          setSelectedWarehouseScopeMode(nextMode)
                          if (nextMode !== 'ASSIGNED') {
                            setSelectedWarehouseScopeIDs([])
                          }
                        }}
                        onWarehouseIdsChange={setSelectedWarehouseScopeIDs}
                      />
                    ),
                  },
                  {
                    key: 'sensitive-fields',
                    label: '敏感字段',
                    children: (
                      <SensitiveFieldOverview
                        permissionKeys={selectedRolePermissionKeys}
                      />
                    ),
                  },
                  {
                    key: 'effective-pages',
                    label: '页面与导航',
                    children: (
                      <Tabs
                        className="erp-role-navigation-workspace-tabs"
                        type="card"
                        size="small"
                        activeKey={roleNavigationViewKey}
                        destroyOnHidden={false}
                        onChange={setRoleNavigationViewKey}
                        items={[
                          {
                            key: ROLE_NAVIGATION_VIEW_KEYS.LAYOUT,
                            label: '菜单布局',
                            children: (
                              <Space
                                direction="vertical"
                                size={20}
                                style={{ width: '100%' }}
                              >
                                {roleAccessForCurrentDraft?.is_final !==
                                true ? (
                                  <Alert
                                    type="warning"
                                    showIcon
                                    message="页面可用范围尚未完成核对"
                                    description="完成公司当前启用范围核对后，才能调整岗位菜单布局。"
                                    action={
                                      <Button
                                        size="small"
                                        onClick={() =>
                                          setRoleNavigationViewKey(
                                            ROLE_NAVIGATION_VIEW_KEYS.ACCESS
                                          )
                                        }
                                      >
                                        查看页面可用范围
                                      </Button>
                                    }
                                  />
                                ) : null}
                                <RoleNavigationEditor
                                  mode={selectedRoleNavigationMode}
                                  primaryMenuPaths={
                                    selectedRolePrimaryMenuPaths
                                  }
                                  secondaryMenuPaths={
                                    selectedRoleSecondaryMenuPaths
                                  }
                                  options={roleNavigationOptions}
                                  unavailablePaths={
                                    unavailableRoleNavigationPaths
                                  }
                                  disabled={
                                    !canManageRolePermissions ||
                                    selectedRoleReadOnly ||
                                    roleAccessForCurrentDraft?.is_final !== true
                                  }
                                  onModeChange={(nextMode) => {
                                    setSelectedRoleNavigationDraft(
                                      (current) => {
                                        const currentDraft =
                                          current.roleKey === selectedRoleKey &&
                                          current.roleVersion ===
                                            selectedRoleVersion
                                            ? current
                                            : {
                                                roleKey: selectedRoleKey,
                                                roleVersion:
                                                  selectedRoleVersion,
                                                mode: selectedRoleNavigationMode,
                                                primaryMenuPaths:
                                                  selectedRolePrimaryMenuPaths,
                                                secondaryMenuPaths:
                                                  selectedRoleSecondaryMenuPaths,
                                              }
                                        if (
                                          nextMode ===
                                          ROLE_NAVIGATION_MODES.RECOMMENDED
                                        ) {
                                          return {
                                            roleKey: selectedRoleKey,
                                            roleVersion: selectedRoleVersion,
                                            mode: ROLE_NAVIGATION_MODES.RECOMMENDED,
                                            primaryMenuPaths: [],
                                            secondaryMenuPaths: [],
                                          }
                                        }
                                        return {
                                          ...currentDraft,
                                          mode: ROLE_NAVIGATION_MODES.CUSTOM,
                                        }
                                      }
                                    )
                                  }}
                                  onPrimaryMenuPathsChange={(
                                    primaryMenuPaths
                                  ) =>
                                    setSelectedRoleNavigationDraft(
                                      (current) => {
                                        const currentDraft =
                                          current.roleKey === selectedRoleKey &&
                                          current.roleVersion ===
                                            selectedRoleVersion
                                            ? current
                                            : {
                                                roleKey: selectedRoleKey,
                                                roleVersion:
                                                  selectedRoleVersion,
                                                mode: selectedRoleNavigationMode,
                                                primaryMenuPaths:
                                                  selectedRolePrimaryMenuPaths,
                                                secondaryMenuPaths:
                                                  selectedRoleSecondaryMenuPaths,
                                              }
                                        return {
                                          ...currentDraft,
                                          primaryMenuPaths,
                                        }
                                      }
                                    )
                                  }
                                  onSecondaryMenuPathsChange={(
                                    secondaryMenuPaths
                                  ) =>
                                    setSelectedRoleNavigationDraft(
                                      (current) => {
                                        const currentDraft =
                                          current.roleKey === selectedRoleKey &&
                                          current.roleVersion ===
                                            selectedRoleVersion
                                            ? current
                                            : {
                                                roleKey: selectedRoleKey,
                                                roleVersion:
                                                  selectedRoleVersion,
                                                mode: selectedRoleNavigationMode,
                                                primaryMenuPaths:
                                                  selectedRolePrimaryMenuPaths,
                                                secondaryMenuPaths:
                                                  selectedRoleSecondaryMenuPaths,
                                              }
                                        return {
                                          ...currentDraft,
                                          secondaryMenuPaths,
                                        }
                                      }
                                    )
                                  }
                                  onViewPageAccess={() =>
                                    setRoleNavigationViewKey(
                                      ROLE_NAVIGATION_VIEW_KEYS.ACCESS
                                    )
                                  }
                                />
                                <NavigationPlacementOverview
                                  access={roleAccessForCurrentDraft}
                                  roleKey={selectedRoleKey}
                                  navigationMode={selectedRoleNavigationMode}
                                  primaryMenuPaths={
                                    selectedRolePrimaryMenuPaths
                                  }
                                  secondaryMenuPaths={
                                    selectedRoleSecondaryMenuPaths
                                  }
                                  dirty={roleConfigurationDirty}
                                  loading={roleAccessForCurrentDraftLoading}
                                />
                              </Space>
                            ),
                          },
                          {
                            key: ROLE_NAVIGATION_VIEW_KEYS.ACCESS,
                            label: `页面可用范围（${effectiveRolePageCount}）`,
                            children: (
                              <Space
                                direction="vertical"
                                size={20}
                                style={{ width: '100%' }}
                              >
                                <EffectiveRoleAccessOverview
                                  access={roleAccessForCurrentDraft}
                                  loading={roleAccessForCurrentDraftLoading}
                                />
                                <div>
                                  <Text strong>当前勾选的功能影响</Text>
                                  <Paragraph type="secondary">
                                    根据已选功能预览这个岗位可进入的页面；保存后还会结合公司当前启用范围。
                                  </Paragraph>
                                  <PermissionImpactMap
                                    permissions={[
                                      ...permissionDetailMap.values(),
                                    ]}
                                    permissionKeys={selectedRolePermissionKeys}
                                  />
                                </div>
                              </Space>
                            ),
                          },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'associated-accounts',
                    label: canReadUsers
                      ? `关联账号（${selectedRoleAdmins.length}）`
                      : '关联账号',
                    children: (
                      <RoleAssociatedAccounts
                        admins={selectedRoleAdmins}
                        currentRoleKey={selectedRoleKey}
                        canReadUsers={canReadUsers}
                        onOpenAdminAccounts={openSelectedRoleAdminAccounts}
                      />
                    ),
                  },
                ]}
              />
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="请选择一个岗位"
            />
          )}
        </section>
      </div>
    </Card>
  )

  const adminAccountTab = (
    <Card
      className="erp-permission-section erp-permission-section--admins"
      variant="borderless"
    >
      <Space
        size={12}
        style={{ width: '100%', justifyContent: 'space-between' }}
        wrap
      >
        <div>
          <Text className="erp-permission-section__eyebrow">账号分配</Text>
          <Title level={5} style={{ margin: 0 }}>
            员工账号与岗位
          </Title>
          <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
            新账号默认不能进入业务页面。分配多个岗位时，员工获得各岗位最终有效页面和操作的合并，仍受客户设置和业务状态限制。
          </Paragraph>
        </div>
        <Space size={8} wrap>
          {canReadUsers ? (
            <Tag color="green">共 {admins.length} 个员工账号</Tag>
          ) : null}
          <Button
            type="primary"
            disabled={!canCreateUsers}
            onClick={openCreateModal}
          >
            创建员工账号
          </Button>
        </Space>
      </Space>

      <div className="erp-permission-list-toolbar">
        <div className="erp-permission-list-toolbar__filters">
          <Input
            allowClear
            className="erp-permission-list-toolbar__search"
            value={adminSearchKeyword}
            placeholder="搜索姓名、员工账号、手机号或岗位"
            onChange={(event) => {
              setAdminSearchKeyword(event.target.value)
              setTablePagination((prev) => ({ ...prev, current: 1 }))
            }}
          />
          <Select
            value={adminStatusFilter}
            options={adminStatusOptions}
            onChange={(value) => {
              setAdminStatusFilter(value || ADMIN_STATUS_FILTERS.ALL)
              setTablePagination((prev) => ({ ...prev, current: 1 }))
            }}
          />
        </div>
        <Text type="secondary">
          {!canReadUsers
            ? '无权查看员工账号列表'
            : hasAdminFilter
              ? `命中 ${filteredAdmins.length}/${admins.length} 个员工账号`
              : `共 ${admins.length} 个员工账号`}
        </Text>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredAdmins}
        loading={loading}
        pagination={{
          current: tablePagination.current,
          pageSize: tablePagination.pageSize,
          pageSizeOptions: TABLE_PAGE_SIZE_OPTIONS,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
        }}
        locale={{ emptyText }}
        scroll={{ x: 1100 }}
        onChange={handleTableChange}
      />
    </Card>
  )

  return (
    <Space
      className="erp-permission-page"
      direction="vertical"
      size={12}
      style={{ width: '100%' }}
    >
      <Title level={1} className="erp-permission-page__title">
        权限管理
      </Title>
      {permissionWarningMessages.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message="当前账号部分操作受限"
          description={`${permissionWarningMessages.join('；')}。超级管理员账号只能由超级管理员维护。`}
        />
      ) : null}

      <Tabs
        activeKey={activeTabKey}
        className="erp-permission-tabs"
        items={[
          {
            key: PERMISSION_CENTER_TAB_KEYS.ROLES,
            label: (
              <span className="erp-permission-tabs__label">
                岗位设置
                <Tag color="blue">{roles.length}</Tag>
              </span>
            ),
            children: roleTemplateTab,
          },
          {
            key: PERMISSION_CENTER_TAB_KEYS.ADMINS,
            label: (
              <span className="erp-permission-tabs__label">
                员工账号
                {canReadUsers ? <Tag color="green">{admins.length}</Tag> : null}
              </span>
            ),
            children: adminAccountTab,
          },
          canReadApprovalResponsibilities
            ? {
                key: PERMISSION_CENTER_TAB_KEYS.APPROVALS,
                label: (
                  <span className="erp-permission-tabs__label">
                    审批责任
                    <Tag color="purple">3</Tag>
                  </span>
                ),
                children: (
                  <ApprovalResponsibilityPanel
                    active={
                      activeTabKey === PERMISSION_CENTER_TAB_KEYS.APPROVALS
                    }
                    admins={admins}
                    roles={roles}
                    currentAdmin={currentAdmin}
                    canRead={canReadApprovalResponsibilities}
                    canManage={canManageApprovalResponsibilities}
                    readOnlyReason={approvalReadOnlyReason}
                    discardVersion={approvalDiscardVersion}
                    refreshVersion={approvalRefreshVersion}
                    onDirtyChange={setApprovalResponsibilityDirty}
                  />
                ),
              }
            : null,
        ].filter(Boolean)}
        onChange={changePermissionCenterTab}
      />

      <Modal
        title="创建员工账号"
        className="erp-permission-modal"
        open={createModalOpen}
        onCancel={closeCreateModal}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        centered
        width={720}
        forceRender
      >
        <Form form={createForm} layout="vertical" onFinish={createAdmin}>
          <Form.Item
            label="姓名"
            name="display_name"
            validateFirst
            rules={[
              { required: true, message: '请输入员工姓名' },
              {
                validator: (_, value) => {
                  const displayName = String(value || '').trim()
                  if (!displayName) {
                    return Promise.reject(new Error('请输入员工姓名'))
                  }
                  return Array.from(displayName).length <= 64
                    ? Promise.resolve()
                    : Promise.reject(new Error('员工姓名不能超过 64 个字符'))
                },
              },
            ]}
          >
            <Input placeholder="例如 张三" autoComplete="name" />
          </Form.Item>
          <DuplicateAdminNameWarning
            matches={createDuplicateNameAdmins}
            style={{ marginBottom: 24 }}
          />
          <Form.Item
            label="账号"
            name="username"
            extra={ADMIN_USERNAME_RULE_TEXT}
            validateFirst
            rules={[
              { required: true, message: '请输入员工账号' },
              {
                validator: (_, value) => {
                  const validationMessage =
                    getAdminUsernameValidationMessage(value)
                  return validationMessage
                    ? Promise.reject(new Error(validationMessage))
                    : Promise.resolve()
                },
              },
            ]}
          >
            <Input
              placeholder="例如 sales01 或 sales_01"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={ADMIN_USERNAME_MAX_LENGTH}
            />
          </Form.Item>
          <Form.Item
            label="手机号"
            name="phone"
            rules={[optionalMainlandMobilePhoneRule()]}
          >
            <Input placeholder="可选，用于短信登录" inputMode="tel" />
          </Form.Item>
          <Form.Item
            label="初始密码"
            name="password"
            rules={[
              { required: true, message: '请输入初始密码' },
              adminPasswordPolicyRule(),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="岗位" name="role_keys">
            <Select
              mode="multiple"
              allowClear
              disabled={!canAssignUserRoles}
              placeholder={
                canAssignUserRoles
                  ? '选择一个或多个岗位'
                  : '当前账号只能创建未分配岗位的账号'
              }
              options={roleOptions}
            />
          </Form.Item>
          {!canAssignUserRoles ? (
            <Alert
              type="info"
              showIcon
              message="创建后暂不分配岗位"
              description="当前账号不能分配岗位，只能创建未分配岗位的账号；后续请联系账号负责人完成设置。"
            />
          ) : null}
        </Form>
      </Modal>

      <Modal
        className="erp-permission-modal"
        title={
          editingAdmin?.username
            ? `分配岗位：${formatAdminIdentity(editingAdmin)}`
            : '分配岗位'
        }
        open={editModalOpen}
        onCancel={closeEditModal}
        onOk={saveAdminRoles}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        centered
        width={720}
        forceRender
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="多个岗位会合并最终有效权限"
            description="例如财务兼采购账号可以同时获得两类岗位已放行的页面和操作；页面可见不代表拥有页面内全部按钮。姓名和登录手机号请使用账号列表中的“修改资料”。"
          />
          <label>
            <Text strong>岗位</Text>
            <Select
              mode="multiple"
              allowClear
              value={selectedRoleKeys}
              options={roleOptions}
              placeholder="选择一个或多个可分配岗位"
              style={{ width: '100%', marginTop: 8 }}
              onChange={setSelectedRoleKeys}
            />
          </label>
        </Space>
      </Modal>

      <Modal
        className="erp-permission-modal"
        title={
          profileAdmin?.username
            ? `修改资料：${formatAdminIdentity(profileAdmin)}`
            : '修改员工资料'
        }
        open={profileModalOpen}
        onCancel={closeProfileModal}
        onOk={saveAdminProfile}
        confirmLoading={saving}
        okText="保存资料"
        cancelText="取消"
        centered
        width={520}
        forceRender
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="姓名用于任务记录、审批责任和业务操作人展示"
            description="账号和岗位不会随本次操作改变；手机号留空表示解除短信登录手机号。"
          />
          <label>
            <Text strong>姓名</Text>
            <Input
              value={editingDisplayName}
              placeholder="例如 张三"
              autoComplete="name"
              style={{ marginTop: 8 }}
              onChange={(event) => setEditingDisplayName(event.target.value)}
            />
          </label>
          <DuplicateAdminNameWarning matches={profileDuplicateNameAdmins} />
          <label>
            <Text strong>登录手机号</Text>
            <Input
              value={editingPhone}
              placeholder="可选，用于短信登录"
              inputMode="tel"
              style={{ marginTop: 8 }}
              onChange={(event) => setEditingPhone(event.target.value)}
            />
          </label>
        </Space>
      </Modal>

      <Modal
        className="erp-permission-modal"
        title={
          resettingAdmin?.username
            ? `重置密码：${formatAdminIdentity(resettingAdmin)}`
            : '重置密码'
        }
        open={resetModalOpen}
        onCancel={closeResetModal}
        onOk={() => resetForm.submit()}
        confirmLoading={saving}
        okText="重置"
        cancelText="取消"
        centered
        forceRender
      >
        <Form form={resetForm} layout="vertical" onFinish={resetAdminPassword}>
          <Form.Item
            label="新密码"
            name="password"
            rules={[
              { required: true, message: '请输入新密码' },
              adminPasswordPolicyRule(),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        className="erp-permission-modal"
        title={statusActionDisabled ? '临时停用账号' : '恢复账号使用'}
        open={statusModalOpen}
        onCancel={() => {
          dispatchAdminDialog({ type: 'close' })
          statusForm.resetFields()
        }}
        onOk={() => statusForm.submit()}
        confirmLoading={statusUpdatingAdminID === statusActionAdmin?.id}
        okText={statusActionDisabled ? '确认临时停用' : '确认启用'}
        cancelText="取消"
        centered
        forceRender
      >
        <Alert
          type={statusActionDisabled ? 'warning' : 'info'}
          showIcon
          message={
            statusActionDisabled
              ? `${formatAdminIdentity(statusActionAdmin)} 将立即无法继续访问后台`
              : `${formatAdminIdentity(statusActionAdmin)} 将恢复登录和原有岗位功能`
          }
          style={{ marginBottom: 16 }}
        />
        <Form form={statusForm} layout="vertical" onFinish={applyAdminStatus}>
          <Form.Item
            label="变更原因"
            name="reason"
            rules={
              statusActionDisabled
                ? [{ required: true, message: '请填写临时停用原因' }]
                : []
            }
          >
            <Input.TextArea
              maxLength={255}
              showCount
              rows={3}
              placeholder="例如：临时离岗、安全核查或恢复正常使用"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        className="erp-permission-modal"
        title="离职注销账号"
        open={revokeModalOpen}
        onCancel={() => {
          dispatchAdminDialog({ type: 'close' })
          revokeForm.resetFields()
        }}
        onOk={() => revokeForm.submit()}
        confirmLoading={saving}
        okText="确认注销"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        centered
        forceRender
      >
        <Alert
          type="warning"
          showIcon
          message={`将正式注销 ${formatAdminIdentity(revokingAdmin)}`}
          description="账号和历史操作记录会保留，未完成的个人待办将退回原负责岗位，供该岗位其他人员继续处理。注销不可恢复；如需该人员重新使用系统，必须创建新账号。"
          style={{ marginBottom: 16 }}
        />
        <Form form={revokeForm} layout="vertical" onFinish={revokeAdminAccount}>
          <Form.Item
            label="注销原因"
            name="reason"
            rules={[{ required: true, message: '请填写离职或注销原因' }]}
          >
            <Input.TextArea
              maxLength={255}
              showCount
              rows={3}
              placeholder="例如：员工离职，账号停止使用"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
