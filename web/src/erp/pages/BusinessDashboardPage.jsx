import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Space, Spin, Table, Tag, Typography } from 'antd'
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
        title: '业务对象总数',
        value: summary.totalRecords,
      },
      {
        key: 'activeCount',
        title: '推进中记录数',
        value: summary.activeCount,
        color: '#1677ff',
      },
      {
        key: 'blockedCount',
        title: '阻塞/取消记录数',
        value: summary.blockedCount,
        color: '#d4380d',
      },
      {
        key: 'completionRatio',
        title: '业务完成比例',
        value: summary.completionRatio,
        suffix: '%',
        color: '#389e0d',
      },
    ],
    [summary]
  )

  const businessFocusCards = useMemo(
    () => [
      {
        key: 'pmcFocus',
        title: '计划物控关注任务数',
        value: workflowStats.pmcFocus,
      },
      {
        key: 'bossFocus',
        title: '老板待审批/高风险任务数',
        value: workflowStats.bossFocus,
      },
      {
        key: 'financePending',
        title: '财务待处理任务数',
        value: workflowStats.financePending,
      },
      {
        key: 'qualityPending',
        title: '品质待检任务数',
        value: workflowStats.qualityPending,
      },
      {
        key: 'warehousePending',
        title: '仓库待处理任务数',
        value: workflowStats.warehousePending,
      },
      {
        key: 'todayAlerts',
        title: '今日预警数',
        value: workflowStats.todayAlerts,
      },
      {
        key: 'criticalAlerts',
        title: '严重预警数',
        value: workflowStats.criticalAlerts,
        color: '#cf1322',
      },
      {
        key: 'warningAlerts',
        title: '一般预警数',
        value: workflowStats.warningAlerts,
        color: '#d48806',
      },
    ],
    [workflowStats]
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

  const openTaskDashboard = () => {
    navigate('/erp/task-board')
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
            <Text type="secondary">ERP / 业务看板</Text>
            <Title level={4} className="erp-dashboard-title">
              业务看板
            </Title>
            <Paragraph type="secondary" className="erp-dashboard-summary">
              按模块查看当前结果、阻塞预警和下一步入口。
            </Paragraph>
          </div>
          <div className="erp-business-board-actions">
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={loadDashboardStats}
            >
              刷新业务数据
            </Button>
            <Button icon={<ArrowLeftOutlined />} onClick={openTaskDashboard}>
              任务看板
            </Button>
          </div>
        </div>
        <div className="erp-business-board-summary-grid">
          {businessMetricCards.map((item) => (
            <div className="erp-business-board-summary-card" key={item.key}>
              <Text type="secondary">{item.title}</Text>
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
        title="模块健康明细"
      >
        <Table
          size="middle"
          loading={{
            spinning: loading,
            indicator: <Spin size="small" />,
          }}
          pagination={false}
          rowKey="key"
          scroll={{ x: 1120 }}
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
            ...dashboardStatusGroups.map((group) => ({
              title: group.title,
              dataIndex: ['statusGroupCounts', group.key],
              width: 118,
              align: 'center',
              sorter: (a, b) =>
                Number(a.statusGroupCounts?.[group.key] || 0) -
                Number(b.statusGroupCounts?.[group.key] || 0),
              render: (value, record) =>
                renderModuleEntryButton(
                  value,
                  () => openModuleList(record, group.statusKeys),
                  `查看${record?.module}${group.title}`,
                  !record?.path || Number(value) <= 0
                ),
            })),
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
              业务预警
            </Title>
            <div className="erp-business-board-alert-grid">
              {workflowAlertGroups.slice(0, 6).map((group) => {
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

      <Card
        className="erp-dashboard-card erp-dashboard-table-card"
        variant="borderless"
        title="业务关注统计"
      >
        <Table
          size="small"
          pagination={false}
          rowKey="key"
          scroll={{ x: 760 }}
          columns={[
            {
              title: '关注项',
              dataIndex: 'title',
              width: 280,
            },
            {
              title: '数量',
              dataIndex: 'value',
              width: 120,
              sorter: (a, b) => Number(a.value || 0) - Number(b.value || 0),
              render: (value, record) => (
                <strong style={record.color ? { color: record.color } : null}>
                  {value}
                </strong>
              ),
            },
          ]}
          dataSource={businessFocusCards}
        />
      </Card>
    </Space>
  )
}
