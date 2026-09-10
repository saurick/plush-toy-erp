import { UserAddOutlined } from '@ant-design/icons'
import {
  Typography,
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'
import { useOutletContext } from 'react-router-dom'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'
import {
  TABLE_PAGE_SIZE_OPTIONS,
  IS_PRODUCTION_BUILD,
  READ_USER_PERMISSION,
  UPDATE_USER_PERMISSION,
  ASSIGN_USER_ROLE_PERMISSION,
  CREATE_USER_PERMISSION,
  DISABLE_USER_PERMISSION,
  REVOKE_USER_PERMISSION,
  adminStatusOptions,
  roleKeysForAdmin,
  hasPermission,
} from './permissionCenterModel.mjs'
import {
  getPermissionCenterRoleKey as getRoleKey,
  getPermissionCenterRoleName as getRoleVisibleName,
  buildAssignableRoleOptions,
  getAdminControlTargetBlockReason,
  getAdminProfileTargetBlockReason,
  getRoleAssignmentBlockReason,
  isSameAdminAccount,
  normalizeStringList,
} from '../../utils/permissionCenterAccess.mjs'
import {
  DEFAULT_TABLE_PAGE_SIZE,
  DuplicateAdminNameWarning,
} from './RoleAssociatedAccounts.jsx'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  ADMIN_ACCOUNT_STATUS,
  ADMIN_STATUS_FILTERS,
  filterAdminRecords,
  getAdminAccountStatus,
} from '../../utils/permissionCenterSearch.mjs'
import {
  isValidMainlandMobilePhone,
  optionalMainlandMobilePhoneRule,
} from '../../utils/contactValidation.mjs'
import { adminPasswordPolicyRule } from '../../utils/adminPasswordPolicy.mjs'
import {
  ADMIN_USERNAME_MAX_LENGTH,
  ADMIN_USERNAME_RULE_TEXT,
  getAdminUsernameValidationMessage,
} from '../../utils/adminUsername.mjs'
import {
  findAdminsWithDisplayName,
  formatAdminIdentity,
  getAdminDisplayName,
} from '../../utils/adminIdentity.mjs'
import {
  createPermissionCenterAdminDialogState,
  nextPermissionCenterAdminPagination,
  PERMISSION_CENTER_ADMIN_DIALOG,
  permissionCenterAdminDialogReducer,
} from '../../utils/permissionCenterAdminDialog.mjs'

export default function PermissionAdminAccounts({
  editorContainer,
  currentAdmin,
  roles,
  setSaving,
  adminRpc,
  loadData,
  admins,
  loading,
  saving,
  filterRequest,
}) {
  const outletContext = useOutletContext()

  const [creating, setCreating] = useState(false)

  const [statusUpdatingAdminID, setStatusUpdatingAdminID] = useState(null)

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

  const canReadUsers = hasPermission(currentAdmin, READ_USER_PERMISSION)

  const canCreateUsers = hasPermission(currentAdmin, CREATE_USER_PERMISSION)

  const canManageUsers = hasPermission(currentAdmin, UPDATE_USER_PERMISSION)

  const canAssignUserRoles = hasPermission(
    currentAdmin,
    ASSIGN_USER_ROLE_PERMISSION
  )

  const canDisableUsers = hasPermission(currentAdmin, DISABLE_USER_PERMISSION)

  const canRevokeUsers = hasPermission(currentAdmin, REVOKE_USER_PERMISSION)

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
            icon={<UserAddOutlined aria-hidden="true" />}
            className="erp-action-button"
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
  useEffect(() => {
    if (!filterRequest) return
    setAdminSearchKeyword(filterRequest.keyword)
    setAdminStatusFilter(ADMIN_STATUS_FILTERS.ALL)
    setTablePagination((current) => ({ ...current, current: 1 }))
  }, [filterRequest])
  return (
    <>
      {' '}
      {adminAccountTab}
      <BusinessFormPage
        container={editorContainer}
        form={createForm}
        title="创建员工账号"
        className="erp-permission-editor"
        open={createModalOpen}
        onCancel={closeCreateModal}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        okText="创建"
      >
        <Form form={createForm} className="erp-business-action-form" layout="vertical" onFinish={createAdmin}>
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
            <Paragraph type="secondary" className="erp-business-inline-note">
              当前账号不能分配岗位；新账号创建后，请联系账号负责人完成岗位设置。
            </Paragraph>
          ) : null}
        </Form>
      </BusinessFormPage>
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
          <Paragraph type="secondary" className="erp-business-inline-note">
            选择多个岗位时，账号会合并这些岗位已开放的页面和操作。
          </Paragraph>
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
      <BusinessFormPage
        container={editorContainer}
        className="erp-permission-editor"
        hasChanges={
          editingDisplayName !== (profileAdmin?.display_name || '') ||
          editingPhone !== (profileAdmin?.phone || '')
        }
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
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Paragraph type="secondary" className="erp-business-inline-note">
            姓名用于任务、审批和业务操作记录；手机号留空表示解除短信登录手机号。
          </Paragraph>
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
      </BusinessFormPage>
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
    </>
  )
}

const { Paragraph, Text, Title } = Typography
