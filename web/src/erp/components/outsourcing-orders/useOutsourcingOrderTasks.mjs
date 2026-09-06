import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listWorkflowTasks } from '../../api/workflowApi.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import {
  filterBusinessCollaborationTasksBySource,
  loadBusinessCollaborationTasksForSource,
} from '../../utils/businessCollaborationTasks.mjs'
import { OUTSOURCING_ORDERS_MODULE_KEY } from './outsourcingOrderPageConfig.mjs'
import { useSourceOrderWorkflowActions } from '../workflow/useSourceOrderWorkflowActions.mjs'

export function useOutsourcingOrderTasks({
  adminProfile,
  beginLatestRequest,
  selectedRow,
}) {
  const [workflowTasks, setWorkflowTasks] = useState([])

  const [workflowTaskLoadState, setWorkflowTaskLoadState] = useState('idle')

  const workflowTaskSourceIDRef = useRef(0)

  const canReadWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.read'
  )

  const loadWorkflowTasks = useCallback(
    (sourceID) => {
      const requestedSourceID = Number(
        sourceID ?? workflowTaskSourceIDRef.current ?? 0
      )
      return loadBusinessCollaborationTasksForSource({
        beginLatestRequest,
        canRead: canReadWorkflowTasks,
        isAbortError: isRpcAbortError,
        isCurrentSource: (candidateSourceID) =>
          candidateSourceID === workflowTaskSourceIDRef.current,
        listTasks: listWorkflowTasks,
        onError: (error) =>
          message.error(
            getActionErrorMessage(error, '加载当前加工合同任务失败')
          ),
        setLoadState: setWorkflowTaskLoadState,
        setTasks: setWorkflowTasks,
        sourceID: requestedSourceID,
        sourceType: OUTSOURCING_ORDERS_MODULE_KEY,
      })
    },
    [beginLatestRequest, canReadWorkflowTasks]
  )

  useEffect(() => {
    const sourceID = Number(selectedRow?.id || 0)
    workflowTaskSourceIDRef.current = sourceID
    loadWorkflowTasks(sourceID)
  }, [loadWorkflowTasks, selectedRow?.id])

  useEffect(
    () => () => {
      workflowTaskSourceIDRef.current = 0
    },
    []
  )

  const {
    blockWorkflowTask,
    completeWorkflowTask,
    rejectWorkflowTask,
    resumeWorkflowTask,
    urgeSourceWorkflowTask: urgeOutsourcingWorkflowTask,
  } = useSourceOrderWorkflowActions({
    loadWorkflowTasks,
    surfaceKey: 'outsourcing_orders',
  })

  const selectedWorkflowTasks = useMemo(
    () =>
      selectedRow?.id
        ? filterBusinessCollaborationTasksBySource({
            tasks: workflowTasks,
            sourceType: OUTSOURCING_ORDERS_MODULE_KEY,
            sourceIDs: [selectedRow.id],
          })
        : [],
    [selectedRow, workflowTasks]
  )
  return {
    workflowTaskLoadState,
    canReadWorkflowTasks,
    loadWorkflowTasks,
    blockWorkflowTask,
    completeWorkflowTask,
    rejectWorkflowTask,
    resumeWorkflowTask,
    urgeOutsourcingWorkflowTask,
    selectedWorkflowTasks,
  }
}
