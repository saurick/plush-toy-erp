import React, { useCallback, useState } from 'react'
import { Button, Modal } from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import {
  exceptionProcessRecoveryReadbackMatches,
  findExceptionProcessRecoveryCandidate,
  recoverCompensatedProcessDomainCommand,
} from '../../api/customerConfigApi.mjs'
import { isSourceBusinessActionResultUnknown } from '../../utils/sourceBusinessAction.mjs'
import { BusinessActionTooltip } from '../business-list/BusinessListLayout.jsx'

export default function ExceptionProcessRecoveryButton({
  canRecover = false,
  disabled = false,
  disabledReason = '',
  loadProcess,
  onRecovered,
  size = 'small',
}) {
  const [modal, contextHolder] = Modal.useModal()
  const [loading, setLoading] = useState(false)

  const finishRecovery = useCallback(async () => {
    if (typeof onRecovered === 'function') {
      await onRecovered()
    }
    message.success('异常流程已终止，下游待办已撤回，恢复审计已保留')
  }, [onRecovered])

  const recover = useCallback(
    async (candidate, processData) => {
      const params = {
        process_instance_id: processData.process_context.process_instance.id,
        process_node_instance_id: candidate.id,
        expected_version: candidate.version,
        expected_result_hash: candidate.domain_command_result_hash,
        expected_compensation_hash: candidate.domain_command_compensation_hash,
      }
      setLoading(true)
      try {
        await recoverCompensatedProcessDomainCommand(params)
        await finishRecovery()
      } catch (error) {
        if (
          isSourceBusinessActionResultUnknown(error) &&
          typeof loadProcess === 'function'
        ) {
          const readback = await loadProcess().catch(() => null)
          if (exceptionProcessRecoveryReadbackMatches(readback, params)) {
            await finishRecovery()
            return
          }
          message.warning(
            '恢复结果暂未确认，请先重新读取来源记录；保持当前页面可用原条件重试'
          )
        } else {
          message.error(getActionErrorMessage(error, '恢复异常流程'))
        }
        throw error
      } finally {
        setLoading(false)
      }
    },
    [finishRecovery, loadProcess]
  )

  const inspect = useCallback(async () => {
    if (typeof loadProcess !== 'function') return
    setLoading(true)
    try {
      const processData = await loadProcess()
      const candidate = findExceptionProcessRecoveryCandidate(processData)
      if (!candidate) {
        const alreadyRecovered =
          processData?.process_context?.nodes?.some(
            (node) =>
              node?.domain_command_recovery_decision ===
              'terminate_and_withdraw_downstream'
          ) === true
        message.info(
          alreadyRecovered
            ? '该来源的流程恢复处置已记录，无需重复操作'
            : '该来源当前没有可恢复的已补偿流程'
        )
        return
      }
      modal.confirm({
        title: '确认终止异常流程并撤回下游待办？',
        content:
          '来源业务已取消或冲正。此操作只终止仍未生效的下游流程与待办，不会删除业务记录、事实或补偿证据。',
        okText: '确认恢复',
        cancelText: '返回核对',
        okButtonProps: { danger: true },
        onOk: () => recover(candidate, processData),
      })
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对异常流程恢复条件'))
    } finally {
      setLoading(false)
    }
  }, [loadProcess, modal, recover])

  if (!canRecover) return null
  const actionDisabled = disabled || loading
  const actionDisabledReason = loading
    ? '当前操作完成后可核对异常流程'
    : disabledReason

  return (
    <>
      {contextHolder}
      <BusinessActionTooltip
        disabled={actionDisabled}
        disabledReason={actionDisabledReason}
      >
        <Button
          danger
          size={size}
          data-business-action-key="exception-process-recovery"
          disabled={actionDisabled}
          loading={loading}
          onClick={inspect}
        >
          恢复异常流程
        </Button>
      </BusinessActionTooltip>
    </>
  )
}
