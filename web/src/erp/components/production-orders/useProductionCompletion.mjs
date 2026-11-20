import { useRef, useState } from 'react'
import { InventoryLotStatus } from '../../../common/consts/statuses.generated.mjs'
import { showPageLoadError } from '../PageLoadFeedback.jsx'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listAllInventoryLots } from '../../api/inventoryApi.mjs'
import { listAllWarehouses } from '../../api/masterDataOrderApi.mjs'
import {
  createProductionCompletionFromOrder,
  listAllProductionFacts,
} from '../../api/operationalFactApi.mjs'
import { getProductionOrder } from '../../api/productionOrderApi.mjs'
import { getProductionWip } from '../../api/productionWipApi.mjs'
import {
  buildProductionCompletionChoices,
  buildProductionCompletionPayload,
  findProductionCompletionResult,
  validateProductionCompletionResult,
} from '../../utils/productionCompletionAction.mjs'
import { PRODUCTION_ORDER_STATUS } from '../../utils/productionOrderModel.mjs'
import {
  PRODUCTION_WIP_ROUTE_CODE,
  partitionProductionCompletionItems,
  productionWipCompletionEligibility,
  productionWipOrderItemLabel,
} from '../../utils/productionWipModel.mjs'
import {
  uniqueReferenceOptions,
  warehouseOptionFromRecord,
} from '../../utils/referenceSelectOptions.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
} from '../../utils/sourceBusinessAction.mjs'

const EMPTY_CONTEXT = Object.freeze({
  order: null,
  items: [],
  blockedItems: [],
  facts: [],
  initialValues: null,
  wipAggregate: null,
  warehouseOptions: [],
  lots: [],
})

function blockerText(blockedItems = []) {
  const details = blockedItems
    .slice(0, 3)
    .map(
      ({ item, reason }) =>
        `${productionWipOrderItemLabel(item)}：${String(reason || '').trim()}`
    )
  if (blockedItems.length > 3) {
    details.push(`另有 ${blockedItems.length - 3} 项路线明细暂不可办理`)
  }
  return details.join('；')
}

export function useProductionCompletion({
  activeCustomerKey,
  beginLatestRequest,
  canReadProductionWip,
  modal,
  refreshAfterSuccess,
  refreshProductionSources,
  reportBusinessResult,
  selected,
  selectedIDRef,
  setProductionRouteOpen,
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState(EMPTY_CONTEXT)
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const inFlightRef = useRef(false)

  const close = () => {
    if (inFlightRef.current) return
    const invalidation = beginLatestRequest('production-completion-context')
    invalidation.finish()
    setOpen(false)
    setLoading(false)
    setContext(EMPTY_CONTEXT)
  }

  const openForOrder = async (sourceBatch = null) => {
    const orderID = Number(selected?.id || 0)
    if (
      !orderID ||
      ![
        PRODUCTION_ORDER_STATUS.RELEASED,
        PRODUCTION_ORDER_STATUS.CLOSED,
      ].includes(selected?.status)
    ) {
      message.warning('请先选择已发布或已关闭的生产订单')
      return
    }
    const request = beginLatestRequest('production-completion-context')
    setLoading(true)
    try {
      const nextAggregate = await getProductionOrder(orderID, {
        signal: request.signal,
      })
      if (!request.isCurrent() || selectedIDRef.current !== orderID) return
      if (
        ![
          PRODUCTION_ORDER_STATUS.RELEASED,
          PRODUCTION_ORDER_STATUS.CLOSED,
        ].includes(nextAggregate?.order?.status)
      ) {
        message.warning('生产订单状态已变化，请刷新后重试')
        await refreshAfterSuccess()
        return
      }
      const orderItems = Array.isArray(nextAggregate.items)
        ? nextAggregate.items
        : []
      const hasRoutedItem = orderItems.some(
        (item) => item.route_code === PRODUCTION_WIP_ROUTE_CODE
      )
      if (hasRoutedItem && !canReadProductionWip) {
        modal.warning({
          maskClosable: true,
          title: '暂不能核对成品收仓条件',
          content:
            '当前账号没有查看生产工序的权限，无法核对路线明细是否完成手工或回货，请联系管理员调整岗位权限。',
        })
        return
      }
      const [factData, warehouseData, lotData, wipAggregate] =
        await Promise.all([
          listAllProductionFacts(
            {
              source_type: 'PRODUCTION_ORDER',
              source_id: orderID,
            },
            { signal: request.signal }
          ),
          listAllWarehouses({ active_only: true }, { signal: request.signal }),
          listAllInventoryLots(
            { status: InventoryLotStatus.ACTIVE },
            { signal: request.signal }
          ),
          hasRoutedItem
            ? getProductionWip(orderID, { signal: request.signal })
            : Promise.resolve(null),
        ])
      if (!request.isCurrent() || selectedIDRef.current !== orderID) return
      const { eligibleItems, blockedItems } =
        partitionProductionCompletionItems(orderItems, wipAggregate, {
          orderStatus: nextAggregate.order.status,
        })
      if (eligibleItems.length === 0) {
        modal.warning({
          maskClosable: true,
          title: '暂不能登记成品收仓',
          content:
            blockerText(blockedItems) || '当前没有可登记成品收仓的生产明细。',
        })
        return
      }
      const facts = Array.isArray(factData?.production_facts)
        ? factData.production_facts
        : []
      let initialValues = null
      if (sourceBatch) {
        const choice = buildProductionCompletionChoices(
          eligibleItems,
          facts,
          wipAggregate
        ).find((item) => item.value === sourceBatch.production_order_item_id)
        const batchChoice = choice?.batchChoices.find(
          (batch) => batch.value === sourceBatch.id
        )
        if (!batchChoice || batchChoice.disabled) {
          message.warning(
            '当前批次没有待登记的收仓数量，请核对已有收仓草稿或入库记录'
          )
          return
        }
        initialValues = {
          production_order_item_id: choice.value,
          production_wip_batch_id: batchChoice.value,
          quantity: batchChoice.remaining,
        }
      }
      setContext({
        order: nextAggregate.order,
        items: eligibleItems,
        blockedItems,
        facts,
        initialValues,
        wipAggregate,
        warehouseOptions: uniqueReferenceOptions(
          warehouseData?.warehouses,
          warehouseOptionFromRecord
        ),
        lots: Array.isArray(lotData?.inventory_lots)
          ? lotData.inventory_lots
          : [],
      })
      setProductionRouteOpen(false)
      setOpen(true)
    } catch (error) {
      if (!isRpcAbortError(error) && request.isCurrent()) {
        showPageLoadError(error, '加载成品收仓详情')
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }

  const submit = async (values) => {
    if (inFlightRef.current || !context.order) return
    const orderItem = context.items.find(
      (item) =>
        Number(item?.id || 0) === Number(values.production_order_item_id || 0)
    )
    if (!orderItem) {
      message.error('生产明细已变化，请关闭后重新办理')
      return
    }
    let payload
    try {
      payload = {
        ...buildProductionCompletionPayload(values, context.order, orderItem),
        customer_key: activeCustomerKey || undefined,
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '办理生产完工'))
      return
    }
    inFlightRef.current = true
    setLoading(true)
    try {
      if (orderItem.route_code === PRODUCTION_WIP_ROUTE_CODE) {
        if (!canReadProductionWip) {
          message.warning(
            '当前账号无法复核生产工序状态，请联系管理员调整岗位权限后重试'
          )
          return
        }
        let latestWipAggregate
        try {
          latestWipAggregate = await getProductionWip(context.order.id)
        } catch (error) {
          message.error(getActionErrorMessage(error, '复核生产完工条件'))
          return
        }
        const eligibility = productionWipCompletionEligibility(
          latestWipAggregate,
          orderItem,
          {
            orderStatus: latestWipAggregate.productionOrder?.status,
            productionWipBatchID: payload.production_wip_batch_id,
          }
        )
        if (!eligibility.eligible) {
          message.warning(`工序状态已变化：${eligibility.reason}`)
          return
        }
      }
      let scope
      let attempt
      let params
      try {
        scope = `production-completion:${context.order.id}:${payload.production_order_item_id}:${payload.production_wip_batch_id || 0}`
        attempt = attemptsRef.current.prepare(scope, payload)
        params = {
          ...attempt.params,
          fact_no: sourceBusinessActionNo(
            'PROD-FG',
            context.order.order_no,
            attempt.params.idempotency_key
          ),
        }
      } catch (error) {
        message.error(getActionErrorMessage(error, '准备成品收仓草稿'))
        return
      }
      let result
      let confirmedByReread = false
      try {
        result = await createProductionCompletionFromOrder(params)
        validateProductionCompletionResult(result, params, orderItem)
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) {
          attemptsRef.current.settle(scope, attempt, error)
          message.error(getActionErrorMessage(error, '生成成品收仓草稿'))
          return
        }
        try {
          const factData = await listAllProductionFacts({
            source_type: 'PRODUCTION_ORDER',
            source_id: context.order.id,
          })
          result = findProductionCompletionResult(
            factData?.production_facts,
            params,
            orderItem
          )
        } catch {
          result = null
        }
        if (!result) {
          attemptsRef.current.settle(scope, attempt, error)
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
          return
        }
        confirmedByReread = true
      }
      attemptsRef.current.settle(scope, attempt, null)
      try {
        await refreshProductionSources(context.order.id)
      } catch (error) {
        message.warning(getActionErrorMessage(error, '刷新成品收仓结果'))
      }
      reportBusinessResult(
        '成品收仓草稿已生成，待仓库核对并确认成品入库',
        result
      )
      setProductionRouteOpen(false)
      setOpen(false)
      setContext(EMPTY_CONTEXT)
      message.success(
        confirmedByReread
          ? '已重新读取并确认成品收仓草稿，请核对并确认成品入库'
          : '成品收仓草稿已生成，请核对并确认成品入库'
      )
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  return {
    closeProductionCompletion: close,
    completionContext: context,
    completionLoading: loading,
    completionOpen: open,
    openProductionCompletion: openForOrder,
    submitProductionCompletion: submit,
  }
}
