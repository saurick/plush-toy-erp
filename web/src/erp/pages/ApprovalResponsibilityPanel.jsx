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
  applyApprovalSettings,
  getApprovalSettings,
  previewApprovalSettings,
} from '../api/approvalSettingsApi.mjs'
import {
  approvalSettingsMutationMayHaveSucceeded,
  getApprovalSettingsBlockingItems,
  verifyAppliedApprovalSettings,
} from '../utils/approvalSettingsActivation.mjs'
import {
  freezeApprovalSettingsPayload,
  nextApprovalSettingsRevision,
} from '../utils/approvalSettingsDraft.mjs'
import { getRoleDisplayName, ROLE_DISPLAY_NAMES } from '../utils/roleKeys.mjs'

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
const APPROVAL_ROLE_KEYS = new Set(Object.keys(ROLE_DISPLAY_NAMES))
const EDITOR_MEMBER_FIELDS = STRATEGIES.flatMap(({ key }) => [
  `${key}_role`,
  `${key}_mode`,
  `${key}_user`,
])

const BLOCKER_LABELS = {
  approval_settings_not_published: '尚未发布审批责任',
  approval_disabled: '该审批事项已停用',
  no_eligible_approver: '没有符合岗位、账号和责任设置的办理人',
}
const APPROVAL_SETTINGS_RESULT_MESSAGE_KEY = 'approval-settings-result'

function notifyApprovalSettingsApplied() {
  message.success({
    key: APPROVAL_SETTINGS_RESULT_MESSAGE_KEY,
    content:
      '审批责任已保存并生效；之后新发起审批使用新责任，在途审批继续按原责任办理',
  })
}

function notifyApprovalSettingsConfirmation(content) {
  message.warning({
    key: APPROVAL_SETTINGS_RESULT_MESSAGE_KEY,
    content,
  })
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

function strategyShortLabel(strategyKey) {
  return (
    STRATEGIES.find((strategy) => strategy.key === strategyKey)?.shortLabel ||
    '其他'
  )
}

function responsibilityIdentity(values = {}, strategyKey = '') {
  const roleKey = String(values[`${strategyKey}_role`] || '').trim()
  if (!roleKey) return ''
  if (values[`${strategyKey}_mode`] === 'user') {
    const userID = Number(values[`${strategyKey}_user`] || 0)
    return userID > 0 ? `${roleKey}:${userID}` : ''
  }
  return `${roleKey}:0`
}

function conflictingStrategy(values = {}, strategyKey = '', identity = '') {
  if (!identity) return ''
  return (
    STRATEGIES.find(
      ({ key }) =>
        key !== strategyKey && responsibilityIdentity(values, key) === identity
    )?.key || ''
  )
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
    () =>
      (settings?.items || []).some(
        (item) => item?.configurable === true && item.configured !== true
      ),
    [settings]
  )
  const pageDirty =
    canManage &&
    (draftDirty || Boolean(appliedReceipt) || Boolean(pendingPayload))

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

  const roleOptions = useMemo(() => {
    const roleByKey = new Map(
      roles
        .map((role) => [roleKeyOf(role), role])
        .filter(([key]) => key && !['admin', 'debug_operator'].includes(key))
    )
    const savedRoleKeys = new Set(
      draftItems.flatMap((item) =>
        (item.members || []).map((member) =>
          String(member.role_key || '').trim()
        )
      )
    )
    savedRoleKeys.forEach((key) => {
      if (key && !roleByKey.has(key)) {
        roleByKey.set(key, { role_key: key, missing: true })
      }
    })

    return Array.from(roleByKey.entries()).map(([key, role]) => {
      const displayLabel = getRoleDisplayName(key)
      const protectedOwnRole =
        currentAdmin?.is_super_admin !== true && currentAdminRoleSet.has(key)
      const activeEmployeeCount = admins.filter(
        (admin) => adminIsActive(admin) && adminHasRole(admin, key)
      ).length
      let reason = ''
      let validationMessage = ''
      if (role.missing === true) {
        reason = '岗位已不存在，请重新选择'
        validationMessage = '当前岗位已不存在，请重新选择'
      } else if (!APPROVAL_ROLE_KEYS.has(key)) {
        reason = '不支持审批责任'
        validationMessage = '当前岗位不支持审批责任，请重新选择'
      } else if (role.disabled === true) {
        reason = '岗位已停用'
        validationMessage = '当前岗位已停用，请重新选择'
      } else if (
        !Array.isArray(role.permissions) ||
        !role.permissions.includes('workflow.task.approve')
      ) {
        reason = '未开启审批功能'
        validationMessage = '当前岗位未开启审批功能，请先在岗位设置中开启'
      } else if (activeEmployeeCount === 0) {
        reason = '暂无启用员工'
        validationMessage = '当前岗位暂无启用员工，请先启用员工'
      } else if (protectedOwnRole) {
        reason = '不能配置本人岗位'
        validationMessage = '不能通过审批责任配置本人岗位'
      }
      return {
        value: key,
        displayLabel,
        label: reason ? `${displayLabel}（${reason}）` : displayLabel,
        disabled: Boolean(reason),
        eligible: !reason,
        reason,
        validationMessage,
      }
    })
  }, [admins, currentAdmin, currentAdminRoleSet, draftItems, roles])

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
      roleOptions.map((option) => {
        if (option.disabled || editorValues[`${strategyKey}_mode`] === 'user') {
          return option
        }
        const occupiedBy = conflictingStrategy(
          editorValues,
          strategyKey,
          `${option.value}:0`
        )
        if (!occupiedBy) return option
        return {
          ...option,
          label: `${option.displayLabel}（已用于${strategyShortLabel(
            occupiedBy
          )}责任）`,
          disabled: true,
        }
      }),
    [editorValues, roleOptions]
  )

  const usersForRole = useCallback(
    (roleKey, selectedUserID = 0, strategyKey = '') => {
      const candidates = admins
        .filter(
          (admin) =>
            adminHasRole(admin, roleKey) ||
            Number(admin.id) === Number(selectedUserID)
        )
        .map((admin) => ({ ...admin, missing: false }))
      if (
        selectedUserID > 0 &&
        !candidates.some((admin) => Number(admin.id) === Number(selectedUserID))
      ) {
        candidates.push({ id: selectedUserID, missing: true })
      }
      return candidates.map((admin) => {
        const adminID = Number(admin.id)
        const protectedSelf =
          currentAdmin?.is_super_admin !== true &&
          adminID === Number(currentAdmin?.id)
        const occupiedBy = conflictingStrategy(
          editorValues,
          strategyKey,
          `${roleKey}:${adminID}`
        )
        let reason = ''
        if (admin.missing === true || admin.account_status === 'revoked') {
          reason = '账号不存在或已离职'
        } else if (!adminHasRole(admin, roleKey)) {
          reason = '已不属于该岗位'
        } else if (!adminIsActive(admin)) {
          reason = '账号已停用'
        } else if (protectedSelf) {
          reason = '不能指定本人'
        } else if (occupiedBy) {
          reason = `已用于${strategyShortLabel(occupiedBy)}责任`
        }
        const displayLabel = admin.username || admin.phone || `员工 ${adminID}`
        return {
          value: adminID,
          label: reason ? `${displayLabel}（${reason}）` : displayLabel,
          disabled: Boolean(reason),
          reason,
        }
      })
    },
    [admins, currentAdmin, editorValues]
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
  const selectedUnavailableRoles = useMemo(() => {
    const seen = new Set()
    return STRATEGIES.flatMap(({ key }) => {
      const roleKey = String(editorValues[`${key}_role`] || '').trim()
      const option = roleOptionByKey.get(roleKey)
      if (!roleKey || !option?.disabled || seen.has(roleKey)) return []
      seen.add(roleKey)
      return [option]
    })
  }, [editorValues, roleOptionByKey])

  const editorEligibilityNotice = useMemo(() => {
    const onlyOption = selectableRoleOptions[0]
    const availabilityCopy =
      selectableRoleOptions.length === 0
        ? '当前没有具备审批资格的岗位。请先在“岗位设置”中启用岗位、开启审批功能，并至少保留一名启用员工。'
        : selectableRoleOptions.length === 1
          ? `当前只有“${onlyOption.displayLabel}”具备审批资格。备用和升级可以留空；同一岗位池或同一指定员工不能重复设置，如需将该岗位池改为主办，请先清空现有的备用或升级责任。`
          : ''
    if (selectedUnavailableRoles.length > 0) {
      return {
        type: 'warning',
        message: '当前设置包含不可用岗位',
        description: `${selectedUnavailableRoles
          .map(
            (option) =>
              `${option.displayLabel}：${option.reason || '当前不可用'}`
          )
          .join(
            '；'
          )}。${availabilityCopy || '请重新选择具备审批资格的岗位。'}`,
      }
    }
    if (availabilityCopy) {
      return {
        type: selectableRoleOptions.length === 0 ? 'warning' : 'info',
        message:
          selectableRoleOptions.length === 0
            ? '当前没有可承接岗位'
            : '当前只有一个可承接岗位',
        description: availabilityCopy,
      }
    }
    return null
  }, [selectableRoleOptions, selectedUnavailableRoles])

  const openEditor = (item) => {
    if (saving || appliedReceipt || pendingPayload) {
      message.info('请先完成当前设置生效，或刷新后重新调整')
      return
    }
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
    setEditorValues(values)
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
    setEditorValues({})
    form.resetFields()
  }

  const requestReload = () => {
    if (mutationRef.current) {
      message.info('审批责任正在保存，请稍候')
      return
    }
    if (!pageDirty && !editorDirty) {
      return load()
    }
    modal.confirm({
      centered: true,
      title: '刷新前要放弃审批责任调整吗？',
      content:
        '刷新会重新读取当前生效设置，弹窗内尚未保存的选择、未生效调整或等待确认的保存结果都会丢失。',
      okText: '放弃并刷新',
      cancelText: '继续处理',
      onOk: () => {
        closeEditor(true)
        return load()
      },
    })
  }

  const saveEditor = async () => {
    if (mutationRef.current || appliedReceipt || pendingPayload) return
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
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
        message.warning('同一岗位池或同一指定员工不能重复承担多个责任层级')
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
    setAppliedReceipt(null)
    setPendingPayload(null)
    closeEditor(true)
  }

  const saveAndActivate = async () => {
    if (mutationRef.current || !settings) return
    mutationRef.current = true
    requestIDRef.current += 1
    setSaving(true)
    const nextPayload =
      pendingPayload ||
      freezeApprovalSettingsPayload({
        settings,
        revision,
        draftItems,
      })
    try {
      if (appliedReceipt || pendingPayload) {
        try {
          const current = await getApprovalSettings({})
          verifyAppliedApprovalSettings({
            readback: current,
            payload: nextPayload,
            receipt: appliedReceipt,
          })
          applySettings(current)
          notifyApprovalSettingsApplied()
          return
        } catch (readbackError) {
          if (appliedReceipt) {
            notifyApprovalSettingsConfirmation(
              getActionErrorMessage(readbackError, '', {
                fallback: '生效结果暂时无法确认，请稍后重新确认',
              })
            )
            return
          }
        }
      }
      if (!pendingPayload) {
        const checked = await previewApprovalSettings(nextPayload)
        const blocking = getApprovalSettingsBlockingItems(checked)
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
      }
      let receipt
      try {
        receipt = await applyApprovalSettings(nextPayload)
      } catch (error) {
        if (!approvalSettingsMutationMayHaveSucceeded(error)) throw error
        try {
          const current = await getApprovalSettings({})
          verifyAppliedApprovalSettings({
            readback: current,
            payload: nextPayload,
          })
          applySettings(current)
          notifyApprovalSettingsApplied()
          return
        } catch {
          setPendingPayload(nextPayload)
          setAppliedReceipt(null)
          notifyApprovalSettingsConfirmation(
            '保存结果暂时无法确认，请点击“确认并生效”继续处理'
          )
          return
        }
      }
      setAppliedReceipt(receipt)
      setPendingPayload(nextPayload)
      let readback
      try {
        readback = await getApprovalSettings({})
        verifyAppliedApprovalSettings({
          readback,
          payload: nextPayload,
          receipt,
        })
      } catch (error) {
        notifyApprovalSettingsConfirmation(
          getActionErrorMessage(error, '', {
            fallback: '设置已提交，正在等待确认生效结果',
          })
        )
        return
      }
      applySettings(readback)
      notifyApprovalSettingsApplied()
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
          return <Text type="secondary">保存前自动检查</Text>
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
          <Button
            type="link"
            disabled={
              saving || Boolean(appliedReceipt) || Boolean(pendingPayload)
            }
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
        <Empty description="无权查看审批责任" />
      </Card>
    )
  }

  return (
    <Card
      className="erp-permission-section erp-permission-section--approvals"
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
                为三项可配置审批指定主办、备用和升级责任。
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
                disabled={saving}
                onClick={requestReload}
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
            className="erp-approval-responsibility__table"
            rowKey="approval_key"
            columns={columns}
            dataSource={displayItems}
            pagination={false}
            scroll={{ x: 880 }}
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
              <Button type="primary" loading={saving} onClick={saveAndActivate}>
                {appliedReceipt || pendingPayload ? '确认并生效' : '保存并生效'}
              </Button>
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
          onValuesChange={(_, values) => {
            setEditorValues(values)
            setEditorDirty(true)
          }}
        >
          <Form.Item name="enabled" label="启用此审批" valuePropName="checked">
            <Switch />
          </Form.Item>
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
                              `该岗位池已用于${strategyShortLabel(
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
                  allowClear={key !== 'primary'}
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
                      form.setFieldValue(`${key}_user`, undefined)
                      setEditorValues({
                        ...form.getFieldsValue(true),
                        [`${key}_role`]: roleKey,
                        [`${key}_user`]: undefined,
                      })
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
                      dependencies={EDITOR_MEMBER_FIELDS.filter(
                        (field) => field !== `${key}_user`
                      )}
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
                        showSearch
                        optionFilterProp="label"
                        options={usersForRole(
                          getFieldValue(`${key}_role`),
                          Number(getFieldValue(`${key}_user`) || 0),
                          key
                        )}
                        placeholder="显示该岗位员工；不可用账号会标明原因"
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
