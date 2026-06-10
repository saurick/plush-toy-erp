import React from 'react'

import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  buildBusinessCollaborationTaskPanelModel,
  getBusinessCollaborationTaskReason,
  getBusinessCollaborationTaskStatusKey,
  getBusinessCollaborationTaskUrgeMeta,
  isBusinessCollaborationTaskBlocking,
  isBusinessCollaborationTaskTerminal,
} from '../../utils/businessCollaborationTasks.mjs'

const { Text } = Typography
const DEFAULT_TASK_STATUS_LABELS = new Map([
  ['pending', '待处理'],
  ['ready', '可执行'],
  ['processing', '处理中'],
  ['blocked', '阻塞'],
  ['rejected', '退回'],
  ['done', '已完成'],
  ['closed', '已关闭'],
  ['cancelled', '已取消'],
])
const COLLABORATION_PANEL_MIN_HEIGHT = 320
const COLLABORATION_PANEL_DEFAULT_HEIGHT = 560
const COLLABORATION_PANEL_VIEWPORT_OFFSET = 180
const DESKTOP_RESIZE_MEDIA_QUERY = '(min-width: 769px)'

function joinClassNames(...items) {
  return items.filter(Boolean).join(' ')
}

function clampCollaborationPanelHeight(value) {
  const fallbackHeight = COLLABORATION_PANEL_DEFAULT_HEIGHT
  const numericValue = Number.isFinite(value) ? value : fallbackHeight
  const viewportHeight =
    typeof window === 'undefined'
      ? fallbackHeight + COLLABORATION_PANEL_VIEWPORT_OFFSET
      : window.innerHeight
  const maxHeight = Math.max(
    COLLABORATION_PANEL_MIN_HEIGHT,
    viewportHeight - COLLABORATION_PANEL_VIEWPORT_OFFSET
  )

  return Math.min(
    Math.max(numericValue, COLLABORATION_PANEL_MIN_HEIGHT),
    maxHeight
  )
}

export function BusinessPageLayout({ children, className = '' }) {
  return (
    <div className={joinClassNames('erp-business-page-layout', className)}>
      {children}
    </div>
  )
}

export function PageHeaderCard({
  sectionTitle,
  title,
  description,
  tags = null,
  stats = [],
  summary = null,
  compact = false,
}) {
  return (
    <Card
      className={joinClassNames(
        'erp-business-page-header-card erp-business-module-hero',
        compact ? 'erp-business-page-header-card--compact' : ''
      )}
    >
      <div className="erp-business-page-header-card__grid erp-business-module-hero__grid">
        <div className="erp-business-page-header-card__main erp-business-module-hero__main">
          <div>
            <Text type="secondary">{sectionTitle}</Text>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {tags ? (
            <div className="erp-business-page-header-card__tags erp-business-module-hero__tags">
              {tags}
            </div>
          ) : null}
        </div>
        {stats.length > 0 ? (
          <div className="erp-business-page-header-card__stats erp-business-module-stats">
            {stats.map((item) => (
              <div key={item.key || item.label}>
                <Text type="secondary">{item.label}</Text>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {summary ? (
        <div className="erp-business-page-header-card__summary erp-business-module-hero__footer">
          {summary}
        </div>
      ) : null}
    </Card>
  )
}

export function BusinessFilterPanel({
  children,
  actions = null,
  summary = null,
  compact = false,
}) {
  const hasAside = Boolean(actions || summary)
  return (
    <Card
      className={joinClassNames(
        'erp-business-filter-panel erp-business-module-filter-panel erp-business-module-toolbar',
        hasAside ? 'erp-business-filter-panel--with-actions' : '',
        compact ? 'erp-business-filter-panel--compact' : ''
      )}
    >
      <div className="erp-business-filter-panel__row erp-business-module-toolbar__row">
        <div className="erp-business-filter-panel__grid erp-business-module-toolbar__filters">
          {children}
        </div>
        {hasAside ? (
          <div className="erp-business-filter-panel__aside">
            {summary ? (
              <div className="erp-business-filter-panel__summary">
                {summary}
              </div>
            ) : null}
            {actions ? (
              <div className="erp-business-filter-panel__actions erp-business-module-toolbar__actions">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

export function SearchInput({
  value,
  onChange,
  onPressEnter,
  placeholder = '搜索关键词',
}) {
  return (
    <Input
      allowClear
      className="erp-business-filter-control erp-business-filter-control--search"
      prefix={<SearchOutlined />}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onPressEnter={onPressEnter}
    />
  )
}

export function SelectFilter({
  value,
  onChange,
  options,
  placeholder,
  mode,
  allowClear = false,
  maxTagCount,
  className = '',
  onOpenChange,
  onMouseDownCapture,
  ...restProps
}) {
  const selectRef = React.useRef(null)
  const scrollMobileSelectIntoView = React.useCallback((element) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(max-width: 768px)').matches
    ) {
      element?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
      })
    }
  }, [])
  const handleMouseDownCapture = React.useCallback(
    (event) => {
      scrollMobileSelectIntoView(event.currentTarget)
      onMouseDownCapture?.(event)
    },
    [onMouseDownCapture, scrollMobileSelectIntoView]
  )
  const handleOpenChange = React.useCallback(
    (open) => {
      if (
        open &&
        typeof window !== 'undefined' &&
        window.matchMedia?.('(max-width: 768px)').matches
      ) {
        window.requestAnimationFrame(() => {
          scrollMobileSelectIntoView(selectRef.current?.nativeElement)
          window.requestAnimationFrame(() => {
            window.dispatchEvent(new Event('scroll'))
            window.dispatchEvent(new Event('resize'))
          })
        })
      }
      onOpenChange?.(open)
    },
    [onOpenChange, scrollMobileSelectIntoView]
  )

  return (
    <Select
      ref={selectRef}
      className={joinClassNames(
        'erp-business-filter-control erp-business-filter-control--select',
        className
      )}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      mode={mode}
      allowClear={allowClear}
      maxTagCount={maxTagCount}
      onOpenChange={handleOpenChange}
      onMouseDownCapture={handleMouseDownCapture}
      {...restProps}
    />
  )
}

export function DateRangeFilter({
  options = [],
  value,
  onTypeChange,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  onOpenNativeDatePicker,
}) {
  return (
    <div className="erp-business-filter-control erp-business-date-range-filter erp-business-module-date-filter">
      <Select
        className="erp-business-date-range-filter__type"
        aria-label="日期类型"
        options={options}
        value={value || undefined}
        onChange={onTypeChange}
        classNames={{
          popup: { root: 'erp-business-module-select-popup' },
        }}
      />
      <div className="erp-business-date-range-filter__divider" />
      <div className="erp-business-date-range-filter__range">
        <Input
          aria-label="开始日期"
          title="开始日期"
          type="date"
          value={startValue}
          onChange={(event) => onStartChange(event.target.value)}
          onClick={onOpenNativeDatePicker}
        />
        <span aria-hidden="true">-</span>
        <Input
          aria-label="结束日期"
          title="结束日期"
          type="date"
          value={endValue}
          onChange={(event) => onEndChange(event.target.value)}
          onClick={onOpenNativeDatePicker}
        />
      </div>
    </div>
  )
}

export function BusinessListToolbar({ stats = [], actions = null }) {
  const hasStats = stats.length > 0
  if (!hasStats && !actions) return null
  return (
    <Card className="erp-business-list-toolbar erp-business-module-toolbar">
      <div className="erp-business-list-toolbar__row erp-business-module-toolbar__row">
        {hasStats ? (
          <div className="erp-business-list-toolbar__stats">
            {stats.map((item) => (
              <span
                key={item.key || item.label}
                className="erp-business-list-toolbar__stat"
              >
                <Text type="secondary">{item.label}</Text>
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>
        ) : null}
        {actions ? (
          <div className="erp-business-list-toolbar__actions erp-business-module-toolbar__actions">
            {actions}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

export function SelectionActionBar({
  selectedCount,
  selectedLabel,
  summaryItems = [],
  collaborationItems = [],
  boundaryText = '当前区域只提供记录操作和 Workflow 协同，不代表事实层已完成。',
  children,
}) {
  const hasSelection = Number(selectedCount) > 0

  return (
    <Card
      className={joinClassNames(
        'erp-business-selection-action-bar erp-business-module-current-action',
        hasSelection
          ? 'erp-business-selection-action-bar--active'
          : 'erp-business-selection-action-bar--empty'
      )}
    >
      <div className="erp-business-selection-action-bar__row">
        <div className="erp-business-selection-action-bar__copy erp-business-module-selection-block">
          <div className="erp-business-selection-action-bar__primary">
            <Text strong>当前操作</Text>
            <Tag
              className="erp-business-selection-action-bar__tag erp-business-module-selection-tag"
              color={hasSelection ? 'green' : 'default'}
            >
              {selectedLabel || `已选择 ${selectedCount} 条记录`}
            </Tag>
            <Tag color={hasSelection ? 'blue' : 'default'}>
              已选 {selectedCount} 条
            </Tag>
          </div>
          {summaryItems.length > 0 ? (
            <div className="erp-business-selection-action-bar__summary">
              {summaryItems.map((item) => (
                <span
                  key={item.key || `${item.label}-${item.value}`}
                  className="erp-business-selection-action-bar__summary-item"
                >
                  <Text type="secondary">{item.label}</Text>
                  <strong>{item.value}</strong>
                </span>
              ))}
            </div>
          ) : null}
          {collaborationItems.length > 0 ? (
            <div className="erp-business-selection-action-bar__collab">
              {collaborationItems.map((item) => (
                <Tag
                  key={item.key || `${item.label}-${item.value}`}
                  color={item.color || 'default'}
                >
                  {item.label} {item.value}
                </Tag>
              ))}
            </div>
          ) : null}
          <Text className="erp-business-selection-action-bar__hint">
            {boundaryText}
          </Text>
        </div>
        <Space
          wrap
          className="erp-business-selection-action-bar__actions erp-business-module-selection-actions"
        >
          {children}
        </Space>
      </div>
    </Card>
  )
}

export function BusinessDataTable({
  loading,
  rowKey,
  columns,
  dataSource,
  scroll,
  rowSelection,
  rowClassName,
  onRow,
  onChange,
  pagination,
  emptyDescription = '暂无业务记录，点击“新建记录”开始落盘',
}) {
  return (
    <Card className="erp-business-data-table-card erp-business-module-table-card">
      <Table
        loading={loading}
        rowKey={rowKey}
        columns={columns}
        dataSource={dataSource}
        scroll={scroll}
        rowSelection={rowSelection}
        rowClassName={rowClassName}
        onRow={onRow}
        onChange={onChange}
        pagination={pagination}
        locale={{
          emptyText: <Empty description={emptyDescription} />,
        }}
      />
    </Card>
  )
}

export function CollaborationTaskPanel({
  tasks = [],
  selectedTasks = [],
  selectedRecordLabel = '',
  taskStatusLabels,
  roleLabelMap,
  onUrgeTask,
  onCompleteTask,
  onBlockTask,
  urgingTaskID,
  taskActionLoadingID,
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [activeTaskTab, setActiveTaskTab] = React.useState('todo')
  const [panelHeight, setPanelHeight] = React.useState(null)
  const [isResizing, setIsResizing] = React.useState(false)
  const resizeStateRef = React.useRef(null)
  const statusLabels = taskStatusLabels || DEFAULT_TASK_STATUS_LABELS
  const roleLabels = roleLabelMap || new Map()
  const taskPanelModel = buildBusinessCollaborationTaskPanelModel({
    tasks,
    selectedTasks,
  })
  const panelStyle = panelHeight
    ? { '--erp-business-collaboration-panel-height': `${panelHeight}px` }
    : undefined
  const handleResizePointerDown = React.useCallback(
    (event) => {
      if (
        !expanded ||
        (event.pointerType === 'mouse' && event.button !== 0) ||
        typeof window === 'undefined' ||
        !window.matchMedia?.(DESKTOP_RESIZE_MEDIA_QUERY).matches
      ) {
        return
      }

      const cardBody = event.currentTarget.closest('.ant-card-body')
      const startHeight = clampCollaborationPanelHeight(
        cardBody?.getBoundingClientRect().height || panelHeight
      )

      resizeStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startHeight,
      }
      setIsResizing(true)
      event.currentTarget.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    },
    [expanded, panelHeight]
  )
  const handleResizePointerMove = React.useCallback((event) => {
    const resizeState = resizeStateRef.current
    if (!resizeState || resizeState.pointerId !== event.pointerId) return

    const nextHeight = clampCollaborationPanelHeight(
      resizeState.startHeight + resizeState.startY - event.clientY
    )
    setPanelHeight(nextHeight)
    event.preventDefault()
  }, [])
  const stopResize = React.useCallback((event) => {
    const resizeState = resizeStateRef.current
    if (resizeState && resizeState.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    resizeStateRef.current = null
    setIsResizing(false)
  }, [])
  const tabItems = [
    {
      key: 'todo',
      label: '本页待办',
      count: taskPanelModel.pageTasks.length,
      items: taskPanelModel.pageTasks,
      emptyText: '本页暂无协同任务，可从上方选中业务记录后创建。',
    },
    {
      key: 'current',
      label: '当前记录',
      count: taskPanelModel.currentRecordTasks.length,
      items: taskPanelModel.currentRecordTasks,
      emptyText: selectedRecordLabel
        ? '当前记录暂无协同任务，可从上方创建。'
        : '先选择一条业务记录，再查看当前记录协同。',
    },
    {
      key: 'blocked',
      label: '阻塞异常',
      count: taskPanelModel.blockedTasks.length,
      items: taskPanelModel.blockedTasks,
      emptyText: '暂无阻塞或退回协同任务。',
    },
    {
      key: 'done',
      label: '已完成',
      count: taskPanelModel.doneTasks.length,
      items: taskPanelModel.doneTasks,
      emptyText: '暂无已完成协同任务。',
    },
  ]
  const activeTab =
    tabItems.find((item) => item.key === activeTaskTab) || tabItems[0]
  const renderTaskList = (items, emptyText) => {
    if (items.length === 0) {
      return (
        <div className="erp-business-collaboration-task-panel__empty">
          <Text type="secondary">{emptyText}</Text>
        </div>
      )
    }

    return items.map((task) => {
      const taskStatusKey = getBusinessCollaborationTaskStatusKey(task)
      const isTerminal = isBusinessCollaborationTaskTerminal(task)
      const isBlocking = isBusinessCollaborationTaskBlocking(task)
      const taskReason = getBusinessCollaborationTaskReason(task)
      const urgeMeta = getBusinessCollaborationTaskUrgeMeta(task)
      const taskLoading =
        String(taskActionLoadingID || '') === String(task.id || '')

      return (
        <div
          key={task.id}
          className="erp-business-collaboration-task-panel__item erp-business-module-task-item"
        >
          <div className="erp-business-module-task-item__main">
            <strong>{task.task_name}</strong>
            <span>
              {task.source_no || `${task.source_type} #${task.source_id}`}
            </span>
            {taskReason ? (
              <span className="erp-business-collaboration-task-panel__reason erp-business-module-task-item__reason">
                阻塞原因：{taskReason}
              </span>
            ) : null}
            {urgeMeta.isUrged ? (
              <span className="erp-business-collaboration-task-panel__reason erp-business-module-task-item__reason">
                已催办 {urgeMeta.urgeCount} 次
                {urgeMeta.lastUrgeReason ? `：${urgeMeta.lastUrgeReason}` : ''}
              </span>
            ) : null}
          </div>
          <div className="erp-business-module-task-item__meta">
            <Tag>
              {roleLabels.get(task.owner_role_key) || task.owner_role_key}
            </Tag>
            <Tag color={isBlocking ? 'red' : isTerminal ? 'green' : 'blue'}>
              {statusLabels.get(taskStatusKey) || taskStatusKey}
            </Tag>
          </div>
          <Space
            wrap
            size={[6, 6]}
            className="erp-business-module-task-item__actions"
          >
            {onCompleteTask && !isTerminal ? (
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                loading={taskLoading}
                onClick={() => onCompleteTask(task)}
              >
                完成
              </Button>
            ) : null}
            {onBlockTask && !isTerminal ? (
              <Button
                size="small"
                danger
                icon={<ExclamationCircleOutlined />}
                disabled={taskLoading}
                onClick={() => onBlockTask(task)}
              >
                阻塞
              </Button>
            ) : null}
            {onUrgeTask && !isTerminal ? (
              <Button
                size="small"
                loading={String(urgingTaskID || '') === String(task.id)}
                disabled={taskLoading}
                onClick={() => onUrgeTask(task)}
              >
                催办
              </Button>
            ) : null}
          </Space>
        </div>
      )
    })
  }

  return (
    <Card
      className={joinClassNames(
        'erp-business-collaboration-task-panel erp-business-module-task-card',
        expanded ? 'erp-business-collaboration-task-panel--expanded' : '',
        isResizing ? 'erp-business-collaboration-task-panel--resizing' : ''
      )}
      style={panelStyle}
    >
      {expanded ? (
        <button
          type="button"
          className="erp-business-collaboration-task-panel__resize-handle"
          aria-label="上下拖动调整本页协同入口高度"
          title="上下拖动调整高度"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
        >
          <span
            className="erp-business-collaboration-task-panel__resize-bar"
            aria-hidden="true"
          />
        </button>
      ) : null}
      <div className="erp-business-collaboration-task-panel__head erp-business-module-task-card__head">
        <div>
          <strong>本页协同入口</strong>
          <Text type="secondary">
            只处理 Workflow 任务，不写库存、出货、财务、开票或收付款事实。
          </Text>
        </div>
        <Space wrap size={[6, 6]}>
          <Tag>{taskPanelModel.totalTaskCount} 个任务</Tag>
          <Tag color="blue">待办 {taskPanelModel.activeTaskCount}</Tag>
          <Tag color={taskPanelModel.blockedTaskCount > 0 ? 'red' : 'default'}>
            阻塞 {taskPanelModel.blockedTaskCount}
          </Tag>
          <Button
            size="small"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
          >
            {expanded ? '收起' : '展开'}
          </Button>
        </Space>
      </div>
      {expanded ? (
        <div className="erp-business-collaboration-task-panel__panel">
          <div className="erp-business-collaboration-task-panel__tabs">
            {tabItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={joinClassNames(
                  'erp-business-collaboration-task-panel__tab',
                  item.key === activeTab.key
                    ? 'erp-business-collaboration-task-panel__tab--active'
                    : ''
                )}
                onClick={() => setActiveTaskTab(item.key)}
              >
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            ))}
          </div>
          <div className="erp-business-collaboration-task-panel__active-head">
            <Text strong>{activeTab.label}</Text>
            <Text type="secondary">
              {activeTab.key === 'current'
                ? selectedRecordLabel || '未选择记录'
                : '按当前业务模块读取现有 workflow 任务'}
            </Text>
          </div>
          <div className="erp-business-collaboration-task-panel__list erp-business-module-task-list">
            {renderTaskList(activeTab.items, activeTab.emptyText)}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

export function ToolbarButton({ className = '', ...props }) {
  return (
    <Button
      className={joinClassNames('erp-business-toolbar-button', className)}
      {...props}
    />
  )
}
