import { useCallback, useMemo, useRef, useState } from 'react'
import { buildArrivalItems } from '../../utils/incomingAcceptance.mjs'
import {
  materialWarehouseOptions,
  recommendedMaterialWarehouse,
} from '../../utils/warehouseClassification.mjs'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getPurchaseOrderReceiptProgress } from '../../api/masterDataOrderApi.mjs'
import { createPurchaseReceiptFromPurchaseOrder } from '../../api/purchaseApi.mjs'
import { V1_ROUTE_PATHS } from '../../utils/masterDataOrderView.mjs'
import {
  createPurchaseReceiptMutationAttemptStore,
  isPurchaseReceiptMutationResultUnknown,
} from '../../utils/purchaseReceiptMutation.mjs'
import { routeWithQuery } from '../../utils/routeQuery.mjs'
import {
  buildInboundDraftPreviewRows,
  todayInputValue,
} from './purchaseOrderPageConfig.mjs'

export function usePurchaseOrderInboundDraft({
  form,
  navigate,
  selectedOrder,
  materials = [],
  warehouseOptions = [],
}) {
  const [generatingInboundDraft, setGeneratingInboundDraft] = useState(false)
  const [inboundDraftModalOpen, setInboundDraftModalOpen] = useState(false)
  const [inboundDraftPreviewLoading, setInboundDraftPreviewLoading] =
    useState(false)
  const [inboundDraftPreviewRows, setInboundDraftPreviewRows] = useState([])
  const [inboundDraftPreviewError, setInboundDraftPreviewError] = useState('')
  const previewRequestRef = useRef(0)
  const submittingRef = useRef(false)
  const mutationAttemptsRef = useRef(
    createPurchaseReceiptMutationAttemptStore()
  )

  const closeInboundDraftModal = useCallback(() => {
    previewRequestRef.current += 1
    setInboundDraftModalOpen(false)
    setInboundDraftPreviewRows([])
    setInboundDraftPreviewError('')
    setInboundDraftPreviewLoading(false)
  }, [])

  const openInboundDraftModal = useCallback(
    async (record) => {
      if (!record) {
        return
      }
      setInboundDraftPreviewRows([])
      setInboundDraftPreviewError('')
      const request = ++previewRequestRef.current
      form.resetFields()
      form.setFieldsValue({
        receipt_no: record.purchase_order_no
          ? `IN-${record.purchase_order_no.slice(0, 36)}-${Date.now().toString(36)}`
          : undefined,
        arrival_items: [],
        received_at: todayInputValue(),
        note: '',
      })
      setInboundDraftModalOpen(true)
      setInboundDraftPreviewLoading(true)
      try {
        const progress = await getPurchaseOrderReceiptProgress({
          id: record.id,
        })
        if (request !== previewRequestRef.current) return
        const rows = buildInboundDraftPreviewRows(progress).map((row) => {
          const material = materials.find(
            (item) => Number(item.id) === row.materialID
          )
          return {
            ...row,
            stockCategory: material?.stock_category,
            warehouseOptions: materialWarehouseOptions(
              warehouseOptions,
              material
            ),
            defaultWarehouseID: recommendedMaterialWarehouse(
              material,
              warehouseOptions
            ),
          }
        })
        setInboundDraftPreviewRows(rows)
        form.setFieldValue(
          'arrival_items',
          rows
            .filter((row) => row.canGenerate)
            .map((row) => ({
              purchase_order_item_id: row.key,
              warehouse_id: row.defaultWarehouseID,
            }))
        )
      } catch (error) {
        if (request !== previewRequestRef.current) return
        setInboundDraftPreviewRows([])
        setInboundDraftPreviewError(
          getActionErrorMessage(error, '到货材料加载失败，请重试')
        )
      } finally {
        if (request === previewRequestRef.current) {
          setInboundDraftPreviewLoading(false)
        }
      }
    },
    [form, materials, warehouseOptions]
  )

  const createInboundDraftFromOrder = useCallback(async () => {
    if (!selectedOrder || submittingRef.current) {
      return
    }
    submittingRef.current = true
    const scope = `create-from-purchase-order:${selectedOrder.id}`
    let attempt
    try {
      const values = await form.validateFields()
      let items
      try {
        items = buildArrivalItems(values.arrival_items)
      } catch (validationError) {
        message.warning(
          getActionErrorMessage(validationError, '请核对本次到货数量和仓库')
        )
        return
      }
      const payload = {
        purchase_order_id: selectedOrder.id,
        receipt_no: values.receipt_no,
        items,
        received_at: values.received_at,
        note: values.note || undefined,
      }
      attempt = mutationAttemptsRef.current.prepare(scope, payload)
      setGeneratingInboundDraft(true)
      const receipt = await createPurchaseReceiptFromPurchaseOrder(
        attempt.params
      )
      mutationAttemptsRef.current.settle(scope, attempt)
      closeInboundDraftModal()
      message.success('到货已登记，已生成待检记录；检验通过后由仓库确认入库')
      navigate(
        routeWithQuery(V1_ROUTE_PATHS.purchaseReceipts, {
          receipt_id: receipt?.id,
          purchase_order_id: selectedOrder.id,
        })
      )
    } catch (error) {
      if (error?.errorFields) {
        if (error.errorFields[0]) {
          form.scrollToField(error.errorFields[0].name, {
            block: 'center',
            focus: true,
          })
        }
        return
      }
      const retained = attempt
        ? mutationAttemptsRef.current.settle(scope, attempt, error)
        : isPurchaseReceiptMutationResultUnknown(error)
      if (retained) {
        message.warning(
          '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
        )
      } else {
        message.error(getActionErrorMessage(error, '登记采购到货失败'))
      }
    } finally {
      submittingRef.current = false
      setGeneratingInboundDraft(false)
    }
  }, [closeInboundDraftModal, form, navigate, selectedOrder])

  const hasInboundDraftRemaining = useMemo(
    () => inboundDraftPreviewRows.some((row) => row.canGenerate),
    [inboundDraftPreviewRows]
  )

  return {
    closeInboundDraftModal,
    createInboundDraftFromOrder,
    generatingInboundDraft,
    hasInboundDraftRemaining,
    inboundDraftModalOpen,
    inboundDraftPreviewLoading,
    inboundDraftPreviewError,
    inboundDraftPreviewRows,
    openInboundDraftModal,
  }
}
