// 保存、附件、审批与结果回读共用同一提交路径，避免重复写入与不确定结果误报。
export async function submitShipmentDraft({
  taskDraftSavingRef,
  taskBusiness,
  shipmentForm,
  buildShipmentWithItemsParams,
  products,
  productSKUs,
  selectedSalesOrder,
  taskSource,
  shipmentModal,
  positiveInt,
  canSubmitShipmentRelease,
  confirmSubmission,
  setSaving,
  saveShipmentDraft,
  createShipmentWithItems,
  shipmentAttachmentRef,
  getShipment,
  shipmentFormValues,
  applyBusinessFormReadback,
  setSelectedRow,
  setShipmentModal,
  submitShipmentFinanceApprovalProcess,
  closeShipmentModal,
  reportBusinessResult,
  loadRows,
  message,
  getActionErrorMessage,
  isSourceBusinessActionResultUnknown,
  resetBusinessPaginationCurrent,
  setPagination,
}, { submitForApproval = false } = {}) {
  if (taskDraftSavingRef.current || taskBusiness?.readOnly) return
  taskDraftSavingRef.current = true
  let savedBeforeApproval = false
  let approvalSubmitted = false
  try {
    const values = await shipmentForm.validateFields()
    const params = buildShipmentWithItemsParams(values, {
      products,
      productSKUs,
      sourceCurrency: selectedSalesOrder?.currency,
    })
    if (taskSource && (params.sales_order_id !== taskSource.record.id || params.items.some((item) => !taskSource.items.some((source) => source.id === item.sales_order_item_id)))) {
      message.warning('请使用当前任务关联的销售订单和来源行，保留填写内容后重新核对')
      return
    }
    const editingShipment =
      shipmentModal?.mode === 'edit' ? shipmentModal.shipment : null
    if (editingShipment?.id && !positiveInt(editingShipment.version)) {
      message.error('出货草稿版本不完整，请关闭弹窗并刷新后重试')
      return
    }
    if (submitForApproval) {
      if (!canSubmitShipmentRelease || taskBusiness?.readOnly) return
      const confirmed = await confirmSubmission()
      if (!confirmed) return
    }
    setSaving(true)
    let savedShipment
    if (editingShipment?.id) {
      const draftParams = { ...params }
      delete draftParams.idempotency_key
      savedShipment = await saveShipmentDraft({
        ...draftParams,
        id: editingShipment.id,
        expected_version: editingShipment.version,
      })
    } else {
      savedShipment = await createShipmentWithItems(params)
    }
    if (submitForApproval) {
      savedBeforeApproval = true
      setSelectedRow(savedShipment)
      setShipmentModal({ mode: 'edit', shipment: savedShipment })
    }
    const attachmentSaved =
      (await shipmentAttachmentRef.current?.flushPendingAttachments(
        savedShipment?.id
      )) !== false
    if (submitForApproval) {
      if (!attachmentSaved) {
        message.warning('草稿已保存，附件尚未上传完成，请重新选择附件后提交审批')
        return
      }
      await submitShipmentFinanceApprovalProcess({ id: savedShipment.id, shipment_no: savedShipment.shipment_no })
      approvalSubmitted = true
      closeShipmentModal()
      reportBusinessResult('出货草稿已保存，审批已提交', savedShipment)
      await loadRows()
      return
    }
    message.success(
      attachmentSaved
        ? editingShipment?.id
          ? '出货草稿和明细已更新'
          : '出货单草稿和明细已保存'
        : '出货单已保存，未上传的附件请重新选择'
    )
    if (taskBusiness) {
      const fresh = await getShipment({ id: savedShipment.id })
      applyBusinessFormReadback(shipmentForm, { ...shipmentFormValues(fresh), items: fresh.items })
      setShipmentModal({ mode: 'edit', shipment: fresh })
    } else closeShipmentModal()
    setSelectedRow(savedShipment)
    reportBusinessResult(editingShipment?.id ? '出货草稿和明细已更新' : '出货单草稿和明细已保存', savedShipment)
    if (editingShipment?.id) {
      await loadRows()
    } else {
      resetBusinessPaginationCurrent(setPagination)
    }
  } catch (error) {
    if (error?.errorFields) {
      return
    }
    if (approvalSubmitted) {
      message.error('审批已提交，任务列表读取失败，请刷新列表')
    } else if (savedBeforeApproval) {
      message.error(isSourceBusinessActionResultUnknown(error)
        ? '草稿已保存，审批结果暂未确认，请重新打开任务核对'
        : `草稿已保存，审批未提交。${getActionErrorMessage(error, '提交出货审批')}`)
    } else {
      message.error(getActionErrorMessage(error, '保存出货单'))
    }
  } finally {
    setSaving(false)
    taskDraftSavingRef.current = false
  }
}
