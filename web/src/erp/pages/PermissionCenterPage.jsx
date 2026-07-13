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
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  ADMIN_STATUS_FILTERS,
  filterAdminRecords,
  filterPermissionGroups,
} from '../utils/permissionCenterSearch.mjs'
import {
  isValidMainlandMobilePhone,
  optionalMainlandMobilePhoneRule,
} from '../utils/contactValidation.mjs'
import { getPermissionModuleTitle } from '../utils/permissionModuleLabels.mjs'
import { isMenuVisibleForPermissionKeys } from '../utils/menuAccessProjection.mjs'
import { getRoleDisplayName } from '../utils/roleKeys.mjs'

const { Paragraph, Text, Title } = Typography

const TABLE_PAGE_SIZE_OPTIONS = ['8', '10', '20', '50', '100']
const DEFAULT_TABLE_PAGE_SIZE = 8
const PASSWORD_MIN_LENGTH = 6
const READ_USER_PERMISSION = 'system.user.read'
const READ_ROLE_PERMISSION = 'system.role.read'
const READ_PERMISSION_PERMISSION = 'system.permission.read'
const MANAGE_ROLE_PERMISSION = 'system.permission.manage'
const UPDATE_USER_PERMISSION = 'system.user.update'
const CREATE_USER_PERMISSION = 'system.user.create'
const DISABLE_USER_PERMISSION = 'system.user.disable'
const REVOKE_USER_PERMISSION = 'system.user.revoke'
const PERMISSION_CENTER_TAB_KEYS = {
  ROLES: 'roles',
  ADMINS: 'admins',
}

const adminStatusOptions = [
  { label: '全部状态', value: ADMIN_STATUS_FILTERS.ALL },
  { label: '启用', value: ADMIN_STATUS_FILTERS.ENABLED },
  { label: '禁用', value: ADMIN_STATUS_FILTERS.DISABLED },
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
  return getRoleDisplayName(getRoleKey(role), '已配置角色')
}

function getPermissionKey(permission = {}) {
  return String(
    permission?.permission_key || permission?.key || permission || ''
  ).trim()
}

function getPermissionVisibleName(permission = {}) {
  const name = String(permission?.name || '').trim()
  return name || '未登记权限'
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

function buildRoleOptions(roles = []) {
  return roles
    .filter((role) => getRoleKey(role) && role.disabled !== true)
    .map((role) => ({
      label: getRoleVisibleName(role),
      value: getRoleKey(role),
    }))
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
      usage: permission.usage || {},
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
      usage: permission.usage || {},
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
            这个岗位能看到什么、能做什么
          </Text>
          <Paragraph type="secondary">
            菜单会随下方功能自动开放，不需要重复设置。调整勾选后，这里会立即预览保存后的结果。
          </Paragraph>
        </div>
        <Tag color="green">{visibleMenus.length} 个可见菜单</Tag>
      </div>

      <div className="erp-role-capability-overview__grid">
        <div className="erp-role-capability-card erp-role-capability-card--enabled">
          <div className="erp-role-capability-card__title">
            <Text strong>可以进入的菜单</Text>
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
              <Text type="secondary">当前岗位还不能进入任何桌面菜单</Text>
            )}
          </div>
        </div>

        <div className="erp-role-capability-card">
          <div className="erp-role-capability-card__title">
            <Text strong>暂不可进入的菜单</Text>
            <Tag>{hiddenMenus.length}</Tag>
          </div>
          <div className="erp-role-capability-card__items erp-role-capability-card__items--muted">
            {hiddenMenus.length > 0 ? (
              hiddenMenus.map((menu) => <Tag key={menu.key}>{menu.label}</Tag>)
            ) : (
              <Text type="secondary">当前岗位可进入全部桌面菜单</Text>
            )}
          </div>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        message="字段显示不是岗位权限"
        description="进入页面后，字段名称、显示范围和必填规则按当前客户的页面配置统一生效；本页只控制岗位能否进入菜单、查看业务和执行操作，不会让同一客户的不同岗位看到两套互相矛盾的业务字段。"
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
  const rows = selected.map((permission) => ({
    ...permission,
    menus: Array.isArray(permission.usage?.menus) ? permission.usage.menus : [],
  }))
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="这里解释权限会影响什么，不会额外授予页面权限"
        description="页面入口由功能权限自动推导；按钮和表单仍会在后端再次校验，并受客户模块、单据状态和任务归属限制。"
      />
      <Table
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: <Empty description="当前岗位尚未选择功能" /> }}
        columns={[
          { title: '功能', dataIndex: 'label', width: 220 },
          {
            title: '影响页面',
            dataIndex: 'menus',
            render: (items) =>
              items.length > 0 ? (
                <Space wrap size={[4, 4]}>
                  {items.map((item) => (
                    <Tag key={item.key}>{item.label}</Tag>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">页面内功能或后台能力</Text>
              ),
          },
          {
            title: '影响控件',
            dataIndex: ['usage', 'control_type'],
            width: 190,
          },
          {
            title: '最终生效条件',
            render: (_, record) => (
              <Text type="secondary">
                {record.usage?.condition || '以后端校验结果为准'}
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
        message="业务数据范围尚未开放配置"
        description="当前 Workflow 任务已按责任岗位、处理人和任务状态限制；客户、订单、仓库、采购和财务等资源尚未建立统一的本人、指定范围或全部数据策略。未完成后端查询和写入约束前，这里不会提供仅隐藏前端数据的伪开关。"
      />
      <div className="erp-role-policy-boundary__grid">
        <div>
          <Text strong>协同任务</Text>
          <Tag color="green">后端已限制</Tag>
          <Text type="secondary">责任岗位或指定处理人</Text>
        </div>
        <div>
          <Text strong>业务单据</Text>
          <Tag color="gold">按功能权限</Tag>
          <Text type="secondary">尚未按负责人或部门隔离</Text>
        </div>
        <div>
          <Text strong>仓库数据</Text>
          <Tag color="gold">按功能权限</Tag>
          <Text type="secondary">尚未按指定仓库隔离</Text>
        </div>
        <div>
          <Text strong>财务数据</Text>
          <Tag color="gold">按功能权限</Tag>
          <Text type="secondary">尚未拆分摘要与完整范围</Text>
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
        message="角色级敏感字段策略尚未接入"
        description="当前客户字段策略只控制少量列表和导出列，不是安全权限。成本、结算账户、联系方式等敏感内容必须由后端同时约束查询、修改、导出和打印后，才能在这里授权。"
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
  let systemPermissionCount = 0

  keys.forEach((permissionKey) => {
    const detail = permissionDetailMap.get(permissionKey)
    const moduleKey =
      detail?.module || permissionKey.split('.')[0]?.trim() || 'other'
    moduleCounts.set(moduleKey, (moduleCounts.get(moduleKey) || 0) + 1)
    if (permissionKey.startsWith('mobile.')) {
      mobileAccessCount += 1
    }
    if (permissionKey.startsWith('system.')) {
      systemPermissionCount += 1
    }
  })

  return {
    total: keys.length,
    moduleCounts,
    mobileAccessCount,
    systemPermissionCount,
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
          placeholder="搜索功能名称或业务模块"
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
                        {item.usage?.control_type || '业务功能'}
                        {Array.isArray(item.usage?.menus) &&
                        item.usage.menus.length > 0
                          ? ` · ${item.usage.menus.map((menu) => menu.label).join('、')}`
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
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [revokeModalOpen, setRevokeModalOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState(null)
  const [resettingAdmin, setResettingAdmin] = useState(null)
  const [statusActionAdmin, setStatusActionAdmin] = useState(null)
  const [statusActionDisabled, setStatusActionDisabled] = useState(false)
  const [revokingAdmin, setRevokingAdmin] = useState(null)
  const [selectedRoleKeys, setSelectedRoleKeys] = useState([])
  const [selectedRoleKey, setSelectedRoleKey] = useState('')
  const [selectedRolePermissionKeys, setSelectedRolePermissionKeys] = useState(
    []
  )
  const [activeTabKey, setActiveTabKey] = useState(
    PERMISSION_CENTER_TAB_KEYS.ROLES
  )
  const [editingPhone, setEditingPhone] = useState('')
  const [createForm] = Form.useForm()
  const [resetForm] = Form.useForm()
  const [statusForm] = Form.useForm()
  const [revokeForm] = Form.useForm()

  const roleOptions = useMemo(() => buildRoleOptions(roles), [roles])
  const permissionGroups = useMemo(
    () => buildPermissionGroups(permissions),
    [permissions]
  )
  const permissionDetailMap = useMemo(
    () => buildPermissionDetailMap(permissions),
    [permissions]
  )
  const selectedRole = useMemo(
    () => roles.find((role) => getRoleKey(role) === selectedRoleKey) || null,
    [roles, selectedRoleKey]
  )
  const selectedRoleSavedPermissionKeys = useMemo(
    () => permissionKeysForRole(selectedRole || {}),
    [selectedRole]
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
          setSelectedRolePermissionKeys(
            permissionKeysForRole(selectedRole || {})
          )
          onDiscard?.()
        },
        onCancel: onKeepEditing,
      })
    },
    [rolePermissionsDirty, selectedRole]
  )

  const confirmLeavePermissionCenter = useCallback(
    () =>
      new Promise((resolve) => {
        confirmDiscardRoleChanges({
          title: '离开前要放弃未保存的修改吗？',
          content: '离开权限管理后，当前角色尚未保存的功能调整会丢失。',
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
  const canDisableUsers = hasPermission(currentAdmin, DISABLE_USER_PERMISSION)
  const canRevokeUsers = hasPermission(currentAdmin, REVOKE_USER_PERMISSION)
  const canManageRolePermissions = hasPermission(
    currentAdmin,
    MANAGE_ROLE_PERMISSION
  )
  const selectedRoleReadOnly = selectedRole?.disabled === true
  const permissionWarningMessages = [
    !canReadRoleTemplates ? '您不能查看岗位角色设置' : '',
    !canReadUsers ? '缺少查看管理员权限，不能查看管理员账号' : '',
    !canManageRolePermissions ? '您不能调整岗位角色的可用功能' : '',
    !canManageUsers
      ? '缺少更新管理员权限，不能分配用户角色、修改手机号或重置密码'
      : '',
    !canDisableUsers ? '缺少启停管理员权限，不能启用或禁用管理员' : '',
    !canRevokeUsers ? '缺少注销管理员权限，不能办理员工账号正式退出' : '',
    !canCreateUsers ? '缺少创建管理员权限，不能新增账号' : '',
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
      message.error(getActionErrorMessage(err, '加载权限数据'))
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
      title: '放弃未保存的角色权限调整？',
      content:
        '切换角色会丢弃当前未保存的勾选结果。请先保存，或确认放弃本次调整。',
      onDiscard: () => setSelectedRoleKey(nextRoleKey),
    })
  }

  const changePermissionCenterTab = (nextTabKey) => {
    if (nextTabKey === activeTabKey) {
      return
    }
    confirmDiscardRoleChanges({
      title: '切换页面前要放弃未保存的修改吗？',
      content: '切换到管理员账号后，当前角色尚未保存的功能调整会丢失。',
      onDiscard: () => setActiveTabKey(nextTabKey),
    })
  }

  const refreshPermissionCenter = useCallback(
    () =>
      new Promise((resolve) => {
        confirmDiscardRoleChanges({
          title: '刷新前要放弃未保存的修改吗？',
          content: '刷新会重新加载权限数据，当前角色尚未保存的功能调整会丢失。',
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
    setSelectedRolePermissionKeys(permissionKeysForRole(selectedRole))
  }, [selectedRole])

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
    setEditingAdmin(admin)
    setSelectedRoleKeys(roleKeysForAdmin(admin))
    setEditingPhone(admin.phone || '')
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditingAdmin(null)
    setSelectedRoleKeys([])
    setEditingPhone('')
  }

  const openResetModal = (admin) => {
    if (!admin || admin.is_super_admin) {
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
        role_keys: canManageUsers
          ? normalizeStringList(values.role_keys || [])
          : [],
      }
      const result = await adminRpc.call('create', payload)
      const createdAdmin = result?.data?.admin
      message.success(
        createdAdmin?.username
          ? `管理员 ${createdAdmin.username} 已创建`
          : '管理员已创建'
      )
      closeCreateModal()
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '创建管理员'))
    } finally {
      setCreating(false)
    }
  }

  const saveAdminRoles = async () => {
    if (!editingAdmin?.id) {
      return
    }
    const nextPhone = String(editingPhone || '').trim()
    if (nextPhone && !isValidMainlandMobilePhone(nextPhone)) {
      message.warning('请输入有效手机号')
      return
    }
    setSaving(true)
    try {
      if (nextPhone !== String(editingAdmin.phone || '').trim()) {
        await adminRpc.call('set_phone', {
          id: editingAdmin.id,
          phone: nextPhone,
        })
      }
      await adminRpc.call('set_roles', {
        id: editingAdmin.id,
        role_keys: normalizeStringList(selectedRoleKeys),
      })
      message.success('用户角色已更新')
      closeEditModal()
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '更新用户角色'))
    } finally {
      setSaving(false)
    }
  }

  const saveRolePermissions = async () => {
    if (!selectedRoleKey) {
      return
    }
    setSaving(true)
    try {
      await adminRpc.call('set_role_permissions', {
        role_key: selectedRoleKey,
        permission_keys: normalizeStringList(selectedRolePermissionKeys),
      })
      message.success('角色权限已更新')
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '更新角色权限'))
    } finally {
      setSaving(false)
    }
  }

  const applyAdminStatus = async (values) => {
    const admin = statusActionAdmin
    const disabled = statusActionDisabled
    if (!admin?.id || admin.is_super_admin) {
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
          ? `已禁用管理员 ${admin.username}`
          : `已启用管理员 ${admin.username}`
      )
      await loadData()
      setStatusModalOpen(false)
      setStatusActionAdmin(null)
      statusForm.resetFields()
    } catch (err) {
      message.error(getActionErrorMessage(err, '更新管理员状态'))
    } finally {
      setStatusUpdatingAdminID(null)
    }
  }

  const resetAdminPassword = async (values) => {
    if (!resettingAdmin?.id) {
      return
    }
    setSaving(true)
    try {
      await adminRpc.call('reset_password', {
        id: resettingAdmin.id,
        password: values.password,
      })
      message.success(`已重置管理员 ${resettingAdmin.username} 的密码`)
      closeResetModal()
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '重置管理员密码'))
    } finally {
      setSaving(false)
    }
  }

  const onToggleAdminStatus = (admin, checkedEnabled) => {
    if (admin?.account_status === 'revoked') return
    const nextDisabled = !checkedEnabled
    setStatusActionAdmin(admin)
    setStatusActionDisabled(nextDisabled)
    statusForm.setFieldsValue({ reason: '' })
    setStatusModalOpen(true)
  }

  const revokeAdminAccount = async (values) => {
    if (!revokingAdmin?.id) return
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
      message.error(getActionErrorMessage(err, '注销管理员账号'))
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: '管理员',
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
      title: '角色',
      dataIndex: 'roles',
      render: (_, record) => {
        if (record.is_super_admin) {
          return <Tag color="gold">超级管理员</Tag>
        }
        const assignedRoles = Array.isArray(record.roles) ? record.roles : []
        if (assignedRoles.length === 0) {
          return <Tag color="default">未分配角色</Tag>
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
      title: '权限',
      dataIndex: 'permissions',
      width: 120,
      render: (_, record) => {
        if (record.is_super_admin) {
          return <Tag color="gold">全部权限</Tag>
        }
        const count = normalizeStringList(record.permissions || []).length
        return count > 0 ? (
          <Tag color="blue">{count} 项</Tag>
        ) : (
          <Tag color="default">无权限</Tag>
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'disabled',
      width: 150,
      render: (disabled, record) => {
        if (record.is_super_admin) {
          return <Tag color="gold">始终启用</Tag>
        }
        if (record.account_status === 'revoked') {
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
            </Space>
          )
        }
        if (!canDisableUsers) {
          return (
            <Tag color={disabled ? 'red' : 'green'}>
              {disabled ? '禁用' : '启用'}
            </Tag>
          )
        }
        return (
          <Space direction="vertical" size={2}>
            <Switch
              checked={!disabled}
              checkedChildren="启用"
              unCheckedChildren="禁用"
              loading={statusUpdatingAdminID === record.id}
              disabled={record.account_status === 'revoked'}
              onChange={(checked) => onToggleAdminStatus(record, checked)}
            />
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
        const revoked = record.account_status === 'revoked'
        return (
          <Space wrap size={[8, 8]}>
            <Button
              size="small"
              disabled={!canManageUsers || revoked}
              onClick={() => openEditModal(record)}
            >
              分配角色
            </Button>
            <Button
              size="small"
              disabled={!canManageUsers || revoked}
              onClick={() => openResetModal(record)}
            >
              重置密码
            </Button>
            <Button
              danger
              size="small"
              disabled={!canRevokeUsers || revoked}
              onClick={() => {
                setRevokingAdmin(record)
                revokeForm.resetFields()
                setRevokeModalOpen(true)
              }}
            >
              {revoked ? '已注销' : '离职注销'}
            </Button>
          </Space>
        )
      },
    },
  ]

  const emptyText = loading ? (
    <Empty description="加载中..." />
  ) : hasAdminFilter ? (
    <Empty description="没有匹配的管理员" />
  ) : (
    <Empty description="暂无管理员数据" />
  )

  if (loading && admins.length === 0 && !currentAdmin) {
    return (
      <Loading
        title="权限加载中"
        description="正在加载账号和岗位角色，请稍候..."
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
            角色模板
          </Title>
          <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
            按岗位职责维护角色名称和默认权限组合，用于统一分配菜单、岗位任务端入口和操作权限。
          </Paragraph>
        </div>
        <Tag color="blue">先设置岗位，再分配账号</Tag>
      </div>

      <div className="erp-role-center-layout">
        <aside className="erp-role-center-sidebar" aria-label="角色模板列表">
          {roles.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无角色模板"
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
                      {role.disabled ? '已停用角色模板' : '角色模板'}
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
                    {selectedRole.builtin ? (
                      <Tag color="cyan">系统预设</Tag>
                    ) : (
                      <Tag color="blue">自定义模板</Tag>
                    )}
                  </Space>
                  <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
                    {selectedRole.description ||
                      '该角色决定可使用的菜单、岗位任务端入口和业务操作。'}
                  </Paragraph>
                </div>
                <div className="erp-role-center-actions">
                  <Tag color={rolePermissionsDirty ? 'orange' : 'green'}>
                    {rolePermissionsDirty ? '有未保存调整' : '已同步'}
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
                    保存角色权限
                  </Button>
                </div>
              </div>

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
                  <Text type="secondary">岗位入口</Text>
                  <strong>
                    {selectedRolePermissionSummary.mobileAccessCount}
                  </strong>
                </div>
                <div>
                  <Text type="secondary">管理功能</Text>
                  <strong>
                    {selectedRolePermissionSummary.systemPermissionCount}
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
                      <Text type="secondary">暂无账号绑定该角色</Text>
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
                      <Text type="secondary">未包含岗位入口或重要管理功能</Text>
                    )}
                  </div>
                </div>
              </div>

              {selectedRoleReadOnly ? (
                <Alert
                  type="warning"
                  showIcon
                  message="停用角色只能查看，不能调整权限"
                  description="停用状态来自系统角色真源；当前页面不会绕过该状态写入权限组合，也不提供没有后端合同的恢复或删除入口。"
                />
              ) : null}

              <Tabs
                className="erp-role-policy-tabs"
                defaultActiveKey="functions"
                items={[
                  {
                    key: 'functions',
                    label: '功能权限',
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
                    label: '权限地图',
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
              description="请选择一个角色模板"
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
            管理员与角色
          </Title>
          <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
            新账号默认不能进入业务页面，分配角色后才能使用相应功能。
          </Paragraph>
        </div>
        <Space size={8} wrap>
          <Tag color="green">共 {admins.length} 个管理员</Tag>
          <Button
            type="primary"
            disabled={!canCreateUsers}
            onClick={openCreateModal}
          >
            创建管理员
          </Button>
        </Space>
      </Space>

      <div className="erp-permission-list-toolbar">
        <div className="erp-permission-list-toolbar__filters">
          <Input
            allowClear
            className="erp-permission-list-toolbar__search"
            value={adminSearchKeyword}
            placeholder="搜索管理员账号、手机号或岗位角色"
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
            ? `命中 ${filteredAdmins.length}/${admins.length} 个管理员`
            : `共 ${admins.length} 个管理员`}
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
              账号通过角色获得对应的菜单、岗位任务端入口和业务操作权限。
            </Paragraph>
          </div>
          <Tag color="blue">默认先维护角色模板</Tag>
        </div>
      </Card>

      {permissionWarningMessages.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message="当前账号部分操作受限"
          description={`${permissionWarningMessages.join('；')}。超级管理员账号不能在此页面被普通管理员修改。`}
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
                角色模板
                <Tag color="blue">{roles.length}</Tag>
              </span>
            ),
            children: roleTemplateTab,
          },
          {
            key: PERMISSION_CENTER_TAB_KEYS.ADMINS,
            label: (
              <span className="erp-permission-tabs__label">
                管理员账号
                <Tag color="green">{admins.length}</Tag>
              </span>
            ),
            children: adminAccountTab,
          },
        ]}
        onChange={changePermissionCenterTab}
      />

      <Modal
        title="创建管理员"
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
              { required: true, message: '请输入管理员账号' },
              {
                validator: (_, value) =>
                  String(value || '').trim()
                    ? Promise.resolve()
                    : Promise.reject(new Error('请输入管理员账号')),
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
              {
                min: PASSWORD_MIN_LENGTH,
                message: `密码至少 ${PASSWORD_MIN_LENGTH} 位`,
              },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="角色" name="role_keys">
            <Select
              mode="multiple"
              allowClear
              disabled={!canManageUsers}
              placeholder={
                canManageUsers
                  ? '选择一个或多个角色'
                  : '当前账号只能创建无角色账号'
              }
              options={roleOptions}
            />
          </Form.Item>
          {!canManageUsers ? (
            <Alert
              type="info"
              showIcon
              message="创建后暂不分配角色"
              description="当前账号缺少更新管理员权限，只能创建无角色账号；后续需由有权限的管理员进入“分配角色”完成授权。"
            />
          ) : null}
        </Form>
      </Modal>

      <Modal
        className="erp-permission-modal"
        title={
          editingAdmin?.username
            ? `分配角色：${editingAdmin.username}`
            : '分配角色'
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
          <label>
            <Text strong>手机号</Text>
            <Input
              value={editingPhone}
              placeholder="可选，用于短信登录"
              inputMode="tel"
              style={{ marginTop: 8 }}
              onChange={(event) => setEditingPhone(event.target.value)}
            />
          </label>
          <label>
            <Text strong>角色</Text>
            <Select
              mode="multiple"
              allowClear
              value={selectedRoleKeys}
              options={roleOptions}
              placeholder="选择一个或多个角色"
              style={{ width: '100%', marginTop: 8 }}
              onChange={setSelectedRoleKeys}
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
              {
                min: PASSWORD_MIN_LENGTH,
                message: `密码至少 ${PASSWORD_MIN_LENGTH} 位`,
              },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        className="erp-permission-modal"
        title={statusActionDisabled ? '临时禁用账号' : '恢复账号使用'}
        open={statusModalOpen}
        onCancel={() => {
          setStatusModalOpen(false)
          setStatusActionAdmin(null)
          statusForm.resetFields()
        }}
        onOk={() => statusForm.submit()}
        confirmLoading={statusUpdatingAdminID === statusActionAdmin?.id}
        okText={statusActionDisabled ? '确认禁用' : '确认启用'}
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
              : `${statusActionAdmin?.username || '该账号'} 将恢复登录和原有角色权限`
          }
          style={{ marginBottom: 16 }}
        />
        <Form form={statusForm} layout="vertical" onFinish={applyAdminStatus}>
          <Form.Item
            label="变更原因"
            name="reason"
            rules={
              statusActionDisabled
                ? [{ required: true, message: '请填写临时禁用原因' }]
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
          description="账号和历史操作记录会保留，未完成的个人待办将退回原岗位任务池；注销后不能通过普通启用恢复。"
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
