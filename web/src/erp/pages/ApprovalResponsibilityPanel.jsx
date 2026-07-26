import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Modal,
  Popover,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  getApprovalSettings,
  previewApprovalSettings,
  publishApprovalSettings,
} from '../api/approvalSettingsApi.mjs'
import {
  activateCustomerConfig,
  checkCustomerConfigTransition,
} from '../api/customerConfigApi.mjs'
import { getRoleDisplayName } from '../utils/roleKeys.mjs'

const { Text, Title } = Typography

const APPROVAL_KEYS = ['sales_order', 'purchase_order', 'shipment_finance']
const STRATEGIES = [
  {
    key: 'primary',
    shortLabel: '主办',
    fieldLabel: '主要由谁审批',
  },
  {
    key: 'backup',
    shortLabel: '备用',
    fieldLabel: '主办无人可处理时',
  },
  {
    key: 'escalation',
    shortLabel: '升级',
    fieldLabel: '超时或需要升级时',
  },
]

const BLOCKER_LABELS = {
  approval_settings_not_published: '尚未发布审批责任',
  approval_disabled: '该审批事项已停用',
  no_eligible_approver: '没有符合岗位、账号和责任设置的办理人',
}

function roleKeyOf(role = {}) {
  return String(role.role_key || role.key || '').trim()
}

function adminRoleKeys(admin = {}) {
  return Array.from(
    new Set(
      (Array.isArray(admin.roles) ? admin.roles : [])
        .map(roleKeyOf)
        .filter(Boolean)
    )
  )
}

function adminIsActive(admin = {}) {
  const status = String(admin.account_status || '').trim()
  return (
    admin.disabled !== true &&
    admin.revoked !== true &&
    !admin.revoked_at &&
    (!status || status === 'active')
  )
}

function adminHasRole(admin = {}, roleKey = '') {
  return adminRoleKeys(admin).includes(String(roleKey || '').trim())
}

function defaultMembers(approvalKey) {
  const primaryRole = {
    sales_order: 'sales',
    purchase_order: 'purchase',
    shipment_finance: 'finance',
  }[approvalKey]
  return [
    {
      role_key: primaryRole,
      user_id: 0,
      strategy: 'primary',
      enabled: true,
    },
    {
      role_key: 'boss',
      user_id: 0,
      strategy: 'escalation',
      enabled: true,
    },
  ].filter((member) => member.role_key)
}

function normalizeDraftItems(
  items = [],
  { initializeUnconfigured = true } = {}
) {
  return APPROVAL_KEYS.map((approvalKey) => {
    const item = (Array.isArray(items) ? items : []).find(
      (candidate) =>
        candidate?.configurable === true &&
        candidate.approval_key === approvalKey
    )
    const configured = item?.configured === true
    const shouldInitialize = !configured && initializeUnconfigured
    return {
      approval_key: approvalKey,
      configured,
      enabled: shouldInitialize ? true : item?.enabled === true,
      members:
        Array.isArray(item?.members) && item.members.length > 0
          ? item.members.map((member) => ({
              role_key: String(member.role_key || '').trim(),
              user_id: Number(member.user_id || 0),
              strategy: String(member.strategy || '').trim(),
              enabled: member.enabled !== false,
            }))
          : shouldInitialize
            ? defaultMembers(approvalKey)
            : [],
    }
  })
}

function draftSignature(items = []) {
  return JSON.stringify(
    items.map((item) => ({
      ...item,
      configured: undefined,
      members: [...item.members].sort((left, right) =>
        `${left.strategy}:${left.role_key}:${left.user_id}`.localeCompare(
          `${right.strategy}:${right.role_key}:${right.user_id}`
        )
      ),
    }))
  )
}

function nextRevision(activeRevision) {
  const base = String(activeRevision || 'approval').trim()
  const stamp = new Date()
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/, 'Z')
  return `${base}.approval.${stamp}`.slice(0, 64)
}

function blockerLabel(code) {
  return BLOCKER_LABELS[code] || '当前设置不能启用'
}

function memberLabel(member, adminByID) {
  const strategy =
    STRATEGIES.find((item) => item.key === member.strategy)?.shortLabel ||
    '责任'
  const role = getRoleDisplayName(member.role_key)
  const admin = adminByID.get(Number(member.user_id || 0))
  return `${strategy} · ${role}${
    admin ? ` · ${admin.username || `员工 ${admin.id}`}` : ''
  }`
}

export default function ApprovalResponsibilityPanel({
  active = false,
  admins = [],
  roles = [],
  currentAdmin = null,
  canRead = false,
  canManage = false,
  readOnlyReason = '',
  discardVersion = 0,
  refreshVersion = 0,
  onDirtyChange,
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [settings, setSettings] = useState(null)
  const [draftItems, setDraftItems] = useState([])
  const [revision, setRevision] = useState('')
  const [preview, setPreview] = useState(null)
  const [published, setPublished] = useState(null)
  const [editingKey, setEditingKey] = useState('')
  const [editorDirty, setEditorDirty] = useState(false)
  const requestIDRef = useRef(0)
  const [form] = Form.useForm()

  const applySettings = useCallback((nextSettings) => {
    setSettings(nextSettings)
    setDraftItems(normalizeDraftItems(nextSettings.items))
    setRevision(nextRevision(nextSettings.config_revision))
    setPreview(null)
    setPublished(null)
    setEditingKey('')
    setEditorDirty(false)
  }, [])

  const load = useCallback(async () => {
    if (!canRead) {
      setSettings(null)
      setDraftItems([])
      setLoadError('')
      return false
    }
    const requestID = requestIDRef.current + 1
    requestIDRef.current = requestID
    setLoading(true)
    setLoadError('')
    setSettings(null)
    setDraftItems([])
    try {
      const nextSettings = await getApprovalSettings({})
      if (requestIDRef.current !== requestID) return false
      applySettings(nextSettings)
      return true
    } catch (error) {
      if (requestIDRef.current !== requestID) return false
      setLoadError(getActionErrorMessage(error, '加载审批责任失败'))
      return false
    } finally {
      if (requestIDRef.current === requestID) {
        setLoading(false)
      }
    }
  }, [applySettings, canRead])

  useEffect(() => {
    if (active) {
      load()
    }
  }, [active, discardVersion, load, refreshVersion])

  const savedSignature = useMemo(
    () =>
      draftSignature(
        normalizeDraftItems(settings?.items || [], {
          initializeUnconfigured: false,
        })
      ),
    [settings]
  )
  const currentSignature = useMemo(
    () => draftSignature(draftItems),
    [draftItems]
  )
  const draftDirty = Boolean(settings) && savedSignature !== currentSignature
  const settingsNeedInitialization = useMemo(
    () =>
      (settings?.items || []).some(
        (item) => item?.configurable === true && item.configured !== true
      ),
    [settings]
  )
  const pageDirty = canManage && (draftDirty || Boolean(published))

  useEffect(() => {
    onDirtyChange?.(pageDirty)
  }, [onDirtyChange, pageDirty])

  const adminByID = useMemo(
    () =>
      new Map(
        admins
          .filter((admin) => Number(admin?.id) > 0)
          .map((admin) => [Number(admin.id), admin])
      ),
    [admins]
  )

  const currentAdminRoleSet = useMemo(
    () => new Set(adminRoleKeys(currentAdmin || {})),
    [currentAdmin]
  )

  const roleOptions = useMemo(
    () =>
      roles
        .filter((role) => {
          const key = roleKeyOf(role)
          return (
            key &&
            !['admin', 'debug_operator'].includes(key) &&
            role.disabled !== true &&
            (Array.isArray(role.permissions)
              ? role.permissions.includes('workflow.task.approve')
              : true)
          )
        })
        .map((role) => {
          const key = roleKeyOf(role)
          const protectedOwnRole =
            currentAdmin?.is_super_admin !== true &&
            currentAdminRoleSet.has(key)
          const activeEmployeeCount = admins.filter(
            (admin) => adminIsActive(admin) && adminHasRole(admin, key)
          ).length
          return {
            value: key,
            label: `${getRoleDisplayName(
              key,
              role.name || role.display_name || '已配置岗位'
            )}${
              protectedOwnRole
                ? '（本人岗位）'
                : activeEmployeeCount === 0
                  ? '（暂无启用员工）'
                  : ''
            }`,
            disabled: protectedOwnRole || activeEmployeeCount === 0,
          }
        }),
    [admins, currentAdmin, currentAdminRoleSet, roles]
  )

  const usersForRole = useCallback(
    (roleKey, selectedUserID = 0) =>
      admins
        .filter(
          (admin) =>
            adminHasRole(admin, roleKey) &&
            (adminIsActive(admin) || Number(admin.id) === selectedUserID)
        )
        .map((admin) => {
          const protectedSelf =
            currentAdmin?.is_super_admin !== true &&
            Number(admin.id) === Number(currentAdmin?.id)
          return {
            value: Number(admin.id),
            label: `${admin.username || admin.phone || `员工 ${admin.id}`}${
              protectedSelf
                ? '（本人）'
                : !adminIsActive(admin)
                  ? '（已停用）'
                  : ''
            }`,
            disabled: protectedSelf || !adminIsActive(admin),
          }
        }),
    [admins, currentAdmin]
  )

  const displayItems = useMemo(() => {
    const baseByKey = new Map(
      (settings?.items || [])
        .filter((item) => item?.configurable)
        .map((item) => [item.approval_key, item])
    )
    const draftByKey = new Map(
      draftItems.map((item) => [item.approval_key, item])
    )
    const previewByKey = new Map(
      (preview?.items || []).map((item) => [item.approval_key, item])
    )
    return APPROVAL_KEYS.map((key) => ({
      ...(baseByKey.get(key) || { approval_key: key, label: key }),
      ...(draftByKey.get(key) || {}),
      ...(previewByKey.get(key) || {}),
      members:
        previewByKey.get(key)?.members ||
        draftByKey.get(key)?.members ||
        baseByKey.get(key)?.members ||
        [],
    }))
  }, [draftItems, preview, settings])

  const activeEditable = draftItems.find(
    (item) => item.approval_key === editingKey
  )

  const openEditor = (item) => {
    const draft = draftItems.find(
      (candidate) => candidate.approval_key === item.approval_key
    ) || { enabled: false, members: [] }
    const values = { enabled: draft.enabled }
    STRATEGIES.forEach(({ key }) => {
      const member = draft.members.find(
        (candidate) => candidate.strategy === key
      )
      values[`${key}_role`] = member?.role_key
      values[`${key}_mode`] = member?.user_id > 0 ? 'user' : 'role'
      values[`${key}_user`] = member?.user_id || undefined
    })
    form.setFieldsValue(values)
    setEditingKey(item.approval_key)
    setEditorDirty(false)
  }

  const closeEditor = (force = false) => {
    if (!force && editorDirty) {
      modal.confirm({
        centered: true,
        title: '放弃本次责任调整？',
        content: '弹窗内尚未保存的选择会丢失。',
        okText: '放弃调整',
        cancelText: '继续编辑',
        onOk: () => closeEditor(true),
      })
      return
    }
    setEditingKey('')
    setEditorDirty(false)
    form.resetFields()
  }

  const requestReload = () => {
    if (!pageDirty && !editorDirty) {
      return load()
    }
    modal.confirm({
      centered: true,
      title: '刷新前要放弃审批责任调整吗？',
      content:
        '刷新会重新读取当前生效设置，弹窗内尚未保存的选择、未发布调整或尚未启用的新设置都会丢失。',
      okText: '放弃并刷新',
      cancelText: '继续处理',
      onOk: () => {
        closeEditor(true)
        return load()
      },
    })
  }

  const saveEditor = async () => {
    const values = await form.validateFields()
    const members = STRATEGIES.filter(({ key }) => values[`${key}_role`]).map(
      ({ key }) => ({
        role_key: values[`${key}_role`],
        user_id:
          values[`${key}_mode`] === 'user'
            ? Number(values[`${key}_user`] || 0)
            : 0,
        strategy: key,
        enabled: true,
      })
    )
    const memberIdentities = new Set()
    for (const member of members) {
      const identity = `${member.role_key}:${member.user_id}`
      if (memberIdentities.has(identity)) {
        message.warning('同一责任成员不能重复承担多个责任层级')
        return
      }
      memberIdentities.add(identity)
    }
    setDraftItems((current) =>
      current.map((item) =>
        item.approval_key === editingKey
          ? { ...item, enabled: values.enabled === true, members }
          : item
      )
    )
    setPreview(null)
    setPublished(null)
    closeEditor(true)
  }

  const payload = () => ({
    customer_key: settings.customer_key,
    revision,
    expected_active_revision: settings.config_revision,
    expected_active_hash: settings.config_hash,
    items: draftItems,
  })

  const checkAndPublish = async () => {
    setSaving(true)
    try {
      const checked = await previewApprovalSettings(payload())
      const blocking = (checked.items || []).filter(
        (item) =>
          item.configurable &&
          item.enabled &&
          Array.isArray(item.blocked_reasons) &&
          item.blocked_reasons.length > 0
      )
      setPreview(checked)
      if (blocking.length > 0) {
        throw new Error(
          blocking
            .map(
              (item) =>
                `${item.label}：${item.blocked_reasons
                  .map(blockerLabel)
                  .join('、')}`
            )
            .join('；')
        )
      }
      const result = await publishApprovalSettings(payload())
      setPublished(result)
      message.success('新设置已发布，请确认启用')
    } catch (error) {
      message.error(getActionErrorMessage(error, '检查并发布审批责任失败'))
    } finally {
      setSaving(false)
    }
  }

  const activatePublished = async () => {
    if (!published) return
    setSaving(true)
    try {
      const transition = await checkCustomerConfigTransition({
        action: 'activate',
        customer_key: published.customer_key,
        target_revision: published.revision,
        expected_config_hash: published.config_hash,
        expected_product_version: published.product_version,
        expected_active_revision: settings.config_revision,
      })
      if (!transition?.allowed) {
        throw new Error('当前生效设置已经变化，请刷新后重新检查')
      }
      await activateCustomerConfig({
        customer_key: published.customer_key,
        revision: published.revision,
        expected_config_hash: published.config_hash,
        expected_product_version: published.product_version,
        expected_active_revision: settings.config_revision,
      })
      const readback = await getApprovalSettings({})
      if (readback.config_revision !== published.revision) {
        throw new Error('新设置已提交，但生效结果尚未确认，请刷新重试')
      }
      applySettings(readback)
      message.success('审批责任已启用；在途审批继续按原责任办理')
    } catch (error) {
      message.error(getActionErrorMessage(error, '启用审批责任失败'))
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: '审批事项',
      dataIndex: 'label',
      width: 210,
      render: (_, item) => (
        <Space direction="vertical" size={1}>
          <Text strong>{item.label}</Text>
          <Text type="secondary">{item.domain}</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      width: 84,
      render: (_, item) =>
        item.configured !== true ? (
          <Tag color="orange">待设置</Tag>
        ) : (
          <Tag color={item.enabled ? 'green' : 'default'}>
            {item.enabled ? '启用' : '停用'}
          </Tag>
        ),
    },
    {
      title: '责任顺序',
      render: (_, item) =>
        !item.enabled ? (
          <Text type="secondary">—</Text>
        ) : item.members?.some((member) => member.enabled) ? (
          <Space size={[4, 4]} wrap>
            {item.members
              .filter((member) => member.enabled)
              .map((member) => (
                <Tag
                  key={`${member.strategy}-${member.role_key}-${member.user_id}`}
                >
                  {memberLabel(member, adminByID)}
                </Tag>
              ))}
          </Space>
        ) : (
          <Text type="secondary">尚未设置</Text>
        ),
    },
    {
      title: '检查',
      width: 190,
      render: (_, item) => {
        if (!item.enabled) {
          return <Text type="secondary">不参与流程</Text>
        }
        if (draftDirty && !preview) {
          return <Text type="secondary">发布前自动检查</Text>
        }
        if (item.blocked_reasons?.length) {
          return (
            <Text type="danger">
              {item.blocked_reasons.map(blockerLabel).join('、')}
            </Text>
          )
        }
        return (
          <Text type="success">
            <CheckCircleOutlined /> 可办理
          </Text>
        )
      },
    },
    {
      title: '操作',
      width: 76,
      render: (_, item) =>
        canManage ? (
          <Button type="link" onClick={() => openEditor(item)}>
            调整
          </Button>
        ) : null,
    },
  ]

  if (!canRead) {
    return (
      <Card
        className="erp-permission-section erp-permission-section--approvals"
        variant="borderless"
      >
        <Empty description="无权查看审批责任" />
      </Card>
    )
  }

  return (
    <Card
      className="erp-permission-section erp-permission-section--approvals"
      variant="borderless"
      loading={loading}
    >
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="审批责任加载失败"
          description={loadError}
          action={
            <Button size="small" onClick={load}>
              重试
            </Button>
          }
        />
      ) : null}

      {!loading && !loadError && !settings ? (
        <Empty description="当前没有可读取的生效配置，请联系系统管理员" />
      ) : null}

      {settings ? (
        <>
          <div className="erp-approval-responsibility__header">
            <div>
              <Title level={5}>审批责任</Title>
              <Text type="secondary">
                为三项正式审批指定主办、备用和升级责任。
              </Text>
            </div>
            <Space size={6} wrap>
              <Tag color={published ? 'blue' : draftDirty ? 'orange' : 'green'}>
                {published
                  ? '待启用'
                  : settingsNeedInitialization
                    ? '待初始化'
                    : draftDirty
                      ? '有待发布调整'
                      : '已生效'}
              </Tag>
              <Popover
                placement="bottomRight"
                trigger={['hover', 'focus', 'click']}
                content={
                  <div className="erp-approval-responsibility__help">
                    <Text strong>这里设置谁来审批</Text>
                    <Text>
                      岗位权限先决定谁具备审批资格；本页再指定主办、备用和升级责任。
                    </Text>
                    <Text>
                      新设置只影响新启动的流程，在途审批继续使用原责任。
                    </Text>
                    <Text type="secondary">
                      审批通过只推进对应单据，不会代替库存、出货或财务入账。
                    </Text>
                    <Text type="secondary">
                      当前版本：{settings.config_revision}
                    </Text>
                  </div>
                }
              >
                <Button
                  type="text"
                  shape="circle"
                  icon={<QuestionCircleOutlined />}
                  aria-label="审批责任说明"
                />
              </Popover>
              <Button
                type="text"
                shape="circle"
                icon={<ReloadOutlined />}
                aria-label="刷新审批责任"
                onClick={requestReload}
              />
            </Space>
          </div>

          {!canManage ? (
            <Alert
              type="info"
              showIcon
              message="当前为只读"
              description={
                readOnlyReason ||
                '调整审批责任需要同时具备账号、岗位、发布和启用权限。'
              }
            />
          ) : null}

          <Table
            className="erp-approval-responsibility__table"
            rowKey="approval_key"
            columns={columns}
            dataSource={displayItems}
            pagination={false}
            scroll={{ x: 880 }}
          />

          {canManage && (draftDirty || published) ? (
            <div className="erp-approval-responsibility__actions">
              <div>
                <Text strong>
                  {published
                    ? '新设置已发布，尚未启用'
                    : settingsNeedInitialization
                      ? '推荐责任尚未发布'
                      : '调整尚未发布'}
                </Text>
                <br />
                <Text type="secondary">
                  {published
                    ? '启用后只影响之后新启动的审批。'
                    : '系统会先检查岗位、员工和责任顺序。'}
                </Text>
              </div>
              {published ? (
                <Button
                  type="primary"
                  loading={saving}
                  onClick={activatePublished}
                >
                  启用新设置
                </Button>
              ) : (
                <Button
                  type="primary"
                  loading={saving}
                  onClick={checkAndPublish}
                >
                  检查并发布
                </Button>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      <Modal
        title={`调整${displayItems.find((item) => item.approval_key === editingKey)?.label || '审批责任'}`}
        open={Boolean(activeEditable)}
        onCancel={() => closeEditor()}
        onOk={saveEditor}
        okText="保存调整"
        cancelText="取消"
        width={760}
        centered
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          className="erp-approval-responsibility-form"
          onValuesChange={() => setEditorDirty(true)}
        >
          <Form.Item name="enabled" label="启用此审批" valuePropName="checked">
            <Switch />
          </Form.Item>
          {STRATEGIES.map(({ key, fieldLabel }) => (
            <div className="erp-approval-responsibility-form__tier" key={key}>
              <Form.Item
                name={`${key}_role`}
                label={fieldLabel}
                dependencies={['enabled']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (
                        key === 'primary' &&
                        getFieldValue('enabled') &&
                        !value
                      ) {
                        return Promise.reject(new Error('请选择主要审批岗位'))
                      }
                      return Promise.resolve()
                    },
                  }),
                ]}
              >
                <Select
                  allowClear={key !== 'primary'}
                  options={roleOptions}
                  placeholder="选择岗位"
                  onChange={(roleKey) => {
                    const userID = Number(
                      form.getFieldValue(`${key}_user`) || 0
                    )
                    if (
                      userID > 0 &&
                      !adminHasRole(adminByID.get(userID), roleKey)
                    ) {
                      form.setFieldValue(`${key}_user`, undefined)
                    }
                  }}
                />
              </Form.Item>
              <Form.Item
                name={`${key}_mode`}
                label="由谁承接"
                initialValue="role"
              >
                <Select
                  options={[
                    { value: 'role', label: '岗位内任一员工' },
                    { value: 'user', label: '指定一名员工' },
                  ]}
                />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(previous, current) =>
                  previous[`${key}_mode`] !== current[`${key}_mode`] ||
                  previous[`${key}_role`] !== current[`${key}_role`]
                }
              >
                {({ getFieldValue }) =>
                  getFieldValue(`${key}_mode`) === 'user' ? (
                    <Form.Item
                      name={`${key}_user`}
                      label="指定员工"
                      dependencies={[`${key}_mode`, `${key}_role`]}
                      rules={[
                        ({ getFieldValue: getValue }) => ({
                          validator(_, value) {
                            if (
                              getValue(`${key}_mode`) === 'user' &&
                              !Number(value)
                            ) {
                              return Promise.reject(
                                new Error('请选择该岗位下的员工')
                              )
                            }
                            return Promise.resolve()
                          },
                        }),
                      ]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        options={usersForRole(
                          getFieldValue(`${key}_role`),
                          Number(getFieldValue(`${key}_user`) || 0)
                        )}
                        placeholder="只显示该岗位的启用员工"
                      />
                    </Form.Item>
                  ) : (
                    <div
                      className="erp-approval-responsibility-form__pool-note"
                      aria-label={`${fieldLabel}由岗位内任一员工承接`}
                    >
                      由该岗位内任一启用员工承接
                    </div>
                  )
                }
              </Form.Item>
            </div>
          ))}
        </Form>
      </Modal>
    </Card>
  )
}
