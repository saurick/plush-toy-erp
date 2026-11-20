import { useRef, useState } from 'react'
import {
  InventoryLotStatus,
  ShipmentStatus,
  StockReservationStatus,
} from '../../../common/consts/statuses.generated.mjs'
import { showPageLoadError } from '../PageLoadFeedback.jsx'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  listAllInventoryBalances,
  listAllInventoryLots,
} from '../../api/inventoryApi.mjs'
import {
  getSalesOrder,
  listAllSalesOrderItems,
  listAllWarehouses,
} from '../../api/masterDataOrderApi.mjs'
import {
  createStockReservationFromSalesOrder,
  listAllShipments,
  listAllStockReservations,
} from '../../api/operationalFactApi.mjs'
import {
  buildSalesOrderReservationItemChoices,
  buildSalesOrderReservationPayload,
  validateSalesOrderReservationResult,
} from '../../utils/salesOrderReservationAction.mjs'
import {
  createSourceBusinessActionAttemptStore,
  sourceBusinessActionNo,
} from '../../utils/sourceBusinessAction.mjs'

const EMPTY_CONTEXT = Object.freeze({
  order: null,
  items: [],
  reservations: [],
  shipments: [],
  balances: [],
  warehouses: [],
})

function inventoryParams(item = {}) {
  return {
    subject_type: 'PRODUCT',
    subject_id: Number(item.product_id || 0),
    ...(Number(item.product_sku_id || 0) > 0
      ? { product_sku_id: Number(item.product_sku_id) }
      : {}),
  }
}

function enrichBalances(balances = [], warehouses = [], lots = []) {
  const warehousesByID = new Map(
    (Array.isArray(warehouses) ? warehouses : []).map((warehouse) => [
      Number(warehouse?.id || 0),
      warehouse,
    ])
  )
  const lotsByID = new Map(
    (Array.isArray(lots) ? lots : []).map((lot) => [Number(lot?.id || 0), lot])
  )
  return (Array.isArray(balances) ? balances : [])
    .filter(
      (balance) => !balance?.lot_id || lotsByID.has(Number(balance.lot_id))
    )
    .map((balance) => {
      const warehouse = warehousesByID.get(Number(balance?.warehouse_id || 0))
      const lot = lotsByID.get(Number(balance?.lot_id || 0))
      return {
        ...balance,
        warehouse_name: warehouse?.name || warehouse?.code || '',
        lot_no: lot?.lot_no || '',
      }
    })
}

async function loadStock(item, options = {}) {
  const params = inventoryParams(item)
  const [balanceData, lotData] = await Promise.all([
    listAllInventoryBalances(params, options),
    listAllInventoryLots(
      { ...params, status: InventoryLotStatus.ACTIVE },
      options
    ),
  ])
  return {
    balances: Array.isArray(balanceData?.inventory_balances)
      ? balanceData.inventory_balances
      : [],
    lots: Array.isArray(lotData?.inventory_lots) ? lotData.inventory_lots : [],
  }
}

export function useSalesOrderReservation({
  activeCustomerKey,
  beginLatestRequest,
  loadOrders,
  selectedOrder,
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState(EMPTY_CONTEXT)
  const inFlightRef = useRef(false)
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const selectedOrderIDRef = useRef(0)
  selectedOrderIDRef.current = Number(selectedOrder?.id || 0)

  const close = () => {
    if (inFlightRef.current) return
    for (const key of [
      'sales-order-reservation-context',
      'sales-order-reservation-balances',
    ]) {
      const invalidation = beginLatestRequest(key)
      invalidation.finish()
    }
    setOpen(false)
    setLoading(false)
    setContext(EMPTY_CONTEXT)
  }

  const loadBalances = async (item) => {
    const orderID = Number(context.order?.id || 0)
    const request = beginLatestRequest('sales-order-reservation-balances')
    if (!item || orderID <= 0) {
      request.finish()
      setLoading(false)
      setContext((current) => ({ ...current, balances: [] }))
      return
    }
    setLoading(true)
    try {
      const stock = await loadStock(item, { signal: request.signal })
      if (!request.isCurrent() || selectedOrderIDRef.current !== orderID) return
      setContext((current) =>
        Number(current.order?.id || 0) === orderID
          ? {
              ...current,
              balances: enrichBalances(
                stock.balances,
                current.warehouses,
                stock.lots
              ),
            }
          : current
      )
    } catch (error) {
      if (request.isCurrent() && !isRpcAbortError(error)) {
        setContext((current) => ({ ...current, balances: [] }))
        showPageLoadError(error, '加载可用库存')
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }

  const openForSelectedOrder = async () => {
    const orderID = Number(selectedOrder?.id || 0)
    if (
      orderID <= 0 ||
      String(selectedOrder?.lifecycle_status || '').toLowerCase() !== 'active'
    ) {
      message.warning('请先选择已生效的销售订单')
      return
    }
    selectedOrderIDRef.current = orderID
    const request = beginLatestRequest('sales-order-reservation-context')
    setLoading(true)
    try {
      const freshOrder = await getSalesOrder(
        { id: orderID },
        { signal: request.signal }
      )
      if (!request.isCurrent() || selectedOrderIDRef.current !== orderID) return
      if (
        String(freshOrder?.lifecycle_status || '').toLowerCase() !== 'active'
      ) {
        message.warning('销售订单状态已变化，请刷新后重试')
        await loadOrders()
        return
      }
      const itemData = await listAllSalesOrderItems(
        {
          sales_order_id: orderID,
          expected_version: freshOrder.version,
        },
        { signal: request.signal }
      )
      const items = Array.isArray(itemData?.sales_order_items)
        ? itemData.sales_order_items
        : []
      const [reservationData, shipmentData, warehouseData] = await Promise.all([
        listAllStockReservations(
          {
            source_id: orderID,
            status: StockReservationStatus.ACTIVE,
          },
          { signal: request.signal }
        ),
        listAllShipments(
          { source_id: orderID, status: ShipmentStatus.SHIPPED },
          { signal: request.signal }
        ),
        listAllWarehouses({ active_only: true }, { signal: request.signal }),
      ])
      if (!request.isCurrent() || selectedOrderIDRef.current !== orderID) return
      const warehouses = Array.isArray(warehouseData?.warehouses)
        ? warehouseData.warehouses
        : []
      const reservations = Array.isArray(reservationData?.stock_reservations)
        ? reservationData.stock_reservations
        : []
      const shipments = Array.isArray(shipmentData?.shipments)
        ? shipmentData.shipments
        : []
      if (
        Number(reservationData?.total || reservations.length) >
          reservations.length ||
        Number(shipmentData?.total || shipments.length) > shipments.length
      ) {
        message.warning('相关预留或出货记录未完整加载，暂不能新增预留')
        return
      }
      const firstReservableItem = buildSalesOrderReservationItemChoices(
        items,
        reservations,
        shipments
      ).find((choice) => !choice.disabled)?.item
      if (!firstReservableItem) {
        message.warning('当前销售订单已没有可预留数量')
        return
      }
      const stock = await loadStock(firstReservableItem, {
        signal: request.signal,
      })
      if (!request.isCurrent() || selectedOrderIDRef.current !== orderID) return
      setContext({
        order: freshOrder,
        items,
        reservations,
        shipments,
        balances: enrichBalances(stock.balances, warehouses, stock.lots),
        warehouses,
      })
      setOpen(true)
    } catch (error) {
      if (request.isCurrent() && !isRpcAbortError(error)) {
        showPageLoadError(error, '加载库存预留详情')
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }

  const submit = async (values) => {
    if (inFlightRef.current || !context.order) return
    let scope
    let attempt
    let params
    try {
      const payload = {
        ...buildSalesOrderReservationPayload(
          values,
          context.order,
          context.items,
          context.balances,
          context.reservations,
          context.shipments
        ),
        customer_key: activeCustomerKey || undefined,
      }
      scope = `sales-order-reservation:${context.order.id}:${payload.sales_order_item_id}`
      attempt = attemptsRef.current.prepare(scope, payload)
      params = {
        ...attempt.params,
        reservation_no: sourceBusinessActionNo(
          'RSV',
          context.order.order_no,
          attempt.params.idempotency_key
        ),
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备库存预留'))
      return
    }
    inFlightRef.current = true
    setLoading(true)
    try {
      const result = await createStockReservationFromSalesOrder(params)
      validateSalesOrderReservationResult(result, params)
      attemptsRef.current.settle(scope, attempt, null)
      setOpen(false)
      setContext(EMPTY_CONTEXT)
      message.success('库存预留已创建，可在“相关单据 → 出库 / 预留”查看')
    } catch (error) {
      const retained = attemptsRef.current.settle(scope, attempt, error)
      if (retained) {
        message.warning(
          '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
        )
      } else {
        message.error(getActionErrorMessage(error, '创建库存预留'))
      }
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  return {
    closeSalesOrderReservation: close,
    loadReservationBalances: loadBalances,
    openSalesOrderReservation: openForSelectedOrder,
    reservationContext: context,
    reservationLoading: loading,
    reservationOpen: open,
    submitSalesOrderReservation: submit,
  }
}
