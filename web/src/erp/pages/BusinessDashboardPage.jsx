import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  Alert,
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
import CommandCenterNav from '../components/CommandCenterNav.jsx'
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
        title: '业务记录总数',
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
    <Space direction="vertical" size={16} className="erp-dashboard-page">
      <Card className="erp-dashboard-card" variant="borderless">
        <div className="erp-command-center-shell">
          <CommandCenterNav activeKey="business-board" />
          <div className="erp-command-center-shell-main">
            <div className="erp-business-board-hero">
              <div className="erp-business-board-hero-main">
                <Text type="secondary">ERP / 业务看板</Text>
                <Title level={4} className="erp-dashboard-title">
                  按业务模块看运行状态，不把摘要当事实真源
                </Title>
                <Paragraph type="secondary" className="erp-dashboard-summary">
                  业务看板用于经营和协同观察：显示业务记录数量、异常分布、即将到期任务和模块入口；真实库存、出货和财务事实仍由各自
                  usecase 与事实表负责。
                </Paragraph>
                <Space wrap>
                  <Tag color="green">业务记录 {summary.totalRecords}</Tag>
                  <Tag color="orange">推进中 {summary.activeCount}</Tag>
                  <Tag color="red">阻塞/取消 {summary.blockedCount}</Tag>
                  <Tag color="blue">完成比例 {summary.completionRatio}%</Tag>
                </Space>
              </div>
              <div className="erp-business-board-hero-side">
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={openTaskDashboard}
                >
                  去任务看板
                </Button>
                <div
                  className="erp-business-board-mini-chart"
                  aria-label="模块记录分布"
                >
                  {moduleRows.slice(0, 7).map((row) => (
                    <span
                      className="erp-business-board-mini-bar"
                      key={row.key}
                      style={{
                        '--erp-business-board-bar-height': `${Math.max(
                          12,
                          summary.totalRecords
                            ? Math.round(
                                (row.count / summary.totalRecords) * 100
                              )
                            : 12
                        )}%`,
                      }}
                      title={`${row.module}: ${row.count}`}
                    >
                      {row.module.slice(0, 2)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Alert
        type="info"
        showIcon
        message="业务看板只做运营摘要"
        description="本页统计业务记录和协同状态，用于发现模块风险和跳转业务列表；不作为库存、出货、财务、发票或收付款事实真源。"
      />

      <Row gutter={[12, 12]}>
        {businessMetricCards.map((item) => (
          <Col xs={24} sm={12} lg={6} key={item.key}>
            <Card className="erp-dashboard-card" variant="borderless">
              <Statistic
                title={item.title}
                value={item.value}
                suffix={item.suffix}
                valueStyle={item.color ? { color: item.color } : undefined}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="erp-dashboard-card" variant="borderless">
        <Space direction="vertical" className="erp-dashboard-block" size={12}>
          <Title level={5} className="erp-dashboard-section-title">
            业务关注统计
          </Title>
          <Row gutter={[12, 12]}>
            {businessFocusCards.map((item) => (
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
            业务预警
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
                          <Button
                            type="link"
                            size="small"
                            className="erp-dashboard-link-button"
                            disabled={!resolveWorkflowAlertEntryPath(alert)}
                            onClick={() => openAlertEntry(alert)}
                          >
                            {alert.alert_label}
                          </Button>
                          <Paragraph
                            type="secondary"
                            className="erp-dashboard-summary"
                          >
                            {alert.task_name} /{' '}
                            {formatWorkflowAlertSource(alert)}
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
            业务状态分布
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
