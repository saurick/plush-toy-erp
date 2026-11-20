import { useRef, useState } from 'react'
import { InventoryLotStatus } from '../../../common/consts/statuses.generated.mjs'
import { showPageLoadError } from '../PageLoadFeedback.jsx'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listAllInventoryLots } from '../../api/inventoryApi.mjs'
import { listAllWarehouses } from '../../api/masterDataOrderApi.mjs'
import {
  createProductionMaterialIssueFromOrder,
  listAllProductionFacts,
} from '../../api/operationalFactApi.mjs'
import { getProductionOrder } from '../../api/productionOrderApi.mjs'
import {
  buildProductionMaterialIssuePayload,
  filterProductionMaterialIssueLots,
  findProductionMaterialIssueResult,
  isProductionMaterialIssueEligible,
  validateProductionMaterialIssueResult,
} from '../../utils/productionMaterialIssueAction.mjs'
import { PRODUCTION_MATERIAL_REQUIREMENTS_STATE } from '../../utils/productionOrderModel.mjs'
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
  orderItem: null,
  requirement: null,
  materialRequirementsState: '',
  warehouseOptions: [],
  lots: [],
})

export function useProductionMaterialIssue({
  activeCustomerKey,
  aggregate,
  beginLatestRequest,
  canCreateMaterialIssue,
  canReadProductionFacts,
  refreshProductionSources,
  reportBusinessResult,
  selected,
  selectedIDRef,
  setAggregate,
  setFormMode,
  setFormValues,
  setSelected,
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lotsLoading, setLotsLoading] = useState(false)
  const [context, setContext] = useState(EMPTY_CONTEXT)
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const inFlightRef = useRef(false)

  const close = () => {
    if (inFlightRef.current) return
    for (const key of [
      'production-material-issue-context',
      'production-material-issue-lots',
    ]) {
      const invalidation = beginLatestRequest(key)
      invalidation.finish()
    }
    setOpen(false)
    setLoading(false)
    setLotsLoading(false)
    setContext(EMPTY_CONTEXT)
  }

  const openForRequirement = async (requirement) => {
    const orderID = Number(aggregate?.order?.id || selected?.id || 0)
    if (!canCreateMaterialIssue || !canReadProductionFacts) {
      message.warning('当前账号不能登记生产领料')
      return
    }
    if (
      !isProductionMaterialIssueEligible(
        aggregate?.order,
        aggregate?.materialRequirementsState,
        requirement
      )
    ) {
      message.warning('当前物料需求尚不能领料，请刷新后核对')
      return
    }

    const request = beginLatestRequest('production-material-issue-context')
    setLoading(true)
    try {
      const nextAggregate = await getProductionOrder(orderID, {
        signal: request.signal,
      })
      if (!request.isCurrent() || selectedIDRef.current !== orderID) return
      if (
        nextAggregate.materialRequirementsState ===
        PRODUCTION_MATERIAL_REQUIREMENTS_STATE.NEEDS_REVIEW
      ) {
        setAggregate(nextAggregate)
        setSelected(nextAggregate.order)
        message.warning('物料需求需要计划人员复核，暂不能领料')
        return
      }
      const requirements = Array.isArray(nextAggregate.materialRequirements)
        ? nextAggregate.materialRequirements
        : []
      const freshRequirement = requirements.find(
        (item) => Number(item.id) === Number(requirement?.id)
      )
      if (
        !isProductionMaterialIssueEligible(
          nextAggregate.order,
          nextAggregate.materialRequirementsState,
          freshRequirement
        )
      ) {
        message.warning('物料需求或订单状态已变化，请刷新后重试')
        setAggregate(nextAggregate)
        setSelected(nextAggregate.order)
        return
      }
      const orderItem = nextAggregate.items.find(
        (item) =>
          Number(item.id) === Number(freshRequirement.production_order_item_id)
      )
      if (!orderItem) {
        message.warning('生产明细已变化，请刷新后重试')
        return
      }
      const warehouseData = await listAllWarehouses(
        { active_only: true },
        { signal: request.signal }
      )
      if (!request.isCurrent() || selectedIDRef.current !== orderID) return
      const warehouseOptions = uniqueReferenceOptions(
        warehouseData?.warehouses,
        warehouseOptionFromRecord
      )
      const firstWarehouseID = Number(warehouseOptions[0]?.value || 0)
      const lotData = firstWarehouseID
        ? await listAllInventoryLots(
            {
              subject_type: 'MATERIAL',
              subject_id: freshRequirement.material_id,
              warehouse_id: firstWarehouseID,
              status: InventoryLotStatus.ACTIVE,
            },
            { signal: request.signal }
          )
        : { inventory_lots: [] }
      if (!request.isCurrent() || selectedIDRef.current !== orderID) return
      setContext({
        order: nextAggregate.order,
        orderItem,
        requirement: freshRequirement,
        materialRequirementsState: nextAggregate.materialRequirementsState,
        warehouseOptions,
        lots: filterProductionMaterialIssueLots(
          freshRequirement,
          lotData?.inventory_lots
        ),
      })
      setAggregate(nextAggregate)
      setSelected(nextAggregate.order)
      setFormMode(null)
      setFormValues(null)
      setOpen(true)
    } catch (error) {
      if (!isRpcAbortError(error) && request.isCurrent()) {
        showPageLoadError(error, '加载生产领料详情')
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }

  const loadLots = async (warehouseID) => {
    const orderID = Number(context.order?.id || 0)
    const { requirement } = context
    const normalizedWarehouseID = Number(warehouseID || 0)
    const request = beginLatestRequest('production-material-issue-lots')
    if (
      !orderID ||
      !Number.isSafeInteger(normalizedWarehouseID) ||
      normalizedWarehouseID <= 0 ||
      !requirement?.material_id
    ) {
      request.finish()
      setLotsLoading(false)
      setContext((current) => ({ ...current, lots: [] }))
      return
    }
    setLotsLoading(true)
    try {
      const lotData = await listAllInventoryLots(
        {
          subject_type: 'MATERIAL',
          subject_id: requirement.material_id,
          warehouse_id: normalizedWarehouseID,
          status: InventoryLotStatus.ACTIVE,
        },
        { signal: request.signal }
      )
      if (request.isCurrent() && selectedIDRef.current === orderID) {
        setContext((current) => ({
          ...current,
          lots: filterProductionMaterialIssueLots(
            current.requirement,
            lotData?.inventory_lots
          ),
        }))
      }
    } catch (error) {
      if (request.isCurrent() && !isRpcAbortError(error)) {
        showPageLoadError(error, '加载可用材料批次')
      }
    } finally {
      if (request.isCurrent()) setLotsLoading(false)
      request.finish()
    }
  }

  const submit = async (values) => {
    if (
      inFlightRef.current ||
      !canCreateMaterialIssue ||
      !canReadProductionFacts ||
      !context.order ||
      !context.requirement
    ) {
      return
    }
    const { order, requirement, materialRequirementsState } = context
    let scope
    let attempt
    let params
    try {
      const payload = {
        ...buildProductionMaterialIssuePayload(
          values,
          order,
          materialRequirementsState,
          requirement
        ),
        customer_key: activeCustomerKey || undefined,
      }
      scope = `production-material-issue:${order.id}:${requirement.id}`
      attempt = attemptsRef.current.prepare(scope, payload)
      params = {
        ...attempt.params,
        fact_no: sourceBusinessActionNo(
          'PROD-MI',
          order.order_no,
          attempt.params.idempotency_key
        ),
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备生产领料记录'))
      return
    }

    let confirmedByReread = false
    inFlightRef.current = true
    setLoading(true)
    try {
      let result
      try {
        result = await createProductionMaterialIssueFromOrder(params)
        validateProductionMaterialIssueResult(result, params, requirement)
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) {
          attemptsRef.current.settle(scope, attempt, error)
          message.error(getActionErrorMessage(error, '生成生产领料记录'))
          return
        }
        try {
          const factData = await listAllProductionFacts({
            source_type: 'PRODUCTION_ORDER',
            source_id: order.id,
          })
          result = findProductionMaterialIssueResult(
            factData?.production_facts,
            params,
            requirement
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
        await refreshProductionSources(order.id)
      } catch (error) {
        message.warning(getActionErrorMessage(error, '刷新生产领料结果'))
      }
      setOpen(false)
      setContext(EMPTY_CONTEXT)
      reportBusinessResult('领料草稿已生成，待核对并确认领料出库')
      message.success(
        confirmedByReread
          ? '已重新读取并确认领料草稿，请到生产记录核对并确认领料出库'
          : '领料记录草稿已生成，请到生产记录核对并确认领料出库'
      )
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  return {
    closeProductionMaterialIssue: close,
    loadProductionMaterialIssueLots: loadLots,
    materialIssueContext: context,
    materialIssueLoading: loading,
    materialIssueLotsLoading: lotsLoading,
    materialIssueOpen: open,
    openProductionMaterialIssue: openForRequirement,
    submitProductionMaterialIssue: submit,
  }
}
