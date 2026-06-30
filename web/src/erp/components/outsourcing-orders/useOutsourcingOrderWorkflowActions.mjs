import { useCallback } from 'react'

import { message } from '@/common/utils/antdApp'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  urgeWorkflowTask,
} from '../../api/workflowApi.mjs'
import { workflowPayloadOf } from './outsourcingOrderPageConfig.mjs'

export function useOutsourcingOrderWorkflowActions({ loadWorkflowTasks }) {
  const completeWorkflowTask = useCallback(
    async (task) => {
      await completeWorkflowTaskAction({
        id: task.id,
        action_key: 'complete',
        business_status_key: task.business_status_key || undefined,
        reason: '',
        payload: {
          ...workflowPayloadOf(task),
          outsourcing_order_page_action: 'complete',
        },
      })
      message.success('任务已处理完成')
      await loadWorkflowTasks()
    },
    [loadWorkflowTasks]
  )

  const blockWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      await blockWorkflowTaskAction({
        id: task.id,
        action_key: 'block',
        business_status_key: 'blocked',
        reason,
        payload: {
          ...workflowPayloadOf(task),
          outsourcing_order_page_action: 'block',
          blocked_reason: reason,
        },
      })
      message.success('阻塞原因已记录')
      await loadWorkflowTasks()
    },
    [loadWorkflowTasks]
  )

  const urgeOutsourcingWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      await urgeWorkflowTask({
        task_id: task.id,
        action: 'urge_task',
        reason,
        payload: {
          source_type: task.source_type,
          source_id: task.source_id,
          source_no: task.source_no,
          entry: 'outsourcing_order_page',
        },
      })
      message.success('催办已记录')
      await loadWorkflowTasks()
    },
    [loadWorkflowTasks]
  )

  return {
    blockWorkflowTask,
    completeWorkflowTask,
    urgeOutsourcingWorkflowTask,
  }
}
