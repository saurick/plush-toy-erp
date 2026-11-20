import { useCallback, useEffect, useRef, useState } from 'react'
import { Form } from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listShipmentSourceCandidates } from '../../api/operationalFactApi.mjs'
import { showPageLoadError } from '../PageLoadFeedback.jsx'
import { salesOrderCustomerText } from './ShipmentEditor.jsx'
import {
  canUndoShipmentSourceImport,
  createShipmentSourceImportUndo,
  shipmentSourceImportSnapshot,
} from '../../utils/shipmentSourceImportUndo.mjs'
import { deliverySnapshotFormValues } from '../../utils/sourcePartySnapshots.mjs'
import {
  createShipmentItemFromSalesOrderItem,
  isBlankShipmentItem,
  positiveInt,
} from '../../utils/businessLineItems.mjs'
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'
import { mergeReferenceRecords } from '../../utils/remoteReferences.mjs'
import {
  SHIPMENT_SOURCE_CANDIDATE_PAGE_SIZE,
  loadShipmentSourceSelection,
  normalizeShipmentSourceCandidate,
  shipmentSourceCandidateListParams,
  shipmentSourceOrderFromCandidate,
} from '../../utils/shipmentSourceCandidate.mjs'

export default function useShipmentSourceImport({
  beginLatestRequest,
  canCreate,
  canImportSalesOrderSource,
  canUpdate,
  isCreateModal,
  isEditModal,
  salesOrderItems,
  salesOrdersByID,
  saving,
  setSalesOrderItems,
  setSalesOrders,
  shipmentForm,
  taskDraftSavingRef,
}) {
  const [salesOrderSources, setSalesOrderSources] = useState([])
  const [salesOrderSourceItems, setSalesOrderSourceItems] = useState([])
  const [shipmentSourceRows, setShipmentSourceRows] = useState([])
  const [salesOrderSourceTotal, setSalesOrderSourceTotal] = useState(0)
  const [salesOrderSourceCurrent, setSalesOrderSourceCurrent] = useState(1)
  const [salesOrderSourceLoadFailed, setSalesOrderSourceLoadFailed] =
    useState(false)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [salesOrderImportOpen, setSalesOrderImportOpen] = useState(false)
  const [sourceImportUndo, setSourceImportUndo] = useState(null)
  const [salesOrderSourceFilters, setSalesOrderSourceFilters] = useState({
    selectable: true,
  })
  const [salesOrderSourceOrders, setSalesOrderSourceOrders] = useState([])
  const salesOrderSourceQueryRef = useRef({ keyword: '', page: 1 })
  const sourceImportSnapshot = Form.useWatch(shipmentSourceImportSnapshot, {
    form: shipmentForm,
    preserve: true,
  })

  useEffect(() => {
    setSourceImportUndo((current) => {
      if (
        !current ||
        current.invalidated ||
        canUndoShipmentSourceImport(
          current,
          shipmentForm.getFieldsValue(true)
        )
      ) {
        return current
      }
      return { ...current, invalidated: true }
    })
  }, [shipmentForm, sourceImportSnapshot])

  const acceptSalesOrderSourceRows = useCallback(
    (rows) => {
      setSalesOrderSourceItems((current) =>
        mergeReferenceRecords(current, rows)
      )
      setSalesOrderItems((currentItems) =>
        mergeReferenceRecords(currentItems, rows)
      )
      setShipmentSourceRows((current) =>
        mergeReferenceRecords(current, rows)
      )
      setSalesOrders((current) =>
        mergeReferenceRecords(
          current.filter(
            (order) =>
              Number.isSafeInteger(Number(order?.id)) && Number(order.id) > 0
          ),
          rows.map(shipmentSourceOrderFromCandidate)
        )
      )
    },
    [setSalesOrderItems, setSalesOrders]
  )

  const loadSalesOrderSources = useCallback(
    async function loadCandidatePage({
      keyword = '',
      page = 1,
      filters = salesOrderSourceQueryRef.current.filters || {},
    } = {}) {
      const normalizedKeyword = String(keyword || '').trim()
      const normalizedPage = Number(page) || 1
      const request = beginLatestRequest('shipment-source-candidates')
      salesOrderSourceQueryRef.current = {
        keyword: normalizedKeyword,
        page: normalizedPage,
        filters,
      }
      setSalesOrderSourceCurrent(normalizedPage)
      setSalesOrderSourceLoadFailed(false)
      setSourceLoading(true)
      try {
        const params = shipmentSourceCandidateListParams({
          keyword: normalizedKeyword,
          page: normalizedPage,
          pageSize: SHIPMENT_SOURCE_CANDIDATE_PAGE_SIZE,
          salesOrderID:
            shipmentForm.getFieldValue('sales_order_id') ||
            filters.salesOrderID,
          customerID: filters.customerID,
          selectable: filters.selectable !== false,
        })
        const data = await listShipmentSourceCandidates(params, {
          signal: request.signal,
        })
        if (!request.isCurrent()) return false
        const lastPage = Math.max(1, Math.ceil(data.total / SHIPMENT_SOURCE_CANDIDATE_PAGE_SIZE))
        if (normalizedPage > lastPage) {
          return loadCandidatePage({ keyword: normalizedKeyword, page: lastPage, filters })
        }
        const nextSourceRows = data.shipment_source_candidates.map(
          normalizeShipmentSourceCandidate
        )
        setSalesOrderSourceOrders(data.source_orders)
        setSalesOrderSources(nextSourceRows)
        setSalesOrderSourceTotal(data.total)
        acceptSalesOrderSourceRows(nextSourceRows)
        return true
      } catch (error) {
        if (isRpcAbortError(error) || !request.isCurrent()) return false
        setSalesOrderSources([])
        setSalesOrderSourceTotal(0)
        setSalesOrderSourceLoadFailed(true)
        showPageLoadError(error, '加载销售订单来源')
        return false
      } finally {
        if (request.isCurrent()) {
          setSourceLoading(false)
          request.finish()
        }
      }
    },
    [acceptSalesOrderSourceRows, beginLatestRequest, shipmentForm]
  )

  const handleSalesOrderSourceSelectAll = useCallback(
    async ({ signal, expectedTotal }) => {
      try {
        if (!canImportSalesOrderSource) {
          throw new Error('当前账号不能读取销售订单来源行')
        }
        const { keyword, filters = {} } = salesOrderSourceQueryRef.current
        const params = shipmentSourceCandidateListParams({
          keyword,
          salesOrderID:
            shipmentForm.getFieldValue('sales_order_id') ||
            filters.salesOrderID,
          customerID: filters.customerID,
          selectable: filters.selectable !== false,
        })
        const rows = await loadShipmentSourceSelection(
          listShipmentSourceCandidates,
          params,
          { signal, expectedTotal }
        )
        if (!signal.aborted) acceptSalesOrderSourceRows(rows)
        return rows
      } catch (error) {
        if (!signal.aborted && !isRpcAbortError(error)) {
          showPageLoadError(error, '全选销售订单来源')
        }
        throw error
      }
    },
    [
      acceptSalesOrderSourceRows,
      canImportSalesOrderSource,
      shipmentForm,
    ]
  )

  const handleSalesOrderSourceSearch = useCallback(
    (keyword) => {
      const normalizedKeyword = String(keyword || '').trim()
      const currentQuery = salesOrderSourceQueryRef.current
      if (
        currentQuery.keyword === normalizedKeyword &&
        currentQuery.page === 1
      ) {
        return
      }
      loadSalesOrderSources({ keyword: normalizedKeyword, page: 1 })
    },
    [loadSalesOrderSources]
  )

  const handleSalesOrderSourcePageChange = useCallback(
    (page, _pageSize, keyword) => {
      loadSalesOrderSources({ keyword, page })
    },
    [loadSalesOrderSources]
  )

  const handleSalesOrderSourceReload = useCallback(
    (keyword, page) => {
      loadSalesOrderSources({ keyword, page })
    },
    [loadSalesOrderSources]
  )

  const handleSalesOrderSourceFiltersChange = useCallback(
    (filters, { keyword = salesOrderSourceQueryRef.current.keyword } = {}) => {
      setSalesOrderSourceFilters(filters)
      loadSalesOrderSources({ keyword, page: 1, filters })
    },
    [loadSalesOrderSources]
  )

  const openSalesOrderImport = useCallback(() => {
    if (!canImportSalesOrderSource) {
      message.warning('当前账号不能读取销售订单来源行')
      return
    }
    setSalesOrderSources([])
    setSalesOrderSourceItems([])
    setSalesOrderSourceOrders([])
    setShipmentSourceRows([])
    setSalesOrderSourceTotal(0)
    setSalesOrderSourceCurrent(1)
    setSalesOrderSourceLoadFailed(false)
    const filters = { selectable: true }
    setSalesOrderSourceFilters(filters)
    salesOrderSourceQueryRef.current = { keyword: '', page: 1, filters }
    setSalesOrderImportOpen(true)
    loadSalesOrderSources({ keyword: '', page: 1, filters })
  }, [canImportSalesOrderSource, loadSalesOrderSources])

  const importSalesOrderToShipment = useCallback(
    async (sourceItems = []) => {
      if (
        !canImportSalesOrderSource ||
        saving ||
        taskDraftSavingRef.current ||
        !(isCreateModal ? canCreate : isEditModal && canUpdate)
      ) {
        return
      }
      const importableItems = sourceItems.filter(
        (item) =>
          item.selectable === true &&
          !item.disabledReason &&
          isPositiveNumeric20Scale6Units(
            numeric20Scale6Units(item.remainingQuantity)
          )
      )
      if (importableItems.length === 0) {
        message.warning('请选择仍有剩余可出货数量的销售订单行')
        return
      }
      const sourceOrderIDs = new Set(
        importableItems.map((item) => Number(item.sales_order_id || 0))
      )
      if (sourceOrderIDs.size !== 1) {
        message.warning('一次出货草稿只能导入同一张销售订单的来源行')
        return
      }
      const sourceOrderID = [...sourceOrderIDs][0]
      const currentSourceOrderID = positiveInt(
        shipmentForm.getFieldValue('sales_order_id')
      )
      if (currentSourceOrderID && currentSourceOrderID !== sourceOrderID) {
        message.warning('当前出货草稿只能继续导入同一张销售订单的来源行')
        return
      }
      const sourceOrder = salesOrdersByID.get(sourceOrderID)
      if (!sourceOrder?.id) return

      const before = shipmentForm.getFieldsValue(true)
      const currentItems = (before.items || []).filter(
        (item) => !isBlankShipmentItem(item)
      )
      const currentSourceItemIDs = new Set(
        currentItems
          .map((item) => positiveInt(item?.sales_order_item_id))
          .filter(Boolean)
      )
      const newSourceItems = importableItems.filter(
        (item) => !currentSourceItemIDs.has(positiveInt(item.id))
      )
      if (newSourceItems.length === 0) {
        message.warning('所选销售订单来源行已在当前出货明细中')
        return
      }

      try {
        setSourceLoading(true)
        const sameOrderItems = salesOrderSourceItems.filter(
          (item) => Number(item.sales_order_id || 0) === sourceOrderID
        )
        setSalesOrderItems(sameOrderItems)
        shipmentForm.setFieldsValue({
          sales_order_id: sourceOrder.id,
          customer_id: sourceOrder.customer_id,
          customer_snapshot: salesOrderCustomerText(sourceOrder),
          ...(currentSourceOrderID
            ? {}
            : deliverySnapshotFormValues(sourceOrder.delivery_snapshot)),
          total_net_weight_g: undefined,
          total_net_weight_items_signature: undefined,
          items: [
            ...currentItems,
            ...newSourceItems.map((item) =>
              createShipmentItemFromSalesOrderItem(item, {
                quantity: item.remainingQuantity,
              })
            ),
          ],
        })
        setSourceImportUndo({
          ...createShipmentSourceImportUndo(
            before,
            shipmentForm.getFieldsValue(true)
          ),
          salesOrderItems: structuredClone(salesOrderItems),
        })
        if (String(before.total_net_weight_g ?? '').trim()) {
          message.warning(
            '出货明细已变更，旧人工总净重已清空；撤销本次导入可恢复'
          )
        }
        message.success('已导入销售订单来源行和剩余可出货数量')
        setSalesOrderImportOpen(false)
      } catch (error) {
        message.error(getActionErrorMessage(error, '导入销售订单来源'))
      } finally {
        setSourceLoading(false)
      }
    },
    [
      canCreate,
      canImportSalesOrderSource,
      canUpdate,
      isCreateModal,
      isEditModal,
      salesOrderItems,
      salesOrderSourceItems,
      salesOrdersByID,
      saving,
      setSalesOrderItems,
      shipmentForm,
      taskDraftSavingRef,
    ]
  )

  const undoSourceImport = useCallback(() => {
    if (
      saving ||
      sourceLoading ||
      taskDraftSavingRef.current ||
      !canImportSalesOrderSource ||
      !(isCreateModal ? canCreate : isEditModal && canUpdate)
    ) {
      return false
    }
    if (
      !canUndoShipmentSourceImport(
        sourceImportUndo,
        shipmentForm.getFieldsValue(true)
      )
    ) {
      setSourceImportUndo((current) =>
        current ? { ...current, invalidated: true } : null
      )
      return false
    }
    shipmentForm.setFieldsValue(structuredClone(sourceImportUndo.values))
    setSalesOrderItems(sourceImportUndo.salesOrderItems)
    setSourceImportUndo(null)
    message.success('已撤销本次导入，原有明细和无关填写已保留')
    return true
  }, [
    canCreate,
    canImportSalesOrderSource,
    canUpdate,
    isCreateModal,
    isEditModal,
    saving,
    setSalesOrderItems,
    shipmentForm,
    sourceImportUndo,
    sourceLoading,
    taskDraftSavingRef,
  ])

  useEffect(() => {
    if (
      !canImportSalesOrderSource ||
      !(isCreateModal ? canCreate : isEditModal && canUpdate)
    ) {
      setSourceImportUndo(null)
    }
  }, [
    canCreate,
    canImportSalesOrderSource,
    canUpdate,
    isCreateModal,
    isEditModal,
  ])

  const resetShipmentSourceSelectionState = useCallback(() => {
    setSourceImportUndo(null)
    setSalesOrderItems([])
    setSalesOrderSources([])
    setSalesOrderSourceItems([])
    setShipmentSourceRows([])
    setSalesOrderSourceTotal(0)
    setSalesOrderSourceCurrent(1)
    setSalesOrderSourceLoadFailed(false)
    setSalesOrderImportOpen(false)
    salesOrderSourceQueryRef.current = { keyword: '', page: 1 }
  }, [setSalesOrderItems])

  const invalidateSourceImportUndo = useCallback(() => {
    setSourceImportUndo(null)
  }, [])

  return {
    handleSalesOrderSourceFiltersChange,
    handleSalesOrderSourcePageChange,
    handleSalesOrderSourceReload,
    handleSalesOrderSourceSearch,
    handleSalesOrderSourceSelectAll,
    importSalesOrderToShipment,
    invalidateSourceImportUndo,
    loadSalesOrderSources,
    openSalesOrderImport,
    resetShipmentSourceSelectionState,
    salesOrderImportOpen,
    salesOrderSourceCurrent,
    salesOrderSourceFilters,
    salesOrderSourceLoadFailed,
    salesOrderSourceOrders,
    salesOrderSources,
    salesOrderSourceTotal,
    setSalesOrderImportOpen,
    shipmentSourceRows,
    sourceImportUndo,
    sourceLoading,
    undoSourceImport,
  }
}
