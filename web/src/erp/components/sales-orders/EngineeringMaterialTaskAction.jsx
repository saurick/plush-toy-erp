import React from 'react'
import EngineeringMaterialRequestForm from './EngineeringMaterialRequestForm.jsx'
import {
  canProcessEngineeringMaterialTask,
  getEngineeringMaterialPermissions,
  getEngineeringMaterialTaskContext,
} from '../../utils/engineeringMaterialTask.mjs'

// 任务处理复用用料源单表单；查看汇总仍由独立只读入口负责。
export default function EngineeringMaterialTaskAction({
  task,
  profile,
  ...props
}) {
  const context = getEngineeringMaterialTaskContext(task)
  if (!context || !canProcessEngineeringMaterialTask(profile, task)) return null
  return (
    <EngineeringMaterialRequestForm
      key={`${task.id}:${task.version}`}
      {...props}
      {...context}
      workflowTask={task}
      permissions={getEngineeringMaterialPermissions(profile, task)}
      taskProcessing
    />
  )
}
