import { useCallback, useRef } from 'react'

import { message } from '@/common/utils/antdApp'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  rejectWorkflowTaskAction,
  resumeWorkflowTaskAction,
  urgeWorkflowTask,
} from '../../api/workflowApi.mjs'
import { verifyWorkflowTaskActionAccessBeforeSubmit } from '../../utils/workflowTaskActionSubmitGuard.mjs'
import {
  createTaskMutationAttemptStore,
  createTaskMutationInFlightGuard,
  runWorkflowTaskMutationWithFailureRefresh,
  verifyNewWorkflowTaskMutationAttempt,
} from '../../utils/workflowTaskMutation.mjs'

export function usePurchaseOrderWorkflowActions({ loadWorkflowTasks }) {
  const mutationAttemptsRef = useRef(null)
  mutationAttemptsRef.current ||= createTaskMutationAttemptStore()
  const mutationInFlightRef = useRef(null)
  mutationInFlightRef.current ||= createTaskMutationInFlightGuard()
  const runMutationInFlight = useCallback(async (taskID, run) => {
    const lease = mutationInFlightRef.current.acquire(`task:${taskID}`)
    if (!lease) return false
    try {
      return await run()
    } finally {
      mutationInFlightRef.current.release(lease)
    }
  }, [])
  const completeWorkflowTask = useCallback(
    async (task) => {
      const scope = `${task.id}:complete`
      const operation = 'complete'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action_key: operation,
        reason: '',
        payload: {
          surface_key: 'purchase_orders',
        },
      }
      return runMutationInFlight(task.id, async () => {
        const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
          attemptStore: mutationAttemptsRef.current,
          scope,
          operation,
          params,
          verify: () =>
            verifyWorkflowTaskActionAccessBeforeSubmit({
              task,
              actionKey: operation,
              onWarning: message.warning,
              onError: message.error,
            }),
        })
        if (!accessVerified) return false
        await runWorkflowTaskMutationWithFailureRefresh(
          () =>
            mutationAttemptsRef.current.run({
              scope,
              operation,
              mutate: completeWorkflowTaskAction,
              params,
            }),
          loadWorkflowTasks
        )
        message.success('任务已处理完成')
        try {
          await loadWorkflowTasks()
        } catch {
          message.warning('操作已成功但列表刷新失败，请手动刷新')
        }
        return true
      })
    },
    [loadWorkflowTasks, runMutationInFlight]
  )

  const blockWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      const scope = `${task.id}:block`
      const operation = 'block'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action_key: operation,
        reason,
        payload: {
          surface_key: 'purchase_orders',
        },
      }
      return runMutationInFlight(task.id, async () => {
        const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
          attemptStore: mutationAttemptsRef.current,
          scope,
          operation,
          params,
          verify: () =>
            verifyWorkflowTaskActionAccessBeforeSubmit({
              task,
              actionKey: operation,
              reason,
              onWarning: message.warning,
              onError: message.error,
            }),
        })
        if (!accessVerified) return false
        await runWorkflowTaskMutationWithFailureRefresh(
          () =>
            mutationAttemptsRef.current.run({
              scope,
              operation,
              mutate: blockWorkflowTaskAction,
              params,
            }),
          loadWorkflowTasks
        )
        message.success('阻塞原因已记录')
        try {
          await loadWorkflowTasks()
        } catch {
          message.warning('操作已成功但列表刷新失败，请手动刷新')
        }
        return true
      })
    },
    [loadWorkflowTasks, runMutationInFlight]
  )

  const rejectWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      const scope = `${task.id}:reject`
      const operation = 'reject'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action_key: operation,
        reason,
        payload: {
          surface_key: 'purchase_orders',
        },
      }
      return runMutationInFlight(task.id, async () => {
        const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
          attemptStore: mutationAttemptsRef.current,
          scope,
          operation,
          params,
          verify: () =>
            verifyWorkflowTaskActionAccessBeforeSubmit({
              task,
              actionKey: operation,
              reason,
              onWarning: message.warning,
              onError: message.error,
            }),
        })
        if (!accessVerified) return false
        await runWorkflowTaskMutationWithFailureRefresh(
          () =>
            mutationAttemptsRef.current.run({
              scope,
              operation,
              mutate: rejectWorkflowTaskAction,
              params,
            }),
          loadWorkflowTasks
        )
        message.success('退回原因已记录')
        try {
          await loadWorkflowTasks()
        } catch {
          message.warning('操作已成功但列表刷新失败，请手动刷新')
        }
        return true
      })
    },
    [loadWorkflowTasks, runMutationInFlight]
  )

  const resumeWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      const scope = `${task.id}:resume`
      const operation = 'resume'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action_key: operation,
        reason,
        payload: {
          surface_key: 'purchase_orders',
        },
      }
      return runMutationInFlight(task.id, async () => {
        const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
          attemptStore: mutationAttemptsRef.current,
          scope,
          operation,
          params,
          verify: () =>
            verifyWorkflowTaskActionAccessBeforeSubmit({
              task,
              actionKey: operation,
              reason,
              onWarning: message.warning,
              onError: message.error,
            }),
        })
        if (!accessVerified) return false
        await runWorkflowTaskMutationWithFailureRefresh(
          () =>
            mutationAttemptsRef.current.run({
              scope,
              operation,
              mutate: resumeWorkflowTaskAction,
              params,
            }),
          loadWorkflowTasks
        )
        message.success('任务已解除阻塞')
        try {
          await loadWorkflowTasks()
        } catch {
          message.warning('操作已成功但列表刷新失败，请手动刷新')
        }
        return true
      })
    },
    [loadWorkflowTasks, runMutationInFlight]
  )

  const urgePurchaseWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      const scope = `${task.id}:urge`
      const operation = 'urge'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action: 'urge_task',
        reason,
        payload: {
          surface_key: 'purchase_orders',
        },
      }
      return runMutationInFlight(task.id, async () => {
        const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
          attemptStore: mutationAttemptsRef.current,
          scope,
          operation,
          params,
          verify: () =>
            verifyWorkflowTaskActionAccessBeforeSubmit({
              task,
              actionKey: operation,
              reason,
              onWarning: message.warning,
              onError: message.error,
            }),
        })
        if (!accessVerified) return false
        await runWorkflowTaskMutationWithFailureRefresh(
          () =>
            mutationAttemptsRef.current.run({
              scope,
              operation,
              mutate: urgeWorkflowTask,
              params,
            }),
          loadWorkflowTasks
        )
        message.success('催办已记录')
        try {
          await loadWorkflowTasks()
        } catch {
          message.warning('操作已成功但列表刷新失败，请手动刷新')
        }
        return true
      })
    },
    [loadWorkflowTasks, runMutationInFlight]
  )

  return {
    blockWorkflowTask,
    completeWorkflowTask,
    rejectWorkflowTask,
    resumeWorkflowTask,
    urgePurchaseWorkflowTask,
  }
}
