import { useCallback } from 'react'

import { message } from '@/common/utils/antdApp'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  rejectWorkflowTaskAction,
  urgeWorkflowTask,
} from '../../api/workflowApi.mjs'
import { verifyWorkflowTaskActionAccessBeforeSubmit } from '../../utils/workflowTaskActionSubmitGuard.mjs'

export function useOutsourcingOrderWorkflowActions({ loadWorkflowTasks }) {
  const completeWorkflowTask = useCallback(
    async (task) => {
      const accessVerified = await verifyWorkflowTaskActionAccessBeforeSubmit({
        task,
        actionKey: 'complete',
        onWarning: message.warning,
        onError: message.error,
      })
      if (!accessVerified) return
      await completeWorkflowTaskAction({
        task_id: task.id,
        action_key: 'complete',
        reason: '',
        payload: {
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
      const accessVerified = await verifyWorkflowTaskActionAccessBeforeSubmit({
        task,
        actionKey: 'block',
        reason,
        onWarning: message.warning,
        onError: message.error,
      })
      if (!accessVerified) return
      await blockWorkflowTaskAction({
        task_id: task.id,
        action_key: 'block',
        reason,
        payload: {
          outsourcing_order_page_action: 'block',
          blocked_reason: reason,
        },
      })
      message.success('阻塞原因已记录')
      await loadWorkflowTasks()
    },
    [loadWorkflowTasks]
  )

  const rejectWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      const accessVerified = await verifyWorkflowTaskActionAccessBeforeSubmit({
        task,
        actionKey: 'reject',
        reason,
        onWarning: message.warning,
        onError: message.error,
      })
      if (!accessVerified) return
      await rejectWorkflowTaskAction({
        task_id: task.id,
        action_key: 'reject',
        reason,
        payload: {
          outsourcing_order_page_action: 'reject',
          rejected_reason: reason,
        },
      })
      message.success('退回原因已记录')
      await loadWorkflowTasks()
    },
    [loadWorkflowTasks]
  )

  const urgeOutsourcingWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      const accessVerified = await verifyWorkflowTaskActionAccessBeforeSubmit({
        task,
        actionKey: 'urge',
        reason,
        onWarning: message.warning,
        onError: message.error,
      })
      if (!accessVerified) return
      await urgeWorkflowTask({
        task_id: task.id,
        action: 'urge_task',
        reason,
        payload: {
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
    rejectWorkflowTask,
    urgeOutsourcingWorkflowTask,
  }
}
