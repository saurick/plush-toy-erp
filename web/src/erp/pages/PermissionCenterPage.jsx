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
import { getPermissionModuleTitle } from '../utils/permissionModuleLabels.mjs'

const { Paragraph, Text, Title } = Typography

const TABLE_PAGE_SIZE_OPTIONS = ['8', '10', '20', '50', '100']
const DEFAULT_TABLE_PAGE_SIZE = 8
const PASSWORD_MIN_LENGTH = 6
const MANAGE_ROLE_PERMISSION = 'system.permission.manage'
const UPDATE_USER_PERMISSION = 'system.user.update'
const CREATE_USER_PERMISSION = 'system.user.create'

const adminStatusOptions = [
  { label: '全部状态', value: ADMIN_STATUS_FILTERS.ALL },
  { label: '启用', value: ADMIN_STATUS_FILTERS.ENABLED },
  { label: '禁用', value: ADMIN_STATUS_FILTERS.DISABLED },
  { label: '超级管理员', value: ADMIN_STATUS_FILTERS.SUPER },
]

function normalizeStringList(values = []) {
  return Array.isArray(values)
    ? values.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function getRoleKey(role = {}) {
  return String(role?.role_key || role?.key || '').trim()
}

function getPermissionKey(permission = {}) {
  return String(
    permission?.permission_key || permission?.key || permission || ''
  ).trim()
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
      label: role.name || getRoleKey(role),
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
      title: getPermissionModuleTitle(moduleKey),
      items: [],
    }
    group.items.push({
      key: permissionKey,
      label: permission.name || permissionKey,
      description: permission.description || '',
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
      label: permission.name || permissionKey,
      module: String(permission.module || 'other').trim() || 'other',
    })
  })
  return detailMap
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

function formatModuleSummary(moduleCounts) {
  const entries = [...(moduleCounts || new Map()).entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
  if (entries.length === 0) {
    return '尚未配置权限'
  }
  return entries
    .map(
      ([moduleKey, count]) => `${getPermissionModuleTitle(moduleKey)} ${count}`
    )
    .join(' / ')
}

function PermissionChecklist({
  groups,
  value = [],
  onChange,
  disabled = false,
}) {
  const [keyword, setKeyword] = useState('')
  const normalizedValue = normalizeStringList(value)
  const visibleGroups = useMemo(
    () => filterPermissionGroups(groups, keyword),
    [groups, keyword]
  )

  const handleSectionChange = (sectionKeys, nextSectionValues) => {
    const next = [
      ...normalizedValue.filter((item) => !sectionKeys.includes(item)),
      ...(nextSectionValues || []),
    ]
    onChange?.([...new Set(next)])
  }

  return (
    <div className="erp-permission-checklist-shell">
      <Input
        allowClear
        className="erp-permission-checklist-search"
        value={keyword}
        placeholder="搜索权限码、权限名称或模块"
        onChange={(event) => setKeyword(event.target.value)}
      />
      <div className="erp-permission-checklist">
        {visibleGroups.map((section) => {
          const originalSection =
            groups.find((item) => item.title === section.title) || section
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

          return (
            <section
              className="erp-permission-checklist__section"
              key={section.title}
            >
              <div className="erp-permission-checklist__header">
                <Text strong>{section.title}</Text>
                <Text type="secondary">
                  {hasKeyword
                    ? `命中 ${section.items.length}/${originalSection.items.length}，已选 ${selectedOriginalKeys.length}`
                    : `${selectedOriginalKeys.length}/${originalSection.items.length}`}
                </Text>
              </div>
              <Checkbox.Group
                options={section.items.map((item) => ({
                  label: `${item.label} (${item.key})`,
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
          description="没有匹配的权限码"
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
  const [editingAdmin, setEditingAdmin] = useState(null)
  const [resettingAdmin, setResettingAdmin] = useState(null)
  const [selectedRoleKeys, setSelectedRoleKeys] = useState([])
  const [selectedRoleKey, setSelectedRoleKey] = useState('')
  const [selectedRolePermissionKeys, setSelectedRolePermissionKeys] = useState(
    []
  )
  const [editingPhone, setEditingPhone] = useState('')
  const [createForm] = Form.useForm()
  const [resetForm] = Form.useForm()

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
        .filter(
          (permission) =>
            permission.module === 'mobile' || permission.module === 'system'
        )
        .slice(0, 8),
    [permissionDetailMap, selectedRolePermissionKeys]
  )
  const canCreateUsers = hasPermission(currentAdmin, CREATE_USER_PERMISSION)
  const canManageUsers = hasPermission(currentAdmin, UPDATE_USER_PERMISSION)
  const canManageRolePermissions = hasPermission(
    currentAdmin,
    MANAGE_ROLE_PERMISSION
  )
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
      const [meResult, listResult, optionsResult] = await Promise.all([
        adminRpc.call('me', {}),
        adminRpc.call('list', {}),
        adminRpc.call('rbac_options', {}),
      ])
      const nextRoles = Array.isArray(optionsResult?.data?.roles)
        ? optionsResult.data.roles
        : []
      setCurrentAdmin(meResult?.data || null)
      setAdmins(
        Array.isArray(listResult?.data?.admins) ? listResult.data.admins : []
      )
      setRoles(nextRoles)
      setPermissions(
        Array.isArray(optionsResult?.data?.permissions)
          ? optionsResult.data.permissions
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

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadData)
  }, [loadData, outletContext])

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
  }, [filteredAdmins.length, tablePagination.current, tablePagination.pageSize])

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
        role_keys: normalizeStringList(values.role_keys || []),
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
    setSaving(true)
    try {
      if (
        String(editingPhone || '').trim() !==
        String(editingAdmin.phone || '').trim()
      ) {
        await adminRpc.call('set_phone', {
          id: editingAdmin.id,
          phone: String(editingPhone || '').trim(),
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

  const applyAdminStatus = async (admin, disabled) => {
    if (!admin?.id || admin.is_super_admin) {
      return
    }

    setStatusUpdatingAdminID(admin.id)
    try {
      await adminRpc.call('set_disabled', {
        id: admin.id,
        disabled,
      })
      message.success(
        disabled
          ? `已禁用管理员 ${admin.username}`
          : `已启用管理员 ${admin.username}`
      )
      await loadData()
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
    const nextDisabled = !checkedEnabled
    if (nextDisabled) {
      modal.confirm({
        centered: true,
        title: '确认禁用管理员',
        content: `禁用后 ${admin.username} 将无法继续访问后台，是否继续？`,
        okText: '确认禁用',
        cancelText: '取消',
        onOk: () => applyAdminStatus(admin, true),
      })
      return
    }
    applyAdminStatus(admin, false)
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
              <Tag key={getRoleKey(role)}>{role.name || getRoleKey(role)}</Tag>
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
        if (!canManageUsers) {
          return (
            <Tag color={disabled ? 'red' : 'green'}>
              {disabled ? '禁用' : '启用'}
            </Tag>
          )
        }
        return (
          <Switch
            checked={!disabled}
            checkedChildren="启用"
            unCheckedChildren="禁用"
            loading={statusUpdatingAdminID === record.id}
            onChange={(checked) => onToggleAdminStatus(record, checked)}
          />
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
        return (
          <Space wrap size={[8, 8]}>
            <Button
              size="small"
              disabled={!canManageUsers}
              onClick={() => openEditModal(record)}
            >
              分配角色
            </Button>
            <Button
              size="small"
              disabled={!canManageUsers}
              onClick={() => openResetModal(record)}
            >
              重置密码
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
        description="正在同步管理员、角色和权限码，请稍候..."
      />
    )
  }

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
              当前后台使用标准
              RBAC：用户绑定角色，角色拥有权限码；菜单、岗位任务端入口和接口守卫统一消费权限码。
            </Paragraph>
          </div>
          <Button
            type="primary"
            size="large"
            disabled={!canCreateUsers}
            onClick={openCreateModal}
          >
            创建管理员
          </Button>
        </div>
      </Card>

      {!canManageUsers || !canManageRolePermissions ? (
        <Alert
          type="warning"
          showIcon
          message="当前账号只能查看部分权限结果"
          description="创建管理员、分配用户角色或调整角色权限需要对应系统权限。超级管理员账号不能在此页面被普通管理员修改。"
        />
      ) : null}

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
            <Text className="erp-permission-section__eyebrow">
              Account Roles
            </Text>
            <Title level={5} style={{ margin: 0 }}>
              管理员与角色
            </Title>
            <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
              新账号默认没有权限，必须分配角色后才能访问受保护页面和接口。
            </Paragraph>
          </div>
          <Tag color="green">共 {admins.length} 个管理员</Tag>
        </Space>

        <div className="erp-permission-list-toolbar">
          <div className="erp-permission-list-toolbar__filters">
            <Input
              allowClear
              className="erp-permission-list-toolbar__search"
              value={adminSearchKeyword}
              placeholder="搜索管理员账号、手机号、角色或权限码"
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

      <Card
        className="erp-permission-section erp-permission-section--roles"
        variant="borderless"
      >
        <div className="erp-role-center-header">
          <div>
            <Text className="erp-permission-section__eyebrow">
              Role Templates
            </Text>
            <Title level={5} style={{ margin: 0 }}>
              当前客户角色模板
            </Title>
            <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
              页面按角色模板维护权限；后续客户配置只替换角色模板和默认权限组合，不改变产品内核权限码。
            </Paragraph>
          </div>
          <Tag color="blue">Product Core 权限码稳定</Tag>
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
                    onClick={() => setSelectedRoleKey(roleKey)}
                  >
                    <span className="erp-role-template-card__main">
                      <Text strong>{role.name || roleKey}</Text>
                      <Text type="secondary">{roleKey}</Text>
                    </span>
                    <span className="erp-role-template-card__meta">
                      <Tag color={role.disabled ? 'default' : 'green'}>
                        {role.disabled ? '停用' : '启用'}
                      </Tag>
                      <Text type="secondary">
                        {summary.permissionSummary?.total || 0} 项权限
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
                        {selectedRole.name || selectedRoleKey}
                      </Title>
                      <Tag>{selectedRoleKey}</Tag>
                      {selectedRole.builtin ? (
                        <Tag color="cyan">内置模板</Tag>
                      ) : (
                        <Tag color="blue">客户模板</Tag>
                      )}
                    </Space>
                    <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
                      {selectedRole.description ||
                        '该角色通过权限码组合获得菜单、岗位任务端入口和接口动作能力。'}
                    </Paragraph>
                  </div>
                  <Button
                    type="primary"
                    loading={saving}
                    disabled={!canManageRolePermissions || !selectedRoleKey}
                    onClick={saveRolePermissions}
                  >
                    保存角色权限
                  </Button>
                </div>

                <div className="erp-role-center-metrics">
                  <div>
                    <Text type="secondary">权限码</Text>
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
                    <Text type="secondary">系统权限</Text>
                    <strong>
                      {selectedRolePermissionSummary.systemPermissionCount}
                    </strong>
                  </div>
                </div>

                <div className="erp-role-center-impact">
                  <div>
                    <Text strong>影响管理员</Text>
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
                    <Text strong>关键入口 / 高风险能力</Text>
                    <div className="erp-role-center-impact__list">
                      {selectedRolePermissionHighlights.length > 0 ? (
                        selectedRolePermissionHighlights.map((permission) => (
                          <Tag key={permission.key} color="blue">
                            {permission.label}
                          </Tag>
                        ))
                      ) : (
                        <Text type="secondary">
                          未包含岗位入口或系统管理权限
                        </Text>
                      )}
                    </div>
                  </div>
                </div>

                <Alert
                  type="info"
                  showIcon
                  message="客户角色可以不同，职责权限保持统一"
                  description="不同甲方可以配置不同角色名称和默认权限包；流程节点仍绑定稳定职责 / 权限，不能按客户角色名写死业务事实规则。"
                />

                <PermissionChecklist
                  groups={permissionGroups}
                  value={selectedRolePermissionKeys}
                  disabled={!canManageRolePermissions || !selectedRoleKey}
                  onChange={setSelectedRolePermissionKeys}
                />

                <div className="erp-role-center-footer">
                  <Text type="secondary">
                    当前模块分布：
                    {formatModuleSummary(
                      selectedRolePermissionSummary.moduleCounts
                    )}
                  </Text>
                  <Button
                    type="primary"
                    loading={saving}
                    disabled={!canManageRolePermissions || !selectedRoleKey}
                    onClick={saveRolePermissions}
                  >
                    保存角色权限
                  </Button>
                </div>
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
          <Form.Item label="手机号" name="phone">
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
              placeholder="选择一个或多个角色"
              options={roleOptions}
            />
          </Form.Item>
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
    </Space>
  )
}
