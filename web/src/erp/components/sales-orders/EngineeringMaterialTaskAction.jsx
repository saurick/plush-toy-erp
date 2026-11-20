import React from 'react'
import EngineeringMaterialRequestForm from './EngineeringMaterialRequestForm.jsx'
import {
  canProcessEngineeringMaterialTask,
  canReadEngineeringMaterial,
  getEngineeringMaterialPermissions,
  getEngineeringMaterialTaskContext,
} from '../../utils/engineeringMaterialTask.mjs'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import useWorkflowTaskActionAccess from '../../hooks/useWorkflowTaskActionAccess.js'
import { canHandleWorkflowTaskBusiness } from '../../utils/workflowTaskBusinessAccess.mjs'
import { taskNeedsDesktop } from '../../utils/taskHandlingPolicy.mjs'

// 任务处理复用用料源单表单；查看汇总仍由独立只读入口负责。
export default function EngineeringMaterialTaskAction({
  task,
  profile,
  readOnly: requestedReadOnly = false,
  ...props
}) {
  const context = getEngineeringMaterialTaskContext(task)
  const page = useBusinessPageContext()
  const access = useWorkflowTaskActionAccess({ adminProfile: profile, task, enabled: Boolean(context && !page?.taskBusiness) })
  if (!context || !canReadEngineeringMaterial(profile)) return null
  const readOnly = requestedReadOnly || (props.mobile && taskNeedsDesktop(task)) || task.task_status_key !== 'ready' || !canProcessEngineeringMaterialTask(profile, task) ||
    (page?.taskBusiness ? page.taskBusiness.readOnly : !canHandleWorkflowTaskBusiness(task, profile, access))
  return (
    <EngineeringMaterialRequestForm
      key={`${task.id}:${task.version}`}
      {...props}
      {...context}
      workflowTask={task}
      readOnly={readOnly}
      permissions={getEngineeringMaterialPermissions(profile, task)}
      taskProcessing
    />
  )
}
