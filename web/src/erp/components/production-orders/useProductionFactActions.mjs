import { useEffect, useMemo, useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  createProductionReworkFromCompletion,
  listAllProductionFacts,
  listProductionOrderMaterialRequirements,
  saveProductionCompletionDraft,
  saveProductionMaterialIssueDraft,
  saveProductionReworkFromCompletionDraft,
} from '../../api/operationalFactApi.mjs'
import { getProductionWip } from '../../api/productionWipApi.mjs'
import { getProductionOrder } from '../../api/productionOrderApi.mjs'
import { listAllWarehouses } from '../../api/masterDataOrderApi.mjs'
import { listAllInventoryLots } from '../../api/inventoryApi.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
} from '../../utils/sourceBusinessAction.mjs'
import {
  buildProductionReworkPayload,
  findProductionReworkResult,
  isPostedProductionCompletion,
  isProductionReworkEligible,
  productionReworkFormValuesFromRequest,
} from '../../utils/productionReworkAction.mjs'
import { hasAnyPermission } from '../operational-facts/OperationalFactForms.jsx'
import {
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS,
  buildOperationalFactDraftSavePayload,
  findOperationalFactDraftSaveResult,
  operationalFactDraftFormValues,
} from '../../utils/operationalFactDraftEdit.mjs'
import { filterProductionMaterialIssueLots } from '../../utils/productionMaterialIssueAction.mjs'
import {
  uniqueReferenceOptions,
  warehouseOptionFromRecord,
} from '../../utils/referenceSelectOptions.mjs'

function productionDraftSaveActionFor(record = {}) {
  const factType = String(record?.fact_type || '').toUpperCase()
  const sourceType = String(record?.source_type || '').toUpperCase()
  if (factType === 'MATERIAL_ISSUE' && sourceType === 'PRODUCTION_ORDER') {
    return OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
  }
  if (
    factType === 'FINISHED_GOODS_RECEIPT' &&
    sourceType === 'PRODUCTION_ORDER'
  ) {
    return OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION
  }
  if (factType === 'REWORK' && sourceType === 'PRODUCTION_FACT') {
    return OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_COMPLETION
  }
  return ''
}

function productionDraftEditPermissions(action) {
  if (
    action === OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
  ) {
    return ['production.material_issue.create']
  }
  if (action === OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION) {
    return ['production.completion.create', 'warehouse.inbound.confirm']
  }
  return ['production.rework.create']
}

export function useProductionFactActions({
  adminProfile,
  activeCustomerKey,
  loadRows,
  canCreateProductionRework,
  canViewProductionReworkProgress,
  resetPaginationForKey,
}) {
  const [productionReworkContext, setProductionReworkContext] = useState(null)

  const [productionReworkLoading, setProductionReworkLoading] = useState(false)

  const [productionReworkProgressContext, setProductionReworkProgressContext] =
    useState(null)

  const [productionReworkProgressLoading, setProductionReworkProgressLoading] =
    useState(false)

  const [productionDraftEditContext, setProductionDraftEditContext] =
    useState(null)

  const [productionDraftEditLoading, setProductionDraftEditLoading] =
    useState(false)

  const productionReworkAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )

  const productionReworkInFlightRef = useRef(false)

  const productionReworkRequestRef = useRef(0)

  const productionReworkProgressRequestRef = useRef(0)

  const productionDraftEditRequestRef = useRef(0)

  useEffect(
    () => () => {
      productionReworkRequestRef.current += 1
      productionReworkProgressRequestRef.current += 1
      productionDraftEditRequestRef.current += 1
    },
    []
  )

  const productionReworkScope = productionReworkContext?.source?.id
    ? `production-rework:${productionReworkContext.source.id}`
    : ''

  const productionReworkInitialValues = useMemo(() => {
    if (!productionReworkScope) return undefined
    const retained = productionReworkAttemptsRef.current.peek(
      productionReworkScope
    )
    return retained
      ? productionReworkFormValuesFromRequest(retained.params)
      : undefined
  }, [productionReworkScope])

  const openProductionDraftEditor = async (record) => {
    const action = productionDraftSaveActionFor(record)
    if (
      !action ||
      record?.status !== 'DRAFT' ||
      !hasAnyPermission(adminProfile, productionDraftEditPermissions(action))
    ) {
      message.warning('当前记录状态或权限已变化，请刷新后重试')
      return
    }
    const requestID = productionDraftEditRequestRef.current + 1
    productionDraftEditRequestRef.current = requestID
    setProductionDraftEditLoading(true)
    try {
      const exactData = await listAllProductionFacts({
        keyword: String(record.id),
      })
      if (productionDraftEditRequestRef.current !== requestID) return
      const fresh = (exactData?.production_facts || []).find(
        (item) => Number(item?.id || 0) === Number(record.id)
      )
      if (
        !fresh ||
        fresh.status !== 'DRAFT' ||
        productionDraftSaveActionFor(fresh) !== action
      ) {
        message.warning('草稿状态或来源已变化，请刷新后重试')
        return
      }
      const initialValues = operationalFactDraftFormValues(fresh)
      if (
        action ===
        OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_COMPLETION
      ) {
        setProductionDraftEditContext({
          kind: 'rework',
          action,
          record: fresh,
          initialValues,
        })
        return
      }
      const orderID = Number(fresh.source_id || 0)
      if (!orderID) throw new Error('生产来源不完整')
      const [aggregate, warehouseData, lotData, factData, requirements] =
        await Promise.all([
          getProductionOrder(orderID),
          listAllWarehouses({ active_only: true }),
          listAllInventoryLots(
            action ===
              OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
              ? {
                  subject_type: 'MATERIAL',
                  subject_id: fresh.subject_id,
                  warehouse_id: fresh.warehouse_id,
                  status: 'ACTIVE',
                }
              : { status: 'ACTIVE' }
          ),
          listAllProductionFacts({
            source_type: 'PRODUCTION_ORDER',
            source_id: orderID,
          }),
          action ===
          OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
            ? listProductionOrderMaterialRequirements({
                customer_key: activeCustomerKey || undefined,
                production_order_id: orderID,
              })
            : Promise.resolve([]),
        ])
      if (productionDraftEditRequestRef.current !== requestID) return
      const warehouseOptions = uniqueReferenceOptions(
        warehouseData?.warehouses,
        warehouseOptionFromRecord
      )
      const facts = Array.isArray(factData?.production_facts)
        ? factData.production_facts
        : []
      const lots = Array.isArray(lotData?.inventory_lots)
        ? lotData.inventory_lots
        : []
      if (
        action === OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
      ) {
        const requirement = (
          Array.isArray(requirements) ? requirements : []
        ).find((item) => Number(item?.id || 0) === Number(fresh.source_line_id))
        const orderItem = (aggregate?.items || []).find(
          (item) =>
            Number(item?.id || 0) ===
            Number(requirement?.production_order_item_id || 0)
        )
        if (!requirement || !orderItem) throw new Error('生产领料来源已变化')
        setProductionDraftEditContext({
          kind: 'material',
          action,
          record: fresh,
          initialValues,
          order: aggregate.order,
          orderItem,
          requirement,
          warehouseOptions,
          lots: filterProductionMaterialIssueLots(requirement, lots),
        })
        return
      }
      const wipAggregate = fresh.production_wip_batch_id
        ? await getProductionWip(orderID)
        : null
      if (productionDraftEditRequestRef.current !== requestID) return
      setProductionDraftEditContext({
        kind: 'completion',
        action,
        record: fresh,
        initialValues: {
          ...initialValues,
          production_order_item_id: fresh.source_line_id,
          production_wip_batch_id: fresh.production_wip_batch_id,
        },
        order: aggregate.order,
        items: aggregate.items || [],
        facts,
        wipAggregate,
        warehouseOptions,
        lots,
      })
    } catch (error) {
      if (productionDraftEditRequestRef.current === requestID) {
        message.error(getActionErrorMessage(error, '加载生产草稿'))
      }
    } finally {
      if (productionDraftEditRequestRef.current === requestID) {
        setProductionDraftEditLoading(false)
      }
    }
  }

  const loadProductionDraftMaterialLots = async (warehouseID) => {
    const context = productionDraftEditContext
    const requestID = productionDraftEditRequestRef.current
    if (context?.kind !== 'material' || !Number(warehouseID || 0)) return
    setProductionDraftEditLoading(true)
    try {
      const data = await listAllInventoryLots({
        subject_type: 'MATERIAL',
        subject_id: context.requirement.material_id,
        warehouse_id: Number(warehouseID),
        status: 'ACTIVE',
      })
      if (productionDraftEditRequestRef.current !== requestID) return
      setProductionDraftEditContext((current) =>
        current?.kind === 'material'
          ? {
              ...current,
              lots: filterProductionMaterialIssueLots(
                current.requirement,
                data?.inventory_lots
              ),
            }
          : current
      )
    } catch (error) {
      if (productionDraftEditRequestRef.current === requestID) {
        message.error(getActionErrorMessage(error, '加载材料批次'))
      }
    } finally {
      if (productionDraftEditRequestRef.current === requestID) {
        setProductionDraftEditLoading(false)
      }
    }
  }

  const closeProductionDraftEditor = () => {
    productionDraftEditRequestRef.current += 1
    setProductionDraftEditLoading(false)
    setProductionDraftEditContext(null)
  }

  const submitProductionDraftEdit = async (values) => {
    const context = productionDraftEditContext
    if (!context?.record?.id || productionDraftEditLoading) return
    let request
    try {
      request = {
        ...buildOperationalFactDraftSavePayload(
          context.action,
          values,
          context.record
        ),
        ...(activeCustomerKey ? { customer_key: activeCustomerKey } : {}),
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备草稿内容'))
      return
    }
    const saveByAction = {
      [OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE]:
        saveProductionMaterialIssueDraft,
      [OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION]:
        saveProductionCompletionDraft,
      [OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_COMPLETION]:
        saveProductionReworkFromCompletionDraft,
    }
    const save = saveByAction[context.action]
    if (!save) return
    setProductionDraftEditLoading(true)
    try {
      try {
        await save(request, context.record)
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) throw error
        const data = await listAllProductionFacts({
          keyword: String(context.record.id),
        })
        const confirmed = findOperationalFactDraftSaveResult(
          data?.production_facts,
          request,
          context.record,
          context.action
        )
        if (!confirmed) throw error
      }
      setProductionDraftEditContext(null)
      message.success(
        context.action ===
          OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION
          ? '待入库草稿已保存，请由仓库核对后确认成品入库'
          : '生产草稿已保存，请核对后再过账'
      )
      await loadRows('production')
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存生产草稿'))
    } finally {
      setProductionDraftEditLoading(false)
    }
  }

  const openProductionRework = async (source) => {
    if (!canCreateProductionRework) {
      message.warning('当前账号没有发起返工的权限')
      return
    }
    if (!isPostedProductionCompletion(source)) {
      message.warning('仅已过账且来源完整的成品入库记录可以发起返工')
      return
    }
    const requestID = productionReworkRequestRef.current + 1
    productionReworkRequestRef.current = requestID
    setProductionReworkLoading(true)
    try {
      const data = await listAllProductionFacts({
        source_type: 'PRODUCTION_FACT',
        source_id: source.id,
      })
      if (productionReworkRequestRef.current !== requestID) return
      const facts = Array.isArray(data?.production_facts)
        ? data.production_facts
        : []
      if (!isProductionReworkEligible(source, facts)) {
        message.warning('当前完工记录已没有可返工数量，请刷新后核对')
        return
      }
      setProductionReworkContext({ source, facts })
    } catch (error) {
      if (productionReworkRequestRef.current === requestID) {
        message.error(getActionErrorMessage(error, '加载返工来源'))
      }
    } finally {
      if (productionReworkRequestRef.current === requestID) {
        setProductionReworkLoading(false)
      }
    }
  }

  const closeProductionRework = () => {
    if (productionReworkInFlightRef.current) return
    productionReworkRequestRef.current += 1
    setProductionReworkLoading(false)
    setProductionReworkContext(null)
  }

  const openProductionReworkProgress = async (source) => {
    const orderID = Number(source?.production_order_id || 0)
    if (!canViewProductionReworkProgress) {
      message.warning('当前账号不能同时查看生产工序和生产记录')
      return
    }
    if (
      String(source?.fact_type || '').toUpperCase() !== 'REWORK' ||
      !['POSTED', 'CANCELLED'].includes(
        String(source?.status || '').toUpperCase()
      ) ||
      !Number.isSafeInteger(orderID) ||
      orderID <= 0
    ) {
      message.warning('请选择已过账或已撤销且来源完整的返工记录')
      return
    }
    const requestID = productionReworkProgressRequestRef.current + 1
    productionReworkProgressRequestRef.current = requestID
    setProductionReworkProgressLoading(true)
    try {
      const [aggregate, factData] = await Promise.all([
        getProductionWip(orderID),
        listAllProductionFacts({
          source_type: 'PRODUCTION_ORDER',
          source_id: orderID,
        }),
      ])
      if (productionReworkProgressRequestRef.current !== requestID) return
      const hasExactRoot = aggregate.batches.some(
        (batch) =>
          Number(batch?.origin_rework_fact_id || 0) === Number(source.id) &&
          !Number(batch?.source_batch_id)
      )
      if (!hasExactRoot) {
        message.warning('该返工记录尚未关联可核对的成品返工补制批次')
        return
      }
      const facts = Array.isArray(factData?.production_facts)
        ? factData.production_facts
        : []
      setProductionReworkProgressContext({
        order: aggregate.productionOrder,
        aggregate,
        facts: facts.some((fact) => Number(fact?.id) === Number(source.id))
          ? facts
          : [source, ...facts],
        focusReworkFactID: source.id,
      })
    } catch (error) {
      if (productionReworkProgressRequestRef.current === requestID) {
        message.error(getActionErrorMessage(error, '加载成品返工进度'))
      }
    } finally {
      if (productionReworkProgressRequestRef.current === requestID) {
        setProductionReworkProgressLoading(false)
      }
    }
  }

  const closeProductionReworkProgress = () => {
    productionReworkProgressRequestRef.current += 1
    setProductionReworkProgressLoading(false)
    setProductionReworkProgressContext(null)
  }

  const submitProductionRework = async (values) => {
    const source = productionReworkContext?.source
    const facts = productionReworkContext?.facts || []
    if (productionReworkInFlightRef.current || !source?.id) return

    const scope = `production-rework:${source.id}`
    let attempt
    try {
      const payload = {
        ...buildProductionReworkPayload(values, source, facts),
        customer_key: activeCustomerKey || undefined,
      }
      attempt = productionReworkAttemptsRef.current.prepare(scope, payload)
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备返工记录'))
      return
    }

    productionReworkInFlightRef.current = true
    setProductionReworkLoading(true)
    try {
      let result
      let confirmedByReread = false
      try {
        result = await createProductionReworkFromCompletion(attempt.params)
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) {
          productionReworkAttemptsRef.current.settle(scope, attempt, error)
          message.error(getActionErrorMessage(error, '生成返工草稿'))
          return
        }
        let currentFacts = []
        try {
          const data = await listAllProductionFacts({
            source_type: 'PRODUCTION_FACT',
            source_id: source.id,
          })
          currentFacts = Array.isArray(data?.production_facts)
            ? data.production_facts
            : []
          result = findProductionReworkResult(currentFacts, attempt.params)
        } catch {
          result = null
        }
        if (!result) {
          productionReworkAttemptsRef.current.settle(scope, attempt, error)
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
          return
        }
        confirmedByReread = true
      }

      productionReworkAttemptsRef.current.settle(scope, attempt, null)
      productionReworkRequestRef.current += 1
      setProductionReworkContext(null)
      message.success(
        confirmedByReread
          ? '已重新读取并确认返工草稿，请核对后过账'
          : '返工草稿已生成，请核对后过账'
      )
      resetPaginationForKey('production')
    } finally {
      productionReworkInFlightRef.current = false
      setProductionReworkLoading(false)
    }
  }
  return {
    productionReworkContext,
    productionReworkLoading,
    productionReworkProgressContext,
    productionReworkProgressLoading,
    productionDraftEditContext,
    productionDraftEditLoading,
    productionReworkInitialValues,
    openProductionDraftEditor,
    loadProductionDraftMaterialLots,
    closeProductionDraftEditor,
    submitProductionDraftEdit,
    openProductionRework,
    closeProductionRework,
    openProductionReworkProgress,
    closeProductionReworkProgress,
    submitProductionRework,
  }
}

export { productionDraftSaveActionFor, productionDraftEditPermissions }
