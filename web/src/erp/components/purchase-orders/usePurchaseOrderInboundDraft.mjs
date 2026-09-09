import { useCallback, useMemo, useRef, useState } from 'react'
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
        item_warehouses: {},
        received_at: todayInputValue(),
        note: `来源采购订单 ${sourceOrderNo}`,
      })
      setInboundDraftModalOpen(true)
      setInboundDraftPreviewLoading(true)
      try {
        const progress = await getPurchaseOrderReceiptProgress({
          id: record.id,
        })
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
          'item_warehouses',
          Object.fromEntries(
            rows
              .filter((row) => row.canGenerate)
              .map((row) => [String(row.key), row.defaultWarehouseID])
          )
        )
      } catch (error) {
        setInboundDraftPreviewRows([])
        message.warning(getActionErrorMessage(error, '加载采购入库进度失败'))
      } finally {
        setInboundDraftPreviewLoading(false)
      }
    },
    [form, materials, warehouseOptions]
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
        item_warehouses: inboundDraftPreviewRows
          .filter((row) => row.canGenerate)
          .map((row) => ({
            purchase_order_item_id: row.key,
            warehouse_id: Number(
              values.item_warehouses?.[String(row.key)] || 0
            ),
          })),
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
          '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
        )
      } else {
        message.error(getActionErrorMessage(error, '生成采购入库草稿失败'))
      }
    } finally {
      setGeneratingInboundDraft(false)
    }
  }, [
    inboundDraftPreviewRows,
    closeInboundDraftModal,
    form,
    navigate,
    selectedOrder,
  ])

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
    inboundDraftPreviewRows,
    openInboundDraftModal,
  }
}
