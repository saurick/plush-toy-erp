import React from 'react'
import { SearchOutlined } from '@ant-design/icons'
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

const { Text } = Typography

function joinClassNames(...items) {
  return items.filter(Boolean).join(' ')
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
  ...restProps
}) {
  return (
    <Select
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

export function SelectionActionBar({ selectedCount, selectedLabel, children }) {
  const hasSelection = Number(selectedCount) > 0
  if (!hasSelection) return null

  return (
    <Card className="erp-business-selection-action-bar erp-business-module-current-action erp-business-selection-action-bar--active">
      <div className="erp-business-selection-action-bar__row">
        <div className="erp-business-selection-action-bar__copy erp-business-module-selection-block">
          <Text strong>已选 {selectedCount} 条</Text>
          <Tag
            className="erp-business-selection-action-bar__tag erp-business-module-selection-tag"
            color="green"
          >
            {selectedLabel || `已选择 ${selectedCount} 条记录`}
          </Tag>
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
  onRow,
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
        onRow={onRow}
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
  taskStatusLabels,
  roleLabelMap,
}) {
  return (
    <Card className="erp-business-collaboration-task-panel erp-business-module-task-card">
      <div className="erp-business-collaboration-task-panel__head erp-business-module-task-card__head">
        <strong>协同任务池</strong>
        <Tag>{tasks.length} 个任务</Tag>
      </div>
      <div className="erp-business-collaboration-task-panel__list erp-business-module-task-list">
        {tasks.length === 0 ? (
          <div className="erp-business-collaboration-task-panel__empty">
            <Text type="secondary">
              暂无协同任务，可从上方选中业务记录后创建。
            </Text>
          </div>
        ) : (
          tasks.slice(0, 6).map((task) => (
            <div
              key={task.id}
              className="erp-business-collaboration-task-panel__item erp-business-module-task-item"
            >
              <div>
                <strong>{task.task_name}</strong>
                <span>
                  {task.source_no || `${task.source_type} #${task.source_id}`}
                </span>
                {task.blocked_reason ? (
                  <span className="erp-business-collaboration-task-panel__reason erp-business-module-task-item__reason">
                    阻塞原因：{task.blocked_reason}
                  </span>
                ) : null}
              </div>
              <Tag>
                {roleLabelMap.get(task.owner_role_key) || task.owner_role_key}
              </Tag>
              <Tag color={task.task_status_key === 'blocked' ? 'red' : 'blue'}>
                {taskStatusLabels.get(task.task_status_key) ||
                  task.task_status_key}
              </Tag>
            </div>
          ))
        )}
      </div>
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
