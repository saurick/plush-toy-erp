import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
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
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  ADMIN_ACCOUNT_STATUS,
  ADMIN_STATUS_FILTERS,
  filterAdminRecords,
  filterPermissionGroups,
  getAdminAccountStatus,
} from '../utils/permissionCenterSearch.mjs'
import {
  isValidMainlandMobilePhone,
  optionalMainlandMobilePhoneRule,
} from '../utils/contactValidation.mjs'
import { adminPasswordPolicyRule } from '../utils/adminPasswordPolicy.mjs'
import { getPermissionModuleTitle } from '../utils/permissionModuleLabels.mjs'
import { isMenuVisibleForPermissionKeys } from '../utils/menuAccessProjection.mjs'
import {
  buildAssignableRoleOptions,
  filterAssignableBusinessPermissions,
  getAdminControlTargetBlockReason,
  getPermissionCenterRoleVersion,
  getRoleAssignmentBlockReason,
  getRolePermissionReadOnlyReason,
  getRoleTypeLabel,
  isSameAdminAccount,
  normalizePermissionUsage,
} from '../utils/permissionCenterAccess.mjs'
import { getRoleDisplayName } from '../utils/roleKeys.mjs'

const { Paragraph, Text, Title } = Typography

const TABLE_PAGE_SIZE_OPTIONS = ['8', '10', '20', '50', '100']
const DEFAULT_TABLE_PAGE_SIZE = 8
const IS_PRODUCTION_BUILD = import.meta.env.PROD === true
const READ_USER_PERMISSION = 'system.user.read'
const READ_ROLE_PERMISSION = 'system.role.read'
const READ_PERMISSION_PERMISSION = 'system.permission.read'
const MANAGE_ROLE_PERMISSION = 'system.role.permission.manage'
const UPDATE_USER_PERMISSION = 'system.user.update'
const ASSIGN_USER_ROLE_PERMISSION = 'system.user.role.assign'
const CREATE_USER_PERMISSION = 'system.user.create'
const DISABLE_USER_PERMISSION = 'system.user.disable'
const REVOKE_USER_PERMISSION = 'system.user.revoke'
const PERMISSION_CENTER_TAB_KEYS = {
  ROLES: 'roles',
  ADMINS: 'admins',
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

function getRoleKey(role = {}) {
  return String(role?.role_key || role?.key || '').trim()
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

function buildPermissionGroups(permissions = []) {
  const groups = new Map()
  const sourcePermissions = Array.isArray(permissions) ? permissions : []
  sourcePermissions.forEach((permission) => {
    const permissionKey = getPermissionKey(permission)
    if (!permissionKey) {
      return
    }
    const moduleKey = String(permission.module || 'other').trim() || 'other'
    const group = groups.get(moduleKey) || {
      key: moduleKey,
      title: getPermissionModuleTitle(moduleKey),
      items: [],
    }
    group.items.push({
      key: permissionKey,
      label: getPermissionVisibleName(permission),
      description: permission.description || '',
      usage: normalizePermissionUsage(permission.usage || {}),
    })
    groups.set(moduleKey, group)
  })
  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((left, right) => left.key.localeCompare(right.key)),
  }))
}

function buildPermissionDetailMap(permissions = []) {
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
    })
  })
  return detailMap
}

function buildRoleMenuProjection(menus = [], permissionKeys = []) {
  return (Array.isArray(menus) ? menus : [])
    .map((menu) => {
      return {
        key: String(menu?.key || menu?.path || '').trim(),
        label: String(menu?.label || '').trim() || '未命名菜单',
        visible: isMenuVisibleForPermissionKeys(menu, permissionKeys),
      }
    })
    .filter((menu) => menu.key)
}

function RoleCapabilityOverview({ menus = [], permissionKeys = [] }) {
  const projectedMenus = useMemo(
    () => buildRoleMenuProjection(menus, permissionKeys),
    [menus, permissionKeys]
  )
  const visibleMenus = projectedMenus.filter((menu) => menu.visible)
  const hiddenMenus = projectedMenus.filter((menu) => !menu.visible)

  return (
    <section
      className="erp-role-capability-overview"
      aria-labelledby="erp-role-capability-overview-title"
    >
      <div className="erp-role-capability-overview__head">
        <div>
          <Text strong id="erp-role-capability-overview-title">
            可使用的页面
          </Text>
          <Paragraph type="secondary">
            根据已选功能预览这个岗位可进入的页面，实际页面以公司当前启用功能为准。
          </Paragraph>
        </div>
        <Tag color="green">{visibleMenus.length} 个页面</Tag>
      </div>

      <div className="erp-role-capability-overview__grid">
        <div className="erp-role-capability-card erp-role-capability-card--enabled">
          <div className="erp-role-capability-card__title">
            <Text strong>可以使用</Text>
            <Tag color="green">{visibleMenus.length}</Tag>
          </div>
          <div className="erp-role-capability-card__items">
            {visibleMenus.length > 0 ? (
              visibleMenus.map((menu) => (
                <Tag key={menu.key} color="green">
                  {menu.label}
                </Tag>
              ))
            ) : (
              <Text type="secondary">当前岗位还没有可使用的页面</Text>
            )}
          </div>
        </div>

        <div className="erp-role-capability-card">
          <div className="erp-role-capability-card__title">
            <Text strong>暂不可使用</Text>
            <Tag>{hiddenMenus.length}</Tag>
          </div>
          <div className="erp-role-capability-card__items erp-role-capability-card__items--muted">
            {hiddenMenus.length > 0 ? (
              hiddenMenus.map((menu) => <Tag key={menu.key}>{menu.label}</Tag>)
            ) : (
              <Text type="secondary">当前岗位已可使用全部页面</Text>
            )}
          </div>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        message="最终可用页面以公司当前设置为准"
        description="公司可关闭暂不使用的页面和操作；岗位设置不会因此扩大。"
      />
    </section>
  )
}

function PermissionImpactMap({
  permissions = [],
  menus = [],
  permissionKeys = [],
}) {
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
        message="这里按业务页面说明每项功能的影响范围"
        description="实际能否使用，还要看公司当前启用范围、单据状态和任务负责人。"
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
      <RoleCapabilityOverview menus={menus} permissionKeys={permissionKeys} />
    </Space>
  )
}

function DataScopeOverview() {
  return (
    <div className="erp-role-policy-boundary">
      <Alert
        type="warning"
        showIcon
        message="数据查看范围暂不可设置"
        description="目前岗位按功能控制；客户、订单、仓库、采购和财务资料还不能按本人、负责人或指定范围细分。"
      />
      <div className="erp-role-policy-boundary__grid">
        <div>
          <Text strong>任务</Text>
          <Tag color="green">按负责人限制</Tag>
          <Text type="secondary">责任岗位或指定处理人</Text>
        </div>
        <div>
          <Text strong>业务单据</Text>
          <Tag color="gold">按可用功能</Tag>
          <Text type="secondary">暂不能按负责人或指定范围细分</Text>
        </div>
        <div>
          <Text strong>仓库数据</Text>
          <Tag color="gold">按可用功能</Tag>
          <Text type="secondary">暂不能按指定仓库细分</Text>
        </div>
        <div>
          <Text strong>财务数据</Text>
          <Tag color="gold">按可用功能</Tag>
          <Text type="secondary">暂不能按查看范围细分</Text>
        </div>
      </div>
    </div>
  )
}

function SensitiveFieldOverview() {
  return (
    <div className="erp-role-policy-boundary">
      <Alert
        type="warning"
        showIcon
        message="敏感信息权限暂不可单独设置"
        description="成本、结算账户和联系方式等内容目前不能按岗位分别开放，系统会按现有页面规则统一显示或隐藏。"
      />
      <div className="erp-role-policy-boundary__grid">
        <div>
          <Text strong>成本与毛利</Text>
          <Tag>尚未开放</Tag>
          <Text type="secondary">成本、单价、毛利和毛利率</Text>
        </div>
        <div>
          <Text strong>财务与结算</Text>
          <Tag>尚未开放</Tag>
          <Text type="secondary">应收应付、账户、发票和税务信息</Text>
        </div>
        <div>
          <Text strong>客商敏感信息</Text>
          <Tag>尚未开放</Tag>
          <Text type="secondary">手机号、详细地址、内部评级和风险备注</Text>
        </div>
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

function summarizeRolePermissions(
  permissionKeys,
  permissionDetailMap = new Map()
) {
  const keys = normalizeStringList(permissionKeys)
  const moduleCounts = new Map()
  let mobileAccessCount = 0
  let actionPermissionCount = 0

  keys.forEach((permissionKey) => {
    const detail = permissionDetailMap.get(permissionKey)
    if (!detail) return
    const moduleKey = detail.module || 'other'
    moduleCounts.set(moduleKey, (moduleCounts.get(moduleKey) || 0) + 1)
    if (detail.module === 'mobile') {
      mobileAccessCount += 1
    }
    if (!['access', 'read'].includes(detail.action)) {
      actionPermissionCount += 1
    }
  })

  return {
    total: [...moduleCounts.values()].reduce(
      (total, count) => total + count,
      0
    ),
    moduleCounts,
    mobileAccessCount,
    actionPermissionCount,
  }
}

function PermissionChecklist({
  groups,
  value = [],
  onChange,
  disabled = false,
}) {
  const [keyword, setKeyword] = useState('')
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const normalizedValue = useMemo(() => normalizeStringList(value), [value])
  const selectedKeySet = useMemo(
    () => new Set(normalizedValue),
    [normalizedValue]
  )
  const visibleGroups = useMemo(() => {
    const filteredGroups = filterPermissionGroups(groups, keyword)
    if (!showSelectedOnly) {
      return filteredGroups
    }
    return filteredGroups
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => selectedKeySet.has(item.key)),
      }))
      .filter((section) => section.items.length > 0)
  }, [groups, keyword, selectedKeySet, showSelectedOnly])

  const handleSectionChange = (sectionKeys, nextSectionValues) => {
    const next = [
      ...normalizedValue.filter((item) => !sectionKeys.includes(item)),
      ...(nextSectionValues || []),
    ]
    onChange?.([...new Set(next)])
  }

  return (
    <div className="erp-permission-checklist-shell">
      <div className="erp-permission-checklist-toolbar">
        <Input
          allowClear
          className="erp-permission-checklist-search"
          value={keyword}
          placeholder="搜索功能名称或业务分类"
          onChange={(event) => setKeyword(event.target.value)}
        />
        <label className="erp-permission-checklist-filter">
          <Switch
            size="small"
            checked={showSelectedOnly}
            onChange={setShowSelectedOnly}
          />
          <span>只看已选</span>
        </label>
      </div>
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
          const hasKeyword = Boolean(String(keyword || '').trim())
          const allOriginalSelected =
            originalSectionKeys.length > 0 &&
            originalSectionKeys.every((item) => selectedKeySet.has(item))

          return (
            <section
              className="erp-permission-checklist__section"
              key={section.key}
            >
              <div className="erp-permission-checklist__header">
                <span className="erp-permission-checklist__title">
                  <Text strong>{section.title}</Text>
                  <Text type="secondary">
                    {hasKeyword || showSelectedOnly
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
                options={section.items.map((item) => ({
                  label: (
                    <span className="erp-permission-option">
                      <span className="erp-permission-option__label">
                        {item.label}
                      </span>
                      <span className="erp-permission-option__impact">
                        {item.usage?.defaultActionLabel ||
                          item.usage?.pages?.[0]?.actionLabel ||
                          '业务功能'}
                        {item.usage?.pages?.length > 0
                          ? ` · ${[
                              ...new Set(
                                item.usage.pages
                                  .map((page) => page.pageLabel)
                                  .filter(Boolean)
                              ),
                            ].join('、')}`
                          : ''}
                      </span>
                    </span>
                  ),
                  value: item.key,
                }))}
                value={selectedKeys}
                disabled={disabled}
                onChange={(nextValues) =>
                  handleSectionChange(sectionKeys, nextValues)
                }
                className="erp-permission-grid"
              />
            </section>
          )
        })}
      </div>
      {visibleGroups.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            showSelectedOnly ? '当前筛选下没有已选功能' : '没有匹配的功能'
          }
        />
      ) : null}
    </div>
  )
}

export default function PermissionCenterPage() {
  const outletContext = useOutletContext()
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
  const [menus, setMenus] = useState([])
  const [adminSearchKeyword, setAdminSearchKeyword] = useState('')
  const [adminStatusFilter, setAdminStatusFilter] = useState(
    ADMIN_STATUS_FILTERS.ALL
  )
  const [tablePagination, setTablePagination] = useState({
    current: 1,
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
  })
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [phoneModalOpen, setPhoneModalOpen] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [revokeModalOpen, setRevokeModalOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState(null)
  const [phoneAdmin, setPhoneAdmin] = useState(null)
  const [resettingAdmin, setResettingAdmin] = useState(null)
  const [statusActionAdmin, setStatusActionAdmin] = useState(null)
  const [statusActionDisabled, setStatusActionDisabled] = useState(false)
  const [revokingAdmin, setRevokingAdmin] = useState(null)
  const [selectedRoleKeys, setSelectedRoleKeys] = useState([])
  const [selectedRoleKey, setSelectedRoleKey] = useState('')
  const [selectedRolePermissionKeys, setSelectedRolePermissionKeys] = useState(
    []
  )
  const [roleSaveConflict, setRoleSaveConflict] = useState(null)
  const [activeTabKey, setActiveTabKey] = useState(
    PERMISSION_CENTER_TAB_KEYS.ROLES
  )
  const [editingPhone, setEditingPhone] = useState('')
  const [createForm] = Form.useForm()
  const [resetForm] = Form.useForm()
  const [statusForm] = Form.useForm()
  const [revokeForm] = Form.useForm()

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
  const permissionGroups = useMemo(
    () => buildPermissionGroups(assignablePermissions),
    [assignablePermissions]
  )
  const permissionDetailMap = useMemo(
    () => buildPermissionDetailMap(assignablePermissions),
    [assignablePermissions]
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

  const confirmDiscardRoleChanges = useCallback(
    ({ title, content, onDiscard, onKeepEditing }) => {
      if (!rolePermissionsDirty) {
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
          setRoleSaveConflict(null)
          onDiscard?.()
        },
        onCancel: onKeepEditing,
      })
    },
    [rolePermissionsDirty, selectedRoleSavedPermissionKeys]
  )

  const confirmLeavePermissionCenter = useCallback(
    () =>
      new Promise((resolve) => {
        confirmDiscardRoleChanges({
          title: '离开前要放弃未保存的修改吗？',
          content: '离开权限管理后，当前岗位尚未保存的功能调整会丢失。',
          onDiscard: () => resolve(true),
          onKeepEditing: () => resolve(false),
        })
      }),
    [confirmDiscardRoleChanges]
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
  const selectedRolePermissionHighlights = useMemo(
    () =>
      normalizeStringList(selectedRolePermissionKeys)
        .map((permissionKey) => permissionDetailMap.get(permissionKey))
        .filter(Boolean)
        .filter(isHighRiskPermission)
        .slice(0, 8),
    [permissionDetailMap, selectedRolePermissionKeys]
  )
  const canReadUsers = hasPermission(currentAdmin, READ_USER_PERMISSION)
  const canReadRoleTemplates =
    hasPermission(currentAdmin, READ_ROLE_PERMISSION) ||
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
    setLoading(true)
    try {
      const meResult = await adminRpc.call('me', {})
      const nextCurrentAdmin = meResult?.data || null
      const shouldLoadAdmins = hasPermission(
        nextCurrentAdmin,
        READ_USER_PERMISSION
      )
      const shouldLoadRBACOptions =
        hasPermission(nextCurrentAdmin, READ_ROLE_PERMISSION) ||
        hasPermission(nextCurrentAdmin, READ_PERMISSION_PERMISSION)
      const [listResult, optionsResult] = await Promise.all([
        shouldLoadAdmins ? adminRpc.call('list', {}) : Promise.resolve(null),
        shouldLoadRBACOptions
          ? adminRpc.call('rbac_options', {})
          : Promise.resolve(null),
      ])
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
      setMenus(
        Array.isArray(optionsResult?.data?.menus)
          ? optionsResult.data.menus
          : []
      )
      setSelectedRoleKey((current) => current || getRoleKey(nextRoles[0]))
      return true
    } catch (err) {
      message.error(getActionErrorMessage(err, '加载岗位设置'))
      return false
    } finally {
      setLoading(false)
    }
  }, [adminRpc])

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
    confirmDiscardRoleChanges({
      title: '切换页面前要放弃未保存的修改吗？',
      content: '切换到员工账号后，当前岗位尚未保存的功能调整会丢失。',
      onDiscard: () => setActiveTabKey(nextTabKey),
    })
  }

  const refreshPermissionCenter = useCallback(
    () =>
      new Promise((resolve) => {
        confirmDiscardRoleChanges({
          title: '刷新前要放弃未保存的修改吗？',
          content: '刷新会重新加载权限数据，当前岗位尚未保存的功能调整会丢失。',
          onDiscard: async () => resolve(await loadData()),
          onKeepEditing: () => resolve(false),
        })
      }),
    [confirmDiscardRoleChanges, loadData]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPermissionCenter)
  }, [outletContext, refreshPermissionCenter])

  useEffect(() => {
    return outletContext?.registerPageLeaveGuard?.(
      rolePermissionsDirty ? confirmLeavePermissionCenter : null
    )
  }, [confirmLeavePermissionCenter, outletContext, rolePermissionsDirty])

  useEffect(() => {
    if (!rolePermissionsDirty) {
      return undefined
    }
    const warnBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [rolePermissionsDirty])

  useEffect(() => {
    if (!selectedRole) {
      setSelectedRolePermissionKeys([])
      return
    }
    if (roleSaveConflict?.roleKey === selectedRoleKey) {
      return
    }
    setSelectedRolePermissionKeys(selectedRoleSavedPermissionKeys)
  }, [
    roleSaveConflict,
    selectedRole,
    selectedRoleKey,
    selectedRoleSavedPermissionKeys,
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
    setCreateModalOpen(false)
    createForm.resetFields()
  }

  const openCreateModal = () => {
    createForm.setFieldsValue({ role_keys: [] })
    setCreateModalOpen(true)
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
    setEditingAdmin(admin)
    setSelectedRoleKeys(roleKeysForAdmin(admin))
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditingAdmin(null)
    setSelectedRoleKeys([])
  }

  const openPhoneModal = (admin) => {
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
    setPhoneAdmin(admin)
    setEditingPhone(admin.phone || '')
    setPhoneModalOpen(true)
  }

  const closePhoneModal = () => {
    setPhoneModalOpen(false)
    setPhoneAdmin(null)
    setEditingPhone('')
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
    setResettingAdmin(admin)
    resetForm.resetFields()
    setResetModalOpen(true)
  }

  const closeResetModal = () => {
    setResetModalOpen(false)
    setResettingAdmin(null)
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
          ? `员工账号 ${createdAdmin.username} 已创建`
          : '员工账号已创建'
      )
      closeCreateModal()
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

  const saveAdminPhone = async () => {
    const accountStatus = getAdminAccountStatus(phoneAdmin)
    if (
      !phoneAdmin?.id ||
      !accountStatus ||
      accountStatus === ADMIN_ACCOUNT_STATUS.REVOKED
    ) {
      return
    }
    const nextPhone = String(editingPhone || '').trim()
    if (nextPhone && !isValidMainlandMobilePhone(nextPhone)) {
      message.warning('请输入有效手机号')
      return
    }
    if (nextPhone === String(phoneAdmin.phone || '').trim()) {
      closePhoneModal()
      return
    }
    setSaving(true)
    try {
      await adminRpc.call('set_phone', {
        id: phoneAdmin.id,
        phone: nextPhone,
      })
      message.success('登录手机号已更新')
      closePhoneModal()
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '更新登录手机号'))
    } finally {
      setSaving(false)
    }
  }

  const saveRolePermissions = async () => {
    const expectedVersion = getPermissionCenterRoleVersion(selectedRole || {})
    if (!selectedRoleKey || selectedRoleReadOnly || !expectedVersion) {
      if (selectedRoleReadOnlyReason) {
        message.info(selectedRoleReadOnlyReason)
      }
      return
    }
    setSaving(true)
    try {
      await adminRpc.call('set_role_permissions', {
        role_key: selectedRoleKey,
        permission_keys: normalizeStringList(selectedRolePermissionKeys),
        expected_version: expectedVersion,
      })
      message.success('岗位可用功能已更新')
      setRoleSaveConflict(null)
      await loadData()
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
      message.error(getActionErrorMessage(err, '更新岗位可用功能'))
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
          ? `已临时停用员工账号 ${admin.username}`
          : `已启用员工账号 ${admin.username}`
      )
      await loadData()
      setStatusModalOpen(false)
      setStatusActionAdmin(null)
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
      message.success(`已重置员工账号 ${resettingAdmin.username} 的密码`)
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
    setStatusActionAdmin(admin)
    setStatusActionDisabled(nextDisabled)
    statusForm.setFieldsValue({ reason: '' })
    setStatusModalOpen(true)
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
      setRevokeModalOpen(false)
      setRevokingAdmin(null)
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
      title: '员工账号',
      dataIndex: 'username',
      width: 180,
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
        if (record.is_super_admin) {
          return <Text type="secondary">系统保留</Text>
        }
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
        const phoneAndPasswordBlockReason = revoked
          ? '已注销账号不可修改手机号或重置密码；如需重新使用，请创建新账号'
          : statusUnavailable
            ? '账号状态尚未完整加载，请刷新后再操作'
            : !canManageUsers
              ? '当前账号不能修改手机号或重置密码'
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
          phoneAndPasswordBlockReason,
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
                disabled={Boolean(phoneAndPasswordBlockReason)}
                onClick={() => openPhoneModal(record)}
              >
                修改手机号
              </Button>
              <Button
                size="small"
                disabled={Boolean(phoneAndPasswordBlockReason)}
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
                  setRevokingAdmin(record)
                  revokeForm.resetFields()
                  setRevokeModalOpen(true)
                }}
              >
                {revoked ? '已注销' : '离职注销'}
              </Button>
            </Space>
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

  const emptyText = loading ? (
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
      <div className="erp-role-center-header">
        <div>
          <Text className="erp-permission-section__eyebrow">岗位权限</Text>
          <Title level={5} style={{ margin: 0 }}>
            岗位设置
          </Title>
          <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
            设置这个岗位可使用的页面和操作，保存后可分配给员工账号。
          </Paragraph>
        </div>
        <Tag color="blue">先设置岗位，再分配账号</Tag>
      </div>

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
                  onClick={() => selectRoleTemplate(roleKey)}
                >
                  <span className="erp-role-template-card__main">
                    <Text strong>{getRoleVisibleName(role)}</Text>
                    <Text type="secondary">
                      {role.disabled ? '已停用岗位' : getRoleTypeLabel(role)}
                    </Text>
                  </span>
                  <span className="erp-role-template-card__meta">
                    <Tag color={role.disabled ? 'default' : 'green'}>
                      {role.disabled ? '停用' : '启用'}
                    </Tag>
                    <Text type="secondary">
                      {summary.permissionSummary?.total || 0} 项功能
                    </Text>
                    <Text type="secondary">
                      {summary.adminCount || 0} 个账号
                    </Text>
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
                <div>
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
                  <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
                    {selectedRole.description ||
                      '该岗位决定可使用的页面、手机待办和业务操作。'}
                  </Paragraph>
                </div>
                <div className="erp-role-center-actions">
                  <Tag color={rolePermissionsDirty ? 'orange' : 'green'}>
                    {rolePermissionsDirty ? '有未保存调整' : '已保存'}
                  </Tag>
                  <Button
                    type="primary"
                    loading={saving}
                    disabled={
                      !canManageRolePermissions ||
                      !selectedRoleKey ||
                      !rolePermissionsDirty ||
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

              <div className="erp-role-center-metrics">
                <div>
                  <Text type="secondary">可用功能</Text>
                  <strong>{selectedRolePermissionSummary.total}</strong>
                </div>
                <div>
                  <Text type="secondary">影响账号</Text>
                  <strong>{selectedRoleAdmins.length}</strong>
                </div>
                <div>
                  <Text type="secondary">任务端功能</Text>
                  <strong>
                    {selectedRolePermissionSummary.mobileAccessCount}
                  </strong>
                </div>
                <div>
                  <Text type="secondary">业务操作</Text>
                  <strong>
                    {selectedRolePermissionSummary.actionPermissionCount}
                  </strong>
                </div>
              </div>

              <div className="erp-role-center-impact">
                <div>
                  <Text strong>已分配账号</Text>
                  <div className="erp-role-center-impact__list">
                    {selectedRoleAdmins.length > 0 ? (
                      selectedRoleAdmins.map((admin) => (
                        <Tag key={admin.id || admin.username}>
                          {admin.username}
                        </Tag>
                      ))
                    ) : (
                      <Text type="secondary">暂无账号分配到该岗位</Text>
                    )}
                  </div>
                </div>
                <div>
                  <Text strong>重点功能</Text>
                  <div className="erp-role-center-impact__list">
                    {selectedRolePermissionHighlights.length > 0 ? (
                      selectedRolePermissionHighlights.map((permission) => (
                        <Tag key={permission.key} color="blue">
                          {permission.label}
                        </Tag>
                      ))
                    ) : (
                      <Text type="secondary">
                        未包含任务端功能或重要管理功能
                      </Text>
                    )}
                  </div>
                </div>
              </div>

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
                        <div className="erp-permission-checklist-heading">
                          <div>
                            <Text strong>选择这个岗位可以使用的功能</Text>
                            <Paragraph type="secondary">
                              按业务名称勾选。查看、创建、修改、审核等操作分别控制。
                            </Paragraph>
                          </div>
                          <Tag color="blue">
                            已选 {selectedRolePermissionSummary.total} 项
                          </Tag>
                        </div>
                        <PermissionChecklist
                          groups={permissionGroups}
                          value={selectedRolePermissionKeys}
                          disabled={
                            !canManageRolePermissions ||
                            !selectedRoleKey ||
                            selectedRoleReadOnly
                          }
                          onChange={setSelectedRolePermissionKeys}
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'data-scope',
                    label: '数据范围',
                    children: <DataScopeOverview />,
                  },
                  {
                    key: 'sensitive-fields',
                    label: '敏感字段',
                    children: <SensitiveFieldOverview />,
                  },
                  {
                    key: 'effective-pages',
                    label: '功能影响',
                    children: (
                      <PermissionImpactMap
                        permissions={[...permissionDetailMap.values()]}
                        menus={menus}
                        permissionKeys={selectedRolePermissionKeys}
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
            新账号默认不能进入业务页面，分配岗位后才能使用相应功能。
          </Paragraph>
        </div>
        <Space size={8} wrap>
          <Tag color="green">共 {admins.length} 个员工账号</Tag>
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
            placeholder="搜索员工账号、手机号或岗位"
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
          {hasAdminFilter
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
        scroll={{ x: 1040 }}
        onChange={handleTableChange}
      />
    </Card>
  )

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card className="erp-permission-hero" variant="borderless">
        <div className="erp-permission-hero__content">
          <div>
            <Title level={4} style={{ margin: 0 }}>
              权限管理
            </Title>
            <Paragraph
              type="secondary"
              style={{ marginTop: 8, marginBottom: 0 }}
            >
              先设置岗位可使用的功能，再把岗位分配给员工账号。
            </Paragraph>
          </div>
          <Tag color="blue">先设置岗位</Tag>
        </div>
      </Card>

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
                <Tag color="green">{admins.length}</Tag>
              </span>
            ),
            children: adminAccountTab,
          },
        ]}
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
            label="账号"
            name="username"
            rules={[
              { required: true, message: '请输入员工账号' },
              {
                validator: (_, value) =>
                  String(value || '').trim()
                    ? Promise.resolve()
                    : Promise.reject(new Error('请输入员工账号')),
              },
            ]}
          >
            <Input placeholder="例如 sales01" autoComplete="username" />
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
            ? `分配岗位：${editingAdmin.username}`
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
            message="仅修改岗位"
            description="修改登录手机号请使用账号列表中的“修改手机号”。"
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
          phoneAdmin?.username
            ? `修改登录手机号：${phoneAdmin.username}`
            : '修改登录手机号'
        }
        open={phoneModalOpen}
        onCancel={closePhoneModal}
        onOk={saveAdminPhone}
        confirmLoading={saving}
        okText="保存手机号"
        cancelText="取消"
        centered
        width={520}
        forceRender
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="修改后用于该账号的短信登录"
            description="岗位不会随本次操作改变。留空表示解除当前登录手机号。"
          />
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
            ? `重置密码：${resettingAdmin.username}`
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
          setStatusModalOpen(false)
          setStatusActionAdmin(null)
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
              ? `${statusActionAdmin?.username || '该账号'} 将立即无法继续访问后台`
              : `${statusActionAdmin?.username || '该账号'} 将恢复登录和原有岗位功能`
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
          setRevokeModalOpen(false)
          setRevokingAdmin(null)
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
          message={`将正式注销 ${revokingAdmin?.username || '该账号'}`}
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
