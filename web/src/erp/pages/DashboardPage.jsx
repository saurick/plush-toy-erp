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
import {
  dashboardModules,
  dashboardStatusGroups,
} from '../config/dashboardModules.mjs'
import {
  buildDashboardModuleRows,
  buildDashboardSummary,
  normalizeDashboardModuleStats,
} from '../utils/dashboardStats.mjs'
import { buildBusinessModuleQuery } from '../utils/businessModuleNavigation.mjs'

const { Paragraph, Title } = Typography

export default function DashboardPage() {
  const [loading, setLoading] = useState(false)
  const [moduleStats, setModuleStats] = useState([])
  const mountedRef = useRef(false)
  const navigate = useNavigate()
  const outletContext = useOutletContext()

  const loadDashboardStats = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getBusinessDashboardStats()
      const modules = Array.isArray(result?.modules)
        ? result.modules.map((item) => normalizeDashboardModuleStats(item))
        : []
      if (mountedRef.current) {
        setModuleStats(modules)
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
