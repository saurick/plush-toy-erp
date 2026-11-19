import React, { useEffect, useState } from 'react'
import { Alert, Button } from 'antd'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { listBusinessProgressOwners } from '../../api/businessProgressApi.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import FilterChip from '@/common/components/navigation/FilterChip'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented.jsx'
import RemoteReferenceSelect, { ReferenceRecordsProvider } from '../RemoteReferenceSelect.jsx'
import FilterSelect from '@/common/components/select/FilterSelect.jsx'
import FilterField from '@/common/components/navigation/FilterField.jsx'
import { savedTextFilterValue, withSavedTextFilter } from '../../utils/businessFilterPresentation.mjs'
import { canReadReference } from '../../utils/remoteReferences.mjs'
import MobileFilterChoices from '../../mobile/components/MobileFilterChoices.jsx'
import {
  PROGRESS_SCOPE_OPTIONS,
  PROGRESS_DELIVERY_STATUS_OPTIONS,
  progressDueOptions,
} from '../../utils/businessProgress.mjs'

const countLabel = (value) =>
  Number.isSafeInteger(value) ? value.toLocaleString('zh-CN') : '—'

const deliveryViews = [{ value: 'orders', label: '整单' }, { value: 'lines', label: '产品明细' }]

export function ProgressDeliverySwitch({ query, onChange }) {
  return <SlidingSegmented aria-label="交付查看方式" hierarchy="secondary" options={deliveryViews} value={query.display || 'orders'} onChange={onChange} />
}

export function ProgressDeliveryFilters({ query, counts, onChange }) {
  return (
    <div className="erp-progress-due-options" role="group" aria-label="交付明细状态">
      {PROGRESS_DELIVERY_STATUS_OPTIONS.map(({ value, label }) => {
        const count = countLabel(value === 'all' ? counts?.total : counts?.delivery?.[value] ?? counts?.[value])
        return (
          <FilterChip
            key={value}
            selected={query.delivery_status === value}
            removable={value !== 'all'}
            count={`${count} 条`}
            onClick={() => onChange({ delivery_status: query.delivery_status === value ? 'all' : value })}
          >
            {label}
          </FilterChip>
        )
      })}
    </div>
  )
}

export function ProgressDueFilters({
  query,
  counts,
  onChange,
  className = 'erp-progress-due-options',
  compact = false,
}) {
  return (
    <div
      className={className}
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
  if (query.scope === 'ended' || query.display === 'lines') return null
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

function ProgressOwnerFilter({ query, onChange }) {
  const [state, setState] = useState({ loading: true, options: [], error: '' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState({ loading: true, options: [], error: '' })
    listBusinessProgressOwners(query.view, { signal: controller.signal })
      .then((names) => {
        if (!controller.signal.aborted) {
          setState({ loading: false, options: names.map((name) => ({ label: name, value: name })), error: '' })
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ loading: false, options: [], error: getActionErrorMessage(error, '读取负责人名单') })
        }
      })
    return () => controller.abort()
  }, [query.view, retry])

  const label = '处理人或业务负责人'
  return (
    <FilterField label={label}>
      <FilterSelect
        label={false}
        aria-label={label}
        placeholder="请选择人员"
        showSearch
        optionFilterProp="label"
        loading={state.loading}
        value={query.owner_name || (query.owner ? savedTextFilterValue : '')}
        options={withSavedTextFilter(state.options, query.owner)}
        onChange={(name) => onChange({ owner_name: name, owner: '' })}
      />
      {state.error && <Alert type="error" showIcon message={state.error} action={<Button onClick={() => setRetry((value) => value + 1)}>重试</Button>} />}
    </FilterField>
  )
}

export default function BusinessProgressFilterFields({
  query,
  counts,
  taskAccess,
  onChange,
  onDateRange,
  compact = false,
  open,
  adminProfile,
}) {
  const fields = (
    <>
      {compact ? <MobileFilterChoices label="记录范围" options={PROGRESS_SCOPE_OPTIONS} value={query.scope} onChange={(scope) => onChange({ scope })} /> : <FilterChipGroup
        label="记录范围"
        className="erp-business-filter-field--choices"
        options={PROGRESS_SCOPE_OPTIONS}
        value={query.scope}
        onChange={(scope) => onChange({ scope })}
      />}
      {query.display !== 'lines' && (
        <FilterField label="交期情况（单选）" className="erp-business-filter-field--choices">
          <ProgressDueFilters className={compact ? undefined : 'erp-filter-chip-group'} query={query} counts={counts} onChange={onChange} />
        </FilterField>
      )}
      {query.scope !== 'ended' && query.display !== 'lines' && (
        <FilterField label="任务异常" className="erp-business-filter-field--choices">
          <ProgressBlockedFilter
            query={query}
            counts={counts}
            taskAccess={taskAccess}
            onChange={onChange}
          />
        </FilterField>
      )}
      {query.view === 'orders' && canReadReference(adminProfile, 'customers') && (
        <ReferenceRecordsProvider component={FilterField} label="客户" adminProfile={adminProfile}>
          <RemoteReferenceSelect
            referenceType="customers"
            component={FilterSelect}
            label={false}
            aria-label="客户"
            options={[{ label: '全部客户', value: '' }]}
            value={query.customer_id || ''}
            onChange={(value) => onChange({ customer_id: value || '' })}
            showSearch
          />
        </ReferenceRecordsProvider>
      )}
      {query.view === 'production' && (
        <FilterField label="销售关联" className="erp-business-filter-field--choices">
          <FilterChip
            selected={query.unlinked_only}
            removable
            count={countLabel(counts?.unlinked)}
            onClick={() => onChange({ unlinked_only: !query.unlinked_only })}
          >
            仅看未关联销售
          </FilterChip>
        </FilterField>
      )}
      {!compact && open && (
        <ProgressOwnerFilter
          key={`${query.view}:${workflowTaskAdminAccessRequestIdentity(adminProfile)}`}
          query={query}
          onChange={onChange}
        />
      )}
      {!compact && (
        <FilterField label="交期范围">
          <Button block onClick={onDateRange}>
            {query.date_from || query.date_to ? `${query.date_from || '不限'} 至 ${query.date_to || '不限'}` : '自定义交期日期'}
          </Button>
        </FilterField>
      )}
    </>
  )
  return compact ? <div className="erp-progress-filter-fields">{fields}</div> : fields
}
