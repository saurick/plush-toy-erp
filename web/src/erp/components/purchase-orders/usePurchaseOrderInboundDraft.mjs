import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'

import useWorkflowTaskBusinessResult from '../../hooks/useWorkflowTaskBusinessResult.js'
import { loadReferenceIDs } from '../../utils/remoteReferences.mjs'
import { buildArrivalItems } from '../../utils/incomingAcceptance.mjs'
import {
  materialWarehouseOptions,
  recommendedMaterialWarehouse,
} from '../../utils/warehouseClassification.mjs'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getPurchaseOrderReceiptProgress } from '../../api/masterDataOrderApi.mjs'
import { createPurchaseReceiptFromPurchaseOrder } from '../../api/purchaseApi.mjs'
import { BUSINESS_ROUTE_PATHS } from '../../utils/masterDataOrderView.mjs'
import {
  createPurchaseReceiptMutationAttemptStore,
  isPurchaseReceiptMutationResultUnknown,
} from '../../utils/purchaseReceiptMutation.mjs'
import { routeWithQuery } from '../../utils/routeQuery.mjs'
import { PurchaseSourceActions } from '../../../common/consts/purchaseSourceActions.mjs'
import { sourceActionAccess, isSourceActionPermissionDenied, SOURCE_ACCESS_REVOKED_MESSAGE } from '../../utils/sourceActionAccess.mjs'
import {
  buildInboundDraftPreviewRows,
  todayInputValue,
} from './purchaseOrderPageConfig.mjs'

export function usePurchaseOrderInboundDraft({
  form,
  navigate,
  selectedOrder,
  warehouseOptions = [],
}) {
  const reportBusinessResult = useWorkflowTaskBusinessResult()
  const outletContext = useBusinessPageContext()
  const taskBusiness = outletContext?.taskBusiness
  const access = sourceActionAccess(outletContext?.adminProfile, PurchaseSourceActions.receipt)
  const accessRef = useRef(access)
  accessRef.current = access
  const [generatingInboundDraft, setGeneratingInboundDraft] = useState(false)
  const [inboundDraftModalOpen, setInboundDraftModalOpen] = useState(false)
  const [inboundDraftPreviewLoading, setInboundDraftPreviewLoading] =
    useState(false)
  const [inboundDraftPreviewRows, setInboundDraftPreviewRows] = useState([])
  const [inboundDraftPreviewError, setInboundDraftPreviewError] = useState('')
  const previewRequestRef = useRef(0)
  const previewAbortRef = useRef(null)
  useEffect(() => () => {
    previewRequestRef.current += 1
    previewAbortRef.current?.abort()
  }, [])
  const submittingRef = useRef(false)
  const mutationAttemptsRef = useRef(
    createPurchaseReceiptMutationAttemptStore()
  )

  const closeInboundDraftModal = useCallback(() => {
    previewRequestRef.current += 1
    previewAbortRef.current?.abort()
    setInboundDraftModalOpen(false)
    setInboundDraftPreviewRows([])
    setInboundDraftPreviewError('')
    setInboundDraftPreviewLoading(false)
    form.resetFields()
  }, [form])

  useEffect(() => {
    if (inboundDraftModalOpen && !access.allowed) {
      closeInboundDraftModal()
      message.warning(SOURCE_ACCESS_REVOKED_MESSAGE)
    }
  }, [access.allowed, closeInboundDraftModal, inboundDraftModalOpen])

  const openInboundDraftModal = useCallback(
    async (record) => {
      if (!record) {
        return
      }
      if (!accessRef.current.allowed) {
        message.warning(accessRef.current.reason)
        return
      }
      setInboundDraftPreviewRows([])
      setInboundDraftPreviewError('')
      previewAbortRef.current?.abort()
      const controller = new AbortController()
      previewAbortRef.current = controller
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
        }, { signal: controller.signal })
        if (request !== previewRequestRef.current) return
        const previewRows = buildInboundDraftPreviewRows(progress)
        const { materials } = await loadReferenceIDs(
          'materials',
          previewRows.map((row) => row.materialID),
          { signal: controller.signal }
        )
        if (request !== previewRequestRef.current) return
        const rows = previewRows.map((row) => {
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
        if (controller.signal.aborted || request !== previewRequestRef.current) return
        if (isSourceActionPermissionDenied(error)) {
          closeInboundDraftModal()
          message.warning(SOURCE_ACCESS_REVOKED_MESSAGE)
          return
        }
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
    [closeInboundDraftModal, form, warehouseOptions]
  )

  const createInboundDraftFromOrder = useCallback(async () => {
    if (!selectedOrder || submittingRef.current || !inboundDraftModalOpen) {
      return
    }
    if (!accessRef.current.allowed) {
      closeInboundDraftModal()
      message.warning(accessRef.current.reason)
      return
    }
    submittingRef.current = true
    const scope = `create-from-purchase-order:${selectedOrder.id}`
    const previewRequest = previewRequestRef.current
    let attempt
    try {
      const values = await form.validateFields()
      if (!accessRef.current.allowed || previewRequest !== previewRequestRef.current) return
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
      reportBusinessResult('到货已登记，已生成待检记录；检验通过后由仓库确认入库', receipt)
      message.success('到货已登记，已生成待检记录；检验通过后由仓库确认入库')
      if (taskBusiness) return
      navigate(
        routeWithQuery(BUSINESS_ROUTE_PATHS.purchaseReceipts, {
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
      if (isSourceActionPermissionDenied(error)) {
        closeInboundDraftModal()
        message.warning(SOURCE_ACCESS_REVOKED_MESSAGE)
      } else if (retained) {
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
  }, [closeInboundDraftModal, form, inboundDraftModalOpen, navigate, selectedOrder, reportBusinessResult, taskBusiness])

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
