import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Alert, Button, Drawer, Grid, Tag, Typography } from 'antd'
import TableScrollRegion from '@/common/components/table/TableScrollRegion.jsx'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError, JsonRpc } from '@/common/utils/jsonRpc'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateInput,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import { listAllPaginatedRecords } from '../utils/referencePagination.mjs'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import { getAuditChanges, summarizeChange } from '../utils/auditLogChanges.mjs'
import '../styles/app/audit-records.css'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import { buildAuditActionSelectOptions } from '../utils/auditActionSelectOptions.mjs'
import { buildAuditLogParams } from '../utils/auditLogParams.mjs'
import { formatAdminIdentity } from '../utils/adminIdentity.mjs'

const { Paragraph, Text, Title } = Typography

const DEFAULT_PAGE_SIZE = 20
const DRAWER_FOCUS_RESTORE_FALLBACK_MS = 600
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

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
  'admin_user.profile.set': {
    label: '员工资料变更',
    risk: 'normal',
    intent: '确认员工姓名或登录手机号是否被调整',
    next: '核对修改前后的姓名和手机号，确认与实际员工身份一致。',
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
  'admin_user.password.change': {
    label: '自行修改密码',
    risk: 'normal',
    intent: '确认账号本人何时修改了密码',
    next: '修改后旧登录全部失效；系统只记录操作，不记录密码内容。',
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

const actionOptions = buildAuditActionSelectOptions(actionMetaMap)

const riskOptions = [
  { label: '全部风险（本页）', value: 'all' },
  { label: '高风险', value: 'high' },
  { label: '需核对', value: 'warning' },
  { label: '常规', value: 'normal' },
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
      return date.toLocaleString('zh-CN', { hour12: false })
    }
  }
  const unix = Number(event.created_at || 0)
  if (unix > 0) {
    return new Date(unix * 1000).toLocaleString('zh-CN', { hour12: false })
  }
  return '-'
}

function getActorText(payload = {}) {
  const actor = payload.actor || {}
  const identity = formatAdminIdentity(actor, { fallback: '' })
  if (identity) return identity
  if (actor.id) {
    return '管理员'
  }
  return '-'
}

function getEventActorText(event = {}) {
  return (
    event.actor_label ||
    getActorText(event.payload) ||
    event.actor_name ||
    event.payload?.actor?.username
  )
}

function getTargetText(payload = {}) {
  const target = payload.target || {}
  const targetType = String(target.type || '').trim()
  if (targetType === 'admin_user') {
    const identity = formatAdminIdentity(target, { fallback: '' })
    if (identity) return identity
  }
  const key =
    target.name ||
    target.display_name ||
    target.displayName ||
    target.username ||
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
    if (after.reset_to_default) {
      return `${actor} 将 ${target} 的密码重置为默认密码`
    }
    return `${actor} 重置了 ${target} 的密码`
  }
  if (event.event_key === 'admin_user.password.change') {
    return `${actor} 修改了自己的密码`
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

function getEventDomId(event = {}) {
  return event.id || `${event.event_key || 'event'}-${event.created_at || ''}`
}

function AuditEventDetail({ event }) {
  if (!event) return null
  const changes = getAuditChanges(event.payload)
  return (
    <div className="erp-audit-record-detail">
      <section aria-label="操作概况">
        <Tag color={riskColorMap[getActionMeta(event).risk]}>
          {riskLabelMap[getActionMeta(event).risk]}
        </Tag>
        <Title level={5}>{buildAuditConclusion(event)}</Title>
        <dl className="erp-audit-record-detail__facts">
          <dt>发生时间</dt>
          <dd>{formatTime(event)}</dd>
          <dt>操作人</dt>
          <dd>{getEventActorText(event)}</dd>
          <dt>业务对象</dt>
          <dd>
            {getEventTargetText(event)}（{getEventTargetTypeText(event)}）
          </dd>
          <dt>操作来源</dt>
          <dd>{getSourceLabel(event.source)}</dd>
        </dl>
      </section>
      <section aria-label="字段变化">
        <Title level={5}>字段变化</Title>
        {changes.length ? (
          <TableScrollRegion className="erp-audit-record-detail__changes">
            <table>
              <thead>
                <tr>
                  <th>字段</th>
                  <th>修改前</th>
                  <th>修改后</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => (
                  <tr key={change.key}>
                    <th scope="row">{change.label}</th>
                    <td>{change.before}</td>
                    <td>{change.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollRegion>
        ) : (
          <Text type="secondary">{getAuditChangeSummary(event)}</Text>
        )}
      </section>
      <section aria-label="核对建议">
        <Title level={5}>核对建议</Title>
        <Paragraph>{getActionMeta(event).next}</Paragraph>
      </section>
    </div>
  )
}

export default function AuditLogsPage() {
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile
  const beginLatestRequest = useLatestRequestCoordinator()
  const screens = Grid.useBreakpoint()
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
  const selectedEvent =
    filteredEvents.find((event) => getEventDomId(event) === selectedEventId) ||
    null
  const dateRangeInvalid = Boolean(
    createdFrom && createdTo && createdFrom > createdTo
  )
  const queryParams = useMemo(
    () =>
      buildAuditLogParams({
        source,
        eventKey,
        keyword,
        createdFrom,
        createdTo,
      }),
    [source, eventKey, keyword, createdFrom, createdTo]
  )

  const restoreEventTriggerFocus = useCallback(() => {
    const trigger = eventTriggerRef.current
    const { activeElement } = document
    if (
      !trigger?.isConnected ||
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
  const openDetail = useCallback((record, event) => {
    const trigger = event?.currentTarget || document.activeElement
    eventTriggerRef.current =
      trigger?.querySelector?.('[data-audit-detail-trigger]') || trigger
    setSelectedEventId(getEventDomId(record))
    setDetailDrawerOpen(true)
  }, [])

  const loadData = useCallback(async () => {
    const request = beginLatestRequest('audit-logs')
    setLoading(true)
    setLoadError('')
    setEvents([])
    setTotal(0)
    setSelectedEventId(null)
    setDetailDrawerOpen(false)
    try {
      if (dateRangeInvalid) return false
      const result = await adminRpc.call(
        'audit_logs',
        {
          ...queryParams,
          limit: pagination.pageSize,
          offset: (pagination.current - 1) * pagination.pageSize,
        },
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
      setLoadError(errorMessage)
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [adminRpc, beginLatestRequest, dateRangeInvalid, pagination, queryParams])
  useEffect(() => {
    loadData()
  }, [loadData])
  useEffect(
    () => outletContext?.registerPageRefresh?.(loadData),
    [loadData, outletContext]
  )
  useEffect(() => clearFocusRestoreTimer, [clearFocusRestoreTimer])

  const columns = useMemo(
    () => [
      {
        title: '发生时间',
        key: 'time',
        width: 175,
        render: (_, record) => formatTime(record),
        exportValue: formatTime,
      },
      {
        title: '操作人',
        key: 'actor',
        width: 160,
        render: (_, record) => getEventActorText(record),
        exportValue: getEventActorText,
      },
      {
        title: '动作',
        key: 'action',
        width: 280,
        render: (_, record) => (
          <div className="erp-audit-records-page__action">
            <strong>{getActionMeta(record).label}</strong>
            <Text type="secondary">
              {getAuditChanges(record.payload).length
                ? summarizeChange(record.payload, { limit: 1 })
                : getAuditChangeSummary(record)}
            </Text>
          </div>
        ),
        exportValue: (record) => getActionMeta(record).label,
      },
      {
        title: '业务对象',
        key: 'target',
        width: 180,
        render: (_, record) => getEventTargetText(record),
        exportValue: getEventTargetText,
      },
      {
        title: '风险',
        key: 'risk',
        width: 95,
        render: (_, record) => (
          <Tag color={riskColorMap[getActionMeta(record).risk]}>
            {riskLabelMap[getActionMeta(record).risk]}
          </Tag>
        ),
        exportValue: (record) => riskLabelMap[getActionMeta(record).risk],
      },
      {
        title: '操作来源',
        dataIndex: 'source',
        width: 130,
        render: getSourceLabel,
        exportValue: (record) => getSourceLabel(record.source),
      },
      {
        title: '变化摘要',
        key: 'summary',
        defaultHidden: true,
        width: 320,
        render: (_, record) => getAuditChangeSummary(record),
        exportValue: getAuditChangeSummary,
      },
    ],
    []
  )
  const { tableColumns, exportColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: 'system-audit-logs',
      moduleTitle: '系统操作记录',
      columns,
    })
  const detailColumn = useMemo(
    () => ({
      title: '详情',
      key: 'detail',
      width: 105,
      fixed: 'right',
      exportable: false,
      render: (_, record) => (
        <Button
          data-audit-detail-trigger
          type="link"
          onClick={(event) => openDetail(record, event)}
        >
          查看变化
        </Button>
      ),
    }),
    [openDetail]
  )
  const loadExportRows = useCallback(
    async ({ signal }) => {
      const result = await listAllPaginatedRecords(
        async (params, options) =>
          (await adminRpc.call('audit_logs', params, options))?.data,
        queryParams,
        'events',
        { signal }
      )
      return normalizeAuditEvents(result.events)
    },
    [adminRpc, queryParams]
  )
  const { exporting, exportRows } = useBusinessListExport({
    requestKey: 'audit-logs-export',
    loadRows: loadExportRows,
    filename: `系统操作记录-${currentBusinessDate()}.csv`,
    columns: exportColumns,
    recordLabel: '操作记录',
  })
  const hasActiveFilters = Boolean(
    source ||
    eventKey ||
    keyword.trim() ||
    createdFrom ||
    createdTo ||
    riskFilter !== 'all'
  )
  const resetPage = () =>
    setPagination((previous) => ({ ...previous, current: 1 }))

  return (
    <BusinessPageLayout className="erp-audit-records-page">
      <PageHeaderCard
        compact
        title="系统操作记录"
        stats={[{ key: 'total', label: '筛选结果', value: total }]}
      />
      <BusinessOperationPanel
        compact
        clearFiltersDisabled={!hasActiveFilters}
        onClearFilters={() => {
          setSource('')
          setEventKey('')
          setKeyword('')
          setCreatedFrom('')
          setCreatedTo('')
          setRiskFilter('all')
          resetPage()
        }}
        filters={
          <>
            <SelectFilter
              inline
              aria-label="操作来源"
              value={source}
              options={sourceOptions}
              onChange={(value) => {
                setSource(value || '')
                setEventKey('')
                resetPage()
              }}
            />
            <SearchInput
              value={keyword}
              placeholder="搜索操作记录"
              searchHint="按操作账号、业务对象或记录内容搜索"
              onChange={(event) => {
                setKeyword(event.target.value)
                resetPage()
              }}
              onPressEnter={loadData}
            />
            <SelectFilter
              aria-label="操作类型"
              value={eventKey}
              options={actionOptions}
              showSearch
              optionFilterProp="label"
              onChange={(value) => {
                setEventKey(value || '')
                resetPage()
              }}
            />
            <SelectFilter
              aria-label="本页风险"
              value={riskFilter}
              options={riskOptions}
              onChange={(value) => {
                setRiskFilter(value)
                setSelectedEventId(null)
                setDetailDrawerOpen(false)
              }}
            />
            <DateInput
              aria-label="开始日期"
              value={createdFrom}
              placeholder="开始日期"
              onChange={(value) => {
                setCreatedFrom(value)
                resetPage()
              }}
            />
            <DateInput
              aria-label="结束日期"
              value={createdTo}
              placeholder="结束日期"
              onChange={(value) => {
                setCreatedTo(value)
                resetPage()
              }}
            />
          </>
        }
        actions={
          <BusinessListToolbarActions
            onExport={exportRows}
            exportDisabled={
              loading ||
              exporting ||
              !total ||
              dateRangeInvalid ||
              riskFilter !== 'all'
            }
            exportDisabledReason={
              riskFilter !== 'all'
                ? '清空本页风险条件后，可导出完整筛选结果'
                : ''
            }
            onOpenColumnOrder={openColumnOrder}
          />
        }
      />
      {dateRangeInvalid ? (
        <Alert type="warning" showIcon message="开始日期不能晚于结束日期" />
      ) : null}
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
      <BusinessDataTable
        loading={loading}
        rowKey={getEventDomId}
        columns={[...tableColumns, detailColumn]}
        dataSource={filteredEvents}
        onOpenRecord={openDetail}
        onRow={() => ({ title: '双击查看变化' })}
        emptyDescription={
          loadError ? '操作记录读取失败，请重新加载' : '当前条件下没有操作记录'
        }
        tableHeader={
          riskFilter !== 'all' ? (
            <p className="erp-audit-records-page__scope">
              本页风险：{riskLabelMap[riskFilter]} · 显示{' '}
              {filteredEvents.length} / {events.length} 条；翻页后按新一页筛选
            </p>
          ) : null
        }
        pagination={{
          ...pagination,
          total,
          showSizeChanger: true,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          showTotal: (value) =>
            `共 ${value} 条${riskFilter !== 'all' ? '（风险仅筛选本页）' : ''}`,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        }}
      />
      {columnOrderModal}
      <Drawer
        rootClassName="erp-audit-detail-drawer"
        title="操作记录详情"
        width={screens.md ? 640 : '100%'}
        open={detailDrawerOpen && Boolean(selectedEvent)}
        keyboard
        maskClosable
        destroyOnHidden
        onClose={closeDetailDrawer}
        footer={<Button onClick={closeDetailDrawer}>完成</Button>}
        afterOpenChange={(open) => {
          if (!open) {
            window.requestAnimationFrame(() => {
              if (restoreEventTriggerFocus()) clearFocusRestoreTimer()
            })
          }
        }}
      >
        <AuditEventDetail event={selectedEvent} />
      </Drawer>
    </BusinessPageLayout>
  )
}
