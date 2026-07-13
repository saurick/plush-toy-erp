import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  StopOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { useOutletContext } from 'react-router-dom'
import {
  Button,
  Empty,
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
import {
  getActionErrorMessage,
  getUserFacingErrorMessage,
} from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { DateInput } from '../components/business-list/BusinessListLayout.jsx'
import { buildAuditLogParams } from '../utils/auditLogParams.mjs'

const { Paragraph, Text, Title } = Typography

const DEFAULT_PAGE_SIZE = 20
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
  server_bootstrap: '启动初始化',
}

const actionMetaMap = {
  'admin_user.create': {
    label: '新建管理员',
    risk: 'warning',
    intent: '确认是否新增了可登录账号',
    next: '核对操作者、账号名、角色和手机号是否符合授权。',
  },
  'admin_user.roles.set': {
    label: '账号角色变更',
    risk: 'warning',
    intent: '确认账号被授予或移除了哪些角色',
    next: '重点核对对象账号的角色变更前后差异，以及是否包含系统管理员或其他高风险权限。',
  },
  'admin_user.phone.set': {
    label: '账号手机号变更',
    risk: 'normal',
    intent: '确认登录或通知手机号是否被调整',
    next: '核对手机号变更前后差异，确认是否由账号负责人发起。',
  },
  'admin_user.disabled.set': {
    label: '账号启停变更',
    risk: 'high',
    intent: '确认账号是否被禁用或恢复',
    next: '重点核对账号当前状态；如果账号被误禁用，回到权限管理页恢复。',
  },
  'admin_user.password.reset': {
    label: '密码重置',
    risk: 'high',
    intent: '确认谁重置了哪个账号密码',
    next: '核对操作者和对象账号；审计只记录重置动作，不记录明文密码。',
  },
  'role.permissions.set': {
    label: '角色权限变更',
    risk: 'high',
    intent: '确认某个角色的权限集是否发生变化',
    next: '重点核对权限变更前后差异，确认是否新增高风险系统权限。',
  },
  'admin_bootstrap.completed': {
    label: '初始化完成',
    risk: 'normal',
    intent: '确认启动初始化是否按预期完成',
    next: '如不是首次部署，应确认是否误触发一次性管理员初始化。',
  },
  'admin_bootstrap.blocked': {
    label: '初始化阻止',
    risk: 'high',
    intent: '确认启动期安全守卫阻止了什么',
    next: '查看阻止原因，并检查启动配置和生产环境启动检查结果。',
  },
}

const sourceOptions = [
  { label: '全部来源', value: '' },
  { label: '系统管理', value: 'admin_manage' },
  { label: '启动初始化', value: 'server_bootstrap' },
]

const actionOptions = [
  { label: '全部动作', value: '' },
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
  disabled: '账号状态',
  is_super_admin: '超级管理员',
  phone: '手机号',
  role_keys: '角色',
  permission_keys: '权限',
  password_reset: '密码',
}

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
    return '操作者已关联'
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
  const id = target.id ? '目标已关联' : ''
  return key || id || '-'
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

function getVisibleAuditReason(reason, fallback = '需检查审计记录') {
  const text = String(reason || '').trim()
  if (!text) return fallback
  return getUserFacingErrorMessage({ message: text }, fallback)
}

function getTargetTypeText(payload = {}) {
  const target = payload.target || {}
  const typeMap = {
    admin_user: '管理员账号',
    role: '角色',
    bootstrap: '启动初始化',
  }
  return typeMap[target.type] || '对象'
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
  ].filter((key) => !['id', 'username'].includes(key))
  if (keys.length === 0) {
    return getVisibleAuditReason(payload.reason, '-')
  }
  return keys
    .slice(0, 4)
    .map(
      (key) =>
        `${getAuditFieldLabel(key)}: ${compactValue(
          before[key],
          key
        )} -> ${compactValue(after[key], key)}`
    )
    .join('；')
}

function getActionMeta(event = {}) {
  if (event.action_label || event.risk_level) {
    const fallback = actionMetaMap[event.event_key] || {}
    return {
      label: getVisibleAuditText(
        event.action_label,
        fallback.label || '未知动作'
      ),
      risk: event.risk_level || fallback.risk || 'normal',
      intent:
        fallback.intent ||
        getVisibleAuditText(event.summary, '查看审计摘要判断动作含义'),
      next:
        fallback.next ||
        '先核对操作者、对象和变更前后差异，再回到对应系统管理入口处理。',
    }
  }
  return (
    actionMetaMap[event.event_key] || {
      label: '未知动作',
      risk: 'normal',
      intent: '查看审计摘要判断动作含义',
      next: '先核对操作者、对象和变更前后差异，再回到对应系统管理入口处理。',
    }
  )
}

function getSourceLabel(source) {
  return sourceLabelMap[source] || (source ? '审计来源' : '-')
}

function buildAuditConclusion(event = {}) {
  if (hasChineseText(event.summary)) {
    return event.summary
  }
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
    return `${actor} 调整了 ${target} 的账号角色`
  }
  if (event.event_key === 'role.permissions.set') {
    return `${actor} 调整了 ${target} 的角色权限`
  }
  if (event.event_key === 'admin_bootstrap.blocked') {
    return `启动初始化被阻止：${getVisibleAuditReason(
      event.payload?.reason,
      '需检查启动配置'
    )}`
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

export default function AuditLogsPage() {
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
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [source, setSource] = useState('')
  const [eventKey, setEventKey] = useState('')
  const [riskFilter, setRiskFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [selectedEventId, setSelectedEventId] = useState(null)
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

  const loadData = useCallback(async () => {
    setLoading(true)
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
        })
      )
      setEvents(normalizeAuditEvents(result?.data?.events))
      setTotal(Number(result?.data?.total || 0))
      return true
    } catch (err) {
      message.error(getActionErrorMessage(err, '加载审计日志'))
      return false
    } finally {
      setLoading(false)
    }
  }, [adminRpc, createdFrom, createdTo, eventKey, keyword, pagination, source])

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
        title="审计日志加载中"
        description="正在读取系统管理审计记录..."
      />
    )
  }

  return (
    <div className="erp-audit-page">
      <section className="erp-audit-command" aria-label="审计日志总览">
        <div className="erp-audit-command__title">
          <Title level={4}>审计日志</Title>
          <Text type="secondary">
            系统管理操作记录。先看风险、对象、变化摘要和下一步。
          </Text>
        </div>
        <div className="erp-audit-command__stats" aria-label="当前页审计摘要">
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

      <section className="erp-audit-toolbar" aria-label="审计筛选">
        <label className="erp-audit-field">
          <span>来源</span>
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
          <span>问题类型</span>
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
            placeholder="操作者、对象、动作或摘要"
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

      <section className="erp-audit-lens" aria-label="常查审计问题">
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

      <div className="erp-audit-workspace">
        <section className="erp-audit-feed" aria-label="审计事件列表">
          <div className="erp-audit-feed__head">
            <Text strong>事件流</Text>
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
                    onClick={() => setSelectedEventId(eventDomId)}
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
                        {summarizeChange(record.payload)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <Empty
              className="erp-audit-empty"
              description="当前条件下没有审计事件"
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

        <aside className="erp-audit-detail" aria-label="审计事件定位详情">
          {selectedEvent ? (
            <>
              <div className="erp-audit-detail__head">
                <Tag color={riskColorMap[getActionMeta(selectedEvent).risk]}>
                  {riskLabelMap[getActionMeta(selectedEvent).risk]}
                </Tag>
                <Title level={5}>{buildAuditConclusion(selectedEvent)}</Title>
                <Text type="secondary">{formatTime(selectedEvent)}</Text>
              </div>
              <div className="erp-audit-next-step">
                <Text type="secondary">下一步</Text>
                <Paragraph>{getActionMeta(selectedEvent).next}</Paragraph>
              </div>
              <div className="erp-audit-facts">
                <div>
                  <span>操作者</span>
                  <strong>{getEventActorText(selectedEvent)}</strong>
                </div>
                <div>
                  <span>对象</span>
                  <strong>{getEventTargetText(selectedEvent)}</strong>
                  <em>{getEventTargetTypeText(selectedEvent)}</em>
                </div>
                <div>
                  <span>来源</span>
                  <strong>{getSourceLabel(selectedEvent.source)}</strong>
                </div>
                <div>
                  <span>变化</span>
                  <strong>{summarizeChange(selectedEvent.payload)}</strong>
                </div>
              </div>
            </>
          ) : (
            <Empty
              description="选择一条审计日志后查看定位详情"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
