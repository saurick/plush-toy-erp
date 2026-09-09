import { ExportOutlined, ImportOutlined } from '@ant-design/icons'
import React, { useCallback, useRef, useState } from 'react'
import { Button, Input, Space } from 'antd'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import { useOutsourcingReturnPayable } from './useOutsourcingReturnPayable.mjs'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { useBusinessRowItemsPreview } from '../business-list/BusinessRowItemsPreview.jsx'
import {
  listAllOutsourcingOrderItems,
  getOutsourcingOrder,
  listOutsourcingOrderItemsPreview,
  listAllWarehouses,
} from '../../api/masterDataOrderApi.mjs'
import {
  createOutsourcingMaterialIssueFromOrder,
  createOutsourcingReturnReceiptFromOrder,
  cancelOutsourcingFact,
  listAllOutsourcingFacts,
  postOutsourcingFact,
  saveOutsourcingMaterialIssueDraft,
  saveOutsourcingReturnReceiptDraft,
} from '../../api/operationalFactApi.mjs'
import { listAllInventoryLots } from '../../api/inventoryApi.mjs'
import {
  createQualityInspectionFromOutsourcingReturn,
  listAllOutsourcingReturnQualityInspections,
} from '../../api/qualityApi.mjs'
import {
  OUTSOURCING_ORDER_ITEM_STATUS_LABELS,
  formatUnixDate,
  V1_ROUTE_PATHS,
  statusText,
} from '../../utils/masterDataOrderView.mjs'
import { OUTSOURCING_ORDER_SUBJECT_TYPES } from '../../utils/sourceOrderLineValues.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'
import {
  OUTSOURCING_SOURCE_ACTIONS,
  buildOutsourcingSourceFactPayload,
  filterOutsourcingSourceActionLots,
  findOutsourcingSourceFactResult,
  isOutsourcingSourceActionEligible,
  validateOutsourcingSourceFactResult,
} from '../../utils/outsourcingOrderFactAction.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
} from '../../utils/sourceBusinessAction.mjs'
import { matchesOperationalFactLifecycleResult } from '../../utils/operationalFactLifecycle.mjs'

import {
  buildOutsourcingReturnQualityInspectionPayload,
  groupOutsourcingReturnQualityInspections,
  isMatchingOutsourcingReturnQualityInspection,
  isPostedOutsourcingReturn,
} from '../../utils/qualityInspectionSourceAction.mjs'
import { relatedDocumentRoute } from '../../utils/relatedDocumentNavigation.mjs'
import {
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS,
  buildOperationalFactDraftSavePayload,
  findOperationalFactDraftSaveResult,
  operationalFactDraftFormValues,
} from '../../utils/operationalFactDraftEdit.mjs'

const EMPTY_SOURCE_FACT_CONTEXT = Object.freeze({
  mode: 'create',
  actionType: '',
  record: null,
  initialValues: null,
  order: null,
  item: null,
  lots: [],
  facts: [],
})

export function useOutsourcingSourceFacts({
  canReadOutsourcingFacts,
  canReadQualityInspection,
  activeCustomerKey,
  canPostOutsourcingFact,
  canCancelOutsourcingFact,
  canCreateQualityInspection,
  canOpenQualityInspection,
  navigate,
  canCreatePayable,
  canViewPayable,
  setWarehouses,
  canCreateMaterialIssue,
  canCreateReturnReceipt,
  unitOptions,
  rows,
  canRead,
}) {
  const [sourceFactOpen, setSourceFactOpen] = useState(false)

  const [sourceFactLoading, setSourceFactLoading] = useState(false)

  const [sourceFactContext, setSourceFactContext] = useState(
    EMPTY_SOURCE_FACT_CONTEXT
  )

  const [returnRecordsOpen, setReturnRecordsOpen] = useState(false)

  const [returnRecordsLoading, setReturnRecordsLoading] = useState(false)

  const [returnRecordsOrder, setReturnRecordsOrder] = useState(null)

  const [relatedReturnFacts, setRelatedReturnFacts] = useState([])

  const [returnRecordActionLoading, setReturnRecordActionLoading] = useState('')

  const [qualityInspectionByFactID, setQualityInspectionByFactID] = useState({})

  const [qualitySourceFact, setQualitySourceFact] = useState(null)

  const [qualitySourceLoading, setQualitySourceLoading] = useState(false)

  const [dispositionSourceFact, setDispositionSourceFact] = useState(null)

  const sourceFactRequestRef = useRef(0)

  const sourceFactInFlightRef = useRef(false)

  const sourceFactAttemptsRef = useRef(createSourceBusinessActionAttemptStore())

  const qualitySourceInFlightRef = useRef(false)

  const returnRecordActionInFlightRef = useRef(false)

  const {
    financeSourceFact,
    financeSourceLoading,
    financeSourceInFlightRef,
    financeSourceInitialValues,
    openOutsourcingReturnPayable,
    closeOutsourcingReturnPayable,
    submitOutsourcingReturnPayable,
    viewOutsourcingReturnPayable,
  } = useOutsourcingReturnPayable({
    canCreatePayable,
    qualityInspectionByFactID,
    setReturnRecordsOpen,
    setReturnRecordsOrder,
    setRelatedReturnFacts,
    activeCustomerKey,
    canViewPayable,
    navigate,
  })

  const loadRelatedOutsourcingFacts = useCallback(
    async (orderID) => {
      if (!canReadOutsourcingFacts || Number(orderID || 0) <= 0) {
        return []
      }
      const data = await listAllOutsourcingFacts({
        source_type: 'OUTSOURCING_ORDER',
        source_id: Number(orderID),
      })
      return Array.isArray(data?.outsourcing_facts)
        ? data.outsourcing_facts
        : []
    },
    [canReadOutsourcingFacts]
  )

  const loadRelatedOutsourcingQualityInspections = useCallback(
    async (facts) => {
      if (
        !canReadQualityInspection ||
        !facts?.some(isPostedOutsourcingReturn)
      ) {
        return {}
      }
      const postedFacts = facts.filter(isPostedOutsourcingReturn)
      const inspections = (
        await Promise.all(
          postedFacts.map(async (fact) => {
            const data = await listAllOutsourcingReturnQualityInspections({
              customer_key: activeCustomerKey || undefined,
              fact_id: fact.id,
            })
            return Array.isArray(data?.quality_inspections)
              ? data.quality_inspections
              : []
          })
        )
      ).flat()
      return groupOutsourcingReturnQualityInspections(inspections, facts)
    },
    [activeCustomerKey, canReadQualityInspection]
  )

  const openRelatedReturnRecords = useCallback(
    async (order) => {
      if (!canReadOutsourcingFacts || !order?.id) return
      setReturnRecordsOrder(order)
      setRelatedReturnFacts([])
      setQualityInspectionByFactID({})
      setReturnRecordsOpen(true)
      setReturnRecordsLoading(true)
      try {
        const facts = await loadRelatedOutsourcingFacts(order.id)
        setRelatedReturnFacts(facts)
        try {
          setQualityInspectionByFactID(
            await loadRelatedOutsourcingQualityInspections(facts)
          )
        } catch (error) {
          message.warning(getActionErrorMessage(error, '读取关联质检记录'))
        }
      } catch (error) {
        message.error(getActionErrorMessage(error, '读取委外记录'))
      } finally {
        setReturnRecordsLoading(false)
      }
    },
    [
      canReadOutsourcingFacts,
      loadRelatedOutsourcingFacts,
      loadRelatedOutsourcingQualityInspections,
    ]
  )

  const closeRelatedReturnRecords = useCallback(() => {
    if (
      returnRecordsLoading ||
      returnRecordActionInFlightRef.current ||
      financeSourceInFlightRef.current ||
      qualitySourceInFlightRef.current
    ) {
      return
    }
    setReturnRecordsOpen(false)
    setReturnRecordsOrder(null)
    setRelatedReturnFacts([])
    setQualityInspectionByFactID({})
  }, [returnRecordsLoading, financeSourceInFlightRef])

  const mutateOutsourcingFact = useCallback(
    async (action, fact, reason = '') => {
      const factID = Number(fact?.id || 0)
      const currentStatus = String(fact?.status || '').toUpperCase()
      const isPost = action === 'post'
      const allowed = isPost
        ? canPostOutsourcingFact && currentStatus === 'DRAFT'
        : action === 'cancel' &&
          canCancelOutsourcingFact &&
          ['DRAFT', 'POSTED'].includes(currentStatus)
      if (
        returnRecordActionInFlightRef.current ||
        !allowed ||
        !factID ||
        !returnRecordsOrder?.id
      ) {
        if (!returnRecordActionInFlightRef.current && !allowed) {
          message.warning('当前委外记录状态或账号权限不允许该操作')
        }
        return
      }

      const expectedStatus = isPost ? 'POSTED' : 'CANCELLED'
      const command = isPost ? postOutsourcingFact : cancelOutsourcingFact
      const actionLabel = isPost ? '过账委外记录' : '取消委外记录'
      const attempt = Object.freeze({
        id: factID,
        expected_version: fact?.version,
        customer_key: activeCustomerKey || undefined,
        ...(!isPost ? { reason: String(reason || '').trim() } : {}),
      })
      let resultWasUnknown = false

      returnRecordActionInFlightRef.current = true
      setReturnRecordActionLoading(`${action}:${factID}`)
      try {
        try {
          const result = await command(attempt)
          if (
            !matchesOperationalFactLifecycleResult(
              result,
              attempt,
              expectedStatus
            )
          ) {
            const error = new Error('委外记录操作结果不完整')
            error.isInvalidResponse = true
            throw error
          }
        } catch (error) {
          if (!isSourceBusinessActionResultUnknown(error)) {
            message.error(getActionErrorMessage(error, actionLabel))
            return
          }
          resultWasUnknown = true
        }

        let currentFacts
        try {
          currentFacts = await loadRelatedOutsourcingFacts(
            returnRecordsOrder.id
          )
          setRelatedReturnFacts(currentFacts)
        } catch (error) {
          message.warning(
            resultWasUnknown
              ? '操作结果仍无法确认，请勿重复操作，稍后重新打开委外记录核对'
              : getActionErrorMessage(
                  error,
                  '操作已提交，但重新读取委外记录失败，请稍后核对'
                )
          )
          return
        }

        const confirmed = currentFacts.find((item) =>
          matchesOperationalFactLifecycleResult(item, attempt, expectedStatus)
        )
        if (!confirmed) {
          message.warning(
            '写入后重新读取仍未确认目标状态，请勿重复操作，稍后重新打开委外记录核对'
          )
          return
        }

        if (canReadQualityInspection) {
          try {
            setQualityInspectionByFactID(
              await loadRelatedOutsourcingQualityInspections(currentFacts)
            )
          } catch (error) {
            message.warning(getActionErrorMessage(error, '刷新关联质检记录'))
          }
        } else {
          setQualityInspectionByFactID({})
        }

        message.success(
          isPost
            ? '委外记录已过账'
            : currentStatus === 'DRAFT'
              ? '委外草稿已作废，库存未发生变动'
              : '委外记录已取消，库存已恢复至过账前状态'
        )
      } finally {
        returnRecordActionInFlightRef.current = false
        setReturnRecordActionLoading('')
      }
    },
    [
      activeCustomerKey,
      canCancelOutsourcingFact,
      canPostOutsourcingFact,
      canReadQualityInspection,
      loadRelatedOutsourcingFacts,
      loadRelatedOutsourcingQualityInspections,
      returnRecordsOrder,
    ]
  )

  const postSelectedOutsourcingFact = useCallback(
    (fact) => mutateOutsourcingFact('post', fact),
    [mutateOutsourcingFact]
  )

  const cancelSelectedOutsourcingFact = useCallback(
    (fact) => {
      const status = String(fact?.status || '').toUpperCase()
      if (!canCancelOutsourcingFact || !['DRAFT', 'POSTED'].includes(status)) {
        message.warning('当前委外记录状态或账号权限不允许取消')
        return
      }
      const isDraft = status === 'DRAFT'
      let cancelReason = ''
      modal.confirm({
        title: isDraft ? '确认作废委外草稿？' : '确认取消已过账委外记录？',
        content: (
          <Space direction="vertical" style={{ width: '100%' }}>
            <span>
              {isDraft
                ? '草稿尚未过账，本次作废不会产生任何库存变动。'
                : '取消后将冲正本次过账，并把库存恢复至过账前状态。'}
            </span>
            <Input.TextArea
              rows={3}
              maxLength={255}
              showCount
              placeholder="请填写作废或取消的业务原因"
              onChange={(event) => {
                cancelReason = event.target.value
              }}
            />
          </Space>
        ),
        okText: isDraft ? '确认作废' : '确认取消过账',
        cancelText: '返回',
        okButtonProps: { danger: true },
        onOk: (_close) => {
          const reason = cancelReason.trim()
          if (!reason || [...reason].length > 255) {
            message.warning('请填写不超过 255 个字的业务原因')
            return
          }
          return mutateOutsourcingFact('cancel', fact, reason)
        },
      })
    },
    [canCancelOutsourcingFact, mutateOutsourcingFact]
  )

  const openOutsourcingReturnQualityInspection = useCallback(
    (fact) => {
      const activeInspection = (
        qualityInspectionByFactID?.[fact?.id] || []
      ).some(
        (inspection) =>
          String(inspection?.status || '').toUpperCase() !== 'CANCELLED'
      )
      if (!canCreateQualityInspection || !isPostedOutsourcingReturn(fact)) {
        message.warning('请先选择已过账的委外回货记录')
        return
      }
      if (activeInspection) {
        message.info('该委外回货已发起质检')
        return
      }
      setReturnRecordsOpen(false)
      setQualitySourceFact(fact)
    },
    [canCreateQualityInspection, qualityInspectionByFactID]
  )

  const closeOutsourcingReturnQualityInspection = useCallback(() => {
    if (qualitySourceInFlightRef.current) return
    setQualitySourceFact(null)
    if (returnRecordsOrder?.id) setReturnRecordsOpen(true)
  }, [returnRecordsOrder?.id])

  const submitOutsourcingReturnQualityInspection = useCallback(
    async (values) => {
      const fact = qualitySourceFact
      if (
        qualitySourceInFlightRef.current ||
        !canCreateQualityInspection ||
        !isPostedOutsourcingReturn(fact)
      ) {
        return
      }
      let params
      try {
        params = buildOutsourcingReturnQualityInspectionPayload(
          values,
          fact,
          activeCustomerKey
        )
      } catch (error) {
        message.error(getActionErrorMessage(error, '准备委外回货质检'))
        return
      }

      qualitySourceInFlightRef.current = true
      setQualitySourceLoading(true)
      try {
        let created
        let confirmedByReread = false
        try {
          created = await createQualityInspectionFromOutsourcingReturn(params)
          if (!isMatchingOutsourcingReturnQualityInspection(created, fact)) {
            const invalidResponse = new Error('质检创建结果缺少来源信息')
            invalidResponse.isInvalidResponse = true
            throw invalidResponse
          }
        } catch (error) {
          if (!isSourceBusinessActionResultUnknown(error)) {
            message.error(getActionErrorMessage(error, '发起委外回货质检'))
            return
          }
          try {
            const reread = await listAllOutsourcingReturnQualityInspections({
              customer_key: activeCustomerKey || undefined,
              fact_id: fact.id,
            })
            created = (reread?.quality_inspections || []).find(
              (inspection) =>
                inspection?.inspection_no === params.inspection_no &&
                isMatchingOutsourcingReturnQualityInspection(inspection, fact)
            )
          } catch {
            created = null
          }
          if (!created) {
            message.warning('质检生成结果仍无法确认，请保留当前质检单号并重试')
            return
          }
          confirmedByReread = true
        }

        setQualityInspectionByFactID((current) => ({
          ...current,
          [fact.id]: [created, ...(current?.[fact.id] || [])],
        }))
        setQualitySourceFact(null)
        setReturnRecordsOpen(Boolean(returnRecordsOrder?.id))
        message.success(
          confirmedByReread
            ? '已重新读取并确认质检草稿'
            : '质检草稿已生成，请在委外记录中继续办理'
        )

        if (returnRecordsOrder?.id) {
          try {
            const facts = await loadRelatedOutsourcingFacts(
              returnRecordsOrder.id
            )
            setRelatedReturnFacts(facts)
            if (canReadQualityInspection) {
              setQualityInspectionByFactID(
                await loadRelatedOutsourcingQualityInspections(facts)
              )
            }
          } catch (error) {
            message.warning(getActionErrorMessage(error, '刷新关联业务记录'))
          }
        }
      } finally {
        qualitySourceInFlightRef.current = false
        setQualitySourceLoading(false)
      }
    },
    [
      activeCustomerKey,
      canCreateQualityInspection,
      canReadQualityInspection,
      loadRelatedOutsourcingFacts,
      loadRelatedOutsourcingQualityInspections,
      qualitySourceFact,
      returnRecordsOrder,
    ]
  )

  const viewOutsourcingReturnQualityInspection = useCallback(
    (inspection) => {
      if (!inspection?.id || !canOpenQualityInspection) return
      navigate(
        relatedDocumentRoute(
          V1_ROUTE_PATHS.qualityInspections,
          { quality_inspection_id: inspection.id },
          {
            keyword: inspection.inspection_no,
            source: 'outsourcing-order',
            fields: ['inspection_no'],
          }
        )
      )
    },
    [canOpenQualityInspection, navigate]
  )

  const openOutsourcingReturnDisposition = useCallback((fact) => {
    if (!isPostedOutsourcingReturn(fact)) {
      message.warning('请先选择已过账的委外回货记录')
      return
    }
    setReturnRecordsOpen(false)
    setDispositionSourceFact(fact)
  }, [])

  const closeOutsourcingReturnDisposition = useCallback(() => {
    setDispositionSourceFact(null)
    if (returnRecordsOrder?.id) setReturnRecordsOpen(true)
  }, [returnRecordsOrder?.id])

  const openOutsourcingSourceFact = useCallback(
    async (actionType, order, item) => {
      if (!isOutsourcingSourceActionEligible(actionType, order, item)) {
        message.warning('当前委外明细状态已变化，请刷新后重试')
        return
      }

      const requestID = sourceFactRequestRef.current + 1
      sourceFactRequestRef.current = requestID
      setSourceFactLoading(true)
      try {
        const subjectType = String(item.subject_type || '').toUpperCase()
        const subjectID =
          subjectType === OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
            ? Number(item.material_id || 0)
            : Number(item.product_id || 0)
        const [lotData, facts, warehouseData] = await Promise.all([
          listAllInventoryLots({
            subject_type: subjectType,
            subject_id: subjectID,
            ...(Number(item.product_sku_id || 0) > 0
              ? { product_sku_id: Number(item.product_sku_id) }
              : {}),
            status: 'ACTIVE',
          }),
          loadRelatedOutsourcingFacts(order.id),
          listAllWarehouses({ active_only: true }),
        ])
        if (sourceFactRequestRef.current !== requestID) {
          return
        }
        setSourceFactContext({
          mode: 'create',
          actionType,
          record: null,
          initialValues: null,
          order,
          item,
          lots: filterOutsourcingSourceActionLots(
            actionType,
            item,
            lotData?.inventory_lots
          ),
          facts,
        })
        setWarehouses(
          Array.isArray(warehouseData?.warehouses)
            ? warehouseData.warehouses
            : []
        )
        setSourceFactOpen(true)
      } catch (error) {
        if (sourceFactRequestRef.current === requestID) {
          message.error(getActionErrorMessage(error, '加载委外办理详情'))
        }
      } finally {
        if (sourceFactRequestRef.current === requestID) {
          setSourceFactLoading(false)
        }
      }
    },
    [loadRelatedOutsourcingFacts, setWarehouses]
  )

  const openOutsourcingFactDraftEditor = useCallback(
    async (fact) => {
      const factType = String(fact?.fact_type || '').toUpperCase()
      const actionType =
        factType === 'MATERIAL_ISSUE'
          ? OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
          : factType === 'RETURN_RECEIPT'
            ? OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT
            : ''
      const allowed =
        actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
          ? canCreateMaterialIssue
          : actionType === OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT
            ? canCreateReturnReceipt
            : false
      if (!allowed || fact?.status !== 'DRAFT' || !returnRecordsOrder?.id) {
        message.warning('当前委外草稿状态或权限已变化，请刷新后重试')
        return
      }
      const requestID = sourceFactRequestRef.current + 1
      sourceFactRequestRef.current = requestID
      setSourceFactLoading(true)
      try {
        const exactData = await listAllOutsourcingFacts({
          keyword: String(fact.id),
        })
        if (sourceFactRequestRef.current !== requestID) return
        const fresh = (exactData?.outsourcing_facts || []).find(
          (item) => Number(item?.id || 0) === Number(fact.id)
        )
        if (
          !fresh ||
          fresh.status !== 'DRAFT' ||
          String(fresh.source_type || '').toUpperCase() !==
            'OUTSOURCING_ORDER' ||
          Number(fresh.source_id || 0) !== Number(returnRecordsOrder.id)
        ) {
          message.warning('委外草稿状态或来源已变化，请刷新后重试')
          return
        }
        const [order, itemData, lotData, facts, warehouseData] =
          await Promise.all([
            getOutsourcingOrder({ id: Number(fresh.source_id) }),
            listAllOutsourcingOrderItems({
              outsourcing_order_id: Number(fresh.source_id),
              expected_version: Number(returnRecordsOrder.version),
            }),
            listAllInventoryLots({
              subject_type: fresh.subject_type,
              subject_id: fresh.subject_id,
              ...(Number(fresh.product_sku_id || 0) > 0
                ? { product_sku_id: Number(fresh.product_sku_id) }
                : {}),
              status: 'ACTIVE',
            }),
            loadRelatedOutsourcingFacts(fresh.source_id),
            listAllWarehouses({ active_only: true }),
          ])
        if (sourceFactRequestRef.current !== requestID) return
        const itemRows = Array.isArray(itemData?.outsourcing_order_items)
          ? itemData.outsourcing_order_items
          : Array.isArray(itemData)
            ? itemData
            : []
        const item = itemRows.find(
          (entry) => Number(entry?.id || 0) === Number(fresh.source_line_id)
        )
        if (!order || !item) throw new Error('委外来源明细已变化')
        setSourceFactContext({
          mode: 'edit',
          actionType,
          record: fresh,
          initialValues: operationalFactDraftFormValues(fresh),
          order,
          item,
          lots: filterOutsourcingSourceActionLots(
            actionType,
            item,
            lotData?.inventory_lots
          ),
          facts,
        })
        setWarehouses(warehouseData?.warehouses || [])
        setSourceFactOpen(true)
      } catch (error) {
        if (sourceFactRequestRef.current === requestID) {
          message.error(getActionErrorMessage(error, '加载委外草稿'))
        }
      } finally {
        if (sourceFactRequestRef.current === requestID) {
          setSourceFactLoading(false)
        }
      }
    },
    [
      canCreateMaterialIssue,
      canCreateReturnReceipt,
      loadRelatedOutsourcingFacts,
      returnRecordsOrder,
      setWarehouses,
    ]
  )

  const closeOutsourcingSourceFact = useCallback(() => {
    if (sourceFactInFlightRef.current) return
    sourceFactRequestRef.current += 1
    setSourceFactOpen(false)
    setSourceFactContext(EMPTY_SOURCE_FACT_CONTEXT)
  }, [])

  const renderOutsourcingSourceFactAction = useCallback(
    (order, item) => {
      const action =
        item?.subject_type === OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
          ? {
              type: OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE,
              label: '委外发料',
              allowed: canCreateMaterialIssue,
            }
          : {
              type: OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
              label: '登记回货',
              allowed: canCreateReturnReceipt,
            }
      if (
        !action.allowed ||
        !isOutsourcingSourceActionEligible(action.type, order, item)
      ) {
        return null
      }
      return (
        <Button
          icon={
            action.type === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE ? (
              <ExportOutlined aria-hidden="true" />
            ) : (
              <ImportOutlined aria-hidden="true" />
            )
          }
          className="erp-action-button"
          size="small"
          loading={sourceFactLoading}
          onClick={(event) => {
            event.stopPropagation()
            openOutsourcingSourceFact(action.type, order, item)
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {action.label}
        </Button>
      )
    },
    [
      canCreateMaterialIssue,
      canCreateReturnReceipt,
      openOutsourcingSourceFact,
      sourceFactLoading,
    ]
  )

  const getOutsourcingOrderItemFields = useCallback(
    (item, { record, view }) => {
      const isMaterial =
        item?.subject_type === OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
      const sourceAction = renderOutsourcingSourceFactAction(record, item)
      return [
        {
          label: '加工品类',
          value: isMaterial ? '材料' : '产品 / 半成品',
        },
        {
          label: '来源产品订单编号',
          value: item?.product_order_no_snapshot,
        },
        ...(isMaterial
          ? [
              { label: '材料编码', value: item?.material_code_snapshot },
              { label: '材料名称', value: item?.material_name_snapshot },
            ]
          : [
              { label: '产品编号', value: item?.product_no_snapshot },
              { label: '产品规格', value: item?.sku_code_snapshot },
              {
                label: '产品名称',
                value: (
                  <ProductIdentity
                    productId={item?.product_id}
                    name={item?.product_name_snapshot}
                  />
                ),
              },
            ]),
        { label: '加工项目', value: item?.processing_item },
        { label: '工序', value: item?.process_name_snapshot },
        { label: '工序分类', value: item?.process_category_snapshot },
        { label: '加工数量', value: item?.outsourcing_quantity },
        {
          label: '单位',
          value:
            item?.unit_name_snapshot ||
            referenceLabel(unitOptions, item?.unit_id, '单位'),
        },
        { label: '单价', value: item?.unit_price },
        { label: '金额', value: item?.amount },
        {
          label: '预计回货日期',
          value: formatUnixDate(item?.expected_return_date),
        },
        {
          label: '行状态',
          value: statusText(
            item?.line_status,
            OUTSOURCING_ORDER_ITEM_STATUS_LABELS,
            '明细状态待核对'
          ),
        },
        ...(view !== 'preview'
          ? [{ label: '备注', value: item?.note, wide: true }]
          : []),
        ...(sourceAction && view === 'details'
          ? [{ label: '业务操作', value: sourceAction, wide: true }]
          : []),
      ]
    },
    [renderOutsourcingSourceFactAction, unitOptions]
  )

  const loadOutsourcingOrderItemsPreview = useCallback(
    async (order, { signal }) => {
      const data = await listOutsourcingOrderItemsPreview(
        {
          outsourcing_order_id: order.id,
          expected_version: order.version,
        },
        { signal }
      )
      return {
        items: data?.outsourcing_order_items,
        total: data?.total,
      }
    },
    []
  )

  const loadAllOutsourcingOrderItemsForPreview = useCallback(
    async (order, { signal }) => {
      const data = await listAllOutsourcingOrderItems(
        {
          outsourcing_order_id: order.id,
          expected_version: order.version,
        },
        { signal }
      )
      return {
        items: data?.outsourcing_order_items,
        total: data?.total,
      }
    },
    []
  )

  const outsourcingOrderItemsPreview = useBusinessRowItemsPreview({
    records: rows,
    getItemTotal: (order) => order?.item_count,
    rowExpandable: (order) =>
      canRead && Number(order?.id || 0) > 0 && Number(order?.version || 0) > 0,
    loadPreview: loadOutsourcingOrderItemsPreview,
    loadAll: loadAllOutsourcingOrderItemsForPreview,
    getItemFields: getOutsourcingOrderItemFields,
    getItemLabel: (item, { index }) => `明细 ${item?.line_no || index + 1}`,
    getItemSummary: (item) => {
      const isMaterial =
        item?.subject_type === OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
      const subject = isMaterial
        ? [item?.material_code_snapshot, item?.material_name_snapshot]
        : [
            item?.product_no_snapshot,
            item?.sku_code_snapshot,
            item?.product_name_snapshot,
          ]
      return [...subject, item?.process_name_snapshot]
        .filter(Boolean)
        .join(' / ')
    },
    getRecordLabel: (order) => order?.outsourcing_order_no || '当前加工合同',
    modalTitle: '加工合同全部明细',
    emptyDescription: '当前加工合同暂无明细',
  })

  const submitOutsourcingSourceFact = useCallback(
    async (values) => {
      if (
        sourceFactInFlightRef.current ||
        !sourceFactContext.order ||
        !sourceFactContext.item
      ) {
        return
      }
      const { actionType, order, item, facts, mode, record } = sourceFactContext
      const canCreateAction =
        actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
          ? canCreateMaterialIssue
          : actionType === OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT
            ? canCreateReturnReceipt
            : false
      if (!canCreateAction) {
        message.warning('当前账号没有办理该委外业务的权限')
        return
      }

      if (mode === 'edit') {
        const action =
          actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
            ? OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.OUTSOURCING_MATERIAL_ISSUE
            : OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.OUTSOURCING_RETURN_RECEIPT
        let request
        try {
          request = {
            ...buildOperationalFactDraftSavePayload(action, values, record),
            ...(activeCustomerKey ? { customer_key: activeCustomerKey } : {}),
          }
        } catch (error) {
          message.error(getActionErrorMessage(error, '准备委外草稿'))
          return
        }
        const save =
          actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
            ? saveOutsourcingMaterialIssueDraft
            : saveOutsourcingReturnReceiptDraft
        sourceFactInFlightRef.current = true
        setSourceFactLoading(true)
        try {
          try {
            await save(request, record)
          } catch (error) {
            if (!isSourceBusinessActionResultUnknown(error)) throw error
            const currentFacts = await loadRelatedOutsourcingFacts(order.id)
            const confirmed = findOperationalFactDraftSaveResult(
              currentFacts,
              request,
              record,
              action
            )
            if (!confirmed) throw error
          }
          const refreshed = await loadRelatedOutsourcingFacts(order.id)
          setRelatedReturnFacts(refreshed)
          setSourceFactOpen(false)
          setSourceFactContext(EMPTY_SOURCE_FACT_CONTEXT)
          message.success('委外草稿已保存，请核对后再过账')
        } catch (error) {
          message.error(getActionErrorMessage(error, '保存委外草稿'))
        } finally {
          sourceFactInFlightRef.current = false
          setSourceFactLoading(false)
        }
        return
      }

      let scope
      let attempt
      let params
      try {
        const payload = {
          ...buildOutsourcingSourceFactPayload(
            actionType,
            values,
            order,
            item,
            facts
          ),
          customer_key: activeCustomerKey || undefined,
        }
        scope = `outsourcing-source-fact:${actionType}:${order.id}:${item.id}`
        attempt = sourceFactAttemptsRef.current.prepare(scope, payload)
        params = {
          ...attempt.params,
          fact_no: sourceBusinessActionNo(
            actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
              ? 'OUT-MI'
              : 'OUT-RR',
            order.outsourcing_order_no,
            attempt.params.idempotency_key
          ),
        }
      } catch (error) {
        if (scope && attempt) {
          sourceFactAttemptsRef.current.settle(scope, attempt, error)
        }
        message.error(getActionErrorMessage(error, '准备委外业务记录'))
        return
      }

      const execute =
        actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
          ? createOutsourcingMaterialIssueFromOrder
          : createOutsourcingReturnReceiptFromOrder
      sourceFactInFlightRef.current = true
      setSourceFactLoading(true)
      try {
        let result
        let confirmedByReread = false
        try {
          result = await execute(params)
          validateOutsourcingSourceFactResult(
            result,
            actionType,
            order,
            item,
            params
          )
        } catch (error) {
          if (!isSourceBusinessActionResultUnknown(error)) {
            sourceFactAttemptsRef.current.settle(scope, attempt, error)
            message.error(getActionErrorMessage(error, '生成委外业务草稿'))
            return
          }
          try {
            const currentFacts = await loadRelatedOutsourcingFacts(order.id)
            result = findOutsourcingSourceFactResult(
              currentFacts,
              params,
              actionType,
              order,
              item
            )
          } catch {
            result = null
          }
          if (!result) {
            sourceFactAttemptsRef.current.settle(scope, attempt, error)
            message.warning(
              '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
            )
            return
          }
          confirmedByReread = true
        }
        sourceFactAttemptsRef.current.settle(scope, attempt, null)
        outsourcingOrderItemsPreview.invalidate(order)
        try {
          await loadRelatedOutsourcingFacts(order.id)
        } catch (refreshError) {
          message.warning(
            getActionErrorMessage(refreshError, '刷新委外关联记录')
          )
        }
        setSourceFactOpen(false)
        setSourceFactContext(EMPTY_SOURCE_FACT_CONTEXT)
        message.success(
          confirmedByReread
            ? actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
              ? '已重新读取并确认委外发料草稿，可在委外记录中继续办理'
              : '已重新读取并确认委外回货草稿，可在委外记录中继续办理'
            : actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
              ? '委外发料草稿已生成，可在委外记录中继续办理'
              : '委外回货草稿已生成，可在委外记录中继续办理'
        )
      } finally {
        sourceFactInFlightRef.current = false
        setSourceFactLoading(false)
      }
    },
    [
      activeCustomerKey,
      canCreateMaterialIssue,
      canCreateReturnReceipt,
      loadRelatedOutsourcingFacts,
      outsourcingOrderItemsPreview,
      sourceFactContext,
    ]
  )
  return {
    sourceFactOpen,
    sourceFactLoading,
    sourceFactContext,
    returnRecordsOpen,
    returnRecordsLoading,
    returnRecordsOrder,
    relatedReturnFacts,
    returnRecordActionLoading,
    qualityInspectionByFactID,
    qualitySourceFact,
    qualitySourceLoading,
    dispositionSourceFact,
    financeSourceFact,
    financeSourceLoading,
    financeSourceInitialValues,
    openRelatedReturnRecords,
    closeRelatedReturnRecords,
    postSelectedOutsourcingFact,
    cancelSelectedOutsourcingFact,
    openOutsourcingReturnQualityInspection,
    closeOutsourcingReturnQualityInspection,
    submitOutsourcingReturnQualityInspection,
    viewOutsourcingReturnQualityInspection,
    openOutsourcingReturnDisposition,
    closeOutsourcingReturnDisposition,
    openOutsourcingReturnPayable,
    closeOutsourcingReturnPayable,
    submitOutsourcingReturnPayable,
    viewOutsourcingReturnPayable,
    openOutsourcingFactDraftEditor,
    closeOutsourcingSourceFact,
    getOutsourcingOrderItemFields,
    loadAllOutsourcingOrderItemsForPreview,
    outsourcingOrderItemsPreview,
    submitOutsourcingSourceFact,
  }
}
