import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PurchaseReturnStatus } from '../../../common/consts/statuses.generated.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  createPurchaseReturnFromQualityInspection,
  getPurchaseReceipt,
  listAllPurchaseReturns,
} from '../../api/purchaseApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { compactParams } from '../../utils/sourceDocumentValues.mjs'
import {
  buildPurchaseReturnFromQualityInspectionPayload,
  canCreatePurchaseReturnFromRejectedInspection,
  isRejectedIncomingInspection,
} from '../../utils/qualityInspectionSourceAction.mjs'
import { createSourceBusinessActionAttemptStore } from '../../utils/sourceBusinessAction.mjs'
import {
  isSourceActionPermissionDenied,
  SOURCE_ACCESS_REVOKED_MESSAGE,
} from '../../utils/sourceActionAccess.mjs'
import { positiveInt } from './QualityInspectionForms.jsx'
import { buildPurchaseReturnSourceSummary } from './qualityInspectionPageModel.mjs'

export default function useQualityInspectionPurchaseReturn({
  activeCustomerKey,
  canCreatePurchaseReturn,
  canCreateRejectionDisposition,
  canReadPurchaseReturn,
  inventoryLotOptions,
  materialOptions,
  purchaseReceiptItems,
  purchaseReceipts,
  qualityReturnAccess,
  referenceDataState,
  selectedRow,
  setRejectionDispositionOpen,
  warehouseOptions,
}) {
  const [purchaseReturnModal, setPurchaseReturnModal] = useState(null)
  const [purchaseReturnLoading, setPurchaseReturnLoading] = useState(false)
  const [selectedRowPurchaseReceipt, setSelectedRowPurchaseReceipt] =
    useState(null)
  const [selectedRowPurchaseReceiptLoading, setSelectedRowPurchaseReceiptLoading] =
    useState(false)
  const [returnedInspectionIDs, setReturnedInspectionIDs] = useState(
    () => new Set()
  )
  const purchaseReturnInFlightRef = useRef(false)
  const purchaseReturnAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const selectedRowPurchaseReceiptRequestRef = useRef(0)
  const qualityReturnAccessRef = useRef(qualityReturnAccess)
  qualityReturnAccessRef.current = qualityReturnAccess
  const beginPurchaseReturnRequest = useLatestRequestCoordinator()

  const closePurchaseReturnSource = useCallback(() => {
    beginPurchaseReturnRequest('purchase-return').finish()
    setPurchaseReturnModal(null)
    setPurchaseReturnLoading(false)
  }, [beginPurchaseReturnRequest])

  useEffect(() => {
    if (canCreatePurchaseReturn) return
    closePurchaseReturnSource()
    if (purchaseReturnModal) message.warning(SOURCE_ACCESS_REVOKED_MESSAGE)
  }, [canCreatePurchaseReturn, closePurchaseReturnSource, purchaseReturnModal])

  useEffect(() => {
    const receiptID = positiveInt(selectedRow?.purchase_receipt_id)
    const requestID = selectedRowPurchaseReceiptRequestRef.current + 1
    selectedRowPurchaseReceiptRequestRef.current = requestID
    setSelectedRowPurchaseReceipt(null)

    if (
      !receiptID ||
      !isRejectedIncomingInspection(selectedRow) ||
      (!canCreatePurchaseReturn && !canCreateRejectionDisposition)
    ) {
      setSelectedRowPurchaseReceiptLoading(false)
      return undefined
    }

    setSelectedRowPurchaseReceiptLoading(true)
    const request = beginPurchaseReturnRequest('selected-receipt')
    getPurchaseReceipt({ id: receiptID }, { signal: request.signal })
      .then((receipt) => {
        if (selectedRowPurchaseReceiptRequestRef.current !== requestID) return
        setSelectedRowPurchaseReceipt(
          positiveInt(receipt?.id) === receiptID ? receipt : null
        )
      })
      .catch((error) => {
        if (selectedRowPurchaseReceiptRequestRef.current !== requestID) return
        if (isSourceActionPermissionDenied(error)) {
          closePurchaseReturnSource()
          setRejectionDispositionOpen(false)
          message.warning(SOURCE_ACCESS_REVOKED_MESSAGE)
        } else {
          message.error(getActionErrorMessage(error, '核对来源收货状态'))
        }
        setSelectedRowPurchaseReceipt(null)
      })
      .finally(() => {
        request.finish()
        if (selectedRowPurchaseReceiptRequestRef.current === requestID) {
          setSelectedRowPurchaseReceiptLoading(false)
        }
      })

    return () => {
      beginPurchaseReturnRequest('selected-receipt').finish()
      if (selectedRowPurchaseReceiptRequestRef.current === requestID) {
        selectedRowPurchaseReceiptRequestRef.current += 1
      }
    }
  }, [
    beginPurchaseReturnRequest,
    canCreatePurchaseReturn,
    canCreateRejectionDisposition,
    closePurchaseReturnSource,
    selectedRow,
    setRejectionDispositionOpen,
  ])

  const markInspectionReturned = useCallback((inspectionID) => {
    const id = positiveInt(inspectionID)
    if (!id) return
    setReturnedInspectionIDs((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  }, [])

  const openPurchaseReturn = useCallback(
    async (inspection) => {
      if (!qualityReturnAccessRef.current.allowed) {
        message.warning(qualityReturnAccessRef.current.reason)
        return
      }
      if (referenceDataState !== 'ready') {
        message.warning(
          referenceDataState === 'loading'
            ? '质检来源资料正在加载，请稍后再生成采购退货'
            : '质检来源资料加载失败，请先刷新当前页后重试'
        )
        return
      }
      if (
        !canCreatePurchaseReturn ||
        !isRejectedIncomingInspection(inspection)
      ) {
        message.warning('只有已判定不合格的来料质检单可以退供应商')
        return
      }
      if (
        !canCreatePurchaseReturnFromRejectedInspection(
          inspection,
          selectedRowPurchaseReceipt
        )
      ) {
        message.warning(
          '首次到货检验不合格只会阻止入库；只有已入库后追加检验不合格才可退供应商'
        )
        return
      }
      if (returnedInspectionIDs.has(inspection.id)) {
        message.info('该质检单已生成采购退货')
        return
      }

      setPurchaseReturnLoading(true)
      const request = beginPurchaseReturnRequest('purchase-return')
      try {
        if (canReadPurchaseReturn) {
          const data = await listAllPurchaseReturns(
            compactParams({ quality_inspection_id: inspection.id }),
            { signal: request.signal }
          )
          if (
            !request.isCurrent() ||
            !qualityReturnAccessRef.current.allowed
          ) {
            return
          }
          const activeReturn = (
            Array.isArray(data?.purchase_returns) ? data.purchase_returns : []
          ).find(
            (item) =>
              String(item?.status || '').toUpperCase() !==
              PurchaseReturnStatus.CANCELLED
          )
          if (activeReturn) {
            markInspectionReturned(inspection.id)
            message.info('该质检单已生成采购退货')
            return
          }
        }
        if (request.isCurrent() && qualityReturnAccessRef.current.allowed) {
          setPurchaseReturnModal({ inspection })
        }
      } catch (error) {
        if (!request.isCurrent()) return
        if (isSourceActionPermissionDenied(error)) {
          closePurchaseReturnSource()
          message.warning(SOURCE_ACCESS_REVOKED_MESSAGE)
        } else {
          message.error(getActionErrorMessage(error, '核对采购退货状态'))
        }
      } finally {
        if (request.isCurrent()) {
          setPurchaseReturnLoading(false)
          request.finish()
        }
      }
    },
    [
      beginPurchaseReturnRequest,
      canCreatePurchaseReturn,
      canReadPurchaseReturn,
      closePurchaseReturnSource,
      markInspectionReturned,
      referenceDataState,
      returnedInspectionIDs,
      selectedRowPurchaseReceipt,
    ]
  )

  const closePurchaseReturn = useCallback(() => {
    if (purchaseReturnInFlightRef.current) return
    closePurchaseReturnSource()
  }, [closePurchaseReturnSource])

  const submitPurchaseReturn = useCallback(
    async (values) => {
      const inspection = purchaseReturnModal?.inspection
      if (
        purchaseReturnInFlightRef.current ||
        !isRejectedIncomingInspection(inspection)
      ) {
        return false
      }
      if (!qualityReturnAccessRef.current.allowed) {
        closePurchaseReturnSource()
        message.warning(SOURCE_ACCESS_REVOKED_MESSAGE)
        return false
      }

      let scope
      let attempt
      try {
        const payload = buildPurchaseReturnFromQualityInspectionPayload(
          values,
          inspection,
          activeCustomerKey
        )
        scope = `quality-purchase-return:${inspection.id}`
        attempt = purchaseReturnAttemptsRef.current.prepare(scope, payload)
      } catch (error) {
        message.error(getActionErrorMessage(error, '准备采购退货'))
        return false
      }

      purchaseReturnInFlightRef.current = true
      const request = beginPurchaseReturnRequest('purchase-return')
      setPurchaseReturnLoading(true)
      try {
        const created = await createPurchaseReturnFromQualityInspection(
          attempt.params
        )
        if (
          Number(created?.id || 0) <= 0 ||
          Number(created?.quality_inspection_id || 0) !== inspection.id ||
          String(created?.status || '').toUpperCase() !==
            PurchaseReturnStatus.DRAFT
        ) {
          const error = new Error('采购退货返回结果与当前质检单不一致')
          error.isInvalidResponse = true
          throw error
        }
        purchaseReturnAttemptsRef.current.settle(scope, attempt, null)
        if (!request.isCurrent() || !qualityReturnAccessRef.current.allowed) {
          return false
        }
        markInspectionReturned(inspection.id)
        closePurchaseReturnSource()
        message.success('采购退货草稿已生成，请到采购退货记录核对并确认')
        return true
      } catch (error) {
        const retained = purchaseReturnAttemptsRef.current.settle(
          scope,
          attempt,
          error
        )
        if (!request.isCurrent()) return false
        if (isSourceActionPermissionDenied(error)) {
          closePurchaseReturnSource()
          message.warning(SOURCE_ACCESS_REVOKED_MESSAGE)
          return false
        }
        if (retained) {
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
        } else {
          message.error(getActionErrorMessage(error, '生成采购退货草稿'))
        }
        return false
      } finally {
        purchaseReturnInFlightRef.current = false
        if (request.isCurrent()) {
          setPurchaseReturnLoading(false)
          request.finish()
        }
      }
    },
    [
      activeCustomerKey,
      beginPurchaseReturnRequest,
      closePurchaseReturnSource,
      markInspectionReturned,
      purchaseReturnModal,
    ]
  )

  const purchaseReturnSourceSummary = useMemo(
    () =>
      buildPurchaseReturnSourceSummary({
        inspection: purchaseReturnModal?.inspection,
        purchaseReceipts,
        purchaseReceiptItems,
        selectedRowPurchaseReceipt,
        materialOptions,
        warehouseOptions,
        inventoryLotOptions,
      }),
    [
      inventoryLotOptions,
      materialOptions,
      purchaseReceiptItems,
      purchaseReceipts,
      purchaseReturnModal?.inspection,
      selectedRowPurchaseReceipt,
      warehouseOptions,
    ]
  )

  return {
    closePurchaseReturn,
    openPurchaseReturn,
    purchaseReturnLoading,
    purchaseReturnModal,
    purchaseReturnSourceSummary,
    returnedInspectionIDs,
    selectedRowPurchaseReceipt,
    selectedRowPurchaseReceiptLoading,
    submitPurchaseReturn,
  }
}
