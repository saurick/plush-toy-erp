import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { Loading } from '@/common/components/loading'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'

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
    next: '重点看对象账号、before/after role_keys，以及是否包含系统管理员或 debug 角色。',
  },
  'admin_user.phone.set': {
    label: '账号手机号变更',
    risk: 'normal',
    intent: '确认登录或通知手机号是否被调整',
    next: '核对 before/after phone，确认是否由账号负责人发起。',
  },
  'admin_user.disabled.set': {
    label: '账号启停变更',
    risk: 'high',
    intent: '确认账号是否被禁用或恢复',
    next: '重点看 after.disabled；如果账号被误禁用，回到权限管理页恢复。',
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
    next: '重点看 before/after permission_keys，确认是否新增高危系统或 debug 权限。',
  },
  'admin_bootstrap.completed': {
    label: '初始化完成',
    risk: 'normal',
    intent: '确认启动初始化是否按预期完成',
    next: '如不是首次部署，应确认是否误触发 BOOTSTRAP_ADMIN_ONCE。',
  },
  'admin_bootstrap.blocked': {
    label: '初始化阻止',
    risk: 'high',
    intent: '确认启动期安全守卫阻止了什么',
    next: '查看 payload.reason，并检查启动环境变量和生产 preflight。',
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
  'admin_user.password.reset',
  'admin_user.disabled.set',
  'role.permissions.set',
  'admin_user.roles.set',
  'admin_bootstrap.blocked',
]

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
  if (actor.username) {
    return actor.username
  }
  if (actor.id) {
    return `ID ${actor.id}`
  }
  return '-'
}

function getTargetText(payload = {}) {
  const target = payload.target || {}
  const key = target.key || ''
  const id = target.id ? `#${target.id}` : ''
  return key || id || '-'
}

function getTargetTypeText(payload = {}) {
  const target = payload.target || {}
  const typeMap = {
    admin_user: '管理员账号',
    role: '角色',
    bootstrap: '启动初始化',
  }
  return typeMap[target.type] || target.type || '-'
}

function compactValue(value) {
  if (value === null || value === undefined) {
    return '-'
  }
  if (Array.isArray(value)) {
    return value.join(', ') || '-'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

function summarizeChange(payload = {}) {
  const before = payload.before || {}
  const after = payload.after || {}
  const keys = [
    ...new Set([...Object.keys(before || {}), ...Object.keys(after || {})]),
  ].filter((key) => !['id', 'username'].includes(key))
  if (keys.length === 0) {
    return payload.reason || '-'
  }
  return keys
    .slice(0, 4)
    .map(
      (key) =>
        `${key}: ${compactValue(before[key])} -> ${compactValue(after[key])}`
    )
    .join('；')
}

function getActionMeta(event = {}) {
  return (
    actionMetaMap[event.event_key] || {
      label: event.event_key || '未知动作',
      risk: 'normal',
      intent: '查看原始审计 payload 判断动作含义',
      next: '先核对操作者、对象和 before/after，再回到对应系统管理入口处理。',
    }
  )
}

function getSourceLabel(source) {
  return sourceLabelMap[source] || source || '-'
}

function buildAuditConclusion(event = {}) {
  const meta = getActionMeta(event)
  const actor = getActorText(event.payload)
  const target = getTargetText(event.payload)
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

function formatPayload(payload = {}) {
  return JSON.stringify(payload || {}, null, 2)
}

function eventMatchesKeyword(event, keyword) {
  const normalizedKeyword = String(keyword || '')
    .trim()
    .toLowerCase()
  if (!normalizedKeyword) {
    return true
  }
  const haystack = [
    event.event_type,
    event.event_key,
    event.source,
    JSON.stringify(event.payload || {}),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(normalizedKeyword)
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
  const [keyword, setKeyword] = useState('')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  })

  const filteredEvents = useMemo(
    () => events.filter((event) => eventMatchesKeyword(event, keyword)),
    [events, keyword]
  )
  const riskSummary = useMemo(
    () => countByRisk(filteredEvents),
    [filteredEvents]
  )
  const selectedEvent = useMemo(
    () =>
      filteredEvents.find((event) => event.id === selectedEventId) ||
      filteredEvents[0] ||
      null,
    [filteredEvents, selectedEventId]
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const offset = (pagination.current - 1) * pagination.pageSize
      const result = await adminRpc.call('audit_logs', {
        source,
        event_key: eventKey,
        limit: pagination.pageSize,
        offset,
      })
      setEvents(normalizeAuditEvents(result?.data?.events))
      setTotal(Number(result?.data?.total || 0))
      return true
    } catch (err) {
      message.error(getActionErrorMessage(err, '加载审计日志'))
      return false
    } finally {
      setLoading(false)
    }
  }, [adminRpc, eventKey, pagination, source])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadData)
  }, [loadData, outletContext])

  useEffect(() => {
    if (!selectedEventId && filteredEvents[0]?.id) {
      setSelectedEventId(filteredEvents[0].id)
      return
    }
    if (
      selectedEventId &&
      !filteredEvents.some((event) => event.id === selectedEventId)
    ) {
      setSelectedEventId(filteredEvents[0]?.id || null)
    }
  }, [filteredEvents, selectedEventId])

  const columns = [
    {
      title: '定位结论',
      dataIndex: 'event_key',
      width: 360,
      render: (_, record) => {
        const meta = getActionMeta(record)
        return (
          <Space direction="vertical" size={4} className="erp-audit-conclusion">
            <Space size={6} wrap>
              <Tag color={riskColorMap[meta.risk]}>
                {riskLabelMap[meta.risk]}
              </Tag>
              <Text strong>{meta.label}</Text>
            </Space>
            <Text>{buildAuditConclusion(record)}</Text>
            <Text type="secondary" className="erp-audit-code">
              {record.event_key || '-'}
            </Text>
          </Space>
        )
      },
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (_, record) => formatTime(record),
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 130,
      render: (value) => <Tag>{getSourceLabel(value)}</Tag>,
    },
    {
      title: '操作者',
      dataIndex: ['payload', 'actor'],
      width: 140,
      render: (_, record) => getActorText(record.payload),
    },
    {
      title: '对象',
      dataIndex: ['payload', 'target'],
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{getTargetText(record.payload)}</Text>
          <Text type="secondary">{getTargetTypeText(record.payload)}</Text>
        </Space>
      ),
    },
    {
      title: '摘要',
      dataIndex: 'payload',
      render: (_, record) => (
        <Text style={{ whiteSpace: 'normal' }}>
          {summarizeChange(record.payload)}
        </Text>
      ),
    },
  ]

  if (loading && events.length === 0) {
    return (
      <Loading
        title="审计日志加载中"
        description="正在读取系统控制面审计事件..."
      />
    )
  }

  return (
    <Space
      className="erp-audit-page"
      direction="vertical"
      size={16}
      style={{ width: '100%' }}
    >
      <Card className="erp-audit-hero" variant="borderless">
        <div className="erp-audit-hero__content">
          <div>
            <Title level={4} style={{ margin: 0 }}>
              审计日志
            </Title>
            <Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              先定位高风险动作、操作者和对象，再查看 before /
              after。业务事实审计仍回到各业务事实页。
            </Paragraph>
          </div>
          <div className="erp-audit-metrics" aria-label="当前页审计摘要">
            <div className="erp-audit-metric erp-audit-metric--danger">
              <span>高风险</span>
              <strong>{riskSummary.high}</strong>
            </div>
            <div className="erp-audit-metric erp-audit-metric--warning">
              <span>需核对</span>
              <strong>{riskSummary.warning}</strong>
            </div>
            <div className="erp-audit-metric">
              <span>当前命中</span>
              <strong>{riskSummary.total}</strong>
            </div>
          </div>
        </div>
      </Card>

      <Card className="erp-audit-filter-card" variant="borderless">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="定位顺序"
            description="先点问题类型，再看定位结论列；选中一行后右侧会显示操作者、对象、变化摘要和原始 payload。"
          />
          <Space
            size={12}
            wrap
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            <Space size={12} wrap>
              <Text type="secondary">来源</Text>
              <Select
                value={source}
                options={sourceOptions}
                style={{ width: 160 }}
                onChange={(value) => {
                  setSource(value || '')
                  setPagination((prev) => ({ ...prev, current: 1 }))
                }}
              />
              <Text type="secondary">问题类型</Text>
              <Select
                value={eventKey}
                options={actionOptions}
                style={{ width: 220 }}
                onChange={(value) => {
                  setEventKey(value || '')
                  setPagination((prev) => ({ ...prev, current: 1 }))
                }}
              />
              <Input
                allowClear
                value={keyword}
                placeholder="搜操作者、对象、动作或 payload"
                style={{ width: 260 }}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </Space>
            <Text type="secondary">
              {keyword
                ? `当前页命中 ${filteredEvents.length}/${events.length}`
                : `共 ${total} 条`}
            </Text>
          </Space>
          <Space size={8} wrap>
            <Text type="secondary">快速定位</Text>
            {quickLocateActions.map((key) => (
              <Button
                key={key}
                size="small"
                type={eventKey === key ? 'primary' : 'default'}
                onClick={() => {
                  setEventKey(eventKey === key ? '' : key)
                  setPagination((prev) => ({ ...prev, current: 1 }))
                }}
              >
                {actionMetaMap[key].label}
              </Button>
            ))}
          </Space>
        </Space>
      </Card>

      <div className="erp-audit-workspace">
        <Card className="erp-audit-table-card" variant="borderless">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredEvents}
            loading={loading}
            rowClassName={(record) =>
              record.id === selectedEvent?.id ? 'erp-audit-row--selected' : ''
            }
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              pageSizeOptions: PAGE_SIZE_OPTIONS,
              showSizeChanger: true,
              total,
              showTotal: (value) => `共 ${value} 条`,
            }}
            locale={{ emptyText: <Empty description="暂无审计日志" /> }}
            scroll={{ x: 1250 }}
            onChange={(nextPagination) => {
              setPagination({
                current: Number(nextPagination?.current) || 1,
                pageSize: Number(nextPagination?.pageSize) || DEFAULT_PAGE_SIZE,
              })
            }}
            onRow={(record) => ({
              onClick: () => setSelectedEventId(record.id),
            })}
          />
        </Card>

        <aside className="erp-audit-detail" aria-label="审计事件定位详情">
          {selectedEvent ? (
            <>
              <div className="erp-audit-detail__head">
                <Tag color={riskColorMap[getActionMeta(selectedEvent).risk]}>
                  {riskLabelMap[getActionMeta(selectedEvent).risk]}
                </Tag>
                <Title level={5}>{getActionMeta(selectedEvent).label}</Title>
                <Text type="secondary">{formatTime(selectedEvent)}</Text>
              </div>
              <Paragraph className="erp-audit-detail__conclusion">
                {buildAuditConclusion(selectedEvent)}
              </Paragraph>
              <Descriptions
                size="small"
                column={1}
                className="erp-audit-detail__descriptions"
              >
                <Descriptions.Item label="下一步">
                  {getActionMeta(selectedEvent).next}
                </Descriptions.Item>
                <Descriptions.Item label="操作者">
                  {getActorText(selectedEvent.payload)}
                </Descriptions.Item>
                <Descriptions.Item label="对象">
                  {getTargetTypeText(selectedEvent.payload)} /{' '}
                  {getTargetText(selectedEvent.payload)}
                </Descriptions.Item>
                <Descriptions.Item label="来源">
                  {getSourceLabel(selectedEvent.source)}
                </Descriptions.Item>
                <Descriptions.Item label="变化摘要">
                  {summarizeChange(selectedEvent.payload)}
                </Descriptions.Item>
              </Descriptions>
              <div className="erp-audit-payload">
                <Text strong>原始 payload</Text>
                <pre>{formatPayload(selectedEvent.payload)}</pre>
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
    </Space>
  )
}
