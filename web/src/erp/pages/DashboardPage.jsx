import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { listWorkflowTasks } from '../api/workflowApi.mjs'
import {
  formatWorkflowTaskSource,
  resolveWorkflowTaskEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import {
  buildWorkflowDashboardStats,
  getWorkflowTaskDueStatus,
  isTerminalWorkflowTask,
} from '../utils/workflowDashboardStats.mjs'

const { Paragraph, Text, Title } = Typography

const TASK_DETAIL_GROUPS = Object.freeze([
  {
    key: 'pending',
    title: '待处理任务',
    match: (task) => ['pending', 'ready'].includes(getTaskStatusKey(task)),
  },
  {
    key: 'processing',
    title: '处理中任务',
    match: (task) => getTaskStatusKey(task) === 'processing',
  },
  {
    key: 'blocked',
    title: '阻塞任务',
    match: (task) => getTaskStatusKey(task) === 'blocked',
    tagColor: 'red',
  },
  {
    key: 'rejected',
    title: '退回任务',
    match: (task) => getTaskStatusKey(task) === 'rejected',
    tagColor: 'orange',
  },
  {
    key: 'overdue',
    title: '超时任务',
    match: (task) => getWorkflowTaskDueStatus(task) === 'overdue',
    tagColor: 'red',
  },
  {
    key: 'dueSoon',
    title: '即将到期任务',
    match: (task) => getWorkflowTaskDueStatus(task) === 'due_soon',
    tagColor: 'orange',
  },
])

function getTaskStatusKey(task = {}) {
  return String(task.task_status_key || '').trim()
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(false)
  const [workflowTasks, setWorkflowTasks] = useState([])
  const mountedRef = useRef(false)
  const navigate = useNavigate()
  const outletContext = useOutletContext()

  const loadDashboardStats = useCallback(async () => {
    setLoading(true)
    try {
      const workflowResult = await listWorkflowTasks({ limit: 200 })
      if (mountedRef.current) {
        setWorkflowTasks(workflowResult?.tasks || [])
      }
      return true
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载任务看板'))
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
    ],
    [workflowStats]
  )

  const taskDetailGroups = useMemo(
    () =>
      TASK_DETAIL_GROUPS.map((group) => ({
        ...group,
        tasks: workflowTasks
          .filter((task) => !isTerminalWorkflowTask(task))
          .filter((task) => group.match(task)),
      })),
    [workflowTasks]
  )

  const openBusinessDashboard = () => {
    navigate('/erp/business-dashboard')
  }

  const openTaskEntry = (task) => {
    const entryPath = resolveWorkflowTaskEntryPath(task)
    if (entryPath) {
      navigate(entryPath)
    }
  }

  return (
    <Space direction="vertical" size={16} className="erp-dashboard-page">
      <Card
        className="erp-dashboard-card"
        variant="borderless"
        loading={loading}
      >
        <Space className="erp-dashboard-heading-row" align="start">
          <div>
            <Title level={4} className="erp-dashboard-title">
              任务看板
            </Title>
            <Paragraph type="secondary" className="erp-dashboard-summary">
              只看需要人员处理的协同任务，业务进度和风险汇总已拆到业务看板。
            </Paragraph>
          </div>
          <Button icon={<ArrowRightOutlined />} onClick={openBusinessDashboard}>
            去业务看板
          </Button>
        </Space>
      </Card>

      <Card
        className="erp-dashboard-card"
        variant="borderless"
        loading={loading}
      >
        <Space direction="vertical" className="erp-dashboard-block" size={12}>
          <Title level={5} className="erp-dashboard-section-title">
            任务处理统计
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
            任务处理明细
          </Title>
          <Row gutter={[12, 12]}>
            {taskDetailGroups.map((group) => {
              const tasks = group.tasks || []
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
                        <Tag
                          color={tasks.length > 0 ? group.tagColor : 'default'}
                        >
                          {tasks.length}
                        </Tag>
                        <Text strong>{group.title}</Text>
                      </Space>
                      {tasks.slice(0, 3).map((task) => (
                        <div key={`${group.key}-${task.id || task.task_code}`}>
                          <Button
                            type="link"
                            size="small"
                            className="erp-dashboard-link-button"
                            disabled={!resolveWorkflowTaskEntryPath(task)}
                            onClick={() => openTaskEntry(task)}
                          >
                            {task.task_name || '未命名任务'}
                          </Button>
                          <Paragraph
                            type="secondary"
                            className="erp-dashboard-summary"
                          >
                            {formatWorkflowTaskSource(task)}
                          </Paragraph>
                        </div>
                      ))}
                      {tasks.length === 0 ? (
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
    </Space>
  )
}
