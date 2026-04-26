import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
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
import { listWorkflowTasks } from '../api/workflowApi.mjs'
import { roleLabelMap } from '../config/businessRecordDefinitions.mjs'
import {
  BUSINESS_WORKFLOW_STATES,
  TASK_WORKFLOW_STATES,
} from '../config/workflowStatus.mjs'
import {
  WORKFLOW_TASK_BINDING_ROWS,
  WORKFLOW_TASK_DEBUG_DOC_PATH,
  WORKFLOW_TASK_DEBUG_FILTER_DEFAULTS,
  WORKFLOW_TASK_DEBUG_ROLE_OPTIONS,
  buildWorkflowTaskDebugView,
  buildWorkflowTaskVisibilityDiagnostics,
  formatWorkflowTaskDebugTime,
  normalizeWorkflowTaskEventRows,
} from './WorkflowTaskDebugPage.view.mjs'

const { Paragraph, Text } = Typography

const BOOLEAN_FILTER_OPTIONS = Object.freeze([
  { value: 'any', label: '全部' },
  { value: 'yes', label: '是' },
  { value: 'no', label: '否' },
])

const ALERT_LEVEL_OPTIONS = Object.freeze([
  { value: 'critical', label: 'critical' },
  { value: 'warning', label: 'warning' },
  { value: 'info', label: 'info' },
])

const BOOLEAN_FILTER_FIELDS = Object.freeze([
  ['blocked', '是否 blocked'],
  ['overdue', '是否 overdue'],
  ['critical_path', '是否 critical_path'],
  ['urged', '是否 urged'],
  ['escalated', '是否 escalated'],
  ['terminal', '是否 terminal status'],
])

function statusTagColor(value) {
  if (value === 'blocked' || value === 'rejected') return 'red'
  if (value === 'cancelled') return 'default'
  if (value === 'closed' || value === 'settled' || value === 'done') {
    return 'green'
  }
  return 'blue'
}

function alertTagColor(value) {
  if (value === 'critical') return 'red'
  if (value === 'warning') return 'gold'
  return 'default'
}

function uniqueOptions(rows, field) {
  const sourceRows = Array.isArray(rows) ? rows : []
  return [
    ...new Set(
      sourceRows.map((row) => String(row?.[field] || '').trim()).filter(Boolean)
    ),
  ].map((value) => ({ value, label: value }))
}

function renderBool(value) {
  return value ? <Tag color="green">是</Tag> : <Tag>否</Tag>
}

function renderPayloadValue(value) {
  if (value === undefined || value === null || value === '') return '-'
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('、') : '-'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

function FilterField({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      <span>{label}</span>
      {children}
    </label>
  )
}

function SummaryTile({ title, value, suffix }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <Statistic title={title} value={value} suffix={suffix} />
    </div>
  )
}

function BooleanFilterFields({ filters, onFilterChange }) {
  return BOOLEAN_FILTER_FIELDS.map(([key, label]) => (
    <FilterField key={key} label={label}>
      <Select
        value={filters[key]}
        options={BOOLEAN_FILTER_OPTIONS}
        onChange={(value) => onFilterChange(key, value)}
      />
    </FilterField>
  ))
}

function ExpandedTaskPayload({ record }) {
  const payload = record.payload || {}
  const payloadRows = [
    ['complete_condition', payload.complete_condition],
    ['related_documents', payload.related_documents],
    ['notification_type', payload.notification_type],
    ['alert_type', payload.alert_type],
    ['critical_path', payload.critical_path],
    ['urge_count', payload.urge_count],
    ['last_urge_at', formatWorkflowTaskDebugTime(payload.last_urge_at)],
    ['last_urge_reason', payload.last_urge_reason],
    ['escalated', payload.escalated],
    ['escalate_target_role_key', payload.escalate_target_role_key],
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {payloadRows.map(([key, value]) => (
        <Card key={key} size="small" title={<Text code>{key}</Text>}>
          <Text>{renderPayloadValue(value)}</Text>
        </Card>
      ))}
    </div>
  )
}

function renderExpandedTaskPayload(record) {
  return <ExpandedTaskPayload record={record} />
}

export default function WorkflowTaskDebugPage() {
  const [filters, setFilters] = useState(WORKFLOW_TASK_DEBUG_FILTER_DEFAULTS)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedTaskKey, setSelectedTaskKey] = useState('')
  const [diagnosticRoleKey, setDiagnosticRoleKey] = useState('pmc')
  const [diagnosticSourceNo, setDiagnosticSourceNo] = useState('')
  const [diagnosticTaskGroup, setDiagnosticTaskGroup] = useState('')

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listWorkflowTasks({ limit: 200 })
      setTasks(Array.isArray(data?.tasks) ? data.tasks : [])
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '查询协同任务失败，请稍后重试')
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const debugView = useMemo(
    () => buildWorkflowTaskDebugView(tasks, filters),
    [filters, tasks]
  )
  const { rows, filteredRows, summary } = debugView
  const selectedTask = useMemo(
    () => rows.find((row) => row.key === selectedTaskKey) || null,
    [rows, selectedTaskKey]
  )
  const eventRows = useMemo(
    () => normalizeWorkflowTaskEventRows(selectedTask || {}),
    [selectedTask]
  )
  const visibilityDiagnostics = useMemo(
    () =>
      buildWorkflowTaskVisibilityDiagnostics(rows, {
        roleKey: diagnosticRoleKey,
        sourceNo: diagnosticSourceNo,
        taskGroup: diagnosticTaskGroup,
      }),
    [diagnosticRoleKey, diagnosticSourceNo, diagnosticTaskGroup, rows]
  )

  const updateFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value ?? '',
    }))
  }

  const resetFilters = () => {
    setFilters(WORKFLOW_TASK_DEBUG_FILTER_DEFAULTS)
  }

  const taskColumns = useMemo(
    () => [
      {
        title: '任务',
        dataIndex: 'task_name',
        width: 260,
        fixed: 'left',
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text strong>{record.task_name || record.task_code || '-'}</Text>
            <Text type="secondary">{record.task_code || '-'}</Text>
          </Space>
        ),
      },
      { title: 'task_group', dataIndex: 'task_group', width: 170 },
      {
        title: 'source',
        dataIndex: 'source_no',
        width: 210,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text>{record.source_type || '-'}</Text>
            <Text type="secondary">{record.source_no || '-'}</Text>
          </Space>
        ),
      },
      {
        title: '任务状态',
        dataIndex: 'task_status_key',
        width: 130,
        render: (value) => (
          <Tag color={statusTagColor(value)}>{value || '-'}</Tag>
        ),
      },
      {
        title: '业务状态',
        dataIndex: 'business_status_key',
        width: 150,
        render: (value) => (
          <Tag color={statusTagColor(value)}>{value || '-'}</Tag>
        ),
      },
      {
        title: '角色 / 人',
        dataIndex: 'owner_role_key',
        width: 160,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text>
              {roleLabelMap.get(record.owner_role_key) ||
                record.owner_role_key ||
                '-'}
            </Text>
            <Text type="secondary">
              assignee_id: {record.assignee_id || '-'}
            </Text>
          </Space>
        ),
      },
      { title: 'priority', dataIndex: 'priority', width: 100 },
      {
        title: 'due_at',
        dataIndex: 'due_at',
        width: 180,
        render: formatWorkflowTaskDebugTime,
      },
      {
        title: 'blocked_reason',
        dataIndex: 'blocked_reason',
        width: 240,
        ellipsis: true,
        render: (value) => value || '-',
      },
      {
        title: 'alert',
        dataIndex: 'alert_label',
        width: 170,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Tag color={alertTagColor(record.alert_level)}>
              {record.alert_level}
            </Tag>
            <Text type="secondary">{record.alert_label || '-'}</Text>
          </Space>
        ),
      },
      {
        title: 'overdue',
        dataIndex: 'is_overdue',
        width: 100,
        render: renderBool,
      },
      {
        title: 'urged',
        dataIndex: 'is_urged',
        width: 90,
        render: renderBool,
      },
      {
        title: 'escalated',
        dataIndex: 'is_escalated',
        width: 110,
        render: renderBool,
      },
      {
        title: '创建 / 更新',
        dataIndex: 'updated_at',
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text>{formatWorkflowTaskDebugTime(record.created_at)}</Text>
            <Text type="secondary">
              {formatWorkflowTaskDebugTime(record.updated_at)}
            </Text>
          </Space>
        ),
      },
      {
        title: '操作',
        dataIndex: 'action',
        width: 120,
        fixed: 'right',
        render: (_, record) => (
          <Button size="small" onClick={() => setSelectedTaskKey(record.key)}>
            查看事件
          </Button>
        ),
      },
    ],
    []
  )

  const eventColumns = useMemo(
    () => [
      {
        title: 'created_at',
        dataIndex: 'created_at',
        width: 180,
        render: formatWorkflowTaskDebugTime,
      },
      { title: 'from_status_key', dataIndex: 'from_status_key', width: 150 },
      { title: 'to_status_key', dataIndex: 'to_status_key', width: 150 },
      { title: 'actor_role_key', dataIndex: 'actor_role_key', width: 150 },
      { title: 'reason', dataIndex: 'reason', width: 240 },
      { title: 'payload.action', dataIndex: 'action', width: 160 },
      { title: 'payload.note', dataIndex: 'note', width: 240 },
    ],
    []
  )

  const visibilityColumns = useMemo(
    () => [
      {
        title: '任务',
        dataIndex: 'task',
        width: 260,
        render: (task) => (
          <Space direction="vertical" size={2}>
            <Text strong>{task.task_name || task.task_code || '-'}</Text>
            <Text type="secondary">
              {task.source_no || '-'} / {task.task_group || '-'}
            </Text>
          </Space>
        ),
      },
      {
        title: '查询计划',
        dataIndex: 'loaded_by_query_plan',
        width: 180,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            {renderBool(record.loaded_by_query_plan)}
            <Text type="secondary">{record.query_reason}</Text>
          </Space>
        ),
      },
      {
        title: '移动端可见',
        dataIndex: 'visible',
        width: 130,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            {record.visible ? (
              <Tag color="green">可见</Tag>
            ) : (
              <Tag color="red">不可见</Tag>
            )}
            {record.terminal ? <Tag>终态</Tag> : null}
          </Space>
        ),
      },
      {
        title: '命中原因',
        dataIndex: 'reasons',
        width: 340,
        render: (items) =>
          items.length > 0 ? (
            <Space direction="vertical" size={2}>
              {items.map((item) => (
                <Text key={item}>{item}</Text>
              ))}
            </Space>
          ) : (
            '-'
          ),
      },
      {
        title: '不可见原因 / 备注',
        dataIndex: 'blockers',
        width: 420,
        render: (_, record) => {
          const items = [
            ...record.blockers,
            ...record.warnings,
            ...record.checks,
          ]
          return items.length > 0 ? (
            <Space direction="vertical" size={2}>
              {items.map((item) => (
                <Text key={item}>{item}</Text>
              ))}
            </Space>
          ) : (
            '-'
          )
        },
      },
    ],
    []
  )

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="开发与验收"
        title="协同任务调试"
        description="按 workflow_tasks、角色任务池、移动端可见性和 workflow_task_events 口径做只读诊断；用于解释任务是否进了角色池、手机端为什么能看到或看不到。"
        actions={
          <>
            <Link
              className="erp-secondary-button"
              to={WORKFLOW_TASK_DEBUG_DOC_PATH}
            >
              查看调试说明
            </Link>
            <Link
              className="erp-secondary-button"
              to="/erp/qa/business-chain-debug"
            >
              业务链路调试
            </Link>
          </>
        }
      />

      <SurfacePanel className="p-5">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="和业务链路调试并列，但职责不同"
            description="业务链路调试看一条业务主线是否走通、business_record 与 workflow_business_state 是否推进、下游任务是否生成；协同任务调试看任务是否正确创建、task_group / owner_role_key / assignee_id 是否正确、终态是否影响可见、PMC / boss / production 扩展可见性是否命中，以及 workflow_task_events 是否有处理、阻塞、完成、催办和升级留痕。"
          />
          <Alert
            type="warning"
            showIcon
            message="v1 前端诊断模式"
            description="当前不新增后端 API，不改 workflow API，不改 Ent schema；页面默认调用 listWorkflowTasks({ limit: 200 }) 读取最近 200 条任务，再在前端按筛选条件和移动端可见性规则诊断。"
          />
        </Space>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">
                任务查询
              </div>
              <Paragraph className="!mb-0 !text-slate-600">
                默认展示最近 200 条 workflow_tasks，按 updated_at / created_at
                倒序；筛选均在前端完成，不提供任何改数据按钮。
              </Paragraph>
            </div>
            <Space wrap>
              <Button onClick={resetFilters}>清空筛选</Button>
              <Button loading={loading} type="primary" onClick={loadTasks}>
                重新读取任务
              </Button>
            </Space>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FilterField label="关键词：source_no / task_name / task_group / source_type">
              <Input
                allowClear
                value={filters.keyword}
                placeholder="例如 SO-001 / shipment_release"
                onChange={(event) =>
                  updateFilter('keyword', event.target.value)
                }
              />
            </FilterField>
            <FilterField label="source_type">
              <Select
                allowClear
                showSearch
                value={filters.source_type || undefined}
                placeholder="全部"
                options={uniqueOptions(rows, 'source_type')}
                onChange={(value) => updateFilter('source_type', value)}
              />
            </FilterField>
            <FilterField label="source_no">
              <Input
                allowClear
                value={filters.source_no}
                placeholder="按来源单号包含匹配"
                onChange={(event) =>
                  updateFilter('source_no', event.target.value)
                }
              />
            </FilterField>
            <FilterField label="task_group">
              <Select
                allowClear
                showSearch
                value={filters.task_group || undefined}
                placeholder="全部"
                options={uniqueOptions(rows, 'task_group')}
                onChange={(value) => updateFilter('task_group', value)}
              />
            </FilterField>
            <FilterField label="task_status_key">
              <Select
                allowClear
                value={filters.task_status_key || undefined}
                placeholder="全部"
                options={TASK_WORKFLOW_STATES.map((state) => ({
                  value: state.key,
                  label: `${state.label} / ${state.key}`,
                }))}
                onChange={(value) => updateFilter('task_status_key', value)}
              />
            </FilterField>
            <FilterField label="business_status_key">
              <Select
                allowClear
                showSearch
                value={filters.business_status_key || undefined}
                placeholder="全部"
                options={BUSINESS_WORKFLOW_STATES.map((state) => ({
                  value: state.key,
                  label: `${state.label} / ${state.key}`,
                }))}
                onChange={(value) => updateFilter('business_status_key', value)}
              />
            </FilterField>
            <FilterField label="owner_role_key">
              <Select
                allowClear
                value={filters.owner_role_key || undefined}
                placeholder="全部"
                options={WORKFLOW_TASK_DEBUG_ROLE_OPTIONS.map((role) => ({
                  value: role.key,
                  label: role.label,
                }))}
                onChange={(value) => updateFilter('owner_role_key', value)}
              />
            </FilterField>
            <FilterField label="assignee_id">
              <Input
                allowClear
                value={filters.assignee_id}
                placeholder="例如 12"
                onChange={(event) =>
                  updateFilter('assignee_id', event.target.value)
                }
              />
            </FilterField>
            <FilterField label="priority">
              <Input
                allowClear
                value={filters.priority}
                placeholder="0-5"
                onChange={(event) =>
                  updateFilter('priority', event.target.value)
                }
              />
            </FilterField>
            <FilterField label="alert_level">
              <Select
                allowClear
                value={filters.alert_level || undefined}
                placeholder="全部"
                options={ALERT_LEVEL_OPTIONS}
                onChange={(value) => updateFilter('alert_level', value)}
              />
            </FilterField>
            <BooleanFilterFields
              filters={filters}
              onFilterChange={updateFilter}
            />
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <SummaryTile title="加载任务" value={summary.total} />
            <SummaryTile title="筛选结果" value={summary.filtered} />
            <SummaryTile title="阻塞" value={summary.blocked} />
            <SummaryTile title="超时" value={summary.overdue} />
            <SummaryTile title="关键路径" value={summary.criticalPath} />
            <SummaryTile title="终态" value={summary.terminal} />
          </div>
          <Table
            rowKey="key"
            size="small"
            loading={loading}
            columns={taskColumns}
            dataSource={filteredRows}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            expandable={{
              expandedRowRender: renderExpandedTaskPayload,
            }}
            locale={{ emptyText: <Empty description="暂无匹配任务" /> }}
            scroll={{ x: 2150 }}
          />
        </Space>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <div className="text-lg font-semibold text-slate-900">
              workflow_task_events 事件轨迹
            </div>
            <Paragraph className="!mb-0 !text-slate-600">
              先在任务表点击“查看事件”。当前 workflow API 未提供按 task_id
              查询事件接口；如果 list_tasks 未来返回 events，页面会直接展示。
            </Paragraph>
          </div>
          {!selectedTask ? (
            <Empty description="请选择一个任务查看事件轨迹" />
          ) : eventRows.length > 0 ? (
            <Table
              rowKey="key"
              size="small"
              pagination={false}
              columns={eventColumns}
              dataSource={eventRows}
              scroll={{ x: 1270 }}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="任务事件接口待接入"
              description={`已选择任务：${selectedTask.task_name || selectedTask.task_code || selectedTask.id}。真实排查仍应核对 workflow_task_events 中的状态变化、催办、升级、阻塞和完成留痕。`}
            />
          )}
        </Space>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <div className="text-lg font-semibold text-slate-900">
              移动端可见性诊断
            </div>
            <Paragraph className="!mb-0 !text-slate-600">
              这里复用 mobileTaskQueries 和 mobileTaskView
              规则，说明角色会怎样加载任务、任务是否应该显示，以及不可见原因。
            </Paragraph>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <FilterField label="role_key">
              <Select
                value={diagnosticRoleKey}
                options={WORKFLOW_TASK_DEBUG_ROLE_OPTIONS.map((role) => ({
                  value: role.key,
                  label: role.label,
                }))}
                onChange={setDiagnosticRoleKey}
              />
            </FilterField>
            <FilterField label="可选 source_no">
              <Input
                allowClear
                value={diagnosticSourceNo}
                placeholder="只诊断某个来源单号"
                onChange={(event) => setDiagnosticSourceNo(event.target.value)}
              />
            </FilterField>
            <FilterField label="可选 task_group">
              <Input
                allowClear
                value={diagnosticTaskGroup}
                placeholder="只诊断某个任务组"
                onChange={(event) => setDiagnosticTaskGroup(event.target.value)}
              />
            </FilterField>
          </div>
          <Card size="small" title="mobileTaskQueries 查询计划">
            <Space direction="vertical" size={8}>
              <Space size={[8, 8]} wrap>
                <Tag color="blue">
                  {visibilityDiagnostics.queryPlan.strategy}
                </Tag>
                <Tag>
                  {visibilityDiagnostics.queryPlan.loads_full_list
                    ? 'full list'
                    : 'owner_role_key 直查'}
                </Tag>
                <Text code>
                  {JSON.stringify(visibilityDiagnostics.queryPlan.queries)}
                </Text>
              </Space>
              <Text type="secondary">
                {visibilityDiagnostics.queryPlan.reason}
              </Text>
            </Space>
          </Card>
          {visibilityDiagnostics.rows.length > 0 ? (
            <Table
              rowKey="key"
              size="small"
              columns={visibilityColumns}
              dataSource={visibilityDiagnostics.rows}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={{ x: 1330 }}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="没有命中可诊断任务"
              description={visibilityDiagnostics.empty_reason}
            />
          )}
        </Space>
      </SurfacePanel>

      <SurfacePanel className="p-5">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <div className="text-lg font-semibold text-slate-900">
              业务、任务、角色绑定关系
            </div>
            <Paragraph className="!mb-0 !text-slate-600">
              RBAC 权限码只判断动作资格；owner_role_key 决定任务池；assignee_id
              决定具体人。PMC 和老板可以看风险与关注项，但不能代办其他角色事实。
            </Paragraph>
          </div>
          <Table
            rowKey="key"
            size="small"
            pagination={false}
            columns={[
              { title: '对象', dataIndex: 'object', width: 140 },
              { title: '绑定字段', dataIndex: 'field', width: 260 },
              { title: '对应表', dataIndex: 'table', width: 240 },
              { title: '说明', dataIndex: 'note' },
            ]}
            dataSource={WORKFLOW_TASK_BINDING_ROWS}
            scroll={{ x: 960 }}
          />
        </Space>
      </SurfacePanel>
    </div>
  )
}
