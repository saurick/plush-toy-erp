import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Input,
  Modal,
  Select,
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
  cleanupBusinessChainDebugScenario,
  getBusinessChainDebugCapabilities,
  rebuildBusinessChainDebugScenario,
} from '../api/debugApi.mjs'
import {
  listWorkflowBusinessStates,
  listWorkflowTasks,
} from '../api/workflowApi.mjs'
import { businessModuleDefinitions } from '../config/businessModules.mjs'
import { roleLabelMap } from '../config/businessRecordDefinitions.mjs'
import {
  BUSINESS_CHAIN_DEBUG_DOC_PATH,
  BUSINESS_CHAIN_DEBUG_CAPABILITY_DEFAULT,
  BUSINESS_CHAIN_DEBUG_DEFERRED_LINKS,
  BUSINESS_CHAIN_DEBUG_MAINLINE_SCENARIOS,
  BUSINESS_CHAIN_DEBUG_OUT_OF_SCOPE_LINKS,
  BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS,
  buildBusinessChainDebugView,
  createEmptyBusinessChainDebugView,
  formatBusinessDebugNumber,
  formatBusinessDebugTime,
  getBusinessChainDebugActionDisabledReason,
  moduleMatchesBusinessChainDebugQuery,
  normalizeBusinessChainDebugCapabilities,
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

function coverageStatusColor(value) {
  if (value === '已接入 v1') return 'green'
  if (value === 'partial') return 'gold'
  if (value === 'deferred') return 'default'
  if (value === 'out_of_scope') return 'red'
  if (value === 'future') return 'purple'
  return 'blue'
}

function SummaryTile({ title, value, suffix }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <Statistic title={title} value={value} suffix={suffix} />
    </div>
  )
}

function firstDebugRecordQuery(seedResult) {
  const records = Array.isArray(seedResult?.createdRecords)
    ? seedResult.createdRecords
    : []
  return records[0]?.documentNo || seedResult?.debugRunId || ''
}

function resultItems(value) {
  return Array.isArray(value) ? value : []
}

function statusYesNoTag(enabled, enabledText = '允许', disabledText = '禁用') {
  return (
    <Tag color={enabled ? 'green' : 'red'}>
      {enabled ? enabledText : disabledText}
    </Tag>
  )
}

export default function BusinessChainDebugPage() {
  const [query, setQuery] = useState('')
  const [view, setView] = useState(() => createEmptyBusinessChainDebugView())
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selectedScenarioKey, setSelectedScenarioKey] = useState(
    BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS[0]?.key || ''
  )
  const [capabilities, setCapabilities] = useState(() =>
    normalizeBusinessChainDebugCapabilities(
      BUSINESS_CHAIN_DEBUG_CAPABILITY_DEFAULT
    )
  )
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false)
  const [operationLoading, setOperationLoading] = useState('')
  const [seedResult, setSeedResult] = useState(null)
  const [cleanupPreview, setCleanupPreview] = useState(null)
  const [cleanupResult, setCleanupResult] = useState(null)

  const selectedScenario = useMemo(
    () =>
      BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS.find(
        (scenario) => scenario.key === selectedScenarioKey
      ) || BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS[0],
    [selectedScenarioKey]
  )

  const seedDisabledReason = getBusinessChainDebugActionDisabledReason(
    capabilities,
    'seed'
  )
  const cleanupDisabledReason = getBusinessChainDebugActionDisabledReason(
    capabilities,
    'cleanup'
  )
  const selectedRunId =
    seedResult?.debugRunId || cleanupPreview?.debugRunId || ''
  const canSeed = capabilities.seedAllowed && !operationLoading
  const canCleanup =
    capabilities.cleanupAllowed && Boolean(selectedRunId) && !operationLoading

  useEffect(() => {
    let cancelled = false
    async function loadCapabilities() {
      setCapabilitiesLoading(true)
      try {
        const data = await getBusinessChainDebugCapabilities()
        if (!cancelled) {
          setCapabilities(normalizeBusinessChainDebugCapabilities(data))
        }
      } catch (error) {
        if (!cancelled) {
          setCapabilities(
            normalizeBusinessChainDebugCapabilities({
              environment: 'unknown',
              seedDisabledReason: getActionErrorMessage(
                error,
                '无法读取后端调试能力，生成和清理按钮保持禁用'
              ),
              cleanupDisabledReason: getActionErrorMessage(
                error,
                '无法读取后端调试能力，生成和清理按钮保持禁用'
              ),
            })
          )
        }
      } finally {
        if (!cancelled) setCapabilitiesLoading(false)
      }
    }
    loadCapabilities()
    return () => {
      cancelled = true
    }
  }, [])

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

  const handleScenarioChange = (scenarioKey) => {
    setSelectedScenarioKey(scenarioKey)
    setSeedResult(null)
    setCleanupPreview(null)
    setCleanupResult(null)
  }

  const handleSeedScenario = async (scenarioKey = selectedScenario?.key) => {
    if (!scenarioKey) return
    setSelectedScenarioKey(scenarioKey)
    setSeedResult(null)
    setOperationLoading('seed')
    setCleanupPreview(null)
    setCleanupResult(null)
    try {
      const result = await rebuildBusinessChainDebugScenario({
        scenarioKey,
      })
      setSeedResult(result)
      message.success('调试数据已生成')
      const nextQuery = firstDebugRecordQuery(result)
      if (nextQuery) {
        await loadDebugView(nextQuery)
      }
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '生成调试数据失败，请检查后端安全开关')
      )
    } finally {
      setOperationLoading('')
    }
  }

  const handleCleanupDryRun = async () => {
    if (!selectedRunId) {
      message.warning('请先生成一次调试数据，再预览清理范围')
      return
    }
    setOperationLoading('dryRun')
    try {
      const result = await cleanupBusinessChainDebugScenario({
        debugRunId: selectedRunId,
        scenarioKey: seedResult?.scenarioKey || selectedScenario?.key,
        dryRun: true,
      })
      setCleanupPreview(result)
      setCleanupResult(null)
      message.success('已预览清理范围，未修改数据')
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '预览清理范围失败，请检查后端安全开关')
      )
    } finally {
      setOperationLoading('')
    }
  }

  const runCleanup = async () => {
    const result = await cleanupBusinessChainDebugScenario({
      debugRunId: selectedRunId,
      scenarioKey: seedResult?.scenarioKey || selectedScenario?.key,
      dryRun: false,
    })
    setCleanupResult(result)
    setCleanupPreview(null)
    message.success('本次调试数据已清理')
    if (selectedRunId) {
      await loadDebugView(selectedRunId)
    }
  }

  const handleCleanup = () => {
    if (!selectedRunId) {
      message.warning('请先生成一次调试数据，再清理本次数据')
      return
    }
    Modal.confirm({
      title: '清理本次调试数据',
      content: `只会清理 debugRunId=${selectedRunId} 且带 debug 标记的数据。建议先执行 dryRun 预览。`,
      okText: '确认清理',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setOperationLoading('cleanup')
        try {
          await runCleanup()
        } catch (error) {
          message.error(
            getActionErrorMessage(error, '清理调试数据失败，请稍后重试')
          )
        } finally {
          setOperationLoading('')
        }
      },
    })
  }

  const recordColumns = useMemo(
    () => [
      {
        title: '模块',
        dataIndex: 'module_title',
        width: 150,
        render: (value, record) =>
          record.module_path ? (
            <Space direction="vertical" size={2}>
              <Link to={record.module_path}>{value}</Link>
              <Text type="secondary">{record.module_key}</Text>
            </Space>
          ) : (
            <Space direction="vertical" size={2}>
              <Text>{value}</Text>
              <Text type="secondary">{record.module_key}</Text>
            </Space>
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
      {
        title: '更新时间',
        dataIndex: 'updated_at',
        width: 180,
        render: formatBusinessDebugTime,
      },
    ],
    []
  )

  const taskColumns = useMemo(
    () => [
      {
        title: '任务 / 分组',
        dataIndex: 'task_name',
        width: 260,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text strong>{record.task_name || record.task_code}</Text>
            <Text type="secondary">
              {record.task_group || '-'} / {record.task_code || '-'}
            </Text>
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
        title: '到期 / 优先级',
        dataIndex: 'due_at',
        width: 180,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text>{formatBusinessDebugTime(record.due_at)}</Text>
            <Text type="secondary">优先级 {record.priority}</Text>
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
      {
        title: '更新时间',
        dataIndex: 'updated_at',
        width: 180,
        render: formatBusinessDebugTime,
      },
    ],
    []
  )

  const taskEventColumns = useMemo(
    () => [
      {
        title: '任务 ID',
        dataIndex: 'task_id',
        width: 110,
      },
      {
        title: '状态变化',
        dataIndex: 'from_status_key',
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text>
              {record.from_status_key || '-'} -&gt;{' '}
              {record.to_status_key || '-'}
            </Text>
            <Text type="secondary">{record.event_type || '-'}</Text>
          </Space>
        ),
      },
      {
        title: '原因',
        dataIndex: 'reason',
        width: 300,
        ellipsis: true,
        render: (value) => value || '-',
      },
      {
        title: '操作角色',
        dataIndex: 'actor_role_key',
        width: 140,
        render: (value) => roleLabelMap.get(value) || value || '-',
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        width: 180,
        render: formatBusinessDebugTime,
      },
    ],
    []
  )

  const businessStateColumns = useMemo(
    () => [
      {
        title: '来源',
        dataIndex: 'source_type',
        width: 260,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            {record.module_path ? (
              <Link to={record.module_path}>{record.module_title}</Link>
            ) : (
              <Text>{record.module_title || record.source_type}</Text>
            )}
            <Text type="secondary">
              {record.source_type} /{' '}
              {record.source_no || `#${record.source_id}`}
            </Text>
          </Space>
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
        width: 320,
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
        description="按 business_records、workflow_business_states、workflow_tasks 和任务事件口径排查 ERP v1 主干闭环；当前 6 条链路不是全量业务覆盖。"
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
            message="安全调试中心"
            description="填入并查询只读取当前服务返回的数据；生成和清理调试数据必须经过后端环境开关、管理员权限、业务链路调试菜单权限和 debug 标记过滤。"
          />
          <Alert
            type="warning"
            showIcon
            message="覆盖边界"
            description="当前 6 条链路只代表 ERP v1 主干闭环，不代表工程 BOM、排产分派、发料领料、库存盘点、售后退货、收付款、成本毛利等扩展链路已经完成。"
          />
          <Alert
            type="error"
            showIcon
            message="禁止危险操作"
            description="本页不提供任意 SQL 控制台，不提供全库清空，不允许清理没有 payload.debug=true 和 scenario_key 标识的真实业务数据。"
          />
          <Alert
            type="warning"
            showIcon
            message="移动端不可见优先检查项"
            description="看起来有任务但移动端看不到时，先查 owner_role_key、task_group、任务是否已终态，以及 mobileTaskQueries 是否对 PMC、老板、生产使用全量加载后过滤。"
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
        <div className="space-y-5">
          <div>
            <div className="text-lg font-semibold text-slate-50">
              链路覆盖矩阵
            </div>
            <Paragraph className="!mb-0 !text-slate-300">
              矩阵明确区分已接入 v1
              主干闭环、未覆盖或待补扩展链路，以及当前不做的能力，避免把 6
              条主链误读成全量业务覆盖。
            </Paragraph>
          </div>

          <div className="space-y-3">
            <div className="text-base font-semibold text-slate-50">
              已接入 v1 主干闭环
            </div>
            <Table
              rowKey="key"
              size="small"
              pagination={false}
              columns={[
                {
                  title: '场景',
                  dataIndex: 'title',
                  width: 280,
                  render: (_, record) => (
                    <Space direction="vertical" size={2}>
                      <Text strong>{record.title}</Text>
                      <Text type="secondary">{record.key}</Text>
                    </Space>
                  ),
                },
                {
                  title: '覆盖状态',
                  dataIndex: 'status',
                  width: 130,
                  render: (value) => (
                    <Tag color={coverageStatusColor(value)}>{value}</Tag>
                  ),
                },
                { title: '承载方式', dataIndex: 'carrier', width: 220 },
                { title: '验收方式', dataIndex: 'validation', width: 260 },
                {
                  title: '当前盲区',
                  dataIndex: 'blindSpot',
                  width: 420,
                  render: (value) => (
                    <Paragraph className="!mb-0">{value}</Paragraph>
                  ),
                },
              ]}
              dataSource={BUSINESS_CHAIN_DEBUG_MAINLINE_SCENARIOS}
              scroll={{ x: 1310 }}
            />
          </div>

          <div className="space-y-3">
            <div className="text-base font-semibold text-slate-50">
              未覆盖 / 待补扩展链路
            </div>
            <Table
              rowKey="key"
              size="small"
              pagination={{ pageSize: 7, showSizeChanger: false }}
              columns={[
                {
                  title: '扩展链路',
                  dataIndex: 'title',
                  width: 280,
                  render: (_, record) => (
                    <Space direction="vertical" size={2}>
                      <Text strong>{record.title}</Text>
                      <Text type="secondary">{record.key}</Text>
                    </Space>
                  ),
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 120,
                  render: (value) => (
                    <Tag color={coverageStatusColor(value)}>{value}</Tag>
                  ),
                },
                {
                  title: '原因',
                  dataIndex: 'reason',
                  width: 420,
                  render: (value) => (
                    <Paragraph className="!mb-0">{value}</Paragraph>
                  ),
                },
                {
                  title: '后续建议',
                  dataIndex: 'nextStep',
                  width: 360,
                  render: (value) => (
                    <Paragraph className="!mb-0">{value}</Paragraph>
                  ),
                },
              ]}
              dataSource={BUSINESS_CHAIN_DEBUG_DEFERRED_LINKS}
              scroll={{ x: 1180 }}
            />
          </div>

          <div className="space-y-3">
            <div className="text-base font-semibold text-slate-50">
              当前不做
            </div>
            <Table
              rowKey="key"
              size="small"
              pagination={false}
              columns={[
                {
                  title: '能力',
                  dataIndex: 'title',
                  render: (_, record) => (
                    <Space direction="vertical" size={2}>
                      <Text>{record.title}</Text>
                      <Text type="secondary">{record.key}</Text>
                    </Space>
                  ),
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 140,
                  render: (value) => (
                    <Tag color={coverageStatusColor(value)}>{value}</Tag>
                  ),
                },
              ]}
              dataSource={BUSINESS_CHAIN_DEBUG_OUT_OF_SCOPE_LINKS}
            />
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-50">
                按需生成调试场景
              </div>
              <Paragraph className="!mb-0 !text-slate-300">
                生成调试数据 seed 和清理调试数据 cleanup
                只面向开发验收；后端会按环境、权限、debugRunId 和 debug
                标记拦截危险操作。
              </Paragraph>
            </div>
          </div>

          <Descriptions size="small" bordered column={{ xs: 1, md: 2, xl: 4 }}>
            <Descriptions.Item label="当前环境">
              <Space size={6} wrap>
                <Tag color="blue">{capabilities.environment}</Tag>
                {capabilitiesLoading ? (
                  <Text type="secondary">读取中</Text>
                ) : null}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="生成调试数据">
              <Space size={6} wrap>
                {statusYesNoTag(capabilities.seedAllowed)}
                {!capabilities.seedAllowed ? (
                  <Text type="secondary">{seedDisabledReason}</Text>
                ) : null}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="清理调试数据">
              <Space size={6} wrap>
                {statusYesNoTag(capabilities.cleanupAllowed)}
                {!capabilities.cleanupAllowed ? (
                  <Text type="secondary">{cleanupDisabledReason}</Text>
                ) : null}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="清理范围">
              <Space size={6} wrap>
                <Text code>{capabilities.cleanupScope}</Text>
                {capabilities.cleanupOnlyDebugData ? (
                  <Tag color="green">只影响 debug 数据</Tag>
                ) : null}
                {capabilities.destructiveRemoteDenied ? (
                  <Tag color="red">remote/prod 禁止</Tag>
                ) : null}
              </Space>
            </Descriptions.Item>
          </Descriptions>

          <div className="grid gap-3 xl:grid-cols-[minmax(280px,420px)_1fr]">
            <div className="space-y-2">
              <Text strong>选择场景</Text>
              <Select
                className="w-full"
                value={selectedScenarioKey}
                onChange={handleScenarioChange}
                options={BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS.map(
                  (scenario) => ({
                    value: scenario.key,
                    label: scenario.title,
                  })
                )}
              />
            </div>
            <div className="flex flex-col gap-2 xl:items-end">
              <Space size={[8, 8]} wrap>
                <Button
                  type="primary"
                  loading={operationLoading === 'seed'}
                  disabled={!canSeed}
                  title={seedDisabledReason}
                  onClick={() => handleSeedScenario()}
                >
                  生成调试数据
                </Button>
                <Button
                  loading={operationLoading === 'dryRun'}
                  disabled={!canCleanup}
                  title={
                    selectedRunId
                      ? cleanupDisabledReason
                      : '请先生成调试数据，拿到 debugRunId'
                  }
                  onClick={handleCleanupDryRun}
                >
                  dryRun 预览清理范围
                </Button>
                <Button
                  danger
                  loading={operationLoading === 'cleanup'}
                  disabled={!canCleanup}
                  title={
                    selectedRunId
                      ? cleanupDisabledReason
                      : '请先生成调试数据，拿到 debugRunId'
                  }
                  onClick={handleCleanup}
                >
                  清理本次调试数据
                </Button>
              </Space>
              <Text type="secondary">
                {selectedRunId
                  ? `本次调试编号 debugRunId=${selectedRunId}`
                  : '生成后会显示本次调试编号 debugRunId 和下一步检查点。'}
              </Text>
            </div>
          </div>

          {seedResult ? (
            <div className="space-y-3">
              <Alert
                type={seedResult.partial ? 'warning' : 'success'}
                showIcon
                message={`已生成 ${seedResult.scenarioKey} / ${seedResult.debugRunId}`}
                description={
                  resultItems(seedResult.warnings).length > 0
                    ? resultItems(seedResult.warnings).join('；')
                    : '本次调试数据已写入通用业务记录和协同任务表。'
                }
              />
              <div className="grid gap-3 lg:grid-cols-2">
                <Table
                  rowKey={(record) => `${record.moduleKey}:${record.id}`}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '模块', dataIndex: 'moduleKey' },
                    { title: '单据号', dataIndex: 'documentNo' },
                    { title: '标题', dataIndex: 'title' },
                    { title: '状态', dataIndex: 'businessStatusKey' },
                  ]}
                  dataSource={resultItems(seedResult.createdRecords)}
                />
                <Table
                  rowKey={(record) => `${record.taskCode}:${record.id}`}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '任务组', dataIndex: 'taskGroup' },
                    { title: '任务', dataIndex: 'taskName' },
                    { title: '状态', dataIndex: 'taskStatusKey' },
                    { title: '角色', dataIndex: 'ownerRoleKey' },
                  ]}
                  dataSource={resultItems(seedResult.createdTasks)}
                />
              </div>
              <Table
                rowKey={(record) => `${record.path}:${record.label}`}
                size="small"
                pagination={false}
                columns={[
                  {
                    title: '下一步检查点',
                    dataIndex: 'label',
                    render: (_, record) =>
                      record.path ? (
                        <Link to={record.path}>{record.label}</Link>
                      ) : (
                        record.label
                      ),
                  },
                  { title: '推荐查询', dataIndex: 'query' },
                  { title: '检查原因', dataIndex: 'reason' },
                ]}
                dataSource={resultItems(seedResult.nextCheckpoints)}
              />
            </div>
          ) : null}

          {cleanupPreview || cleanupResult ? (
            <div className="space-y-3">
              <Alert
                type={cleanupPreview ? 'info' : 'success'}
                showIcon
                message={
                  cleanupPreview ? 'dryRun 预览完成，未修改数据' : '清理完成'
                }
                description={
                  cleanupPreview
                    ? `将影响 ${resultItems(cleanupPreview.matchedRecords).length} 条业务记录、${resultItems(cleanupPreview.matchedTasks).length} 个任务。`
                    : `已归档 ${resultItems(cleanupResult.archivedRecords).length} 条业务记录，删除 ${resultItems(cleanupResult.deletedTasks).length} 个调试任务。`
                }
              />
              <Table
                rowKey={(record) =>
                  `${record.moduleKey || record.taskCode}:${record.id}`
                }
                size="small"
                pagination={false}
                columns={[
                  { title: '类型', dataIndex: 'type' },
                  { title: '编号', dataIndex: 'documentNo' },
                  { title: '标题 / 任务', dataIndex: 'title' },
                ]}
                dataSource={[
                  ...resultItems(
                    (cleanupPreview || cleanupResult).matchedRecords
                  ).map((record) => ({
                    ...record,
                    type: 'business_record',
                  })),
                  ...resultItems(
                    (cleanupPreview || cleanupResult).matchedTasks
                  ).map((task) => ({
                    id: task.id,
                    type: 'workflow_task',
                    documentNo: task.taskCode,
                    title: task.taskName,
                  })),
                ]}
              />
            </div>
          ) : null}

          <Table
            rowKey="key"
            size="small"
            pagination={false}
            columns={[
              {
                title: '场景',
                dataIndex: 'title',
                width: 260,
                render: (_, record) => (
                  <Space direction="vertical" size={2}>
                    <Text strong>{record.title}</Text>
                    <Text type="secondary">{record.key}</Text>
                  </Space>
                ),
              },
              {
                title: '覆盖状态',
                dataIndex: 'status',
                width: 120,
                render: (value) => (
                  <Tag color={coverageStatusColor(value)}>{value}</Tag>
                ),
              },
              { title: '主看链路', dataIndex: 'chain', width: 260 },
              {
                title: '关键预期',
                dataIndex: 'expectation',
                width: 360,
                render: (value) => (
                  <Paragraph className="!mb-0">{value}</Paragraph>
                ),
              },
              {
                title: '推荐查询词',
                dataIndex: 'queryKeywords',
                width: 250,
                render: (values) => (
                  <Text code>{Array.isArray(values) ? values[0] : '-'}</Text>
                ),
              },
              {
                title: '查询',
                dataIndex: 'queryKeywords',
                width: 140,
                fixed: 'right',
                render: (values, record) => (
                  <Space size={[8, 8]} wrap>
                    <Button
                      size="small"
                      onClick={() =>
                        loadDebugView(
                          Array.isArray(values) ? values[0] : record.key
                        )
                      }
                    >
                      填入并查询
                    </Button>
                  </Space>
                ),
              },
              {
                title: '开发者操作',
                dataIndex: 'key',
                width: 240,
                fixed: 'right',
                render: (_, record) => (
                  <Space size={[8, 8]} wrap>
                    <Button
                      size="small"
                      onClick={() => handleScenarioChange(record.key)}
                    >
                      选择场景
                    </Button>
                    <Button
                      size="small"
                      disabled={!canSeed}
                      title={seedDisabledReason}
                      onClick={() => handleSeedScenario(record.key)}
                    >
                      生成调试数据
                    </Button>
                  </Space>
                ),
              },
            ]}
            dataSource={BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS}
            scroll={{ x: 1670 }}
          />
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <SummaryTile title="匹配单据" value={view.summary.recordCount} />
            <SummaryTile title="状态快照" value={view.summary.stateCount} />
            <SummaryTile title="匹配任务" value={view.summary.taskCount} />
            <SummaryTile title="任务事件" value={view.summary.eventCount} />
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
                  业务记录 business_records
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
                  协同任务 workflow_tasks
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
              <div className="space-y-3">
                <div className="text-base font-semibold text-slate-50">
                  任务事件 workflow_task_events
                </div>
                <Alert
                  type="info"
                  showIcon
                  message="任务事件读取待接入"
                  description="workflow_task_events 是核对口径；当前后端尚未暴露只读事件列表，本页先保留结果区，后续接入 list_task_events 或 debug 查询 API 后显示真实事件。"
                />
                <Table
                  rowKey="key"
                  size="small"
                  loading={loading}
                  columns={taskEventColumns}
                  dataSource={view.taskEvents}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ x: 950 }}
                />
              </div>
              <div className="space-y-3">
                <div className="text-base font-semibold text-slate-50">
                  业务状态 workflow_business_states
                </div>
                <Table
                  rowKey="key"
                  size="small"
                  loading={loading}
                  columns={businessStateColumns}
                  dataSource={view.businessStates}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ x: 1050 }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </SurfacePanel>
    </div>
  )
}
