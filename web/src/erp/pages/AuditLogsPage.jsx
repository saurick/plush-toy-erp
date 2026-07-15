import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  KeyOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  StopOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { useOutletContext } from 'react-router-dom'
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Grid,
  Input,
  Pagination,
  Segmented,
  Select,
  Tag,
  Typography,
} from 'antd'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { Loading } from '@/common/components/loading'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError, JsonRpc } from '@/common/utils/jsonRpc'
import { DateInput } from '../components/business-list/BusinessListLayout.jsx'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import { buildAuditLogParams } from '../utils/auditLogParams.mjs'

const { Paragraph, Text, Title } = Typography

const DEFAULT_PAGE_SIZE = 20
const DRAWER_FOCUS_RESTORE_FALLBACK_MS = 600
const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100']

const riskLabelMap = {
  high: '高风险',
  warning: '需核对',
  normal: '常规',
}

const riskColorMap = {
  high: 'red',
  warning: 'orange',
  normal: 'blue',
}

const sourceLabelMap = {
  admin_manage: '系统管理',
  customer_config: '客户业务设置',
  server_bootstrap: '系统准备',
  workflow: '紧急任务处理',
}

const actionMetaMap = {
  'admin_user.create': {
    label: '创建员工账号',
    risk: 'warning',
    intent: '确认是否新增了可登录账号',
    next: '核对操作人、账号名、岗位和手机号是否符合公司安排。',
  },
  'admin_user.roles.set': {
    label: '员工岗位变更',
    risk: 'warning',
    intent: '确认员工账号增加或移除了哪些岗位',
    next: '重点核对员工账号的岗位变化，以及是否新增系统管理等重要功能。',
  },
  'admin_user.phone.set': {
    label: '登录手机号变更',
    risk: 'normal',
    intent: '确认登录或通知手机号是否被调整',
    next: '核对手机号修改前后的内容，确认是否由账号负责人发起。',
  },
  'admin_user.disabled.set': {
    label: '账号启用或停用',
    risk: 'high',
    intent: '确认账号是否被禁用或恢复',
    next: '重点核对账号当前状态；如果账号被误禁用，回到权限管理页恢复。',
  },
  'admin_user.revoked': {
    label: '员工账号注销',
    risk: 'high',
    intent: '确认哪个员工账号已被永久注销',
    next: '重点核对操作人和员工账号；已注销账号不能恢复，如需继续使用请创建新账号。',
  },
  'admin_user.password.reset': {
    label: '密码重置',
    risk: 'high',
    intent: '确认谁重置了哪个账号密码',
    next: '核对操作人和员工账号；系统只记录重置操作，不记录密码内容。',
  },
  'role.permissions.set': {
    label: '岗位功能变更',
    risk: 'high',
    intent: '确认某个岗位可使用的功能是否变化',
    next: '重点核对修改前后的功能，确认是否新增账号管理等重要功能。',
  },
  'customer_config.publish': {
    label: '保存客户业务设置',
    risk: 'high',
    intent: '确认谁保存了一版新的客户业务设置',
    next: '核对操作人和修改时间；保存后还需启用，才会影响员工看到的页面和功能。',
  },
  'customer_config.activate': {
    label: '启用客户业务设置',
    risk: 'high',
    intent: '确认哪版客户业务设置开始生效',
    next: '核对操作人和生效时间，并确认员工看到的页面和功能符合预期。',
  },
  'customer_config.rollback': {
    label: '恢复上一版客户业务设置',
    risk: 'high',
    intent: '确认客户业务设置是否恢复到了上一版',
    next: '核对操作人和恢复时间，并确认员工看到的页面和功能已经恢复。',
  },
  'workflow_task.break_glass': {
    label: '紧急代办授权',
    risk: 'high',
    intent: '确认谁临时获准处理了原本不属于自己的待办',
    next: '重点核对操作人、待办事项、处理原因和授权时间是否符合公司安排。',
  },
  'admin_bootstrap.completed': {
    label: '系统准备完成',
    risk: 'normal',
    intent: '确认系统是否已准备好使用',
    next: '如不是首次启用系统，请联系系统维护人员确认此次操作。',
  },
  'admin_bootstrap.blocked': {
    label: '系统准备未完成',
    risk: 'high',
    intent: '确认系统为何暂时无法使用',
    next: '请联系管理员检查系统设置。',
  },
}

const sourceOptions = [
  { label: '全部来源', value: '' },
  { label: '系统管理', value: 'admin_manage' },
  { label: '客户业务设置', value: 'customer_config' },
  { label: '系统准备', value: 'server_bootstrap' },
  { label: '紧急任务处理', value: 'workflow' },
]

const actionOptions = [
  { label: '全部操作', value: '' },
  ...Object.entries(actionMetaMap).map(([value, meta]) => ({
    label: meta.label,
    value,
  })),
]

const quickLocateActions = [
  { key: 'admin_user.password.reset', icon: <KeyOutlined /> },
  { key: 'admin_user.disabled.set', icon: <StopOutlined /> },
  { key: 'role.permissions.set', icon: <SafetyCertificateOutlined /> },
  { key: 'admin_user.roles.set', icon: <UserSwitchOutlined /> },
]

const riskOptions = [
  { label: '全部', value: 'all' },
  { label: '高风险', value: 'high' },
  { label: '需核对', value: 'warning' },
  { label: '常规', value: 'normal' },
]

const fieldLabelMap = {
  account_status: '账号状态',
  disabled: '账号状态',
  is_super_admin: '超级管理员',
  name: '岗位名称',
  phone: '手机号',
  role_type: '岗位类型',
  role_keys: '岗位',
  permission_keys: '可用功能',
  password_reset: '密码',
  session_revoke_reason: '登录状态',
  status_reason: '状态说明',
  version: '岗位信息',
}

const visibleAuditChangeKeys = new Set(Object.keys(fieldLabelMap))

const accountStatusLabelMap = Object.freeze({
  ACTIVE: '正常使用',
  DISABLED: '已停用',
  REVOKED: '已注销',
})

const roleTypeLabelMap = Object.freeze({
  BUILTIN: '系统岗位',
  CUSTOM: '自定义岗位',
})

const technicalAuditValueKeys = new Set([
  'id',
  'actor_id',
  'target_id',
  'source_id',
  'source_line_id',
  'source_type',
  'owner_role_key',
  'task_status_key',
  'payload',
])

function isTechnicalAuditValueKey(key) {
  const normalized = String(key || '').trim()
  if (!normalized) return false
  return (
    technicalAuditValueKeys.has(normalized) ||
    /(?:^|_)(?:id|key)$/u.test(normalized)
  )
}

function normalizeAuditEvents(events = []) {
  return Array.isArray(events)
    ? events.map((event) => ({
        ...event,
        payload:
          event && typeof event.payload === 'object' && event.payload !== null
            ? event.payload
            : {},
      }))
    : []
}

function formatTime(event = {}) {
  if (event.created_at_iso) {
    const date = new Date(event.created_at_iso)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString()
    }
  }
  const unix = Number(event.created_at || 0)
  if (unix > 0) {
    return new Date(unix * 1000).toLocaleString()
  }
  return '-'
}

function getActorText(payload = {}) {
  const actor = payload.actor || {}
  const name =
    actor.username || actor.name || actor.display_name || actor.displayName
  if (name) return name
  if (actor.id) {
    return '管理员'
  }
  return '-'
}

function getEventActorText(event = {}) {
  return (
    event.actor_label ||
    event.actor_name ||
    event.payload?.actor?.username ||
    getActorText(event.payload)
  )
}

function getTargetText(payload = {}) {
  const target = payload.target || {}
  const targetType = String(target.type || '').trim()
  const key =
    target.username ||
    target.name ||
    target.display_name ||
    target.displayName ||
    target.no ||
    target.code ||
    target.order_no ||
    target.document_no ||
    ''
  const targetKey = String(target.key || '').trim()
  const readableTaskKey =
    targetType === 'workflow_task' &&
    targetKey &&
    !/^workflow_task\/\d+$/u.test(targetKey)
      ? targetKey
      : ''
  const id = target.id
    ? {
        admin_user: '员工账号已记录',
        role: '岗位已记录',
        workflow_task: '待办事项已记录',
      }[targetType] || '相关内容已记录'
    : ''
  return key || readableTaskKey || id || '-'
}

function getEventTargetText(event = {}) {
  return getVisibleAuditText(
    event.target_label || event.target_name,
    getTargetText(event.payload)
  )
}

function hasChineseText(value) {
  return /[\u3400-\u9fff]/u.test(String(value || ''))
}

function getVisibleAuditText(value, fallback = '-') {
  const text = String(value || '').trim()
  if (!text) return fallback
  return hasChineseText(text) ? text : fallback
}

function getTargetTypeText(payload = {}) {
  const target = payload.target || {}
  const typeMap = {
    admin_user: '员工账号',
    customer_config_revision: '客户业务设置',
    role: '岗位',
    bootstrap: '系统准备',
    workflow_task: '待办事项',
  }
  return typeMap[target.type] || '相关内容'
}

function getEventTargetTypeText(event = {}) {
  return getVisibleAuditText(
    event.target_type,
    getTargetTypeText(event.payload)
  )
}

function compactValue(value, key) {
  if (value === null || value === undefined) {
    return '-'
  }
  if (key === 'disabled') {
    return value ? '已禁用' : '已启用'
  }
  if (key === 'password_reset') {
    return value ? '已重置' : '未重置'
  }
  if (key === 'account_status') {
    return accountStatusLabelMap[String(value || '').toUpperCase()] || '已更新'
  }
  if (key === 'role_type') {
    return roleTypeLabelMap[String(value || '').toUpperCase()] || '已更新'
  }
  if (key === 'status_reason' || key === 'session_revoke_reason') {
    return value ? '已填写' : '-'
  }
  if (key === 'version') {
    return value ? '已更新' : '-'
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length} 项` : '-'
  }
  if (typeof value === 'object') {
    return '已记录'
  }
  return isTechnicalAuditValueKey(key) ? '已记录' : String(value)
}

function getAuditFieldLabel(key) {
  return fieldLabelMap[key] || '字段变更'
}

function summarizeChange(payload = {}) {
  const before = payload.before || {}
  const after = payload.after || {}
  const keys = [
    ...new Set([...Object.keys(before || {}), ...Object.keys(after || {})]),
  ].filter((key) => visibleAuditChangeKeys.has(key))
  if (keys.length === 0) {
    return '本次操作已记录'
  }
  return keys
    .slice(0, 4)
    .map(
      (key) =>
        `${getAuditFieldLabel(key)}：${compactValue(
          before[key],
          key
        )} → ${compactValue(after[key], key)}`
    )
    .join('；')
}

function getAuditChangeSummary(event = {}) {
  if (event.event_key === 'admin_bootstrap.completed') {
    return '系统已准备完成'
  }
  if (event.event_key === 'admin_bootstrap.blocked') {
    return '系统设置需要管理员检查'
  }
  return summarizeChange(event.payload)
}

function getActionMeta(event = {}) {
  const registeredMeta = actionMetaMap[event.event_key]
  if (registeredMeta) {
    return registeredMeta
  }
  const risk = ['high', 'warning', 'normal'].includes(event.risk_level)
    ? event.risk_level
    : 'normal'
  return {
    label: '其他系统操作',
    risk,
    intent: '系统记录了一项管理操作',
    next: '请核对操作人、相关账号或岗位和修改内容；如有疑问，请联系系统维护人员。',
  }
}

function getSourceLabel(source) {
  return sourceLabelMap[source] || (source ? '其他系统操作' : '-')
}

function buildAuditConclusion(event = {}) {
  const meta = getActionMeta(event)
  const actor = getEventActorText(event)
  const target = getEventTargetText(event)
  const after = event.payload?.after || {}
  if (event.event_key === 'admin_user.password.reset') {
    return `${actor} 重置了 ${target} 的密码`
  }
  if (event.event_key === 'admin_user.disabled.set') {
    return `${actor} ${after.disabled ? '禁用了' : '恢复了'} ${target}`
  }
  if (event.event_key === 'admin_user.roles.set') {
    return `${actor} 调整了 ${target} 的员工岗位`
  }
  if (event.event_key === 'admin_user.revoked') {
    return `${actor} 注销了 ${target}`
  }
  if (event.event_key === 'role.permissions.set') {
    return `${actor} 调整了 ${target} 的岗位功能`
  }
  if (event.event_key === 'admin_bootstrap.blocked') {
    return '系统准备未完成，请联系管理员检查系统设置'
  }
  if (actor === '-' && target === '-') {
    return meta.intent
  }
  if (actor === '-') {
    return `${target}：${meta.intent}`
  }
  if (target === '-') {
    return `${actor} 执行了 ${meta.label}`
  }
  return `${actor} 对 ${target} 执行了 ${meta.label}`
}

function countByRisk(events = []) {
  return events.reduce(
    (summary, event) => {
      const { risk } = getActionMeta(event)
      summary[risk] = (summary[risk] || 0) + 1
      summary.total += 1
      return summary
    },
    { total: 0, high: 0, warning: 0, normal: 0 }
  )
}

function getEventDomId(event = {}) {
  return event.id || `${event.event_key || 'event'}-${event.created_at || ''}`
}

function AuditEventDetail({ event }) {
  if (!event) {
    return (
      <Empty
        description="选择一条操作记录后查看详情"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  return (
    <>
      <div className="erp-audit-detail__head">
        <Tag color={riskColorMap[getActionMeta(event).risk]}>
          {riskLabelMap[getActionMeta(event).risk]}
        </Tag>
        <Title level={5}>{buildAuditConclusion(event)}</Title>
        <Text type="secondary">{formatTime(event)}</Text>
      </div>
      <div className="erp-audit-next-step">
        <Text type="secondary">下一步</Text>
        <Paragraph>{getActionMeta(event).next}</Paragraph>
      </div>
      <div className="erp-audit-facts">
        <div>
          <span>操作人</span>
          <strong>{getEventActorText(event)}</strong>
        </div>
        <div>
          <span>相关账号或岗位</span>
          <strong>{getEventTargetText(event)}</strong>
          <em>{getEventTargetTypeText(event)}</em>
        </div>
        <div>
          <span>操作来源</span>
          <strong>{getSourceLabel(event.source)}</strong>
        </div>
        <div>
          <span>修改内容</span>
          <strong>{getAuditChangeSummary(event)}</strong>
        </div>
      </div>
    </>
  )
}

export default function AuditLogsPage() {
  const outletContext = useOutletContext()
  const beginLatestRequest = useLatestRequestCoordinator()
  const screens = Grid.useBreakpoint()
  const compactAuditLayout = !screens.lg
  const eventTriggerRef = useRef(null)
  const focusRestoreTimerRef = useRef(null)
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
  const [loadError, setLoadError] = useState('')
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [source, setSource] = useState('')
  const [eventKey, setEventKey] = useState('')
  const [riskFilter, setRiskFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  })

  const filteredEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          riskFilter === 'all' || getActionMeta(event).risk === riskFilter
      ),
    [events, riskFilter]
  )
  const riskSummary = useMemo(() => countByRisk(events), [events])
  const selectedEvent = useMemo(
    () =>
      filteredEvents.find(
        (event) => getEventDomId(event) === selectedEventId
      ) ||
      filteredEvents[0] ||
      null,
    [filteredEvents, selectedEventId]
  )

  const restoreEventTriggerFocus = useCallback(() => {
    const trigger = eventTriggerRef.current?.isConnected
      ? eventTriggerRef.current
      : document.querySelector('.erp-audit-event--selected')
    const { activeElement } = document
    if (
      !trigger ||
      (activeElement &&
        activeElement !== document.body &&
        activeElement !== trigger &&
        activeElement.isConnected)
    ) {
      return false
    }
    trigger.focus({ preventScroll: true })
    return document.activeElement === trigger
  }, [])

  const clearFocusRestoreTimer = useCallback(() => {
    if (focusRestoreTimerRef.current !== null) {
      window.clearTimeout(focusRestoreTimerRef.current)
      focusRestoreTimerRef.current = null
    }
  }, [])

  const closeDetailDrawer = useCallback(() => {
    setDetailDrawerOpen(false)
    clearFocusRestoreTimer()
    // Drawer 销毁路径若未交付动画回调，仍在关闭截止后恢复触发点。
    focusRestoreTimerRef.current = window.setTimeout(() => {
      focusRestoreTimerRef.current = null
      restoreEventTriggerFocus()
    }, DRAWER_FOCUS_RESTORE_FALLBACK_MS)
  }, [clearFocusRestoreTimer, restoreEventTriggerFocus])

  const loadData = useCallback(async () => {
    const request = beginLatestRequest('audit-logs')
    setLoading(true)
    setLoadError('')
    try {
      const offset = (pagination.current - 1) * pagination.pageSize
      const result = await adminRpc.call(
        'audit_logs',
        buildAuditLogParams({
          source,
          eventKey,
          keyword,
          createdFrom,
          createdTo,
          pageSize: pagination.pageSize,
          offset,
        }),
        { signal: request.signal }
      )
      if (!request.isCurrent()) {
        return false
      }
      setEvents(normalizeAuditEvents(result?.data?.events))
      setTotal(Number(result?.data?.total || 0))
      return true
    } catch (err) {
      if (isRpcAbortError(err) || !request.isCurrent()) {
        return false
      }
      const errorMessage = getActionErrorMessage(err, '加载操作记录')
      setEvents([])
      setTotal(0)
      setSelectedEventId(null)
      setDetailDrawerOpen(false)
      setLoadError(errorMessage)
      message.error(errorMessage)
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    adminRpc,
    beginLatestRequest,
    createdFrom,
    createdTo,
    eventKey,
    keyword,
    pagination,
    source,
  ])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadData)
  }, [loadData, outletContext])

  useEffect(() => {
    if (!selectedEventId && filteredEvents[0]) {
      setSelectedEventId(getEventDomId(filteredEvents[0]))
      return
    }
    if (
      selectedEventId &&
      !filteredEvents.some((event) => getEventDomId(event) === selectedEventId)
    ) {
      setSelectedEventId(
        filteredEvents[0] ? getEventDomId(filteredEvents[0]) : null
      )
    }
  }, [filteredEvents, selectedEventId])

  useEffect(() => {
    if (!compactAuditLayout || !selectedEvent) {
      setDetailDrawerOpen(false)
    }
  }, [compactAuditLayout, selectedEvent])

  useEffect(() => clearFocusRestoreTimer, [clearFocusRestoreTimer])

  const segmentedOptions = riskOptions.map((option) => ({
    value: option.value,
    label:
      option.value === 'all'
        ? `${option.label} ${riskSummary.total}`
        : `${option.label} ${riskSummary[option.value] || 0}`,
  }))

  if (loading && events.length === 0) {
    return (
      <Loading
        title="操作记录加载中"
        description="正在读取系统管理操作记录..."
      />
    )
  }

  return (
    <div className="erp-audit-page">
      <section className="erp-audit-command" aria-label="系统操作记录总览">
        <div className="erp-audit-command__title">
          <Title level={4}>系统操作记录</Title>
          <Text type="secondary">
            查看员工账号、岗位和系统设置的操作记录，需要时按风险和操作类型筛选。
          </Text>
        </div>
        <div className="erp-audit-command__stats" aria-label="当前页操作摘要">
          <div className="erp-audit-stat erp-audit-stat--danger">
            <span>高风险</span>
            <strong>{riskSummary.high}</strong>
          </div>
          <div className="erp-audit-stat erp-audit-stat--warning">
            <span>需核对</span>
            <strong>{riskSummary.warning}</strong>
          </div>
          <div className="erp-audit-stat">
            <span>当前命中</span>
            <strong>{riskSummary.total}</strong>
          </div>
        </div>
      </section>

      <section className="erp-audit-toolbar" aria-label="操作记录筛选">
        <label className="erp-audit-field">
          <span>操作来源</span>
          <Select
            value={source}
            options={sourceOptions}
            onChange={(value) => {
              setSource(value || '')
              setPagination((prev) => ({ ...prev, current: 1 }))
            }}
          />
        </label>
        <label className="erp-audit-field erp-audit-field--wide">
          <span>操作类型</span>
          <Select
            value={eventKey}
            options={actionOptions}
            onChange={(value) => {
              setEventKey(value || '')
              setPagination((prev) => ({ ...prev, current: 1 }))
            }}
          />
        </label>
        <label className="erp-audit-field erp-audit-field--search">
          <span>搜索</span>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={keyword}
            placeholder="操作人、相关账号或岗位、操作类型或说明"
            onChange={(event) => {
              setKeyword(event.target.value)
              setPagination((prev) => ({ ...prev, current: 1 }))
            }}
          />
        </label>
        <label className="erp-audit-field">
          <span>开始日期</span>
          <DateInput
            value={createdFrom}
            placeholder="开始"
            onChange={(value) => {
              setCreatedFrom(value)
              setPagination((prev) => ({ ...prev, current: 1 }))
            }}
          />
        </label>
        <label className="erp-audit-field">
          <span>结束日期</span>
          <DateInput
            value={createdTo}
            placeholder="结束"
            onChange={(value) => {
              setCreatedTo(value)
              setPagination((prev) => ({ ...prev, current: 1 }))
            }}
          />
        </label>
        <Text className="erp-audit-toolbar__count" type="secondary">
          {keyword || riskFilter !== 'all'
            ? `当前页命中 ${filteredEvents.length}/${events.length}`
            : `共 ${total} 条`}
        </Text>
      </section>

      <section className="erp-audit-lens" aria-label="常查操作">
        <Segmented
          value={riskFilter}
          options={segmentedOptions}
          onChange={(value) => setRiskFilter(value)}
        />
        <div className="erp-audit-quick-actions">
          {quickLocateActions.map(({ key, icon }) => (
            <Button
              key={key}
              size="small"
              icon={icon}
              type={eventKey === key ? 'primary' : 'default'}
              onClick={() => {
                setEventKey(eventKey === key ? '' : key)
                setPagination((prev) => ({ ...prev, current: 1 }))
              }}
            >
              {actionMetaMap[key].label}
            </Button>
          ))}
        </div>
      </section>

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="操作记录加载失败"
          description={`${loadError}。当前不展示上一次筛选结果，请重试。`}
          action={
            <Button size="small" onClick={loadData} disabled={loading}>
              重新加载
            </Button>
          }
        />
      ) : null}

      <div className="erp-audit-workspace">
        <section className="erp-audit-feed" aria-label="操作记录列表">
          <div className="erp-audit-feed__head">
            <Text strong>操作记录</Text>
            {loading ? <Text type="secondary">正在刷新...</Text> : null}
          </div>
          {filteredEvents.length > 0 ? (
            <div className="erp-audit-event-list">
              {filteredEvents.map((record) => {
                const meta = getActionMeta(record)
                const eventDomId = getEventDomId(record)
                const selected = eventDomId === selectedEventId
                return (
                  <button
                    key={eventDomId}
                    type="button"
                    className={[
                      'erp-audit-event',
                      `erp-audit-event--${meta.risk}`,
                      selected ? 'erp-audit-event--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={(event) => {
                      setSelectedEventId(eventDomId)
                      if (compactAuditLayout) {
                        eventTriggerRef.current = event.currentTarget
                        setDetailDrawerOpen(true)
                      }
                    }}
                  >
                    <span className="erp-audit-event__risk">
                      {riskLabelMap[meta.risk]}
                    </span>
                    <span className="erp-audit-event__body">
                      <span className="erp-audit-event__title">
                        {buildAuditConclusion(record)}
                      </span>
                      <span className="erp-audit-event__meta">
                        <span>{formatTime(record)}</span>
                        <span>{getSourceLabel(record.source)}</span>
                        <span>{meta.label}</span>
                      </span>
                      <span className="erp-audit-event__summary">
                        {getAuditChangeSummary(record)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <Empty
              className="erp-audit-empty"
              description="当前条件下没有操作记录"
            />
          )}
          <Pagination
            className="erp-audit-pagination"
            current={pagination.current}
            pageSize={pagination.pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            showSizeChanger
            total={total}
            showTotal={(value) => `共 ${value} 条`}
            onChange={(current, pageSize) =>
              setPagination({
                current,
                pageSize: Number(pageSize) || DEFAULT_PAGE_SIZE,
              })
            }
          />
        </section>

        <aside className="erp-audit-detail" aria-label="操作详情">
          <AuditEventDetail event={selectedEvent} />
        </aside>
      </div>
      <Drawer
        rootClassName="erp-audit-detail-drawer"
        title="操作详情"
        width={screens.md ? 560 : '100%'}
        open={compactAuditLayout && detailDrawerOpen && Boolean(selectedEvent)}
        keyboard
        maskClosable
        destroyOnHidden
        onClose={closeDetailDrawer}
        afterOpenChange={(open) => {
          if (!open) {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                if (restoreEventTriggerFocus()) {
                  clearFocusRestoreTimer()
                }
              })
            })
          }
        }}
      >
        <div className="erp-audit-detail erp-audit-detail--drawer">
          <AuditEventDetail event={selectedEvent} />
        </div>
      </Drawer>
    </div>
  )
}
