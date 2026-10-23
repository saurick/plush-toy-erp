import React from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Space, Tag, Typography } from 'antd'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { buildWorkflowTaskResponsibilityItems } from '../../utils/workflowTaskEventPresentation.mjs'
import Table from '@/common/components/table/AppTable'
import useBusinessListStickyHeader from '../business-list/useBusinessListStickyHeader.js'
import FilterChip from '@/common/components/navigation/FilterChip'
import WorkflowTaskIdentity from './WorkflowTaskIdentity.jsx'
import { WorkflowTaskSource } from './WorkflowTaskCopy.jsx'
import WorkflowTaskTiming from './WorkflowTaskTiming.jsx'
import { openWorkflowTaskRow } from '../../utils/workflowTaskEntry.mjs'
import { SearchInput } from '../business-list/BusinessListLayout.jsx'
import {
  TASK_BOARD_LANE_DEFINITIONS,
  getWorkflowTaskReason,
  getWorkflowTaskStatusRiskTags,
} from '../../utils/workflowTaskBoard.mjs'

const { Paragraph, Text, Title } = Typography

export function TaskBoardSearch({ value, onSearch }) {
  const search = { value, onSearch }
  return (
    <SearchInput
      placeholder="订单 / 产品 / 物料 / 款号"
      searchHint="可搜索：任务、单号、产品、款号、物料、处理原因"
      showSearchScope
      {...search}
    />
  )
}

export function TaskBoardProgressRail({
  activeLane,
  counts,
  ready,
  onSelectLane,
  mode,
}) {
  return (
    <nav className="erp-task-progress-rail" aria-label="任务分类">
      <FilterChip
        className={`erp-task-progress-rail__item erp-task-progress-rail__item--overview${activeLane === 'all' ? ' is-active' : ''}`}
        selected={activeLane === 'all'}
        aria-label="任务概览"
        onClick={() => onSelectLane('all')}
      >
        <span className="erp-task-progress-rail__label">概览</span>
      </FilterChip>
      {TASK_BOARD_LANE_DEFINITIONS.filter(
        (lane) => mode !== 'todo' || lane.key !== 'finished'
      ).map((lane) => (
        <FilterChip
          key={lane.key}
          data-lane={lane.key}
          className={`erp-task-progress-rail__item${activeLane === lane.key ? ' is-active' : ''}`}
          selected={activeLane === lane.key}
          removable
          aria-label={`${lane.title}，${ready ? `${counts[lane.key]} 项` : '数量读取中'}`}
          onClick={() =>
            onSelectLane(activeLane === lane.key ? 'all' : lane.key)
          }
        >
          <span className="erp-task-progress-rail__label">{lane.title}</span>
          <strong className="erp-task-progress-rail__value">
            {ready ? counts[lane.key] : '—'}
          </strong>
        </FilterChip>
      ))}
    </nav>
  )
}

const PRODUCT_CORE_REVIEW_ENTRIES = Object.freeze([
  {
    key: 'business-dashboard',
    title: '进度看板',
    path: '/erp/business-dashboard',
    description: '查看业务数量、办理情况和需要关注的事项。',
  },
  {
    key: 'sales-orders',
    title: '销售订单',
    path: '/erp/sales/project-orders/sales-orders',
    description: '查看销售订单状态、可用操作和填写内容。',
  },
  {
    key: 'bom',
    title: '物料清单（BOM）/ 产品工程',
    path: '/erp/purchase/material-bom',
    description: '查看产品结构、材料用量、损耗和版本状态。',
  },
  {
    key: 'purchase',
    title: '采购与入库',
    path: '/erp/purchase/accessories',
    description: '查看采购订单与入库办理条件。',
  },
  {
    key: 'outsourcing',
    title: '委外加工',
    path: '/erp/outsourcing/orders',
    description: '查看加工合同、工序、回货和质检的衔接方式。',
  },
  {
    key: 'shipment',
    title: '出货与库存',
    path: '/erp/warehouse/shipments',
    description: '查看出货放行、出库、库存和应收的办理顺序。',
  },
])

const PRODUCT_CORE_CONTROL_ENTRIES = Object.freeze([
  {
    key: 'print',
    title: '模板打印中心',
    path: '/erp/print-center',
    description: '查看可用打印模板和客户默认内容。',
  },
  {
    key: 'permissions',
    title: '权限管理',
    path: '/erp/system/permissions',
    description: '维护员工账号、岗位和功能权限。',
  },
  {
    key: 'audit',
    title: '系统操作记录',
    path: '/erp/system/audit-logs',
    description: '查看客户业务设置变更和系统管理操作记录。',
  },
])

export function ProductCoreDashboard({ onNavigate }) {
  return (
    <Card
      className="erp-dashboard-card erp-product-core-dashboard"
      variant="borderless"
      data-product-core-dashboard="true"
    >
      <div className="erp-product-core-dashboard__hero">
        <div>
          <Text type="secondary">功能预览</Text>
          <Title level={3} className="erp-command-center-hero-title">
            系统功能总览
          </Title>
          <Paragraph className="erp-dashboard-summary">
            这里用于查看系统已配置的功能和设置。当前尚未连接客户业务数据，因此不会显示订单、库存、待办任务或财务记录。
          </Paragraph>
        </div>
        <Space wrap>
          <Tag color="blue">不显示客户业务数据</Tag>
          <Tag color="green">功能预览</Tag>
          <Tag>尚未连接客户环境</Tag>
        </Space>
      </div>

      <div className="erp-product-core-dashboard__grid">
        <section className="erp-product-core-panel">
          <div className="erp-product-core-panel__head">
            <Title level={5}>业务功能</Title>
            <Text type="secondary">
              可查看页面说明、填写内容和可用操作；不会读取客户业务记录。
            </Text>
          </div>
          <div className="erp-product-core-entry-grid">
            {PRODUCT_CORE_REVIEW_ENTRIES.map((entry) => (
              <button
                type="button"
                key={entry.key}
                className="erp-product-core-entry"
                onClick={() => onNavigate(entry.path)}
              >
                <strong>{entry.title}</strong>
                <span>{entry.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="erp-product-core-panel">
          <div className="erp-product-core-panel__head">
            <Title level={5}>系统设置</Title>
            <Text type="secondary">
              这里管理客户业务设置、员工权限和操作记录，不办理具体业务。
            </Text>
          </div>
          <Space direction="vertical" size={10} className="erp-dashboard-block">
            {PRODUCT_CORE_CONTROL_ENTRIES.map((entry) => (
              <div className="erp-command-center-focus-item" key={entry.key}>
                <div className="erp-command-center-focus-copy">
                  <Text strong>{entry.title}</Text>
                  <Text type="secondary">{entry.description}</Text>
                </div>
                <Button size="small" onClick={() => onNavigate(entry.path)}>
                  进入
                </Button>
              </div>
            ))}
          </Space>
        </section>
      </div>
    </Card>
  )
}

export function getWorkflowTaskStableKey(task) {
  return String(task?.id || task?.task_code || '')
}

export function TaskTitleEntry({
  task,
  onOpenTask,
  compact = false,
}) {
  const name = getWorkflowTaskDisplayName(task)
  return (
    <button
      type="button"
      className={`erp-task-title-entry${compact ? ' erp-task-title-entry--compact' : ''}`}
      aria-label={`查看${name}详情`}
      aria-haspopup="dialog"
      data-task-entry
      onClick={(event) => {
        event.stopPropagation()
        event.currentTarget.focus({ preventScroll: true })
        onOpenTask(task)
      }}
    >
      <span>{name}</span>
      {!compact ? <ArrowRightOutlined aria-hidden="true" /> : null}
    </button>
  )
}

export function openTaskTableRow(event, task, onOpenTask) {
  openWorkflowTaskRow(event, () => onOpenTask(task))
}

export function TaskLane({ lane, keyword = '', loading = false, focused, onOpenTask }) {
  const tableRef = React.useRef(null)
  const sticky = useBusinessListStickyHeader(tableRef, true)
  return (
    <section
      ref={tableRef}
      className={`erp-task-board-lane erp-task-board-lane--${lane.key}${focused ? ' erp-task-board-lane--focused' : ''}`}
      aria-label={focused ? lane.title : '待处理预览'}
      aria-busy={loading}
    >
      <Table
        className="erp-work-center-table"
        sticky={sticky}
        scrollToolbar
        size="middle"
        rowKey={getWorkflowTaskStableKey}
        loading={loading}
        dataSource={lane.tasks}
        scroll={{ x: 900 }}
        rowClassName="erp-task-table-row"
        columns={[
          {
            align: 'left',
            title: '任务与关联内容',
            key: 'identity',
            width: '36%',
            render: (_, task) => (
              <div className="erp-workbench-task-cell">
                {task.returnedToPosition ? <Tag color="green">刚办理，保留原位置</Tag> : null}
                <WorkflowTaskIdentity
                  task={task}
                  keyword={keyword}
                  compact
                  layout="table"
                  showTaskName
                  renderCompactTitle={() => (
                    <TaskTitleEntry task={task} onOpenTask={onOpenTask} compact />
                  )}
                />
              </div>
            ),
          },
          {
            align: 'left',
            title: '关联单据 / 时间',
            key: 'source',
            width: '27%',
            render: (_, task) => (
              <div className="erp-workbench-task-cell">
                <WorkflowTaskSource task={task} showUnavailable={false} />
                <WorkflowTaskTiming task={task} includeKeys={['due', 'ended']} showDueRisk={!getWorkflowTaskStatusRiskTags(task).some((tag) => tag.key === 'overdue' || tag.key === 'due_soon')} />
              </div>
            ),
          },
          {
            align: 'left',
            title: lane.key === 'exception' ? '阻塞原因' : '状态与说明',
            key: 'reason',
            render: (_, task) => (
              <div className="erp-workbench-task-cell">
                <Space size={[4, 4]} wrap>
                  {getWorkflowTaskStatusRiskTags(task).map((tag) => (
                    <Tag key={tag.key} color={tag.color}>
                      {tag.label}
                    </Tag>
                  ))}
                </Space>
                {getWorkflowTaskReason(task) ? (
                  <Text
                    type={
                      task.task_status_key === 'blocked' ? 'danger' : undefined
                    }
                  >
                    {getWorkflowTaskReason(task)}
                  </Text>
                ) : null}
              </div>
            ),
          },
          {
            title: '负责岗位 / 处理人',
            key: 'responsibility',
            width: 180,
            render: (_, task) => (
              <Space direction="vertical" size={4}>
                {buildWorkflowTaskResponsibilityItems(task)
                  .slice(0, 2)
                  .map((item) => (
                    <Text
                      key={item.key}
                      type={item.key === 'assignee' ? 'secondary' : undefined}
                    >
                      {item.value}
                    </Text>
                  ))}
              </Space>
            ),
          },
        ]}
        onRow={(task) => ({
          'data-task-id': task.id,
          'data-task-code': task.task_code,
          'data-task-group': task.task_group,
          onClick: (event) => openTaskTableRow(event, task, onOpenTask),
        })}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                lane.key === 'overview'
                  ? '当前范围暂无待处理任务'
                  : '当前分类暂无匹配任务'
              }
            />
          ),
        }}
      />
    </section>
  )
}

export function WorkbenchQueueEmpty({
  activeOption,
  fallbackOption,
  onSwitchQueue,
}) {
  const description = fallbackOption
    ? `${activeOption.label}暂无任务，可切到${fallbackOption.label}继续处理。`
    : '当前没有需要处理的任务。'

  return (
    <div className="erp-workbench-queue-empty">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
      {fallbackOption ? (
        <Button size="small" onClick={() => onSwitchQueue(fallbackOption.key)}>
          查看{fallbackOption.label}
        </Button>
      ) : null}
    </div>
  )
}
