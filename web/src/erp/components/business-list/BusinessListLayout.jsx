import React from 'react'

import {
  CalendarOutlined,
  MoreOutlined,
  RollbackOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Grid,
  Input,
  Popconfirm,
  Popover,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  DATE_INPUT_DISPLAY_FORMAT,
  DATE_INPUT_VALUE_FORMAT,
  isDateInputAfter,
  isDateInputBefore,
  isDateInputRangeReversed,
  parseDateInputValue,
} from '../../utils/dateRange.mjs'

const { Text } = Typography

export {
  CollaborationPanelResizeHandle,
  CollaborationTaskPanel,
} from './CollaborationTaskPanel.jsx'
const BUSINESS_TABLE_DEFAULT_SCROLL_X = 960
const BUSINESS_TABLE_DEFAULT_COLUMN_WIDTH = 160
const BUSINESS_TABLE_MIN_COLUMN_WIDTH = 88
const BUSINESS_TABLE_SELECTION_COLUMN_WIDTH = 52
const PHONE_SELECTION_ACTION_LIMIT = 1
const TABLET_SELECTION_ACTION_LIMIT = 2
function joinClassNames(...items) {
  return items.filter(Boolean).join(' ')
}

function flattenSelectionActions(children) {
  const actions = []

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === React.Fragment) {
      actions.push(...flattenSelectionActions(child.props.children))
      return
    }
    if (child != null && child !== false) actions.push(child)
  })

  return actions
}

function inspectSelectionAction(action) {
  if (!React.isValidElement(action)) {
    return { actionable: false, enabled: false, score: -1 }
  }

  if (action.type === Tag) {
    return { actionable: false, enabled: false, score: -1 }
  }

  if (action.type === Button) {
    const enabled =
      action.props.disabled !== true && action.props.loading !== true
    if (action.props.type === 'primary') {
      return { actionable: true, enabled, score: 100 }
    }
    if (action.props.danger) {
      return { actionable: true, enabled, score: 10 }
    }
    if (action.props.type === 'link') {
      return { actionable: true, enabled, score: 0 }
    }
    return { actionable: true, enabled, score: 40 }
  }

  const nestedActions = flattenSelectionActions(action.props.children)
    .map(inspectSelectionAction)
    .filter((item) => item.actionable)
  if (nestedActions.length > 0) {
    const enabledNestedActions = nestedActions.filter((item) => item.enabled)
    const rankedNestedActions =
      enabledNestedActions.length > 0 ? enabledNestedActions : nestedActions
    const nestedScore = Math.max(
      ...rankedNestedActions.map((item) => item.score)
    )
    return {
      actionable: true,
      enabled:
        action.props.disabled !== true && enabledNestedActions.length > 0,
      score: action.type === Dropdown ? Math.min(nestedScore, 30) : nestedScore,
    }
  }

  // Shared action components such as the attachment button expose their
  // interaction internally, so keep them as normal-priority actions.
  if (typeof action.type === 'function' || typeof action.type === 'object') {
    return {
      actionable: true,
      enabled: action.props.disabled !== true && action.props.loading !== true,
      score: 30,
    }
  }

  return { actionable: false, enabled: false, score: -1 }
}

function partitionSelectionActions(children, limit) {
  const nodes = flattenSelectionActions(children)
  const descriptors = nodes.map((node, index) => ({
    index,
    node,
    ...inspectSelectionAction(node),
  }))
  const visibleIndexes = new Set(
    descriptors
      .filter((item) => item.actionable)
      .sort(
        (left, right) =>
          Number(right.enabled) - Number(left.enabled) ||
          right.score - left.score ||
          left.index - right.index
      )
      .slice(0, limit)
      .map((item) => item.index)
  )

  return {
    context: descriptors
      .filter((item) => !item.actionable)
      .map((item) => item.node),
    visible: descriptors
      .filter((item) => visibleIndexes.has(item.index))
      .map((item) => item.node),
    overflow: descriptors
      .filter((item) => item.actionable && !visibleIndexes.has(item.index))
      .map((item) => item.node),
  }
}

function callSelectionActionThenClose(handler, close, ...args) {
  try {
    return handler?.(...args)
  } finally {
    close()
  }
}

function wrapOverflowSelectionAction(action, close) {
  if (!React.isValidElement(action)) return action

  if (action.type === Button) {
    return React.cloneElement(action, {
      onClick: (...args) =>
        callSelectionActionThenClose(action.props.onClick, close, ...args),
    })
  }

  if (action.type === Popconfirm) {
    return React.cloneElement(action, {
      onConfirm: (...args) =>
        callSelectionActionThenClose(action.props.onConfirm, close, ...args),
    })
  }

  if (action.type === Dropdown) {
    const menu = action.props.menu || {}
    return React.cloneElement(action, {
      menu: {
        ...menu,
        onClick: (...args) =>
          callSelectionActionThenClose(menu.onClick, close, ...args),
      },
    })
  }

  if (action.props.children) {
    return React.cloneElement(
      action,
      undefined,
      React.Children.map(action.props.children, (child) =>
        wrapOverflowSelectionAction(child, close)
      )
    )
  }

  return action
}

function containsDeferredSelectionAction(action) {
  if (!React.isValidElement(action)) return false
  if (action.type === Popconfirm || action.type === Dropdown) return true
  return React.Children.toArray(action.props.children).some(
    containsDeferredSelectionAction
  )
}

function ResponsiveSelectionActions({ children, hasSelection }) {
  const screens = Grid.useBreakpoint()
  const [moreActionsOpen, setMoreActionsOpen] = React.useState(false)
  const moreActionsButtonRef = React.useRef(null)
  const moreActionsListRef = React.useRef(null)
  const compact = !screens.lg
  const visibleLimit = screens.md
    ? TABLET_SELECTION_ACTION_LIMIT
    : PHONE_SELECTION_ACTION_LIMIT
  const { context, visible, overflow } = React.useMemo(
    () => partitionSelectionActions(children, visibleLimit),
    [children, visibleLimit]
  )
  const closeMoreActions = React.useCallback(() => {
    setMoreActionsOpen(false)
  }, [])

  React.useEffect(() => {
    if (!compact || !hasSelection) setMoreActionsOpen(false)
  }, [compact, hasSelection])

  if (!compact || overflow.length === 0) {
    return (
      <Space
        wrap
        className="erp-business-selection-action-bar__actions erp-business-module-selection-actions"
      >
        {children}
      </Space>
    )
  }

  return (
    <>
      <div className="erp-business-selection-action-bar__actions erp-business-selection-action-bar__actions--compact erp-business-module-selection-actions">
        {context.length > 0 ? (
          <div className="erp-business-selection-action-bar__compact-context">
            {context}
          </div>
        ) : null}
        <div className="erp-business-selection-action-bar__compact-visible">
          {visible}
        </div>
        <Button
          ref={moreActionsButtonRef}
          className="erp-business-selection-action-bar__compact-more"
          disabled={!hasSelection}
          icon={<MoreOutlined />}
          aria-label={`更多操作，共 ${overflow.length} 项`}
          onClick={() => setMoreActionsOpen(true)}
        >
          更多操作
        </Button>
      </div>
      <Drawer
        rootClassName="erp-business-selection-action-drawer"
        title="更多操作"
        placement={screens.md ? 'right' : 'bottom'}
        width={screens.md ? 420 : undefined}
        height={screens.md ? undefined : 'min(70vh, 560px)'}
        open={moreActionsOpen}
        keyboard
        maskClosable
        destroyOnHidden={false}
        onClose={closeMoreActions}
        afterOpenChange={(open) => {
          window.requestAnimationFrame(() => {
            if (open) {
              moreActionsListRef.current
                ?.querySelector('button:not(:disabled)')
                ?.focus({ preventScroll: true })
              return
            }
            moreActionsButtonRef.current?.focus({ preventScroll: true })
          })
        }}
      >
        <div
          ref={moreActionsListRef}
          className="erp-business-selection-action-drawer__list"
        >
          {overflow.map((action, index) => (
            <div
              key={action?.key || `selection-overflow-action-${index}`}
              className="erp-business-selection-action-drawer__item"
              onClick={(event) => {
                if (
                  !containsDeferredSelectionAction(action) &&
                  event.target.closest('button')
                ) {
                  closeMoreActions()
                }
              }}
            >
              {wrapOverflowSelectionAction(action, closeMoreActions)}
            </div>
          ))}
        </div>
      </Drawer>
    </>
  )
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

function normalizeBusinessTableColumn(column) {
  if (!column || typeof column !== 'object') {
    return column
  }

  const nextColumn = { ...column }
  delete nextColumn.ellipsis
  if (Array.isArray(nextColumn.children)) {
    nextColumn.children = nextColumn.children.map(normalizeBusinessTableColumn)
  }

  return nextColumn
}

function normalizeBusinessTableColumns(columns = []) {
  return (Array.isArray(columns) ? columns : []).map(
    normalizeBusinessTableColumn
  )
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
                </div>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>
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
  searchHint,
  className = '',
  ...restProps
}) {
  const accessibleLabel = restProps['aria-label'] || searchHint || placeholder
  const title = restProps.title || searchHint || undefined

  return (
    <Input
      allowClear
      className={joinClassNames(
        'erp-business-filter-control erp-business-filter-control--search',
        className
      )}
      prefix={<SearchOutlined />}
      placeholder={placeholder}
      aria-label={accessibleLabel}
      title={title}
      value={value}
      onChange={onChange}
      onPressEnter={onPressEnter}
      {...restProps}
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
  const hasMultipleDateTypes = options.length > 1
  const selectedDateTypeLabel =
    options.find((option) => option.value === value)?.label || options[0]?.label
  const rangeInvalid = isDateInputRangeReversed(startValue, endValue)
  const startDisabledDate = React.useCallback(
    (current) => isDateInputAfter(current, endValue),
    [endValue]
  )
  const endDisabledDate = React.useCallback(
    (current) => isDateInputBefore(current, startValue),
    [startValue]
  )
  return (
    <div
      className={joinClassNames(
        'erp-business-filter-control erp-business-date-range-filter erp-business-module-date-filter',
        rangeInvalid ? 'erp-business-date-range-filter--invalid' : ''
      )}
    >
      {hasMultipleDateTypes ? (
        <>
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
        </>
      ) : selectedDateTypeLabel ? (
        <>
          <span
            className="erp-business-date-range-filter__type erp-business-date-range-filter__type-label"
            aria-label="日期类型"
          >
            {selectedDateTypeLabel}
          </span>
          <div className="erp-business-date-range-filter__divider" />
        </>
      ) : null}
      <div className="erp-business-date-range-filter__range">
        <DateInput
          aria-label="开始日期"
          className="erp-business-date-range-filter__date"
          placeholder="开始日期"
          status={rangeInvalid ? 'error' : undefined}
          value={startValue}
          disabledDate={endValue ? startDisabledDate : undefined}
          onChange={onStartChange}
        />
        <span aria-hidden="true">-</span>
        <DateInput
          aria-label="结束日期"
          className="erp-business-date-range-filter__date"
          placeholder="结束日期"
          status={rangeInvalid ? 'error' : undefined}
          value={endValue}
          disabledDate={startValue ? endDisabledDate : undefined}
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
  onClearFilters = null,
  clearFiltersDisabled = false,
  children,
  compact = false,
}) {
  const hasToolbar = Boolean(actions || primaryAction)
  const hasClearFilters = typeof onClearFilters === 'function'
  return (
    <Card
      className={joinClassNames(
        'erp-business-operation-panel',
        compact ? 'erp-business-operation-panel--compact' : ''
      )}
    >
      <div className="erp-business-operation-panel__filters">
        {filters}
        {hasClearFilters ? (
          <Button
            className="erp-business-filter-control erp-business-filter-control--clear"
            disabled={clearFiltersDisabled}
            icon={<RollbackOutlined />}
            onClick={onClearFilters}
          >
            清空筛选
          </Button>
        ) : null}
      </div>
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
      </div>
      <ResponsiveSelectionActions hasSelection={hasSelection}>
        {children}
      </ResponsiveSelectionActions>
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
  const label = hasSelection
    ? selectedLabel || `已选择 ${selectedCount} 条记录`
    : '请选择一条记录'
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

const BUSINESS_DATA_TABLE_INTERACTIVE_TARGET = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  '[role="button"]',
  '[role="link"]',
  '.ant-table-selection-column',
  '.ant-radio-wrapper',
  '.ant-checkbox-wrapper',
  '.erp-business-row-expand-button',
].join(', ')

function isBusinessDataTableInteractiveTarget(target) {
  return Boolean(
    target instanceof Element &&
      target.closest(BUSINESS_DATA_TABLE_INTERACTIVE_TARGET)
  )
}

export function BusinessDataTable({
  tableHeader,
  loading,
  rowKey,
  columns,
  dataSource,
  tableLayout,
  expandable,
  scroll,
  rowSelection,
  rowClassName,
  onRow,
  onOpenRecord,
  onChange,
  pagination,
  emptyDescription = '暂无匹配记录',
}) {
  const resolvedColumns = React.useMemo(
    () => normalizeBusinessTableColumns(columns),
    [columns]
  )
  const resolvedRowSelection = React.useMemo(
    () => resolveBusinessTableRowSelection(rowSelection),
    [rowSelection]
  )
  const hasPageLocalSorter = React.useMemo(
    () =>
      Boolean(
        pagination &&
          resolvedColumns.some((column) => typeof column?.sorter === 'function')
      ),
    [pagination, resolvedColumns]
  )
  const resolvedScroll = React.useMemo(() => {
    const baseScroll =
      scroll && typeof scroll === 'object' && !Array.isArray(scroll)
        ? scroll
        : {}
    return {
      ...baseScroll,
      x: resolveBusinessTableScrollX({
        columns: resolvedColumns,
        rowSelection: resolvedRowSelection,
        scrollX: baseScroll.x,
      }),
    }
  }, [resolvedColumns, resolvedRowSelection, scroll])
  const resolvedOnRow = React.useCallback(
    (record, index) => {
      const rowProps = onRow?.(record, index) || {}
      if (typeof onOpenRecord !== 'function') return rowProps
      const userDoubleClick = rowProps.onDoubleClick
      return {
        ...rowProps,
        style: { cursor: 'pointer', ...(rowProps.style || {}) },
        title: rowProps.title || '单击选中，双击打开',
        onDoubleClick: (event) => {
          if (isBusinessDataTableInteractiveTarget(event?.target)) return
          userDoubleClick?.(event)
          if (!event?.defaultPrevented) onOpenRecord(record, event)
        },
      }
    },
    [onOpenRecord, onRow]
  )

  return (
    <Card className="erp-business-data-table-card erp-business-module-table-card">
      {tableHeader}
      <Table
        loading={loading}
        rowKey={rowKey}
        columns={resolvedColumns}
        dataSource={dataSource}
        tableLayout={tableLayout}
        expandable={expandable}
        scroll={resolvedScroll}
        rowSelection={resolvedRowSelection}
        rowClassName={rowClassName}
        onRow={resolvedOnRow}
        onChange={onChange}
        pagination={pagination}
        showSorterTooltip={
          hasPageLocalSorter ? { title: '仅排序当前页' } : undefined
        }
        locale={{
          emptyText: <Empty description={emptyDescription} />,
        }}
      />
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
