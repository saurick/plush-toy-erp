import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Space, Spin, Table, Typography } from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getBusinessDashboardStats } from '../api/businessDashboardApi.mjs'
import { listWorkflowTasks } from '../api/workflowApi.mjs'
import {
  dashboardModules,
  dashboardStatusGroups,
} from '../config/dashboardModules.mjs'
import {
  buildDashboardModuleRows,
  buildDashboardSummary,
  normalizeDashboardModuleStats,
} from '../utils/dashboardStats.mjs'
import {
  formatWorkflowAlertSource,
  resolveWorkflowAlertEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import { buildWorkflowDashboardStats } from '../utils/workflowDashboardStats.mjs'
import { buildBusinessModuleQuery } from '../utils/businessModuleNavigation.mjs'

const { Paragraph, Text, Title } = Typography

const ACTIVE_STATUS_GROUP_KEYS = Object.freeze([
  'project',
  'material',
  'production',
  'warehouse',
  'finance',
])

function sumStatusGroups(record = {}, keys = []) {
  return keys.reduce(
    (total, key) => total + Number(record.statusGroupCounts?.[key] || 0),
    0
  )
}

function statusKeysForGroups(keys = []) {
  return dashboardStatusGroups
    .filter((group) => keys.includes(group.key))
    .flatMap((group) => group.statusKeys)
}

export default function BusinessDashboardPage() {
  const [loading, setLoading] = useState(false)
  const [moduleStats, setModuleStats] = useState([])
  const [workflowTasks, setWorkflowTasks] = useState([])
  const mountedRef = useRef(false)
  const navigate = useNavigate()
  const outletContext = useOutletContext()

  const loadDashboardStats = useCallback(async () => {
    setLoading(true)
    try {
      const [result, workflowResult] = await Promise.all([
        getBusinessDashboardStats(),
        listWorkflowTasks({ limit: 200 }),
      ])
      const modules = Array.isArray(result?.modules)
        ? result.modules.map((item) => normalizeDashboardModuleStats(item))
        : []
      if (mountedRef.current) {
        setModuleStats(modules)
        setWorkflowTasks(workflowResult?.tasks || [])
      }
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载业务看板'))
      return false
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    loadDashboardStats()
    return () => {
      mountedRef.current = false
    }
  }, [loadDashboardStats])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadDashboardStats)
  }, [loadDashboardStats, outletContext])

  const moduleRows = useMemo(
    () => buildDashboardModuleRows(dashboardModules, moduleStats),
    [moduleStats]
  )
  const summary = useMemo(() => buildDashboardSummary(moduleRows), [moduleRows])
  const workflowStats = useMemo(
    () => buildWorkflowDashboardStats(workflowTasks),
    [workflowTasks]
  )

  const businessMetricCards = useMemo(
    () => [
      {
        key: 'totalRecords',
        title: '业务对象',
        value: summary.totalRecords,
      },
      {
        key: 'activeCount',
        title: '推进中',
        value: summary.activeCount,
        color: '#1677ff',
      },
      {
        key: 'blockedCount',
        title: '阻塞/取消',
        value: summary.blockedCount,
        color: '#d4380d',
      },
    ],
    [summary]
  )

  const workflowAlertGroups = useMemo(
    () => [
      { key: 'shipmentRisk', title: '出货风险' },
      { key: 'materialShortage', title: '欠料风险' },
      { key: 'vendorDelay', title: '委外延期' },
      { key: 'qcFailed', title: '质检不良' },
      { key: 'financePending', title: '财务待处理' },
      { key: 'approvalPending', title: '待老板审批' },
      { key: 'pmcFocus', title: '计划物控关注事项' },
      { key: 'overdueTasks', title: '超时任务' },
      { key: 'blockedTasks', title: '阻塞任务' },
    ],
    []
  )

  const openModuleList = (record, businessStatusKeys = []) => {
    if (!record?.path) {
      return
    }
    const query = buildBusinessModuleQuery({ businessStatusKeys })
    navigate(query ? `${record.path}?${query}` : record.path)
  }

  const openAlertEntry = (alert) => {
    const entryPath = resolveWorkflowAlertEntryPath(alert)
    if (entryPath) {
      navigate(entryPath)
    }
  }

  const renderModuleEntryButton = (label, onClick, ariaLabel, disabled) => (
    <Button
      type="link"
      size="small"
      className="erp-dashboard-link-button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {label}
    </Button>
  )

  return (
    <Space
      direction="vertical"
      size={10}
      className="erp-dashboard-page erp-business-dashboard-page"
    >
      <Card className="erp-dashboard-card" variant="borderless">
        <div className="erp-business-board-hero erp-business-board-hero--compact">
          <div className="erp-business-board-hero-main">
            <Title level={4} className="erp-dashboard-title">
              业务看板
            </Title>
            <Paragraph type="secondary" className="erp-dashboard-summary">
              按模块看对象状态、风险和标准页入口。
            </Paragraph>
          </div>
        </div>
        <div className="erp-business-board-summary-grid">
          {businessMetricCards.map((item) => (
            <div
              className="erp-business-board-summary-card erp-metric-readonly-card"
              key={item.key}
              aria-label={`${item.title} ${item.value}${item.suffix || ''}，只读摘要`}
            >
              <div className="erp-metric-readonly-card__head">
                <Text type="secondary">{item.title}</Text>
                <span className="erp-metric-readonly-card__badge">摘要</span>
              </div>
              <strong style={item.color ? { color: item.color } : undefined}>
                {item.value}
                {item.suffix || ''}
              </strong>
            </div>
          ))}
        </div>
      </Card>

      <Card
        className="erp-dashboard-card erp-dashboard-table-card"
        variant="borderless"
        title="模块健康"
      >
        <Table
          size="middle"
          loading={{
            spinning: loading,
            indicator: <Spin size="small" />,
          }}
          pagination={false}
          rowKey="key"
          scroll={{ x: 760 }}
          columns={[
            {
              title: '模块',
              dataIndex: 'module',
              fixed: 'left',
              width: 220,
              sorter: (a, b) =>
                String(a.module).localeCompare(String(b.module)),
              render: (value, record) =>
                renderModuleEntryButton(
                  value,
                  () => openModuleList(record),
                  `查看${value}列表`,
                  !record?.path
                ),
            },
            {
              title: '记录数',
              dataIndex: 'count',
              width: 100,
              sorter: (a, b) => Number(a.count || 0) - Number(b.count || 0),
              render: (value, record) =>
                renderModuleEntryButton(
                  value,
                  () => openModuleList(record),
                  `查看${record?.module}全部记录`,
                  !record?.path
                ),
            },
            {
              title: '推进中',
              key: 'active',
              width: 120,
              align: 'center',
              sorter: (a, b) =>
                sumStatusGroups(a, ACTIVE_STATUS_GROUP_KEYS) -
                sumStatusGroups(b, ACTIVE_STATUS_GROUP_KEYS),
              render: (_, record) => {
                const value = sumStatusGroups(record, ACTIVE_STATUS_GROUP_KEYS)
                return renderModuleEntryButton(
                  value,
                  () =>
                    openModuleList(
                      record,
                      statusKeysForGroups(ACTIVE_STATUS_GROUP_KEYS)
                    ),
                  `查看${record?.module}推进中记录`,
                  !record?.path || value <= 0
                )
              },
            },
            {
              title: '风险',
              key: 'blocked',
              width: 120,
              align: 'center',
              sorter: (a, b) =>
                Number(a.statusGroupCounts?.blocked || 0) -
                Number(b.statusGroupCounts?.blocked || 0),
              render: (_, record) =>
                renderModuleEntryButton(
                  record.statusGroupCounts?.blocked || 0,
                  () =>
                    openModuleList(
                      record,
                      dashboardStatusGroups.find(
                        (group) => group.key === 'blocked'
                      )?.statusKeys || []
                    ),
                  `查看${record?.module}风险记录`,
                  !record?.path ||
                    Number(record.statusGroupCounts?.blocked) <= 0
                ),
            },
            {
              title: '入口',
              key: 'entry',
              width: 120,
              render: (_, record) =>
                renderModuleEntryButton(
                  '进入',
                  () => openModuleList(record),
                  `进入${record?.module}`,
                  !record?.path
                ),
            },
          ]}
          dataSource={moduleRows}
        />
      </Card>

      <div className="erp-business-board-lower-grid">
        <Card className="erp-dashboard-card" variant="borderless">
          <Space direction="vertical" className="erp-dashboard-block" size={8}>
            <Title level={5} className="erp-dashboard-section-title">
              业务状态分布
            </Title>
            <div className="erp-business-board-status-list">
              {dashboardStatusGroups.map((group) => {
                const count = summary.statusGroupCount[group.key] || 0
                const percent = summary.totalRecords
                  ? Math.round((count / summary.totalRecords) * 100)
                  : 0
                return (
                  <div
                    className="erp-business-board-status-row"
                    key={group.key}
                  >
                    <span>{group.title}</span>
                    <strong>{count}</strong>
                    <i style={{ width: `${Math.max(percent, 4)}%` }} />
                  </div>
                )
              })}
            </div>
          </Space>
        </Card>

        <Card className="erp-dashboard-card" variant="borderless">
          <Space direction="vertical" className="erp-dashboard-block" size={8}>
            <Title level={5} className="erp-dashboard-section-title">
              风险提醒
            </Title>
            <div className="erp-business-board-alert-grid">
              {workflowAlertGroups.slice(0, 4).map((group) => {
                const alerts = workflowStats.buckets?.[group.key] || []
                return (
                  <div
                    className="erp-business-board-alert-item"
                    key={group.key}
                  >
                    <div>
                      <Text strong>{group.title}</Text>
                      <strong className="erp-business-board-alert-count">
                        {alerts.length}
                      </strong>
                    </div>
                    {alerts.slice(0, 1).map((alert) => (
                      <Button
                        key={`${group.key}-${alert.task_id}`}
                        type="link"
                        size="small"
                        className="erp-dashboard-link-button"
                        disabled={!resolveWorkflowAlertEntryPath(alert)}
                        onClick={() => openAlertEntry(alert)}
                      >
                        {alert.alert_label} / {formatWorkflowAlertSource(alert)}
                      </Button>
                    ))}
                    {alerts.length === 0 ? (
                      <Text type="secondary">暂无</Text>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </Space>
        </Card>
      </div>
    </Space>
  )
}
