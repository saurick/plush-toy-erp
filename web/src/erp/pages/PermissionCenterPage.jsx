import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  defaultMenuPermissions,
  ERP_MENU_PERMISSION_OPTIONS,
  getPermissionLabel,
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

export default function PermissionCenterPage() {
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
  const [editingAdmin, setEditingAdmin] = useState(null)
  const [selectedPermissions, setSelectedPermissions] = useState([])
  const [createForm] = Form.useForm()

  const isSuperAdmin = currentAdmin?.level === ADMIN_LEVEL.SUPER

  const checkboxOptions = ERP_MENU_PERMISSION_OPTIONS.filter(
    (item) => item.key !== '/erp/system/permissions'
  ).map((item) => ({
    label: item.label,
    value: item.key,
  }))

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
    } catch (err) {
      message.error(getActionErrorMessage(err, '加载权限数据'))
    } finally {
      setLoading(false)
    }
  }, [adminRpc])

  useEffect(() => {
    loadData()
  }, [loadData])

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
    setSelectedPermissions(
      normalizeMenuPermissions(admin.menu_permissions || [])
    )
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditingAdmin(null)
    setSelectedPermissions([])
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
      width: 180,
      render: (_, record) => {
        if (record.level === ADMIN_LEVEL.SUPER) {
          return <Text type="secondary">系统保留</Text>
        }
        return (
          <Button
            size="small"
            disabled={!isSuperAdmin}
            onClick={() => openEditModal(record)}
          >
            编辑权限
          </Button>
        )
      },
    },
  ]

  const emptyText = loading ? (
    <Empty description="加载中..." />
  ) : (
    <Empty description="暂无管理员数据" />
  )

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card variant="borderless">
        <Title level={4} style={{ margin: 0 }}>
          权限管理
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          管理员菜单权限默认沿用当前后台导航。超级管理员拥有全部菜单，普通管理员按勾选结果显示入口。
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
              新管理员默认使用当前后台的基础菜单权限；如果需要，也可以创建第二个超级管理员账号。
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
        title="创建管理员"
        open={createModalOpen}
        onCancel={closeCreateModal}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        centered
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
          <Form.Item label="默认菜单权限" name="menu_permissions">
            <Checkbox.Group
              options={checkboxOptions}
              className="erp-permission-grid"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          editingAdmin
            ? `编辑 ${editingAdmin.username} 的菜单权限`
            : '编辑菜单权限'
        }
        open={editModalOpen}
        onCancel={closeEditModal}
        onOk={savePermissions}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        centered
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="菜单权限只控制左侧入口显示"
            description="当前版本不会按菜单权限额外拦截后端业务接口，但会阻止直接进入未授权页面。"
          />
          <Checkbox.Group
            options={checkboxOptions}
            value={selectedPermissions}
            onChange={(values) =>
              setSelectedPermissions(normalizeMenuPermissions(values))
            }
            className="erp-permission-grid"
          />
        </Space>
      </Modal>
    </Space>
  )
}
