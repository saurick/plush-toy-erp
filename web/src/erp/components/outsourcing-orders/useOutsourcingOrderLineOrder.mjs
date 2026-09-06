import { useEffect, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { reorderOutsourcingOrderItems } from '../../api/masterDataOrderApi.mjs'
import {
  isMutationResultUnknown,
  isResourceVersionConflict,
  selectOpenSourceDocumentItems,
} from '../../utils/sourceDocumentMutation.mjs'

export function useOutsourcingOrderLineOrder({
  selectedRow,
  selectedOrderCanReorder,
  loadOrderItems,
  setSaving,
  activeCustomerKey,
  outsourcingOrderItemsPreview,
  setRows,
  setSelectedRow,
  loadOrders,
}) {
  const [lineOrderLoading, setLineOrderLoading] = useState(false)

  const [lineOrderOpen, setLineOrderOpen] = useState(false)

  const [lineOrderContext, setLineOrderContext] = useState({
    order: null,
    items: [],
  })

  const lineOrderRequestRef = useRef(0)

  const selectedRowIDRef = useRef(0)
  useEffect(() => {
    selectedRowIDRef.current = Number(selectedRow?.id || 0)
  }, [selectedRow?.id])
  useEffect(
    () => () => {
      lineOrderRequestRef.current += 1
      selectedRowIDRef.current = 0
    },
    []
  )
  const closeLineOrder = () => {
    lineOrderRequestRef.current += 1
    setLineOrderOpen(false)
  }

  const openOutsourcingOrderLineOrder = async () => {
    const order = selectedRow
    if (!selectedOrderCanReorder) {
      message.warning(
        order ? '当前状态不能调整加工明细顺序' : '请先选择一条加工合同'
      )
      return
    }
    const requestID = lineOrderRequestRef.current + 1
    lineOrderRequestRef.current = requestID
    setLineOrderLoading(true)
    try {
      const items = await loadOrderItems(order)
      if (
        lineOrderRequestRef.current !== requestID ||
        selectedRowIDRef.current !== Number(order.id)
      ) {
        return
      }
      setLineOrderContext({
        order,
        items: selectOpenSourceDocumentItems(items),
      })
      setLineOrderOpen(true)
    } catch (error) {
      if (isResourceVersionConflict(error)) {
        message.warning('加工合同已被其他操作更新，请刷新后重试')
      } else {
        message.error(getActionErrorMessage(error, '加载加工明细顺序'))
      }
    } finally {
      if (lineOrderRequestRef.current === requestID) {
        setLineOrderLoading(false)
      }
    }
  }

  const applyOutsourcingOrderLineOrder = async (orderedItems) => {
    const { order } = lineOrderContext
    if (!order?.id || !Array.isArray(orderedItems)) return false
    setSaving(true)
    try {
      const result = await reorderOutsourcingOrderItems({
        customer_key: activeCustomerKey,
        id: order.id,
        expected_version: order.version,
        item_ids: orderedItems.map((item) => item.id),
      })
      const { outsourcing_order: savedOrder } = result
      const openItems = selectOpenSourceDocumentItems(
        result.outsourcing_order_items
      )
      outsourcingOrderItemsPreview.invalidate(order)
      setRows((current) =>
        current.map((item) => (item.id === savedOrder.id ? savedOrder : item))
      )
      setSelectedRow(savedOrder)
      setLineOrderContext({ order: savedOrder, items: openItems })
      message.success('加工明细顺序已保存')
      return true
    } catch (error) {
      if (isResourceVersionConflict(error)) {
        message.warning('加工合同已被其他操作更新，请刷新后重试')
        setLineOrderOpen(false)
        await loadOrders()
      } else if (isMutationResultUnknown(error)) {
        message.warning(
          '加工明细顺序保存结果尚未确认，请先刷新核对，不要连续重复提交'
        )
        setLineOrderOpen(false)
        await loadOrders()
      } else {
        message.error(getActionErrorMessage(error, '保存加工明细顺序'))
      }
      return false
    } finally {
      setSaving(false)
    }
  }
  return {
    lineOrderLoading,
    lineOrderOpen,
    lineOrderContext,
    closeLineOrder,
    openOutsourcingOrderLineOrder,
    applyOutsourcingOrderLineOrder,
  }
}
