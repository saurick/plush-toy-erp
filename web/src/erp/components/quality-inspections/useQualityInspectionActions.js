import { useCallback, useRef } from 'react'
import {
  cancelQualityInspection,
  createQualityInspectionDraft,
  passQualityInspection,
  rejectQualityInspection,
} from '../../api/qualityApi.mjs'
import {
  buildDecisionParams,
  buildInspectionParams,
} from './QualityInspectionForms.jsx'
import { validateIncomingChecks } from '../../utils/incomingAcceptance.mjs'
import { compactParams } from '../../utils/sourceDocumentValues.mjs'
import { resetBusinessPaginationCurrent } from '../../utils/businessPagination.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

export default function useQualityInspectionActions({
  editor,
  activeCustomerKey,
  loadRows,
  reportBusinessResult,
  setSelectedRow,
  setPagination,
}) {
  const {
    referenceDataState,
    inspectionForm,
    decisionForm,
    inspectionModal,
    inspectionAttachmentRef,
    closeModal,
    setSaving,
  } = editor
  const mutationInFlight = useRef(false)
  const handleCreateInspection = useCallback(async () => {
    if (referenceDataState !== 'ready') {
      message.warning('质检来源资料尚未就绪，本次未生成，请刷新后重试')
      return
    }
    const values = await inspectionForm.validateFields()
    if (mutationInFlight.current) return
    mutationInFlight.current = true
    setSaving(true)
    try {
      const inspection = await createQualityInspectionDraft(
        compactParams({
          customer_key: activeCustomerKey || undefined,
          ...buildInspectionParams(values),
        })
      )
      const attachmentSaved =
        (await inspectionAttachmentRef.current?.flushPendingAttachments(
          inspection?.id
        )) !== false
      message.success(
        attachmentSaved
          ? '来料质检草稿已创建'
          : '来料质检草稿已创建，未上传的附件请重新选择'
      )
      setSelectedRow(inspection)
      closeModal()
      resetBusinessPaginationCurrent(setPagination)
    } catch (error) {
      message.error(getActionErrorMessage(error, '创建来料质检草稿'))
    } finally {
      mutationInFlight.current = false
      setSaving(false)
    }
  }, [
    activeCustomerKey,
    closeModal,
    inspectionForm,
    referenceDataState,
    inspectionAttachmentRef,
    setSaving,
    setSelectedRow,
    setPagination,
  ])
  const runInspectionAction = useCallback(
    async (inspection, action, successText) => {
      if (!inspection?.id) return
      if (mutationInFlight.current) return
      mutationInFlight.current = true
      setSaving(true)
      try {
        const nextInspection = await action({ id: inspection.id })
        setSelectedRow(nextInspection || inspection)
        reportBusinessResult(successText, nextInspection)
        message.success(successText)
        await loadRows()
        return nextInspection
      } catch (error) {
        message.error(getActionErrorMessage(error, successText))
        return null
      } finally {
        mutationInFlight.current = false
        setSaving(false)
      }
    },
    [loadRows, reportBusinessResult, setSaving, setSelectedRow]
  )
  const handleDecision = useCallback(async () => {
    const inspection = inspectionModal?.inspection
    if (!inspection?.id) return
    const values = await decisionForm.validateFields()
    if (
      inspection.purchase_receipt_item_id &&
      inspectionModal.mode !== 'cancel'
    ) {
      const result =
        inspectionModal.mode === 'reject' ? 'REJECT' : values.result
      const error = validateIncomingChecks(values.check_items, result)
      if (error) {
        message.warning(error)
        return
      }
      if (
        result === 'CONCESSION' &&
        !String(values.decision_note || '').trim()
      ) {
        message.warning('让步接收请填写接收理由')
        return
      }
    }
    if (mutationInFlight.current) return
    mutationInFlight.current = true
    setSaving(true)
    try {
      let action = passQualityInspection
      let params = buildDecisionParams(inspection.id, values)
      let successText = '质量检验已判定合格'
      if (inspectionModal?.mode === 'reject') {
        action = rejectQualityInspection
        params = buildDecisionParams(inspection.id, values, 'REJECT')
        successText = '质量检验已判定不合格'
      } else if (inspectionModal?.mode === 'cancel') {
        action = cancelQualityInspection
        params = buildDecisionParams(inspection.id, values)
        successText = '质量检验已取消'
      }
      const nextInspection = await action(params)
      const attachmentSaved =
        (await inspectionAttachmentRef.current?.flushPendingAttachments(
          nextInspection?.id || inspection.id
        )) !== false
      setSelectedRow(nextInspection || inspection)
      reportBusinessResult(successText, nextInspection || inspection)
      message.success(
        attachmentSaved ? successText : `${successText}，未上传的附件请重新选择`
      )
      closeModal()
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '处理质量检验'))
    } finally {
      mutationInFlight.current = false
      setSaving(false)
    }
  }, [
    closeModal,
    decisionForm,
    inspectionModal,
    loadRows,
    reportBusinessResult,
    inspectionAttachmentRef,
    setSaving,
    setSelectedRow,
  ])

  return { handleCreateInspection, runInspectionAction, handleDecision }
}
