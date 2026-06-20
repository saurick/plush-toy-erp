import React from 'react'

import {
  CalendarOutlined,
  CheckCircleOutlined,
  DownOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  UpOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  Popover,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import WorkflowTaskActionDrawer, {
  TASK_ACTION_META,
} from '../workflow/WorkflowTaskActionDrawer.jsx'
import {
  buildBusinessCollaborationTaskPanelModel,
  getBusinessCollaborationTaskReason,
  getBusinessCollaborationTaskStatusKey,
  getBusinessCollaborationTaskUrgeMeta,
  isBusinessCollaborationTaskBlocking,
  isBusinessCollaborationTaskTerminal,
} from '../../utils/businessCollaborationTasks.mjs'
import {
  canRunWorkflowTaskAction,
  getWorkflowTaskReadonlyReason,
} from '../../utils/workflowTaskBoard.mjs'
import { formatWorkflowTaskSource } from '../../utils/dashboardTaskDisplay.mjs'

const { Text } = Typography
const COLLABORATION_PANEL_DEFAULT_HEIGHT = 260
const COLLABORATION_PANEL_MIN_HEIGHT = 240
const COLLABORATION_PANEL_MAX_HEIGHT = 560
const BUSINESS_TABLE_DEFAULT_SCROLL_X = 960
const BUSINESS_TABLE_DEFAULT_COLUMN_WIDTH = 132
const BUSINESS_TABLE_MIN_COLUMN_WIDTH = 72
const BUSINESS_TABLE_SELECTION_COLUMN_WIDTH = 52
const DATE_INPUT_VALUE_FORMAT = 'YYYY-MM-DD'
const DATE_INPUT_DISPLAY_FORMAT = 'YYYY/MM/DD'
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

function joinClassNames(...items) {
  return items.filter(Boolean).join(' ')
}

function clampNumber(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue)
}

function resolveBusinessTableColumnWidth(column = {}) {
  if (Number.isFinite(column.width)) {
    return Math.max(column.width, BUSINESS_TABLE_MIN_COLUMN_WIDTH)
  }

  if (typeof column.width === 'string') {
    const pixelWidth = Number.parseFloat(column.width)
    if (Number.isFinite(pixelWidth) && column.width.trim().endsWith('px')) {
      return Math.max(pixelWidth, BUSINESS_TABLE_MIN_COLUMN_WIDTH)
    }
  }

  return BUSINESS_TABLE_DEFAULT_COLUMN_WIDTH
}

function resolveBusinessTableScrollX({ columns = [], rowSelection, scrollX }) {
  const estimatedColumnsWidth = columns.reduce(
    (total, column) => total + resolveBusinessTableColumnWidth(column),
    rowSelection ? BUSINESS_TABLE_SELECTION_COLUMN_WIDTH : 0
  )
  const estimatedScrollX = Math.max(
    BUSINESS_TABLE_DEFAULT_SCROLL_X,
    estimatedColumnsWidth
  )

  if (Number.isFinite(scrollX)) {
    return Math.max(scrollX, estimatedScrollX)
  }

  if (scrollX === true || scrollX == null) {
    return estimatedScrollX
  }

  return scrollX
}

function resolveBusinessTableRowSelection(rowSelection) {
  if (!rowSelection) return rowSelection

  if (rowSelection.type !== 'radio') return rowSelection

  const columnTitle =
    rowSelection.columnTitle && rowSelection.columnTitle !== '选择'
      ? rowSelection.columnTitle
      : null

  return {
    columnWidth: BUSINESS_TABLE_SELECTION_COLUMN_WIDTH,
    ...rowSelection,
    columnTitle,
  }
}

function resolveCollaborationPanelMaxHeight() {
  if (typeof window === 'undefined') return COLLABORATION_PANEL_MAX_HEIGHT
  const viewportMaxHeight = Math.floor(window.innerHeight - 140)
  return Math.max(
    COLLABORATION_PANEL_MIN_HEIGHT,
    Math.min(COLLABORATION_PANEL_MAX_HEIGHT, viewportMaxHeight)
  )
}

function parseDateInputValue(value) {
  const normalizedValue = String(value || '')
    .trim()
    .replaceAll('/', '-')
  if (!normalizedValue) return null
  const parsedValue = dayjs(normalizedValue)
  return parsedValue.isValid() ? parsedValue : null
}

export const DateInput = React.forwardRef(
  (
    {
      value,
      onChange,
      className = '',
      disabled = false,
      placeholder = '选择日期',
      allowClear = true,
      onClick,
      onMouseDown,
      ...restProps
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false)
    const pickerValue = parseDateInputValue(value)
    const handleChange = React.useCallback(
      (nextValue) => {
        onChange?.(nextValue ? nextValue.format(DATE_INPUT_VALUE_FORMAT) : '')
      },
      [onChange]
    )
    const handlePointerOpen = React.useCallback(
      (event) => {
        if (disabled) return
        if (event.target?.closest?.('.ant-picker-clear')) return
        setOpen(true)
      },
      [disabled]
    )
    const handleClick = React.useCallback(
      (event) => {
        handlePointerOpen(event)
        onClick?.(event)
      },
      [handlePointerOpen, onClick]
    )
    const handleMouseDown = React.useCallback(
      (event) => {
        handlePointerOpen(event)
        onMouseDown?.(event)
      },
      [handlePointerOpen, onMouseDown]
    )

    return (
      <DatePicker
        ref={ref}
        allowClear={allowClear}
        className={joinClassNames('erp-business-date-input', className)}
        disabled={disabled}
        format={DATE_INPUT_DISPLAY_FORMAT}
        inputReadOnly
        open={open}
        placeholder={placeholder}
        suffixIcon={<CalendarOutlined />}
        value={pickerValue}
        onChange={handleChange}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onOpenChange={setOpen}
        {...restProps}
      />
    )
  }
)

export function BusinessPageLayout({ children, className = '' }) {
  return (
    <div className={joinClassNames('erp-business-page-layout', className)}>
      {children}
    </div>
  )
}

export function PageHeaderCard({
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
              <div
                key={item.key || item.label}
                className="erp-business-page-header-card__stat erp-metric-readonly-card"
                aria-label={`${item.label} ${item.value}，只读摘要`}
              >
                <div className="erp-business-page-header-card__stat-head">
                  <Text type="secondary">{item.label}</Text>
                  <span className="erp-metric-readonly-card__badge">摘要</span>
                </div>
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
        'erp-business-filter-control erp-business-filter-control--select erp-business-filter-control--compact-select',
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
        <DateInput
          aria-label="开始日期"
          className="erp-business-date-range-filter__date"
          placeholder="开始日期"
          value={startValue}
          onChange={onStartChange}
        />
        <span aria-hidden="true">-</span>
        <DateInput
          aria-label="结束日期"
          className="erp-business-date-range-filter__date"
          placeholder="结束日期"
          value={endValue}
          onChange={onEndChange}
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

export function BusinessOperationPanel({
  filters,
  actions = null,
  primaryAction = null,
  children,
  compact = false,
}) {
  const hasToolbar = Boolean(actions || primaryAction)
  return (
    <Card
      className={joinClassNames(
        'erp-business-operation-panel',
        compact ? 'erp-business-operation-panel--compact' : ''
      )}
    >
      <div className="erp-business-operation-panel__filters">{filters}</div>
      {hasToolbar ? (
        <div className="erp-business-operation-panel__toolbar">
          {actions ? (
            <div className="erp-business-operation-panel__actions">
              {actions}
            </div>
          ) : null}
          {primaryAction ? (
            <div className="erp-business-operation-panel__primary">
              {primaryAction}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="erp-business-operation-panel__selection">{children}</div>
    </Card>
  )
}

export function SelectionActionBar({
  selectedCount,
  selectedLabel,
  selectedItems = [],
  summaryItems = [],
  collaborationItems = [],
  boundaryText = '',
  children,
  embedded = false,
}) {
  const hasSelection = Number(selectedCount) > 0
  const className = joinClassNames(
    'erp-business-selection-action-bar erp-business-module-current-action',
    hasSelection
      ? 'erp-business-selection-action-bar--active'
      : 'erp-business-selection-action-bar--empty',
    embedded ? 'erp-business-selection-action-bar--embedded' : ''
  )
  const content = (
    <div className="erp-business-selection-action-bar__row">
      <div className="erp-business-selection-action-bar__copy erp-business-module-selection-block">
        <div className="erp-business-selection-action-bar__primary">
          <Text strong>当前操作</Text>
          <SelectedItemsSummaryTag
            selectedCount={selectedCount}
            selectedLabel={selectedLabel}
            selectedItems={selectedItems}
          />
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
        {boundaryText ? (
          <Text className="erp-business-selection-action-bar__hint">
            {boundaryText}
          </Text>
        ) : null}
      </div>
      <Space
        wrap
        className="erp-business-selection-action-bar__actions erp-business-module-selection-actions"
      >
        {children}
      </Space>
    </div>
  )

  if (embedded) {
    return <div className={className}>{content}</div>
  }

  return <Card className={className}>{content}</Card>
}

export function SelectedItemsSummaryTag({
  selectedCount,
  selectedLabel,
  selectedItems = [],
}) {
  const hasSelection = Number(selectedCount) > 0
  const items = selectedItems
    .map((item, index) => ({
      key: item?.key ?? item?.id ?? `${item?.label || 'item'}-${index}`,
      label: String(item?.label ?? item?.name ?? item?.title ?? '').trim(),
      title: String(item?.title ?? item?.description ?? '').trim(),
    }))
    .filter((item) => item.label)
  const label = selectedLabel || `已选择 ${selectedCount} 条记录`
  const tag = (
    <Tag
      tabIndex={hasSelection && items.length > 0 ? 0 : undefined}
      className="erp-business-selection-action-bar__tag erp-business-module-selection-tag"
      color={hasSelection ? 'green' : 'default'}
    >
      {label}
    </Tag>
  )

  if (!hasSelection || items.length === 0) {
    return tag
  }

  return (
    <Popover
      trigger={['hover', 'click', 'focus']}
      placement="bottomLeft"
      overlayClassName="erp-business-selected-items-popover"
      title={`已选 ${selectedCount} 条`}
      content={
        <div className="erp-business-selected-items-popover__items">
          {items.map((item) => (
            <Tag
              key={item.key}
              title={item.title || item.label}
              className="erp-business-selected-items-popover__item"
            >
              {item.label}
            </Tag>
          ))}
        </div>
      }
    >
      {tag}
    </Popover>
  )
}

export function BusinessDataTable({
  tableHeader,
  loading,
  rowKey,
  columns,
  dataSource,
  expandable,
  scroll,
  rowSelection,
  rowClassName,
  onRow,
  onChange,
  pagination,
  emptyDescription = '暂无业务记录，点击“新建记录”开始落盘',
}) {
  const resolvedRowSelection = React.useMemo(
    () => resolveBusinessTableRowSelection(rowSelection),
    [rowSelection]
  )
  const resolvedScroll = React.useMemo(() => {
    const baseScroll =
      scroll && typeof scroll === 'object' && !Array.isArray(scroll)
        ? scroll
        : {}
    return {
      ...baseScroll,
      x: resolveBusinessTableScrollX({
        columns,
        rowSelection: resolvedRowSelection,
        scrollX: baseScroll.x,
      }),
    }
  }, [columns, resolvedRowSelection, scroll])

  return (
    <Card className="erp-business-data-table-card erp-business-module-table-card">
      {tableHeader}
      <Table
        loading={loading}
        rowKey={rowKey}
        columns={columns}
        dataSource={dataSource}
        expandable={expandable}
        scroll={resolvedScroll}
        rowSelection={resolvedRowSelection}
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

export function CollaborationPanelResizeHandle({
  height,
  minHeight = COLLABORATION_PANEL_MIN_HEIGHT,
  maxHeight = COLLABORATION_PANEL_MAX_HEIGHT,
  onHeightChange,
}) {
  const dragStateRef = React.useRef(null)
  const [dragging, setDragging] = React.useState(false)
  const applyHeight = React.useCallback(
    (nextHeight) => {
      onHeightChange(clampNumber(nextHeight, minHeight, maxHeight))
    },
    [maxHeight, minHeight, onHeightChange]
  )
  const handlePointerDown = React.useCallback(
    (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      dragStateRef.current = {
        pointerID: event.pointerId,
        startY: event.clientY,
        startHeight: height,
      }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDragging(true)
      event.preventDefault()
    },
    [height]
  )
  const handlePointerMove = React.useCallback(
    (event) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerID !== event.pointerId) return
      applyHeight(dragState.startHeight + dragState.startY - event.clientY)
      event.preventDefault()
    },
    [applyHeight]
  )
  const finishDrag = React.useCallback((event) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerID !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragStateRef.current = null
    setDragging(false)
  }, [])
  const handleKeyDown = React.useCallback(
    (event) => {
      const step = event.shiftKey ? 40 : 20
      if (event.key === 'ArrowUp') {
        applyHeight(height + step)
        event.preventDefault()
      } else if (event.key === 'ArrowDown') {
        applyHeight(height - step)
        event.preventDefault()
      } else if (event.key === 'Home') {
        applyHeight(minHeight)
        event.preventDefault()
      } else if (event.key === 'End') {
        applyHeight(maxHeight)
        event.preventDefault()
      }
    },
    [applyHeight, height, maxHeight, minHeight]
  )

  return (
    <button
      type="button"
      className={joinClassNames(
        'erp-business-collaboration-task-panel__resize-handle',
        dragging
          ? 'erp-business-collaboration-task-panel__resize-handle--dragging'
          : ''
      )}
      aria-label="拖动调整本页协同高度"
      title="拖动调整本页协同高度"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
    >
      <span className="erp-business-collaboration-task-panel__grip-bar" />
    </button>
  )
}

export function CollaborationTaskPanel({
  tasks = [],
  selectedTasks = [],
  selectedRecordLabel = '',
  adminProfile,
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
  const [panelHeight, setPanelHeight] = React.useState(
    COLLABORATION_PANEL_DEFAULT_HEIGHT
  )
  const [panelMaxHeight, setPanelMaxHeight] = React.useState(
    COLLABORATION_PANEL_MAX_HEIGHT
  )
  const [actionDrawerTask, setActionDrawerTask] = React.useState(null)
  const [actionDrawerMode, setActionDrawerMode] = React.useState('')
  const [actionDrawerReason, setActionDrawerReason] = React.useState('')
  const [actionDrawerSaving, setActionDrawerSaving] = React.useState(false)
  const tabIDPrefix = React.useId().replace(/:/g, '')
  const statusLabels = taskStatusLabels || DEFAULT_TASK_STATUS_LABELS
  const roleLabels = roleLabelMap || new Map()
  const hasAdminProfile = adminProfile && typeof adminProfile === 'object'
  const getTaskAllowedActionModes = React.useCallback(
    (task) =>
      [
        onCompleteTask &&
        (!hasAdminProfile ||
          canRunWorkflowTaskAction(adminProfile, task, 'complete'))
          ? 'complete'
          : '',
        onBlockTask &&
        (!hasAdminProfile ||
          canRunWorkflowTaskAction(adminProfile, task, 'block'))
          ? 'block'
          : '',
        onUrgeTask &&
        (!hasAdminProfile ||
          canRunWorkflowTaskAction(adminProfile, task, 'urge'))
          ? 'urge'
          : '',
      ].filter(Boolean),
    [adminProfile, hasAdminProfile, onBlockTask, onCompleteTask, onUrgeTask]
  )
  const actionDrawerAllowedModes = React.useMemo(
    () => getTaskAllowedActionModes(actionDrawerTask),
    [actionDrawerTask, getTaskAllowedActionModes]
  )
  const actionDrawerReadonlyReason = React.useMemo(
    () =>
      hasAdminProfile && actionDrawerTask
        ? getWorkflowTaskReadonlyReason(adminProfile, actionDrawerTask)
        : '',
    [actionDrawerTask, adminProfile, hasAdminProfile]
  )
  const taskPanelModel = React.useMemo(
    () =>
      buildBusinessCollaborationTaskPanelModel({
        tasks,
        selectedTasks,
      }),
    [selectedTasks, tasks]
  )
  const tabItems = React.useMemo(
    () => [
      {
        key: 'todo',
        label: '本页待办',
        count: taskPanelModel.pageTaskCount,
        items: taskPanelModel.pageTasks,
        emptyText: '本页暂无待处理 Workflow 任务。',
      },
      {
        key: 'current',
        label: '当前记录',
        count: taskPanelModel.currentRecordTaskCount,
        items: taskPanelModel.currentRecordTasks,
        emptyText: selectedRecordLabel
          ? '当前记录暂无 Workflow 任务。'
          : '先选择一条业务记录，再查看当前记录协同。',
      },
      {
        key: 'blocked',
        label: '阻塞异常',
        count: taskPanelModel.blockedTaskCount,
        items: taskPanelModel.blockedTasks,
        emptyText: '暂无阻塞或退回 Workflow 任务。',
      },
    ],
    [selectedRecordLabel, taskPanelModel]
  )
  const activeTab =
    tabItems.find((item) => item.key === activeTaskTab) || tabItems[0]
  const activeTabHiddenCount = Math.max(
    0,
    activeTab.count - activeTab.items.length
  )
  const activeTabIndex = Math.max(
    0,
    tabItems.findIndex((item) => item.key === activeTab.key)
  )
  const activeTabPanelID = `${tabIDPrefix}-${activeTab.key}-panel`
  const activeTabID = `${tabIDPrefix}-${activeTab.key}-tab`
  React.useEffect(() => {
    const syncPanelMaxHeight = () => {
      const nextMaxHeight = resolveCollaborationPanelMaxHeight()
      setPanelMaxHeight(nextMaxHeight)
      setPanelHeight((currentHeight) =>
        clampNumber(
          currentHeight,
          COLLABORATION_PANEL_MIN_HEIGHT,
          nextMaxHeight
        )
      )
    }
    syncPanelMaxHeight()
    window.addEventListener('resize', syncPanelMaxHeight)
    return () => window.removeEventListener('resize', syncPanelMaxHeight)
  }, [])
  const hasFocusedRecord = Boolean(
    selectedRecordLabel &&
      !/^(?:请先|已选择)/u.test(String(selectedRecordLabel).trim())
  )
  const summaryItems = [
    ...(hasFocusedRecord
      ? [
          {
            key: 'current',
            label: '当前',
            value: selectedRecordLabel,
            tone: 'blue',
          },
        ]
      : []),
    {
      key: 'todo',
      label: '待办',
      value: taskPanelModel.activeTaskCount,
      tone: taskPanelModel.activeTaskCount > 0 ? 'blue' : 'muted',
    },
    {
      key: 'blocked',
      label: '阻塞异常',
      value: taskPanelModel.blockedTaskCount,
      tone: taskPanelModel.blockedTaskCount > 0 ? 'red' : 'muted',
    },
  ]
  const handleTabKeyDown = React.useCallback(
    (event) => {
      const keyToOffset = {
        ArrowRight: 1,
        ArrowDown: 1,
        ArrowLeft: -1,
        ArrowUp: -1,
      }
      if (event.key === 'Home') {
        setActiveTaskTab(tabItems[0].key)
        event.preventDefault()
        return
      }
      if (event.key === 'End') {
        setActiveTaskTab(tabItems[tabItems.length - 1].key)
        event.preventDefault()
        return
      }
      const offset = keyToOffset[event.key]
      if (!offset) return
      const nextIndex =
        (activeTabIndex + offset + tabItems.length) % tabItems.length
      setActiveTaskTab(tabItems[nextIndex].key)
      event.preventDefault()
    },
    [activeTabIndex, tabItems]
  )
  const openActionDrawer = React.useCallback((task, mode) => {
    setActionDrawerTask(task)
    setActionDrawerMode(mode)
    setActionDrawerReason(
      mode === 'block' ? getBusinessCollaborationTaskReason(task) : ''
    )
  }, [])
  const closeActionDrawer = React.useCallback(() => {
    setActionDrawerTask(null)
    setActionDrawerMode('')
    setActionDrawerReason('')
  }, [])
  React.useEffect(() => {
    if (!actionDrawerTask) return

    const drawerTaskID = String(actionDrawerTask.id || '').trim()
    if (!drawerTaskID) {
      closeActionDrawer()
      return
    }

    const visibleTasks = [
      ...(Array.isArray(tasks) ? tasks : []),
      ...(Array.isArray(selectedTasks) ? selectedTasks : []),
    ]
    const taskStillVisible = visibleTasks.some(
      (task) => String(task?.id || '').trim() === drawerTaskID
    )
    if (!taskStillVisible) {
      closeActionDrawer()
    }
  }, [actionDrawerTask, closeActionDrawer, selectedTasks, tasks])
  const submitActionDrawer = React.useCallback(async () => {
    if (!actionDrawerTask || !actionDrawerMode) return
    const actionMeta = TASK_ACTION_META[actionDrawerMode]
    if (!actionMeta) return
    if (!actionDrawerAllowedModes.includes(actionDrawerMode)) {
      message.warning('当前账号不能提交这个任务动作')
      return
    }

    const reason = actionDrawerReason.trim()
    if (actionMeta.requireReason && !reason) {
      message.warning(`${actionMeta.title}需要填写原因`)
      return
    }

    const actionHandler =
      actionDrawerMode === 'complete'
        ? onCompleteTask
        : actionDrawerMode === 'block'
          ? onBlockTask
          : onUrgeTask

    if (!actionHandler) return

    setActionDrawerSaving(true)
    try {
      await actionHandler(actionDrawerTask, {
        actionMode: actionDrawerMode,
        reason,
      })
      closeActionDrawer()
    } catch (error) {
      message.error(getActionErrorMessage(error, `${actionMeta.title}失败`))
    } finally {
      setActionDrawerSaving(false)
    }
  }, [
    actionDrawerMode,
    actionDrawerReason,
    actionDrawerTask,
    actionDrawerAllowedModes,
    closeActionDrawer,
    onBlockTask,
    onCompleteTask,
    onUrgeTask,
  ])
  const renderTaskList = (items, emptyText, hiddenCount = 0) => {
    if (items.length === 0) {
      return (
        <div className="erp-business-collaboration-task-panel__empty">
          <Text type="secondary">{emptyText}</Text>
        </div>
      )
    }

    return (
      <>
        {items.map((task) => {
          const taskStatusKey = getBusinessCollaborationTaskStatusKey(task)
          const isTerminal = isBusinessCollaborationTaskTerminal(task)
          const isBlocking = isBusinessCollaborationTaskBlocking(task)
          const taskReason = getBusinessCollaborationTaskReason(task)
          const urgeMeta = getBusinessCollaborationTaskUrgeMeta(task)
          const taskAllowedActionModes = getTaskAllowedActionModes(task)
          const taskReadonlyReason =
            hasAdminProfile &&
            !isTerminal &&
            taskAllowedActionModes.length === 0
              ? getWorkflowTaskReadonlyReason(adminProfile, task)
              : ''
          const taskLoading =
            String(taskActionLoadingID || '') === String(task.id || '')

          return (
            <div
              key={task.id}
              className="erp-business-collaboration-task-panel__item erp-business-module-task-item"
            >
              <div className="erp-business-module-task-item__main">
                <strong>{task.task_name}</strong>
                <span>{formatWorkflowTaskSource(task)}</span>
                {taskReason ? (
                  <span className="erp-business-collaboration-task-panel__reason erp-business-module-task-item__reason">
                    阻塞原因：{taskReason}
                  </span>
                ) : null}
                {urgeMeta.isUrged ? (
                  <span className="erp-business-collaboration-task-panel__reason erp-business-module-task-item__reason">
                    已催办 {urgeMeta.urgeCount} 次
                    {urgeMeta.lastUrgeReason
                      ? `：${urgeMeta.lastUrgeReason}`
                      : ''}
                  </span>
                ) : null}
                {taskReadonlyReason ? (
                  <span className="erp-business-collaboration-task-panel__reason erp-business-module-task-item__reason">
                    只读：{taskReadonlyReason}
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
                {taskAllowedActionModes.includes('complete') && !isTerminal ? (
                  <Button
                    size="small"
                    icon={<CheckCircleOutlined />}
                    loading={taskLoading}
                    onClick={() => openActionDrawer(task, 'complete')}
                  >
                    完成
                  </Button>
                ) : null}
                {taskAllowedActionModes.includes('block') && !isTerminal ? (
                  <Button
                    size="small"
                    danger
                    icon={<ExclamationCircleOutlined />}
                    disabled={taskLoading}
                    onClick={() => openActionDrawer(task, 'block')}
                  >
                    阻塞
                  </Button>
                ) : null}
                {taskAllowedActionModes.includes('urge') && !isTerminal ? (
                  <Button
                    size="small"
                    loading={String(urgingTaskID || '') === String(task.id)}
                    disabled={taskLoading}
                    onClick={() => openActionDrawer(task, 'urge')}
                  >
                    催办
                  </Button>
                ) : null}
              </Space>
            </div>
          )
        })}
        {hiddenCount > 0 ? (
          <div className="erp-business-collaboration-task-panel__more-note">
            仅显示前 {items.length} 条，还有 {hiddenCount} 条
          </div>
        ) : null}
      </>
    )
  }

  return (
    <>
      <Card
        className={joinClassNames(
          'erp-business-collaboration-task-panel erp-business-module-task-card',
          expanded ? 'erp-business-collaboration-task-panel--expanded' : ''
        )}
        style={
          expanded
            ? {
                '--erp-business-collaboration-panel-height': `${panelHeight}px`,
              }
            : undefined
        }
      >
        <div className="erp-business-collaboration-task-panel__body">
          {expanded ? (
            <CollaborationPanelResizeHandle
              height={panelHeight}
              minHeight={COLLABORATION_PANEL_MIN_HEIGHT}
              maxHeight={panelMaxHeight}
              onHeightChange={setPanelHeight}
            />
          ) : null}
          <div className="erp-business-collaboration-task-panel__head erp-business-module-task-card__head">
            <div className="erp-business-collaboration-task-panel__title-line">
              <strong>本页协同</strong>
              <Text type="secondary">
                只处理 Workflow 任务，不写库存、出货、财务、开票或收付款事实。
              </Text>
              {!expanded ? (
                <span
                  className="erp-business-collaboration-task-panel__summary"
                  aria-live="polite"
                >
                  {summaryItems.map((item) => (
                    <span
                      key={item.key}
                      className={joinClassNames(
                        'erp-business-collaboration-task-panel__summary-item',
                        `erp-business-collaboration-task-panel__summary-item--${item.tone}`,
                        `erp-business-collaboration-task-panel__summary-item--${item.key}`
                      )}
                    >
                      <Text type="secondary">{item.label}</Text>
                      <strong>{item.value}</strong>
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
            <Space
              wrap={false}
              size={[6, 6]}
              className="erp-business-collaboration-task-panel__actions"
            >
              <Button
                size="small"
                icon={expanded ? <DownOutlined /> : <UpOutlined />}
                className="erp-business-collaboration-task-panel__toggle"
                onClick={() => setExpanded((current) => !current)}
                aria-expanded={expanded}
              >
                {expanded ? '收起' : '展开'}
              </Button>
            </Space>
          </div>
          {expanded ? (
            <div className="erp-business-collaboration-task-panel__panel">
              <div
                className="erp-business-collaboration-task-panel__tabs"
                role="tablist"
                aria-label="本页协同任务分类"
              >
                {tabItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    id={`${tabIDPrefix}-${item.key}-tab`}
                    role="tab"
                    aria-selected={item.key === activeTab.key}
                    aria-controls={`${tabIDPrefix}-${item.key}-panel`}
                    tabIndex={item.key === activeTab.key ? 0 : -1}
                    className={joinClassNames(
                      'erp-business-collaboration-task-panel__tab',
                      item.key === activeTab.key
                        ? 'erp-business-collaboration-task-panel__tab--active'
                        : ''
                    )}
                    onClick={() => setActiveTaskTab(item.key)}
                    onKeyDown={handleTabKeyDown}
                  >
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </button>
                ))}
              </div>
              <div
                id={activeTabPanelID}
                className="erp-business-collaboration-task-panel__list erp-business-module-task-list"
                role="tabpanel"
                aria-labelledby={activeTabID}
              >
                {renderTaskList(
                  activeTab.items,
                  activeTab.emptyText,
                  activeTabHiddenCount
                )}
              </div>
            </div>
          ) : null}
        </div>
      </Card>
      <WorkflowTaskActionDrawer
        task={actionDrawerTask}
        actionMode={actionDrawerMode}
        actionReason={actionDrawerReason}
        actionSaving={actionDrawerSaving}
        allowedActionModes={actionDrawerAllowedModes}
        readonlyReason={actionDrawerReadonlyReason}
        roleLabelMap={roleLabels}
        onActionModeChange={setActionDrawerMode}
        onActionReasonChange={setActionDrawerReason}
        onClose={closeActionDrawer}
        onSubmit={submitActionDrawer}
      />
    </>
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
