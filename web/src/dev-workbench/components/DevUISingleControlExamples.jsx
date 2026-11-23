import React, { useState } from 'react'
import FilterSelect from '@/common/components/select/FilterSelect.jsx'

const TASK_ASSIGNEES = ['王小禾', '李小宁', '王小禾', '周小雨']
const ASSIGNEE_OPTIONS = [...new Set(TASK_ASSIGNEES)].map((name) => ({ value: name, label: name }))

export function FilterSelectExample() {
  const [assignee, setAssignee] = useState('')
  const count = TASK_ASSIGNEES.filter((name) => !assignee || name === assignee).length
  return (
    <div className="erp-control-input-field">
      <FilterSelect
        label="办理人"
        labelPlacement="stacked"
        placeholder="输入姓名搜索"
        showSearch
        optionFilterProp="label"
        value={assignee}
        onChange={setAssignee}
        options={ASSIGNEE_OPTIONS}
      />
      <output aria-label="筛选当前结果">
        {assignee || '不限'} · {count} 条任务
      </output>
    </div>
  )
}
