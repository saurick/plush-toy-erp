import { useCallback, useRef } from 'react'

import { message } from '@/common/utils/antdApp'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  rejectWorkflowTaskAction,
  resumeWorkflowTaskAction,
  urgeWorkflowTask,
  getWorkflowTaskAssignmentOptions,
  reassignWorkflowTask,
} from '../../api/workflowApi.mjs'
import { verifyWorkflowTaskActionAccessBeforeSubmit } from '../../utils/workflowTaskActionSubmitGuard.mjs'
import { buildDesktopWorkflowTaskActionParams } from '../../utils/desktopWorkflowTaskAction.mjs'
import {
  createTaskMutationAttemptStore,
  createTaskMutationInFlightGuard,
  runWorkflowTaskMutationWithFailureRefresh,
  verifyNewWorkflowTaskMutationAttempt,
} from '../../utils/workflowTaskMutation.mjs'

export function useSourceOrderWorkflowActions({
  loadWorkflowTasks,
  surfaceKey,
}) {
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
    async (task, { reason = '', processDecision = null } = {}) => {
      const scope = `${task.id}:complete`
      const operation = 'complete'
      const params = buildDesktopWorkflowTaskActionParams({ task, actionMode: operation, reason, processDecision, surfaceKey })
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
              reason: reason.trim(),
              onWarning: message.warning,
              onError: message.error,
            }),
        })
        if (!accessVerified) return false
        const updatedTask = await runWorkflowTaskMutationWithFailureRefresh(
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
        return updatedTask
      })
    },
    [loadWorkflowTasks, runMutationInFlight, surfaceKey]
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
          surface_key: surfaceKey,
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
        const updatedTask = await runWorkflowTaskMutationWithFailureRefresh(
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
        return updatedTask
      })
    },
    [loadWorkflowTasks, runMutationInFlight, surfaceKey]
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
          surface_key: surfaceKey,
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
        const updatedTask = await runWorkflowTaskMutationWithFailureRefresh(
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
        return updatedTask
      })
    },
    [loadWorkflowTasks, runMutationInFlight, surfaceKey]
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
          surface_key: surfaceKey,
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
        const updatedTask = await runWorkflowTaskMutationWithFailureRefresh(
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
        return updatedTask
      })
    },
    [loadWorkflowTasks, runMutationInFlight, surfaceKey]
  )

  const urgeSourceWorkflowTask = useCallback(
    async (task, { reason = '' } = {}) => {
      const scope = `${task.id}:urge`
      const operation = 'urge'
      const params = {
        task_id: task.id,
        expected_version: task.version,
        action: 'urge_task',
        reason,
        payload: {
          surface_key: surfaceKey,
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
        const updatedTask = await runWorkflowTaskMutationWithFailureRefresh(
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
        return updatedTask
      })
    },
    [loadWorkflowTasks, runMutationInFlight, surfaceKey]
  )

  const assignWorkflowTask = useCallback(async (task, { reason = '', assignmentTarget } = {}) => {
    const scope = `${task.id}:assign`
    const params = buildDesktopWorkflowTaskActionParams({ task, actionMode: 'assign', assignmentTarget, reason, surfaceKey })
    return runMutationInFlight(task.id, async () => {
      const verified = await verifyNewWorkflowTaskMutationAttempt({
        attemptStore: mutationAttemptsRef.current,
scope,
operation: 'assign',
params,
        verify: async () => {
          const access = await getWorkflowTaskAssignmentOptions({ task_id: task.id })
          const allowed = assignmentTarget === 'pool' ? access.can_return_to_pool : access.candidates.some((item) => item.admin_id === assignmentTarget)
          if (access.task_version !== task.version || !access.can_reassign || !allowed) {
            message.warning(access.reason || '转交去向已失效，请重新选择')
            return false
          }
          return true
        },
      })
      if (!verified) return false
      const updated = await runWorkflowTaskMutationWithFailureRefresh(() => mutationAttemptsRef.current.run({ scope, operation: 'assign', mutate: reassignWorkflowTask, params }), loadWorkflowTasks)
      await loadWorkflowTasks()
      return updated
    })
  }, [loadWorkflowTasks, runMutationInFlight, surfaceKey])

  return {
    assignWorkflowTask,
    blockWorkflowTask,
    completeWorkflowTask,
    rejectWorkflowTask,
    resumeWorkflowTask,
    urgeSourceWorkflowTask,
  }
}
