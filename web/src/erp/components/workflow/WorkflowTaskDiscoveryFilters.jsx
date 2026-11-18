import React from 'react'
import { Button } from 'antd'
import FilterSelect from '@/common/components/select/FilterSelect'
import useWorkflowTaskAssignees from '../../hooks/useWorkflowTaskAssignees'
import { taskStagePath } from '../../utils/workflowTaskDiscovery.mjs'
import './workflowTaskDiscovery.css'

export default function WorkflowTaskDiscoveryFilters({
  value,
  onChange,
  profile,
  people,
  peopleError = false,
  onRetryPeople,
  roleKey,
  labelPlacement = 'stacked',
}) {
  const result = useWorkflowTaskAssignees(profile, roleKey, !people)
  const assignees = people || result.people
  const options = [
    { value: 'unassigned', label: '未指定办理人' },
    ...assignees.map((person) => ({ value: String(person.id), label: person.name })),
    ...(value.assignee && value.assignee !== 'unassigned' && !assignees.some((person) => String(person.id) === value.assignee)
      ? [{ value: value.assignee, label: '已选办理人（名单中未找到）' }]
      : []),
  ]
  const change = (assignee) => onChange({ ...value, assignee: assignee || '' })
  const stage = taskStagePath(value.stageKey)
  return (
    <div className="workflow-task-discovery">
      {stage && (
        <div className="workflow-task-discovery__context" role="note" aria-label="来源环节范围">
          <span>来自环节：{stage}</span>
          <Button type="link" size="small" onClick={() => onChange({ ...value, stageKey: '' })}>清除环节范围</Button>
        </div>
      )}
      <FilterSelect label="办理人" labelPlacement={labelPlacement} className="workflow-task-discovery__person" aria-label="办理人" value={value.assignee || undefined} allowClear placeholder="办理人" options={options} showSearch optionFilterProp="label" onChange={change} />
      {(peopleError || (!people && result.error)) && (
        <p role="status">办理人选项暂时未能读取。<Button type="link" size="small" onClick={onRetryPeople || result.reload}>重新读取办理人</Button></p>
      )}
    </div>
  )
}
