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
  defaultMenuPermissions,
  ERP_MENU_PERMISSION_GROUPS,
  ERP_PERMISSION_PRESETS,
  getPermissionPreset,
  getPermissionLabel,
  matchPermissionPreset,
  normalizeMenuPermissions,
} from '../config/menuPermissions.mjs'

const { Paragraph, Text, Title } = Typography

const ADMIN_LEVEL = {
  SUPER: 0,
  STANDARD: 1,
}

const levelTextMap = {
  [ADMIN_LEVEL.SUPER]: '超级管理员',
  [ADMIN_LEVEL.STANDARD]: '普通管理员',
}

const TABLE_PAGE_SIZE_OPTIONS = ['8', '10', '20', '50', '100']
const DEFAULT_TABLE_PAGE_SIZE = 8
const PASSWORD_MIN_LENGTH = 6

const permissionGroups = ERP_MENU_PERMISSION_GROUPS.map((section) => ({
  ...section,
  items: section.items.filter((item) => item.key !== '/erp/system/permissions'),
})).filter((section) => section.items.length > 0)

const presetOptions = ERP_PERMISSION_PRESETS.map((preset) => ({
  label: preset.label,
  value: preset.key,
}))

function PermissionSectionChecklist({ value = [], onChange }) {
  const normalizedValue = normalizeMenuPermissions(value)

  const handleSectionChange = (sectionKeys, nextSectionValues) => {
    const next = normalizeMenuPermissions([
      ...normalizedValue.filter((item) => !sectionKeys.includes(item)),
      ...(nextSectionValues || []),
    ])
    onChange?.(next)
  }

  return (
    <div className="erp-permission-checklist">
      {permissionGroups.map((section) => {
        const sectionKeys = section.items.map((item) => item.key)
        const selectedKeys = normalizedValue.filter((item) =>
          sectionKeys.includes(item)
        )

        return (
          <section
            className="erp-permission-checklist__section"
            key={section.title}
          >
            <div className="erp-permission-checklist__header">
              <Text strong>{section.title}</Text>
              <Text type="secondary">
                {selectedKeys.length}/{section.items.length}
              </Text>
            </div>
            <Checkbox.Group
              options={section.items.map((item) => ({
                label: item.label,
                value: item.key,
              }))}
              value={selectedKeys}
              onChange={(nextValues) =>
                handleSectionChange(sectionKeys, nextValues)
              }
              className="erp-permission-grid"
            />
          </section>
        )
      })}
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
  const [tablePagination, setTablePagination] = useState({
    current: 1,
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
  })
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState(null)
  const [resettingAdmin, setResettingAdmin] = useState(null)
  const [selectedPermissions, setSelectedPermissions] = useState([])
  const [selectedPresetKey, setSelectedPresetKey] = useState('')
  const [createForm] = Form.useForm()
  const [resetForm] = Form.useForm()
  const createMenuPermissions = Form.useWatch('menu_permissions', createForm)

  const isSuperAdmin = currentAdmin?.level === ADMIN_LEVEL.SUPER
  const createSelectedPermissionCount = normalizeMenuPermissions(
    createMenuPermissions || []
  ).length

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [meResult, listResult] = await Promise.all([
        adminRpc.call('me', {}),
        adminRpc.call('list', {}),
      ])
      setCurrentAdmin(meResult?.data || null)
      setAdmins(
        Array.isArray(listResult?.data?.admins) ? listResult.data.admins : []
      )
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
    const totalPages = Math.max(
      1,
      Math.ceil(admins.length / tablePagination.pageSize)
    )
    if (tablePagination.current <= totalPages) {
      return
    }
    setTablePagination((prev) => ({
      ...prev,
      current: totalPages,
    }))
  }, [admins.length, tablePagination.current, tablePagination.pageSize])

  useEffect(() => {
    if (!createModalOpen) {
      return
    }
    createForm.setFieldsValue({
      level: ADMIN_LEVEL.STANDARD,
      menu_permissions: defaultMenuPermissions(),
    })
  }, [createForm, createModalOpen])

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

  const closeCreateModal = () => {
    setCreateModalOpen(false)
    createForm.resetFields()
  }

  const openEditModal = (admin) => {
    if (!admin || admin.level === ADMIN_LEVEL.SUPER) {
      return
    }
    setEditingAdmin(admin)
    const normalized = normalizeMenuPermissions(admin.menu_permissions || [])
    setSelectedPermissions(normalized)
    setSelectedPresetKey(matchPermissionPreset(normalized))
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditingAdmin(null)
    setSelectedPermissions([])
    setSelectedPresetKey('')
  }

  const openResetModal = (admin) => {
    if (!admin || admin.level === ADMIN_LEVEL.SUPER) {
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

  const createAdmin = async (values) => {
    setCreating(true)
    try {
      const payload = {
        username: String(values.username || '').trim(),
        password: values.password,
        level: Number(values.level ?? ADMIN_LEVEL.STANDARD),
        menu_permissions: normalizeMenuPermissions(
          values.menu_permissions || []
        ),
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

  const savePermissions = async () => {
    if (!editingAdmin?.id) {
      return
    }
    setSaving(true)
    try {
      await adminRpc.call('set_permissions', {
        id: editingAdmin.id,
        menu_permissions: normalizeMenuPermissions(selectedPermissions),
      })
      message.success('权限已更新')
      closeEditModal()
      await loadData()
    } catch (err) {
      message.error(getActionErrorMessage(err, '更新权限'))
    } finally {
      setSaving(false)
    }
  }

  const applyCreatePreset = (presetKey) => {
    const preset = getPermissionPreset(presetKey)
    createForm.setFieldsValue({
      permission_preset: presetKey || undefined,
      menu_permissions: preset?.permissions || defaultMenuPermissions(),
    })
  }

  const applyEditPreset = (presetKey) => {
    const preset = getPermissionPreset(presetKey)
    setSelectedPresetKey(presetKey || '')
    setSelectedPermissions(
      preset?.permissions || normalizeMenuPermissions(selectedPermissions)
    )
  }

  const handleEditPermissionsChange = (permissions) => {
    const normalized = normalizeMenuPermissions(permissions)
    setSelectedPermissions(normalized)
    setSelectedPresetKey(matchPermissionPreset(normalized))
  }

  const applyAdminStatus = async (admin, disabled) => {
    if (!admin?.id || admin.level === ADMIN_LEVEL.SUPER) {
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
      title: '等级',
      dataIndex: 'level',
      width: 140,
      render: (level) => {
        const text = levelTextMap[level] || `未知(${level})`
        const color = level === ADMIN_LEVEL.SUPER ? 'gold' : 'blue'
        return <Tag color={color}>{text}</Tag>
      },
    },
    {
      title: '状态',
      dataIndex: 'disabled',
      width: 150,
      render: (disabled, record) => {
        if (record.level === ADMIN_LEVEL.SUPER) {
          return <Tag color="gold">始终启用</Tag>
        }
        if (!isSuperAdmin) {
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
      title: '菜单权限',
      dataIndex: 'menu_permissions',
      render: (_, record) => {
        if (record.level === ADMIN_LEVEL.SUPER) {
          return <Tag color="gold">全部菜单</Tag>
        }
        const normalized = normalizeMenuPermissions(
          record.menu_permissions || []
        )
        if (normalized.length === 0) {
          return <Tag color="default">无菜单权限</Tag>
        }
        return (
          <Space wrap size={[4, 6]}>
            {normalized.slice(0, 4).map((key) => (
              <Tag key={key}>{getPermissionLabel(key)}</Tag>
            ))}
            {normalized.length > 4 ? (
              <Text type="secondary">+{normalized.length - 4}</Text>
            ) : null}
          </Space>
        )
      },
    },
    {
      title: '操作',
      width: 240,
      render: (_, record) => {
        if (record.level === ADMIN_LEVEL.SUPER) {
          return <Text type="secondary">系统保留</Text>
        }
        return (
          <Space wrap size={[8, 8]}>
            <Button
              size="small"
              disabled={!isSuperAdmin}
              onClick={() => openEditModal(record)}
            >
              编辑权限
            </Button>
            <Button
              size="small"
              disabled={!isSuperAdmin}
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
  ) : (
    <Empty description="暂无管理员数据" />
  )

  if (loading && admins.length === 0 && !currentAdmin) {
    return (
      <Loading
        title="权限加载中"
        description="正在同步管理员账号和菜单权限，请稍候..."
      />
    )
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card variant="borderless">
        <Title level={4} style={{ margin: 0 }}>
          权限管理
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          当前已补到完整页面级权限：业务页、打印中心、帮助中心和系统管理统一按菜单权限显示，并阻止直接进入未授权页面。
        </Paragraph>
      </Card>

      {!isSuperAdmin ? (
        <Alert
          type="warning"
          showIcon
          message="当前账号只能查看权限结果"
          description="创建管理员、修改菜单权限和启用/禁用状态都需要超级管理员权限。"
        />
      ) : null}

      {isSuperAdmin ? (
        <Card variant="borderless">
          <Space
            size={12}
            style={{ width: '100%', justifyContent: 'space-between' }}
            wrap
          >
            <Paragraph type="secondary" style={{ margin: 0 }}>
              新管理员默认继承完整基础菜单；如果是固定业务角色，建议先套用下面的推荐模板再微调。
            </Paragraph>
            <Button type="primary" onClick={() => setCreateModalOpen(true)}>
              创建管理员
            </Button>
          </Space>
        </Card>
      ) : null}

      <Card variant="borderless">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={admins}
          loading={loading}
          pagination={{
            current: tablePagination.current,
            pageSize: tablePagination.pageSize,
            pageSizeOptions: TABLE_PAGE_SIZE_OPTIONS,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          locale={{ emptyText }}
          scroll={{ x: 960 }}
          onChange={handleTableChange}
        />
      </Card>

      <Modal
        title={
          <div className="erp-permission-modal__title">
            <span className="erp-permission-modal__title-main">创建管理员</span>
            <Text type="secondary">账号与默认菜单一次配置</Text>
          </div>
        }
        open={createModalOpen}
        onCancel={closeCreateModal}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        centered
        width={980}
        className="erp-permission-modal"
        forceRender
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={createAdmin}
          initialValues={{
            level: ADMIN_LEVEL.STANDARD,
            menu_permissions: defaultMenuPermissions(),
          }}
        >
          <div className="erp-permission-modal__fields">
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
              <Input placeholder="例如：manager02" maxLength={64} />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少 6 位' },
              ]}
            >
              <Input.Password
                placeholder="至少 6 位"
                autoComplete="new-password"
              />
            </Form.Item>
            <Form.Item label="等级" name="level">
              <Select
                options={[
                  { value: ADMIN_LEVEL.STANDARD, label: '普通管理员' },
                  { value: ADMIN_LEVEL.SUPER, label: '超级管理员' },
                ]}
              />
            </Form.Item>
            <Form.Item label="推荐权限模板" name="permission_preset">
              <Select
                allowClear
                placeholder="可选：按老板 / PMC / 仓库 / 财务等模板先套用"
                options={presetOptions}
                onChange={applyCreatePreset}
              />
            </Form.Item>
          </div>
          <div className="erp-permission-modal__section-head">
            <Text strong>默认菜单权限</Text>
            <Text type="secondary">
              已选 {createSelectedPermissionCount} 项
            </Text>
          </div>
          <Form.Item
            className="erp-permission-modal__permission-field"
            name="menu_permissions"
          >
            <PermissionSectionChecklist />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <div className="erp-permission-modal__title">
            <span className="erp-permission-modal__title-main">
              {editingAdmin
                ? `编辑 ${editingAdmin.username} 的菜单权限`
                : '编辑菜单权限'}
            </span>
            <Text type="secondary">修改后立即影响左侧菜单可见范围</Text>
          </div>
        }
        open={editModalOpen}
        onCancel={closeEditModal}
        onOk={savePermissions}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        centered
        width={980}
        className="erp-permission-modal"
      >
        <Space
          className="erp-permission-modal__edit-stack"
          direction="vertical"
          size={12}
        >
          <Alert
            type="info"
            showIcon
            message="当前权限已收口到页面级"
            description="会同时控制左侧菜单显示和未授权页面直达；但业务动作级权限、字段级权限和手机端接口级权限仍待后端继续落。"
          />
          <Select
            allowClear
            placeholder="套用推荐权限模板后可继续微调"
            options={presetOptions}
            value={selectedPresetKey || undefined}
            onChange={applyEditPreset}
          />
          <PermissionSectionChecklist
            value={selectedPermissions}
            onChange={handleEditPermissionsChange}
          />
          <Text type="secondary">
            当前共选择 {selectedPermissions.length}{' '}
            项页面权限，后台会按当前导航顺序保存。
          </Text>
        </Space>
      </Modal>

      <Modal
        title={
          <div className="erp-permission-modal__title">
            <span className="erp-permission-modal__title-main">
              重置管理员密码
            </span>
            <Text type="secondary">
              {resettingAdmin ? resettingAdmin.username : ''}
            </Text>
          </div>
        }
        open={resetModalOpen}
        onCancel={closeResetModal}
        onOk={() => resetForm.submit()}
        confirmLoading={saving}
        okText="确认重置"
        cancelText="取消"
        centered
        width={520}
        forceRender
      >
        <Form form={resetForm} layout="vertical" onFinish={resetAdminPassword}>
          <Alert
            type="warning"
            showIcon
            message="旧密码会立即失效"
            description="保存后请把新密码交给本人，并提醒其尽快登录确认。"
            style={{ marginBottom: 16 }}
          />
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
            <Input.Password
              placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位`}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="password_confirm"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的新密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password
              placeholder="再次输入新密码"
              autoComplete="new-password"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
