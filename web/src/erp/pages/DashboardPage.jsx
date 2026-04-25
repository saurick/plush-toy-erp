import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getBusinessDashboardStats } from '../api/businessRecordApi.mjs'
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
import { buildWorkflowDashboardStats } from '../utils/workflowDashboardStats.mjs'
import { buildBusinessModuleQuery } from '../utils/businessModuleNavigation.mjs'

const { Paragraph, Text, Title } = Typography

export default function DashboardPage() {
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
      message.error(getActionErrorMessage(error, '加载任务看板统计'))
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

  const workflowMetricCards = useMemo(
    () => [
      { key: 'total', title: '协同任务总数', value: workflowStats.total },
      { key: 'pending', title: '待处理任务数', value: workflowStats.pending },
      {
        key: 'processing',
        title: '处理中任务数',
        value: workflowStats.processing,
      },
      {
        key: 'blocked',
        title: '阻塞任务数',
        value: workflowStats.blocked,
        color: '#d4380d',
      },
      {
        key: 'rejected',
        title: '退回任务数',
        value: workflowStats.rejected,
        color: '#d48806',
      },
      {
        key: 'overdue',
        title: '超时任务数',
        value: workflowStats.overdue,
        color: '#cf1322',
      },
      {
        key: 'dueSoon',
        title: '即将到期任务数',
        value: workflowStats.dueSoon,
        color: '#d48806',
      },
      { key: 'done', title: '已完成任务数', value: workflowStats.done },
      {
        key: 'pmcFocus',
        title: 'PMC 关注任务数',
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
        title: 'critical 预警数',
        value: workflowStats.criticalAlerts,
        color: '#cf1322',
      },
      {
        key: 'warningAlerts',
        title: 'warning 预警数',
        value: workflowStats.warningAlerts,
        color: '#d48806',
      },
    ],
    [workflowStats]
  )

  const workflowAlertGroups = useMemo(
    () => [
      { key: 'overdueTasks', title: '超时任务' },
      { key: 'blockedTasks', title: '阻塞任务' },
      { key: 'shipmentRisk', title: '出货风险' },
      { key: 'materialShortage', title: '欠料风险' },
      { key: 'vendorDelay', title: '委外延期' },
      { key: 'qcFailed', title: '质检不良' },
      { key: 'financePending', title: '财务待处理' },
      { key: 'approvalPending', title: '待老板审批' },
      { key: 'pmcFocus', title: 'PMC 关注事项' },
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
    <Space direction="vertical" size={16} className="erp-dashboard-page">
      <Card className="erp-dashboard-card" variant="borderless">
        <Title level={4} className="erp-dashboard-title">
          毛绒 ERP 任务看板
        </Title>
        <Paragraph type="secondary" className="erp-dashboard-summary">
          按当前业务记录聚合模块状态；模块名、记录数和状态数字都可进入对应业务列表。
        </Paragraph>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="erp-dashboard-card" variant="borderless">
            <Statistic title="业务记录总数" value={summary.totalRecords} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="erp-dashboard-card" variant="borderless">
            <Statistic
              title="推进中"
              value={summary.activeCount}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="erp-dashboard-card" variant="borderless">
            <Statistic
              title="阻塞/取消"
              value={summary.blockedCount}
              valueStyle={{ color: '#d4380d' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="erp-dashboard-card" variant="borderless">
            <Statistic
              title="已完成"
              value={summary.completionRatio}
              suffix="%"
              valueStyle={{ color: '#389e0d' }}
            />
          </Card>
        </Col>
      </Row>

      <Card className="erp-dashboard-card" variant="borderless">
        <Space direction="vertical" className="erp-dashboard-block" size={12}>
          <Title level={5} className="erp-dashboard-section-title">
            Workflow 任务视角
          </Title>
          <Row gutter={[12, 12]}>
            {workflowMetricCards.map((item) => (
              <Col xs={12} md={8} xl={6} key={item.key}>
                <Card
                  size="small"
                  variant="borderless"
                  className="erp-dashboard-status-card"
                >
                  <Statistic
                    title={item.title}
                    value={item.value}
                    valueStyle={item.color ? { color: item.color } : undefined}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </Space>
      </Card>

      <Card className="erp-dashboard-card" variant="borderless">
        <Space direction="vertical" className="erp-dashboard-block" size={12}>
          <Title level={5} className="erp-dashboard-section-title">
            今日预警
          </Title>
          <Row gutter={[12, 12]}>
            {workflowAlertGroups.map((group) => {
              const alerts = workflowStats.buckets?.[group.key] || []
              return (
                <Col xs={24} md={12} xl={8} key={group.key}>
                  <Card
                    size="small"
                    variant="borderless"
                    className="erp-dashboard-status-card"
                  >
                    <Space
                      direction="vertical"
                      className="erp-dashboard-block"
                      size={8}
                    >
                      <Space>
                        <Tag color={alerts.length > 0 ? 'red' : 'default'}>
                          {alerts.length}
                        </Tag>
                        <Text strong>{group.title}</Text>
                      </Space>
                      {alerts.slice(0, 3).map((alert) => (
                        <div key={`${group.key}-${alert.task_id}`}>
                          <Text>{alert.alert_label}</Text>
                          <Paragraph
                            type="secondary"
                            className="erp-dashboard-summary"
                          >
                            {alert.task_name} /{' '}
                            {alert.source_no ||
                              `${alert.source_type} #${alert.task?.source_id}`}
                          </Paragraph>
                        </div>
                      ))}
                      {alerts.length === 0 ? (
                        <Text type="secondary">暂无</Text>
                      ) : null}
                    </Space>
                  </Card>
                </Col>
              )
            })}
          </Row>
        </Space>
      </Card>

      <Card className="erp-dashboard-card" variant="borderless">
        <Space direction="vertical" className="erp-dashboard-block" size={8}>
          <Title level={5} className="erp-dashboard-section-title">
            状态分布
          </Title>
          <Row gutter={[12, 12]}>
            {dashboardStatusGroups.map((group) => {
              const count = summary.statusGroupCount[group.key] || 0
              return (
                <Col xs={24} md={12} lg={8} key={group.key}>
                  <Card
                    size="small"
                    variant="borderless"
                    className="erp-dashboard-status-card"
                  >
                    <Space
                      direction="vertical"
                      className="erp-dashboard-block"
                      size={6}
                    >
                      <Tag>{group.title}</Tag>
                      <Progress
                        percent={
                          summary.totalRecords
                            ? Math.round((count / summary.totalRecords) * 100)
                            : 0
                        }
                      />
                    </Space>
                  </Card>
                </Col>
              )
            })}
          </Row>
        </Space>
      </Card>

      <Card
        className="erp-dashboard-card erp-dashboard-table-card"
        variant="borderless"
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
    </Space>
  )
}
