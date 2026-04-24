import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert,
  Button,
  Empty,
  Input,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import PageHero from '../components/PageHero'
import { listBusinessRecords } from '../api/businessRecordApi.mjs'
import {
  listWorkflowBusinessStates,
  listWorkflowTasks,
} from '../api/workflowApi.mjs'
import { businessModuleDefinitions } from '../config/businessModules.mjs'
import { roleLabelMap } from '../config/businessRecordDefinitions.mjs'
import {
  BUSINESS_CHAIN_DEBUG_DOC_PATH,
  BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS,
  buildBusinessChainDebugView,
  createEmptyBusinessChainDebugView,
  formatBusinessDebugNumber,
  formatBusinessDebugTime,
  moduleMatchesBusinessChainDebugQuery,
  normalizeBusinessChainDebugQuery,
} from '../utils/businessChainDebug.mjs'
import {
  BUSINESS_WORKFLOW_STATES,
  TASK_WORKFLOW_STATES,
} from '../config/workflowStatus.mjs'

const { Search } = Input
const { Paragraph, Text } = Typography

const activeBusinessModules = businessModuleDefinitions.filter(
  (moduleItem) => moduleItem.status !== 'awaiting_confirmation'
)
const BUSINESS_STATUS_LABELS = new Map(
  BUSINESS_WORKFLOW_STATES.map((state) => [state.key, state.label])
)
const TASK_STATUS_LABELS = new Map(
  TASK_WORKFLOW_STATES.map((state) => [state.key, state.label])
)

function uniqueRecords(records = []) {
  const byKey = new Map()
  records.forEach((record) => {
    if (!record?.module_key || !record?.id) return
    byKey.set(`${record.module_key}:${record.id}`, record)
  })
  return [...byKey.values()]
}

async function fetchBusinessDebugRecords(query) {
  const normalizedQuery = normalizeBusinessChainDebugQuery(query)
  const moduleMatches = activeBusinessModules.filter((moduleItem) =>
    moduleMatchesBusinessChainDebugQuery(moduleItem, normalizedQuery)
  )
  const recordRequests = [
    listBusinessRecords({
      keyword: normalizedQuery,
      limit: 200,
    }),
    ...moduleMatches.map((moduleItem) =>
      listBusinessRecords({
        module_key: moduleItem.key,
        limit: 200,
      })
    ),
  ]
  const results = await Promise.all(recordRequests)
  return uniqueRecords(results.flatMap((result) => result.records || []))
}

function statusTagColor(value) {
  if (value === 'blocked') return 'red'
  if (value === 'cancelled') return 'default'
  if (value === 'closed' || value === 'settled' || value === 'done') {
    return 'green'
  }
  return 'blue'
}

function SummaryTile({ title, value, suffix }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <Statistic title={title} value={value} suffix={suffix} />
    </div>
  )
}

export default function BusinessChainDebugPage() {
  const [query, setQuery] = useState('')
  const [view, setView] = useState(() => createEmptyBusinessChainDebugView())
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const loadDebugView = async (nextQuery = query) => {
    const normalizedQuery = normalizeBusinessChainDebugQuery(nextQuery)
    setQuery(normalizedQuery)
    setSearched(Boolean(normalizedQuery))
    if (!normalizedQuery) {
      setView(createEmptyBusinessChainDebugView())
      return
    }

    setLoading(true)
    try {
      const [records, stateData, taskData] = await Promise.all([
        fetchBusinessDebugRecords(normalizedQuery),
        listWorkflowBusinessStates({ limit: 200 }),
        listWorkflowTasks({ limit: 200 }),
      ])
      setView(
        buildBusinessChainDebugView({
          query: normalizedQuery,
          records,
          businessStates: stateData.business_states || [],
          tasks: taskData.tasks || [],
          modules: activeBusinessModules,
        })
      )
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '查询业务链路失败，请稍后重试')
      )
    } finally {
      setLoading(false)
    }
  }

  const recordColumns = useMemo(
    () => [
      {
        title: '模块',
        dataIndex: 'module_title',
        width: 150,
        render: (value, record) =>
          record.module_path ? (
            <Link to={record.module_path}>{value}</Link>
          ) : (
            value
          ),
      },
      {
        title: '单据 / 来源',
        dataIndex: 'document_no',
        width: 210,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text strong>{record.document_no || `#${record.id}`}</Text>
            <Text type="secondary">{record.source_no || '无来源单号'}</Text>
          </Space>
        ),
      },
      {
        title: '标题',
        dataIndex: 'title',
        width: 220,
        ellipsis: true,
      },
      {
        title: '对象 / 物料',
        dataIndex: 'customer_name',
        width: 240,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text>{record.customer_name || record.supplier_name || '-'}</Text>
            <Text type="secondary">
              {record.product_name ||
                record.material_name ||
                record.warehouse_location ||
                '-'}
            </Text>
          </Space>
        ),
      },
      {
        title: '数量 / 金额',
        dataIndex: 'quantity',
        width: 150,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text>{formatBusinessDebugNumber(record.quantity)}</Text>
            <Text type="secondary">
              {formatBusinessDebugNumber(record.amount)}
            </Text>
          </Space>
        ),
      },
      {
        title: '状态 / 主责',
        dataIndex: 'business_status_key',
        width: 170,
        render: (_, record) => (
          <Space direction="vertical" size={4}>
            <Tag color={statusTagColor(record.business_status_key)}>
              {BUSINESS_STATUS_LABELS.get(record.business_status_key) ||
                record.business_status_key ||
                '-'}
            </Tag>
            <Text type="secondary">
              {roleLabelMap.get(record.owner_role_key) ||
                record.owner_role_key ||
                '-'}
            </Text>
          </Space>
        ),
      },
      {
        title: '明细 / 任务',
        dataIndex: 'items_count',
        width: 130,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text>{record.items_count} 行明细</Text>
            <Text type="secondary">
              {record.active_task_count}/{record.task_count} 活跃任务
            </Text>
          </Space>
        ),
      },
      {
        title: '阻塞原因',
        dataIndex: 'blocked_reason',
        width: 240,
        ellipsis: true,
        render: (value) => value || '-',
      },
    ],
    []
  )

  const taskColumns = useMemo(
    () => [
      {
        title: '任务',
        dataIndex: 'task_name',
        width: 260,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text strong>{record.task_name || record.task_code}</Text>
            <Text type="secondary">{record.task_code || '-'}</Text>
          </Space>
        ),
      },
      {
        title: '来源',
        dataIndex: 'source_no',
        width: 210,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text>{record.module_title}</Text>
            <Text type="secondary">
              {record.source_no || `${record.source_type} #${record.source_id}`}
            </Text>
          </Space>
        ),
      },
      {
        title: '任务状态',
        dataIndex: 'task_status_key',
        width: 130,
        render: (value) => (
          <Tag color={statusTagColor(value)}>
            {TASK_STATUS_LABELS.get(value) || value || '-'}
          </Tag>
        ),
      },
      {
        title: '业务状态',
        dataIndex: 'business_status_key',
        width: 150,
        render: (value) => (
          <Tag color={statusTagColor(value)}>
            {BUSINESS_STATUS_LABELS.get(value) || value || '-'}
          </Tag>
        ),
      },
      {
        title: '主责角色',
        dataIndex: 'owner_role_key',
        width: 140,
        render: (value) => roleLabelMap.get(value) || value || '-',
      },
      {
        title: '阻塞原因',
        dataIndex: 'blocked_reason',
        width: 240,
        ellipsis: true,
        render: (value) => value || '-',
      },
      {
        title: '更新时间',
        dataIndex: 'updated_at',
        width: 180,
        render: formatBusinessDebugTime,
      },
    ],
    []
  )

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="开发与验收"
        title="业务链路调试"
        description="按当前通用业务记录、workflow 业务状态和协同任务做只读链路排查。这里参考外贸项目的排查方式，但不提供旧外贸造数、清库或测试样本重建。"
        actions={
          <>
            <Link
              className="erp-secondary-button"
              to={BUSINESS_CHAIN_DEBUG_DOC_PATH}
            >
              查看排查说明
            </Link>
            <Link className="erp-secondary-button" to="/erp/qa/reports">
              专项报告
            </Link>
          </>
        }
      />

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <Alert
            type="info"
            showIcon
            message="只读排查入口"
            description="查询只读取当前服务返回的 business_records、workflow_business_states 和 workflow_tasks；不会创建、清理或改写任何业务数据。"
          />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Search
              allowClear
              value={query}
              placeholder="输入单据号、来源单号、客户、供应商、物料、模块 key 或任务名称"
              enterButton="查询链路"
              loading={loading}
              onChange={(event) => setQuery(event.target.value)}
              onSearch={loadDebugView}
            />
            <Button loading={loading} onClick={() => loadDebugView(query)}>
              刷新当前查询
            </Button>
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-50">
                固定排查入口
              </div>
              <Paragraph className="!mb-0 !text-slate-300">
                这些按钮只填入推荐查询词并回查当前库；如果当前库没有对应业务数据，结果会为空。
              </Paragraph>
            </div>
          </div>
          <Table
            rowKey="key"
            size="small"
            pagination={false}
            columns={[
              {
                title: '场景',
                dataIndex: 'title',
                width: 180,
                render: (_, record) => (
                  <Space direction="vertical" size={2}>
                    <Text strong>{record.title}</Text>
                    <Text type="secondary">{record.key}</Text>
                  </Space>
                ),
              },
              { title: '主看链路', dataIndex: 'chain', width: 260 },
              {
                title: '关键预期',
                dataIndex: 'expectation',
                width: 520,
                render: (value) => (
                  <Paragraph className="!mb-0">{value}</Paragraph>
                ),
              },
              {
                title: '查询',
                dataIndex: 'queryKeywords',
                width: 170,
                fixed: 'right',
                render: (values, record) => (
                  <Space size={[8, 8]} wrap>
                    {(Array.isArray(values) ? values : []).map((value) => (
                      <Button
                        key={`${record.key}-${value}`}
                        size="small"
                        onClick={() => loadDebugView(value)}
                      >
                        填入并查询
                      </Button>
                    ))}
                  </Space>
                ),
              },
            ]}
            dataSource={BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS}
            scroll={{ x: 1130 }}
          />
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <SummaryTile title="匹配单据" value={view.summary.recordCount} />
            <SummaryTile title="状态快照" value={view.summary.stateCount} />
            <SummaryTile title="匹配任务" value={view.summary.taskCount} />
            <SummaryTile
              title="活跃任务"
              value={view.summary.activeTaskCount}
            />
            <SummaryTile title="阻塞项" value={view.summary.blockedCount} />
            <SummaryTile
              title="金额合计"
              value={formatBusinessDebugNumber(view.summary.amount)}
            />
          </div>

          {!searched ? (
            <Empty description="输入查询词后查看业务记录、明细摘要和协同任务。" />
          ) : null}

          {searched ? (
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="text-base font-semibold text-slate-50">
                  匹配业务记录
                </div>
                <Table
                  rowKey="key"
                  size="small"
                  loading={loading}
                  columns={recordColumns}
                  dataSource={view.records}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ x: 1520 }}
                />
              </div>
              <div className="space-y-3">
                <div className="text-base font-semibold text-slate-50">
                  匹配协同任务
                </div>
                <Table
                  rowKey="key"
                  size="small"
                  loading={loading}
                  columns={taskColumns}
                  dataSource={view.tasks}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ x: 1330 }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </SurfacePanel>
    </div>
  )
}
