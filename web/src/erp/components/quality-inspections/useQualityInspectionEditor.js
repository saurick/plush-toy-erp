import { useCallback, useEffect, useRef, useState } from 'react'
import { Form } from 'antd'
import { initialIncomingChecks } from '../../utils/incomingAcceptance.mjs'
import { buildSequentialDraftCode } from '../../utils/masterDataOrderView.mjs'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import { message } from '@/common/utils/antdApp'

export default function useQualityInspectionEditor({
  rows,
  referenceDataState,
}) {
  const [inspectionModal, setInspectionModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [inspectionForm] = Form.useForm()
  const [decisionForm] = Form.useForm()
  const inspectionAttachmentRef = useRef(null)

  useEffect(() => {
    if (inspectionModal?.mode !== 'create') return
    inspectionForm.resetFields()
    inspectionForm.setFieldsValue({
      inspection_no: inspectionModal.inspectionNo,
      purchase_receipt_id: undefined,
      purchase_receipt_item_id: undefined,
      decision_note: '',
    })
  }, [inspectionForm, inspectionModal])
  useEffect(() => {
    if (['pass', 'reject', 'cancel'].includes(inspectionModal?.mode)) {
      decisionForm.resetFields()
      decisionForm.setFieldsValue({
        result: inspectionModal?.mode === 'pass' ? 'PASS' : undefined,
        inspected_at:
          inspectionModal?.mode === 'cancel'
            ? undefined
            : currentBusinessDate(),
        defect_rate_selection: undefined,
        defect_rate_custom_percent: undefined,
        check_items:
          inspectionModal?.mode !== 'cancel' &&
          inspectionModal?.inspection?.purchase_receipt_item_id
            ? initialIncomingChecks()
            : undefined,
        decision_note: '',
      })
    }
  }, [decisionForm, inspectionModal])

  const openCreate = useCallback(() => {
    if (referenceDataState !== 'ready') {
      message.warning(
        referenceDataState === 'loading'
          ? '质检来源资料正在加载，请稍后再补建来料质检'
          : '质检来源资料加载失败，请先刷新当前页后重试'
      )
      return
    }
    inspectionAttachmentRef.current?.clearPendingAttachments()
    setInspectionModal({
      mode: 'create',
      inspectionNo: buildSequentialDraftCode(rows, {
        prefix: 'QI',
        field: 'inspection_no',
      }),
    })
  }, [referenceDataState, rows])

  const openDecision = useCallback((mode, inspection) => {
    inspectionAttachmentRef.current?.clearPendingAttachments()
    setInspectionModal({ mode, inspection })
  }, [])

  const closeModal = useCallback(() => {
    inspectionAttachmentRef.current?.clearPendingAttachments()
    setInspectionModal(null)
  }, [])

  const handleReceiptChange = useCallback(() => {
    inspectionForm.setFieldsValue({
      purchase_receipt_item_id: undefined,
    })
  }, [inspectionForm])

  return {
    referenceDataState,
    inspectionModal,
    saving,
    setSaving,
    inspectionForm,
    decisionForm,
    inspectionAttachmentRef,
    openCreate,
    openDecision,
    closeModal,
    handleReceiptChange,
  }
}
