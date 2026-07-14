import { useCallback, useMemo, useRef, useState } from 'react'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  createPurchaseReceiptFromPurchaseOrder,
  listPurchaseReceipts,
} from '../../api/purchaseApi.mjs'
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
  loadOrderItems,
  materials = [],
  navigate,
  selectedOrder,
  unitOptions = [],
}) {
  const [generatingInboundDraft, setGeneratingInboundDraft] = useState(false)
  const [inboundDraftModalOpen, setInboundDraftModalOpen] = useState(false)
  const [inboundDraftPreviewLoading, setInboundDraftPreviewLoading] =
    useState(false)
  const [inboundDraftPreviewRows, setInboundDraftPreviewRows] = useState([])
  const mutationAttemptsRef = useRef(
    createPurchaseReceiptMutationAttemptStore()
  )

  const closeInboundDraftModal = useCallback(() => {
    setInboundDraftModalOpen(false)
    setInboundDraftPreviewRows([])
  }, [])

  const openInboundDraftModal = useCallback(
    async (record) => {
      if (!record) {
        return
      }
      setInboundDraftPreviewRows([])
      const sourceOrderNo = record.purchase_order_no || '采购订单未编号'
      form.setFieldsValue({
        receipt_no: record.purchase_order_no
          ? `IN-${record.purchase_order_no}`
          : undefined,
        warehouse_id: undefined,
        received_at: todayInputValue(),
        note: `来源采购订单 ${sourceOrderNo}`,
      })
      setInboundDraftModalOpen(true)
      setInboundDraftPreviewLoading(true)
      try {
        const [orderItems, receiptData] = await Promise.all([
          loadOrderItems(record),
          listPurchaseReceipts({
            purchase_order_id: record.id,
            limit: 200,
          }),
        ])
        setInboundDraftPreviewRows(
          buildInboundDraftPreviewRows({
            orderItems,
            receipts: receiptData?.purchase_receipts || [],
            materialOptions: materials.map((item) => ({
              value: item.id,
              label: item.name || item.code || '材料已关联',
            })),
            unitOptions,
          })
        )
      } catch (error) {
        setInboundDraftPreviewRows([])
        message.warning(getActionErrorMessage(error, '加载采购来源明细失败'))
      } finally {
        setInboundDraftPreviewLoading(false)
      }
    },
    [form, loadOrderItems, materials, unitOptions]
  )

  const createInboundDraftFromOrder = useCallback(async () => {
    if (!selectedOrder) {
      return
    }
    const scope = `create-from-purchase-order:${selectedOrder.id}`
    let attempt
    try {
      const values = await form.validateFields()
      const payload = {
        purchase_order_id: selectedOrder.id,
        receipt_no: values.receipt_no,
        warehouse_id: Number(values.warehouse_id || 0),
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
      message.success('采购入库草稿已生成')
      navigate(
        routeWithQuery(V1_ROUTE_PATHS.purchaseReceipts, {
          receipt_id: receipt?.id,
          purchase_order_id: selectedOrder.id,
        })
      )
    } catch (error) {
      if (error?.errorFields) return
      const retained = attempt
        ? mutationAttemptsRef.current.settle(scope, attempt, error)
        : isPurchaseReceiptMutationResultUnknown(error)
      if (retained) {
        message.warning(
          '入库草稿生成结果尚未确认，系统将使用原请求核对，请不要重复生成。'
        )
      } else {
        message.error(getActionErrorMessage(error, '生成采购入库草稿失败'))
      }
    } finally {
      setGeneratingInboundDraft(false)
    }
  }, [closeInboundDraftModal, form, navigate, selectedOrder])

  const hasInboundDraftRemaining = useMemo(
    () => inboundDraftPreviewRows.some((row) => row.remainingQuantity > 0),
    [inboundDraftPreviewRows]
  )

  return {
    closeInboundDraftModal,
    createInboundDraftFromOrder,
    generatingInboundDraft,
    hasInboundDraftRemaining,
    inboundDraftModalOpen,
    inboundDraftPreviewLoading,
    inboundDraftPreviewRows,
    openInboundDraftModal,
  }
}
