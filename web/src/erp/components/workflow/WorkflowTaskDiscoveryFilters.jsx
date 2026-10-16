import React from 'react'
import { Select, Tag } from 'antd'
import { getWorkflowTaskBoard } from '../../api/workflowApi.mjs'
import {
  workflowTaskDiscoveryCatalog as catalog,
  taskStagePath,
  taskDiscoveryFilterLabels,
} from '../../utils/workflowTaskDiscovery.mjs'
import WorkflowTaskSavedViews from './WorkflowTaskSavedViews.jsx'
import './workflowTaskDiscovery.css'

export default function WorkflowTaskDiscoveryFilters({
  value,
  onChange,
  profile,
  people,
  roleKey,
  compact = false,
}) {
  const [result, setResult] = React.useState(null)
  const scope = `${profile?.id}:${roleKey || ''}:${JSON.stringify(profile?.effective_session || profile?.permissions || [])}`
  React.useEffect(() => {
    if (people || !profile?.id) return undefined
    const controller = new AbortController()
    getWorkflowTaskBoard(
      { limit: 1, offset: 0, ...(roleKey ? { owner_role_key: roleKey } : {}) },
      { signal: controller.signal }
    )
      .then((data) => {
        if (!controller.signal.aborted)
          { setResult({ scope, people: data.assignees || [] }) }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          { setResult({ scope, people: [], error: true }) }
      })
    return () => controller.abort()
  }, [scope, profile?.id, roleKey, people])
  const assignees = people || (result?.scope === scope ? result.people : [])
  const change = (key, next) => onChange({ ...value, [key]: next || '' })
  const stages = catalog.stages.filter(
    (stage) =>
      (!value.chainKey || stage.chain === value.chainKey) &&
      (!value.moduleKey || stage.module === value.moduleKey)
  )
  const stageOptions = catalog.chains
    .map((chain) => ({
      label: chain.label,
      options: stages
        .filter((stage) => stage.chain === chain.key)
        .map((stage) => ({
          value: stage.key,
          label: taskStagePath(stage.key),
        })),
    }))
    .filter((group) => group.options.length)
  const fields = [
    [
      'moduleKey',
      '业务模块',
      catalog.modules.map((entry) => ({
        value: entry.key,
        label: entry.label,
      })),
    ],
    [
      'chainKey',
      '业务链路',
      catalog.chains.map((entry) => ({ value: entry.key, label: entry.label })),
    ],
    ['stageKey', '业务环节', stageOptions],
    [
      'assignee',
      '办理人',
      [
        { value: 'unassigned', label: '岗位待领取' },
        ...assignees.map((person) => ({
          value: String(person.id),
          label: person.name,
        })),
      ],
    ],
  ]
  return (
    <div
      className={`workflow-task-discovery ${compact ? 'workflow-task-discovery--compact' : ''}`}
    >
      <div className="workflow-task-discovery__fields">
        {fields.map(([key, label, options]) => (
          <label key={key}>
            <span>{label}</span>
            <Select
              aria-label={label}
              value={value[key] || undefined}
              allowClear
              placeholder={`全部${label}`}
              options={options}
              showSearch={!compact}
              optionFilterProp="label"
              onChange={(next) => {
                if (['moduleKey', 'chainKey'].includes(key))
                  { onChange({ ...value, [key]: next || '', stageKey: '' }) }
                else change(key, next)
              }}
            />
          </label>
        ))}
      </div>
      {result?.scope === scope && result.error ? (
        <p role="status">办理人选项暂时未能读取，可用上方搜索查找。</p>
      ) : null}
      <WorkflowTaskSavedViews
        profile={profile}
        value={value}
        onChange={onChange}
      />
      <div
        className="workflow-task-discovery__selected"
        aria-label="已选任务条件"
      >
        {taskDiscoveryFilterLabels(value, assignees).map(({ key, label }) => (
          <Tag key={key} closable onClose={() => change(key, '')}>
            {label}
          </Tag>
        ))}
      </div>
    </div>
  )
}
