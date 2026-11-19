import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Form,
  InputNumber,
  Radio,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import SupplementalHelp from '@/common/components/help/SupplementalHelp'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import Select from '@/common/components/select/AppSelect'
import useBusinessListStickyHeader from '../components/business-list/useBusinessListStickyHeader.js'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import Table from '@/common/components/table/AppTable'
import { message, useModal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  applyApprovalSettings,
  getApprovalSettings,
  previewApprovalSettings,
} from '../api/approvalSettingsApi.mjs'
import {
  activateApprovalSettings,
  getApprovalSettingsBlockerLabel,
} from '../utils/approvalSettingsActivation.mjs'
import {
  freezeApprovalSettingsPayload,
  nextApprovalSettingsRevision,
} from '../utils/approvalSettingsDraft.mjs'
import {
  EDITOR_MEMBER_FIELDS,
  STRATEGIES,
  adminHasRole,
  adminIsActive,
  approvalConditionSummary,
  approvalEditorEligibilityNotice,
  approvalSettingsNeedInitialization,
  buildApprovalDisplayItems,
  buildApprovalRoleOptions,
  conflictingStrategy,
  draftItemFromEditor,
  draftSignature,
  editorValuesForApproval,
  memberLabel,
  normalizeApprovalCondition,
  normalizeDraftItems,
  roleOptionsForStrategy as calculateRoleOptionsForStrategy,
  selectedUnavailableApprovalRoles,
  strategyShortLabel,
  usersForApprovalRole,
} from '../utils/approvalResponsibilityModel.mjs'
import { AMOUNT_APPROVAL_KEYS } from '../utils/approvalCondition.mjs'
import { BUSINESS_CURRENCY_OPTIONS } from '../utils/businessCurrency.mjs'
import BusinessForm from '../components/business-list/BusinessForm.jsx'

const { Text, Title } = Typography

const APPROVAL_SETTINGS_RESULT_MESSAGE_KEY = 'approval-settings-result'

const APPROVAL_CONDITION_HELP =
  '全部审批表示每次提交都发起人工审批。销售和采购可按金额设置：同币种金额低于门槛免审，达到门槛、币种不同或金额不完整仍需审批；出货财务放行始终需要审批。'
const APPROVAL_RESPONSIBILITY_HELP =
  '系统按主办、备用、升级的优先级选择当前可办理责任。主办无人可处理时使用备用；超时或需要升级时由升级责任承接，不是多人逐级会签。'

function approvalColumnTitle(label, help, ariaLabel) {
  return (
    <Space size={4}>
      <span>{label}</span>
      <SupplementalHelp label={label} aria-label={ariaLabel} content={help} />
    </Space>
  )
}

function notifyApprovalSettingsApplied() {
  message.success({
    key: APPROVAL_SETTINGS_RESULT_MESSAGE_KEY,
    content:
      '审批设置已保存并生效；新发起流程使用新条件和责任，在途流程继续按原设置办理',
  })
}

function notifyApprovalSettingsConfirmation(content) {
  message.warning({
    key: APPROVAL_SETTINGS_RESULT_MESSAGE_KEY,
    content,
  })
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
  const modal = useModal()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [settings, setSettings] = useState(null)
  const tableCardRef = useRef(null)
  const sticky = useBusinessListStickyHeader(
    tableCardRef,
    active && Boolean(settings)
  )
  const [draftItems, setDraftItems] = useState([])
  const [revision, setRevision] = useState('')
  const [preview, setPreview] = useState(null)
  const [appliedReceipt, setAppliedReceipt] = useState(null)
  const [pendingPayload, setPendingPayload] = useState(null)
  const [editingKey, setEditingKey] = useState('')
  const [editorDirty, setEditorDirty] = useState(false)
  const [editorValues, setEditorValues] = useState({})
  const requestIDRef = useRef(0)
  const mutationRef = useRef(false)
  const [form] = Form.useForm()

  const applySettings = useCallback((nextSettings) => {
    setSettings(nextSettings)
    setDraftItems(normalizeDraftItems(nextSettings.items))
    setRevision(nextApprovalSettingsRevision(nextSettings.config_revision))
    setPreview(null)
    setAppliedReceipt(null)
    setPendingPayload(null)
    setEditingKey('')
    setEditorDirty(false)
    setEditorValues({})
  }, [])

  const load = useCallback(async () => {
    if (mutationRef.current) return false
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
    () => approvalSettingsNeedInitialization(settings),
    [settings]
  )
  const pageDirty =
    canManage &&
    (draftDirty || Boolean(appliedReceipt) || Boolean(pendingPayload))
  const canEdit = canManage && !saving && !appliedReceipt && !pendingPayload

  useEffect(() => {
    onDirtyChange?.(pageDirty || editorDirty)
  }, [editorDirty, onDirtyChange, pageDirty])

  const adminByID = useMemo(
    () =>
      new Map(
        admins
          .filter((admin) => Number(admin?.id) > 0)
          .map((admin) => [Number(admin.id), admin])
      ),
    [admins]
  )

  const roleOptions = useMemo(
    () =>
      buildApprovalRoleOptions({
        admins,
        currentAdmin,
        draftItems,
        roles,
      }),
    [admins, currentAdmin, draftItems, roles]
  )

  const roleOptionByKey = useMemo(
    () => new Map(roleOptions.map((option) => [option.value, option])),
    [roleOptions]
  )

  const selectableRoleOptions = useMemo(
    () => roleOptions.filter((option) => option.eligible),
    [roleOptions]
  )

  const roleOptionsForStrategy = useCallback(
    (strategyKey) =>
      calculateRoleOptionsForStrategy({
        roleOptions,
        editorValues,
        strategyKey,
      }),
    [editorValues, roleOptions]
  )

  const usersForRole = useCallback(
    (roleKey, selectedUserID = 0, strategyKey = '') =>
      usersForApprovalRole({
        admins,
        currentAdmin,
        editorValues,
        roleKey,
        selectedUserID,
        strategyKey,
      }),
    [admins, currentAdmin, editorValues]
  )

  const displayItems = useMemo(
    () => buildApprovalDisplayItems({ settings, draftItems, preview }),
    [draftItems, preview, settings]
  )

  const activeEditable = draftItems.find(
    (item) => item.approval_key === editingKey
  )
  const selectedUnavailableRoles = useMemo(
    () => selectedUnavailableApprovalRoles({ editorValues, roleOptionByKey }),
    [editorValues, roleOptionByKey]
  )

  const editorEligibilityNotice = useMemo(
    () =>
      approvalEditorEligibilityNotice({
        selectableRoleOptions,
        selectedUnavailableRoles,
      }),
    [selectableRoleOptions, selectedUnavailableRoles]
  )

  const openEditor = (item) => {
    if (!canManage) return
    if (saving || appliedReceipt || pendingPayload) {
      message.info('请先完成当前设置生效，或刷新后重新调整')
      return
    }
    const values = editorValuesForApproval(item.approval_key, draftItems)
    setEditorValues(values)
    setEditingKey(item.approval_key)
    setEditorDirty(false)
  }

  const closeEditor = (force = false) => {
    if (!force && editorDirty) {
      modal.confirm({
        maskClosable: true,
        centered: true,
        title: '放弃本次审批设置调整？',
        content: '弹窗内尚未保存的选择会丢失。',
        okText: '放弃调整',
        cancelText: '继续编辑',
        onOk: () => closeEditor(true),
      })
      return
    }
    setEditingKey('')
    setEditorDirty(false)
    setEditorValues({})
    form.resetFields()
  }

  const saveEditor = async () => {
    if (mutationRef.current || appliedReceipt || pendingPayload) return
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    let nextDraft
    try {
      nextDraft = draftItemFromEditor(editingKey, values)
    } catch (error) {
      message.warning(
        getActionErrorMessage(error, '审批责任校验失败，请核对填写内容')
      )
      return
    }
    setDraftItems((current) =>
      current.map((item) =>
        item.approval_key === editingKey ? { ...item, ...nextDraft } : item
      )
    )
    setPreview(null)
    setAppliedReceipt(null)
    setPendingPayload(null)
    closeEditor(true)
  }

  const saveAndActivate = async () => {
    if (mutationRef.current || !settings) return
    mutationRef.current = true
    requestIDRef.current += 1
    setSaving(true)
    try {
      const nextPayload =
        pendingPayload ||
        freezeApprovalSettingsPayload({
          settings,
          revision,
          draftItems,
        })
      const result = await activateApprovalSettings({
        payload: nextPayload,
        receipt: appliedReceipt,
        retrying: Boolean(pendingPayload),
        preview: previewApprovalSettings,
        apply: applyApprovalSettings,
        readback: () => getApprovalSettings({}),
      })
      if (result.preview) setPreview(result.preview)
      if (result.status === 'confirmed') {
        applySettings(result.readback)
        notifyApprovalSettingsApplied()
        return
      }
      if (result.status === 'blocked') {
        message.error(result.blockingMessage)
        return
      }
      setPendingPayload(nextPayload)
      setAppliedReceipt(result.receipt || null)
      if (result.status === 'submission_unknown') {
        notifyApprovalSettingsConfirmation(
          '保存结果暂时无法确认，请点击“确认并生效”继续处理'
        )
        return
      }
      if (result.status === 'confirmation_pending') {
        notifyApprovalSettingsConfirmation(
          getActionErrorMessage(result.error, '', {
            fallback:
              result.confirmationStage === 'existing_receipt'
                ? '生效结果暂时无法确认，请稍后重新确认'
                : '设置已提交，正在等待确认生效结果',
          })
        )
      }
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '', {
          fallback: '保存审批责任失败，请稍后重试',
        })
      )
    } finally {
      mutationRef.current = false
      setSaving(false)
    }
  }

  const columns = [
    {
      align: 'left',
      title: '审批事项',
      dataIndex: 'label',
      width: 170,
      fixed: 'left',
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
      title: approvalColumnTitle(
        '审批条件',
        APPROVAL_CONDITION_HELP,
        '审批条件说明'
      ),
      width: 235,
      render: (_, item) => (
        <Space direction="vertical" size={1}>
          <Text>
            {approvalConditionSummary(item.approval_key, item.condition)}
          </Text>
          <Text type="secondary">
            {item.approval_key === 'shipment_finance'
              ? '提交财务审批时发起'
              : item.condition?.mode === 'amount'
                ? '低于门槛免审；其他币种仍需审批'
                : '提交订单后发起审批'}
          </Text>
        </Space>
      ),
    },
    {
      title: approvalColumnTitle(
        '责任顺序',
        APPROVAL_RESPONSIBILITY_HELP,
        '责任顺序说明'
      ),
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
      align: 'left',
      title: '检查',
      width: 150,
      render: (_, item) => {
        if (!item.enabled) {
          return <Text type="secondary">不参与流程</Text>
        }
        if (draftDirty && !preview) {
          return <Text type="secondary">保存前自动检查</Text>
        }
        if (item.blocked_reasons?.length) {
          return (
            <Text type="danger">
              {item.blocked_reasons
                .map(getApprovalSettingsBlockerLabel)
                .join('、')}
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
      align: 'center',
      title: '操作',
      width: 76,
      fixed: 'right',
      render: (_, item) =>
        canManage ? (
          <Button
            type="link"
            disabled={!canEdit}
            onClick={() => openEditor(item)}
          >
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
        <Empty
          state="denied"
          description="无权查看审批责任"
          detail="请联系管理员核对权限。"
        />
      </Card>
    )
  }

  return (
    <Card
      ref={tableCardRef}
      data-page-table-region
      className={`erp-permission-section erp-permission-section--approvals${sticky ? ' erp-business-data-table-card--sticky' : ''}`}
      variant="borderless"
      loading={loading}
      aria-busy={saving}
    >
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="审批责任加载失败"
          description={loadError}
          action={
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              className="erp-action-button"
              size="small"
              onClick={load}
            >
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
          <div
            className="erp-approval-responsibility__header"
            data-page-table-toolbar
          >
            <div>
              <Title level={5}>审批责任</Title>
              <Text type="secondary">
                设置审批条件，以及主办、备用和升级责任。
              </Text>
            </div>
            <Space size={6} wrap>
              <Tag
                color={
                  appliedReceipt || pendingPayload
                    ? 'blue'
                    : draftDirty
                      ? 'orange'
                      : 'green'
                }
              >
                {appliedReceipt || pendingPayload
                  ? '等待确认'
                  : settingsNeedInitialization
                    ? '待初始化'
                    : draftDirty
                      ? '有未生效调整'
                      : '已生效'}
              </Tag>
              <SupplementalHelp
                label="审批责任"
                aria-label="审批责任说明"
                placement="bottomRight"
                content={
                  <div className="erp-approval-responsibility__help">
                    <Text strong>这里设置何时审批、由谁审批</Text>
                    <Text>
                      销售和采购订单可按金额触发审批，默认全部审批。岗位权限决定审批资格，本页指定主办、备用和升级责任。
                    </Text>
                    <Text>
                      新设置只影响新启动的流程，在途审批继续使用原责任。
                    </Text>
                    <Text type="secondary">
                      审批通过只推进对应单据，不会代替库存、出货或财务入账。
                    </Text>
                  </div>
                }
              />
            </Space>
          </div>

          {!canManage ? (
            <Alert
              type="info"
              showIcon
              message="当前为只读"
              description={readOnlyReason || '调整审批责任需要相应的管理权限。'}
            />
          ) : null}

          <Table
            sticky={sticky}
            className="erp-approval-responsibility__table"
            rowKey="approval_key"
            columns={columns}
            dataSource={displayItems}
            onRow={(item) =>
              canEdit
                ? {
                    title: '双击调整审批责任',
                    onDoubleClick: (event) => {
                      if (
                        event.defaultPrevented ||
                        event.target.closest(
                          'button, a, input, textarea, select, label, [role="button"], [role="link"]'
                        )
                      ) {
                        return
                      }
                      openEditor(item)
                    },
                  }
                : {}
            }
            pagination={false}
            scroll={{ x: 980 }}
          />

          {canManage && (draftDirty || appliedReceipt || pendingPayload) ? (
            <div
              className="erp-approval-responsibility__actions"
              aria-busy={saving}
              role="status"
              aria-live="polite"
            >
              <div>
                <Text strong>
                  {appliedReceipt || pendingPayload
                    ? '正在等待确认生效结果'
                    : settingsNeedInitialization
                      ? '推荐责任等待保存'
                      : '调整尚未生效'}
                </Text>
                <br />
                <Text type="secondary">
                  {appliedReceipt || pendingPayload
                    ? '继续后会核对同一次保存结果，不会重复创建配置。'
                    : '保存后立即用于新发起审批；在途审批继续按原责任。'}
                </Text>
              </div>
              <Button
                icon={<SaveOutlined aria-hidden="true" />}
                className="erp-action-button"
                type="primary"
                loading={saving}
                onClick={saveAndActivate}
              >
                {appliedReceipt || pendingPayload ? '确认并生效' : '保存并生效'}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <BusinessModal
        title={`调整${displayItems.find((item) => item.approval_key === editingKey)?.label || '审批责任'}`}
        open={Boolean(activeEditable)}
        onCancel={() => closeEditor()}
        onOk={saveEditor}
        okText="保存调整"
        cancelText="取消"
        size="localAction"
        centered
        destroyOnHidden
      >
        <BusinessForm
          form={form}
          initialValues={editorValues}
          clearOnDestroy
          layout="vertical"
          className="erp-approval-responsibility-form"
          onValuesChange={(_, values) => {
            setEditorValues(values)
            setEditorDirty(true)
          }}
        >
          <Form.Item name="enabled" label="启用此审批" valuePropName="checked">
            <Switch />
          </Form.Item>
          {AMOUNT_APPROVAL_KEYS.has(editingKey) ? (
            <>
              <Form.Item name="approval_mode" label="审批方式">
                <Radio.Group
                  options={[
                    { value: 'all', label: '全部审批' },
                    { value: 'amount', label: '按金额审批' },
                  ]}
                />
              </Form.Item>
              {editorValues.approval_mode === 'amount' ? (
                <>
                  <Form.Item
                    name="approval_currency"
                    label="门槛币种"
                    rules={[{ required: true, message: '请选择币种' }]}
                  >
                    <Select
                      placeholder="请选择门槛币种"
                      options={BUSINESS_CURRENCY_OPTIONS}
                    />
                  </Form.Item>
                  <Form.Item
                    name="approval_amount"
                    label="审批起始金额"
                    extra="达到或超过此金额需审批；低于门槛免审生效。0 表示全部审批。"
                    rules={[
                      { required: true, message: '请输入审批起始金额' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          try {
                            normalizeApprovalCondition(editingKey, {
                              mode: 'amount',
                              amount: value,
                              currency: getFieldValue('approval_currency'),
                            })
                            return Promise.resolve()
                          } catch {
                            return Promise.reject(
                              new Error(
                                '请输入非负金额，最多 14 位整数和 6 位小数'
                              )
                            )
                          }
                        },
                      }),
                    ]}
                  >
                    <InputNumber
                      stringMode
                      min="0"
                      controls={false}
                      style={{ width: '100%' }}
                      placeholder="请输入金额"
                    />
                  </Form.Item>
                  <Text type="secondary">
                    {editingKey === 'sales_order'
                      ? '按订单总额（含税费及约定运费）判断。'
                      : '按采购明细金额合计判断。'}
                    金额不完整或币种不匹配时仍需审批。
                  </Text>
                </>
              ) : (
                <Text type="secondary">
                  所有提交的订单都需审批，不设免审额度。
                </Text>
              )}
            </>
          ) : (
            <Text type="secondary">出货财务确认保持全部审批。</Text>
          )}
          {editorEligibilityNotice ? (
            <Alert
              showIcon
              type={editorEligibilityNotice.type}
              message={editorEligibilityNotice.message}
              description={editorEligibilityNotice.description}
            />
          ) : null}
          {STRATEGIES.map(({ key, fieldLabel }) => (
            <div className="erp-approval-responsibility-form__tier" key={key}>
              <Form.Item
                name={`${key}_role`}
                label={fieldLabel}
                dependencies={[
                  'enabled',
                  ...EDITOR_MEMBER_FIELDS.filter(
                    (field) => field !== `${key}_role`
                  ),
                ]}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!getFieldValue('enabled')) return Promise.resolve()
                      if (
                        key === 'primary' &&
                        getFieldValue('enabled') &&
                        !value
                      ) {
                        return Promise.reject(new Error('请选择主要审批岗位'))
                      }
                      if (!value) return Promise.resolve()
                      const option = roleOptionByKey.get(String(value))
                      if (!option || option.disabled) {
                        return Promise.reject(
                          new Error(
                            option?.validationMessage ||
                              '当前岗位不可用，请重新选择'
                          )
                        )
                      }
                      if (getFieldValue(`${key}_mode`) !== 'user') {
                        const occupiedBy = conflictingStrategy(
                          form.getFieldsValue(true),
                          key,
                          `${value}:0`
                        )
                        if (occupiedBy) {
                          return Promise.reject(
                            new Error(
                              `该岗位的“岗位内任一员工”选项已用于${strategyShortLabel(
                                occupiedBy
                              )}责任`
                            )
                          )
                        }
                      }
                      return Promise.resolve()
                    },
                  }),
                ]}
              >
                <Select
                  options={roleOptionsForStrategy(key)}
                  placeholder="选择岗位"
                  notFoundContent="没有可选审批岗位"
                  onChange={(roleKey) => {
                    const userID = Number(
                      form.getFieldValue(`${key}_user`) || 0
                    )
                    if (
                      userID > 0 &&
                      !adminHasRole(adminByID.get(userID), roleKey)
                    ) {
                      form.setFieldsValue({ [`${key}_user`]: undefined })
                      setEditorValues({
                        ...form.getFieldsValue(true),
                        [`${key}_role`]: roleKey,
                        [`${key}_user`]: undefined,
                      })
                    }
                  }}
                />
              </Form.Item>
              <Form.Item name={`${key}_mode`} label="由谁承接">
                <Select
                  allowClear={
                    false /* 不可清空：承接规则必须明确按岗位或指定员工，空模式不能生成有效责任规则。 */
                  }
                  placeholder="请选择由谁承接"
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
                      dependencies={[
                        'enabled',
                        ...EDITOR_MEMBER_FIELDS.filter(
                          (field) => field !== `${key}_user`
                        ),
                      ]}
                      rules={[
                        ({ getFieldValue: getValue }) => ({
                          validator(_, value) {
                            if (!getValue('enabled')) return Promise.resolve()
                            if (
                              getValue(`${key}_mode`) === 'user' &&
                              !Number(value)
                            ) {
                              return Promise.reject(
                                new Error('请选择该岗位下的员工')
                              )
                            }
                            if (getValue(`${key}_mode`) !== 'user') {
                              return Promise.resolve()
                            }
                            const roleKey = String(
                              getValue(`${key}_role`) || ''
                            ).trim()
                            const selectedAdmin = adminByID.get(Number(value))
                            if (
                              !selectedAdmin ||
                              selectedAdmin.account_status === 'revoked'
                            ) {
                              return Promise.reject(
                                new Error('指定员工不存在或已离职')
                              )
                            }
                            if (!adminHasRole(selectedAdmin, roleKey)) {
                              return Promise.reject(
                                new Error('指定员工已不属于该岗位')
                              )
                            }
                            if (!adminIsActive(selectedAdmin)) {
                              return Promise.reject(
                                new Error('指定员工当前未启用')
                              )
                            }
                            if (
                              currentAdmin?.is_super_admin !== true &&
                              Number(selectedAdmin.id) ===
                                Number(currentAdmin?.id)
                            ) {
                              return Promise.reject(
                                new Error('不能通过审批责任指定本人')
                              )
                            }
                            const occupiedBy = conflictingStrategy(
                              form.getFieldsValue(true),
                              key,
                              `${roleKey}:${Number(value)}`
                            )
                            if (occupiedBy) {
                              return Promise.reject(
                                new Error(
                                  `该指定员工已用于${strategyShortLabel(
                                    occupiedBy
                                  )}责任`
                                )
                              )
                            }
                            return Promise.resolve()
                          },
                        }),
                      ]}
                    >
                      <Select
                        disabled={!getFieldValue(`${key}_role`)}
                        showSearch
                        optionFilterProp="label"
                        options={usersForRole(
                          getFieldValue(`${key}_role`),
                          Number(getFieldValue(`${key}_user`) || 0),
                          key
                        )}
                        placeholder={
                          getFieldValue(`${key}_role`)
                            ? '选择审批员工'
                            : '请先选择审批岗位'
                        }
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
        </BusinessForm>
      </BusinessModal>
    </Card>
  )
}
