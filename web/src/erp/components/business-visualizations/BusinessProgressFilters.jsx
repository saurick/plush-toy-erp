import React from 'react'
import { Button, Input } from 'antd'
import FilterChip from '@/common/components/navigation/FilterChip'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import MobileFilterChoices from '../../mobile/components/MobileFilterChoices.jsx'
import useLiveSearch from '@/common/hooks/useLiveSearch'
import {
  PROGRESS_SCOPE_OPTIONS,
  progressDueOptions,
} from '../../utils/businessProgress.mjs'

const countLabel = (value) =>
  Number.isSafeInteger(value) ? value.toLocaleString('zh-CN') : '—'

export function ProgressDueFilters({
  query,
  counts,
  onChange,
  className = '',
  compact = false,
}) {
  return (
    <div
      className={`erp-progress-due-options ${className}`.trim()}
      role="group"
      aria-label="交期情况"
    >
      {progressDueOptions(query.scope).filter(({ value }) => !compact || value !== 'undated').map(({ value, label }) => (
        <FilterChip
          key={value}
          selected={query.due_status === value}
          removable={value !== 'all'}
          count={countLabel(counts?.[value === 'all' ? 'total' : value])}
          aria-label={`${label} ${countLabel(counts?.[value === 'all' ? 'total' : value])}`}
          onClick={() =>
            onChange({ due_status: query.due_status === value ? 'all' : value })
          }
        >
          {compact ? { all: '全部', overdue: '已逾期', due_soon: '7天内' }[value] : label}
        </FilterChip>
      ))}
    </div>
  )
}

export function ProgressBlockedFilter({ query, counts, taskAccess, onChange, compact = false }) {
  if (query.scope === 'ended') return null
  return (
    <FilterChip
      selected={query.blocked_only}
      removable
      disabled={taskAccess === false}
      count={countLabel(taskAccess === false ? undefined : counts?.blocked)}
      title={taskAccess === false ? '无权查看关联任务' : undefined}
      aria-label={`仅看任务受阻 ${countLabel(taskAccess === false ? undefined : counts?.blocked)}`}
      onClick={() => onChange({ blocked_only: !query.blocked_only })}
    >
      {compact ? '受阻' : '仅看任务受阻'}
    </FilterChip>
  )
}

export default function BusinessProgressFilterFields({
  query,
  counts,
  taskAccess,
  onChange,
  onDateRange,
  compact = false,
  resetKey,
}) {
  const owner = useLiveSearch({ value: query.owner, resetKey, onSearch: (value) => onChange({ owner: value }) })
  return (
    <div className={`erp-progress-filter-fields${compact ? ' erp-progress-filter-fields--compact' : ''}`}>
      <fieldset role={compact ? 'presentation' : undefined}>
        <legend>记录范围</legend>
        {compact ? <MobileFilterChoices label="记录范围" options={PROGRESS_SCOPE_OPTIONS} value={query.scope} onChange={(scope) => onChange({ scope })} /> : <SlidingSegmented
          block
          aria-label="记录范围"
          options={PROGRESS_SCOPE_OPTIONS}
          value={query.scope}
          onChange={(scope) => onChange({ scope })}
        />}
      </fieldset>
      <fieldset role={compact ? 'presentation' : undefined}>
        <legend>交期情况（单选）</legend>
        <ProgressDueFilters query={query} counts={counts} onChange={onChange} />
      </fieldset>
      {query.scope !== 'ended' && (
        <fieldset role={compact ? 'presentation' : undefined}>
          <legend>任务异常</legend>
          <ProgressBlockedFilter
            query={query}
            counts={counts}
            taskAccess={taskAccess}
            onChange={onChange}
          />
        </fieldset>
      )}
      {query.view === 'production' && (
        <fieldset role={compact ? 'presentation' : undefined}>
          <legend>销售关联</legend>
          <FilterChip
            selected={query.unlinked_only}
            removable
            count={countLabel(counts?.unlinked)}
            onClick={() => onChange({ unlinked_only: !query.unlinked_only })}
          >
            仅看未关联销售
          </FilterChip>
        </fieldset>
      )}
      {!compact && (
        <fieldset>
          <legend>处理人或业务负责人</legend>
          <Input
            aria-label="处理人或业务负责人"
            placeholder="输入姓名"
            maxLength={100}
            allowClear
            value={owner.value}
            onChange={owner.onChange}
            onCompositionStart={owner.onCompositionStart}
            onCompositionEnd={owner.onCompositionEnd}
            onPressEnter={owner.onPressEnter}
          />
        </fieldset>
      )}
      {!compact && (
        <fieldset>
          <legend>交期范围</legend>
          <Button block onClick={onDateRange}>
            {query.date_from || query.date_to ? `${query.date_from || '不限'} 至 ${query.date_to || '不限'}` : '自定义交期日期'}
          </Button>
        </fieldset>
      )}
    </div>
  )
}
