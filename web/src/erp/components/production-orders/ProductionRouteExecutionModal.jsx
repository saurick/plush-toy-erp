import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
} from 'antd'
import { useOutletContext } from 'react-router-dom'
import { BranchesOutlined, ReloadOutlined } from '@ant-design/icons'
import useBusinessNavigate from '../../hooks/useBusinessNavigate.js'
import useWorkflowTaskBusinessResult from '../../hooks/useWorkflowTaskBusinessResult.js'
import { workflowTaskReturnNavigation } from '../../utils/workflowTaskNavigation.mjs'
import { productionTaskWipAction } from '../../utils/productionTaskHandling.mjs'
import { ProductionPackagingConfirmationStatus, ProductionWIPStatus } from '../../../common/consts/statuses.generated.mjs'
import { unitQuantityRuleFromOptions } from '../../utils/unitQuantity.mjs'
import useQuantityUnits from '../../hooks/useQuantityUnits.mjs'
import Table from '@/common/components/table/AppTable'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import ProductionOutsourcingPrepareModal from './ProductionOutsourcingPrepareModal.jsx'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

import {
  listAllOutsourcingOrderItems,
  listAllOutsourcingOrders,
} from '../../api/masterDataOrderApi.mjs'
import {
  executeProductionWipAction,
  getProductionWip,
} from '../../api/productionWipApi.mjs'
import {
  PRODUCTION_WIP_ACTION,
  PRODUCTION_WIP_EXECUTION_MODE,
  PRODUCTION_WIP_EXECUTION_MODE_META,
  PRODUCTION_WIP_FLOW_TYPE,
  PRODUCTION_WIP_QUANTITY_MAX_LENGTH,
  PRODUCTION_WIP_ROUTE_CODE,
  buildProductionWipFabricContractOptions,
  buildProductionWipOutsourcingCandidateOptions,
  compareProductionWipQuantity,
  currentProductionWipOperation,
  nextProductionWipOperation,
  normalizeProductionWipQuantity,
  positiveSafeInteger,
  productionWipBatchForOperation,
  productionWipBatchLabel,
  productionWipBatchLineageMeta,
  productionWipCompletionEligibility,
  productionWipFabricMaterialRequirements,
  productionWipOperationDisplayLabel as productionWipOperationLabel,
  productionWipOperationsForBatch,
  productionWipActionAllowedForOrder,
  productionWipActionRelevant,
  productionWipOrderItem,
  productionWipOutputLabel,
  productionWipPackagingConfirmationForBatch,
  productionWipPackagingReceiptChoices,
  productionWipTransferRemainingQuantity,
  productionWipQualityGateLabel,
  productionWipQualitySummary,
  productionWipStatusMeta,
  productionWipUUID,
} from '../../utils/productionWipModel.mjs'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import { buildProductionWipFormPayload } from '../../utils/productionWipFormPayload.mjs'

const { Text, Title } = Typography

const ACTION_SUCCESS_TEXT = Object.freeze({
  [PRODUCTION_WIP_ACTION.SPLIT_BATCH]: '在制批次已拆分',
  [PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION]: '加工安排已保存',
  [PRODUCTION_WIP_ACTION.CANCEL_BATCH]: '在制批次已取消',
  [PRODUCTION_WIP_ACTION.START_OPERATION]: '当前工序已开始',
  [PRODUCTION_WIP_ACTION.COMPLETE_OPERATION]: '本厂完工已登记',
  [PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN]: '外发回仓已登记',
  [PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION]: '已转入下道工序',
  [PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL]: '包材要求已确认',
})

const ACTION_TITLE = Object.freeze({
  [PRODUCTION_WIP_ACTION.SPLIT_BATCH]: '拆分在制批次',
  [PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION]: '安排本厂或外发加工',
  [PRODUCTION_WIP_ACTION.CANCEL_BATCH]: '取消在制批次',
  [PRODUCTION_WIP_ACTION.START_OPERATION]: '开始当前工序',
  [PRODUCTION_WIP_ACTION.COMPLETE_OPERATION]: '登记本厂完工',
  [PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN]: '登记外发回仓',
  [PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION]: '转入下道工序',
  [PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL]: '确认包材要求',
})

function operationStepStatus(batch, operation, currentOperationID) {
  const status = String(batch?.status || '').trim()
  if (status === ProductionWIPStatus.ACCEPTED) return 'finish'
  if (status === ProductionWIPStatus.REJECTED) return 'error'
  if (operation?.id === currentOperationID && batch) return 'process'
  return 'wait'
}

function qualityGateText(aggregate, operation, batch) {
  const gates = operation?.required_quality_gates || []
  if (gates.length === 0) return '本工序无需品质关口'
  if (batch) return productionWipQualitySummary(aggregate, batch)
  return gates
    .map((gateCode) => `${productionWipQualityGateLabel(gateCode)}：尚未到达`)
    .join('；')
}

function displayUnixTime(value) {
  if (!positiveSafeInteger(value)) return ''
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

function packagingConfirmationText(confirmation) {
  if (!confirmation || confirmation.status !== ProductionPackagingConfirmationStatus.CONFIRMED) {
    return '待业务确认'
  }
  return [
    '业务已确认',
    confirmation.packaging_version_snapshot
      ? `包装版本：${confirmation.packaging_version_snapshot}`
      : '',
    displayUnixTime(confirmation.confirmed_at),
    confirmation.note ? `备注：${confirmation.note}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function actionButtonEnabled(
  action,
  batch,
  operation,
  nextOperation,
  packagingConfirmation,
  canAct,
  order
) {
  if (
    !canAct ||
    !batch ||
    !operation ||
    !productionWipActionAllowedForOrder(order, batch, action)
  ) {
    return false
  }
  const status = String(batch.status || '').trim()
  switch (action) {
    case PRODUCTION_WIP_ACTION.SPLIT_BATCH:
      return (
        status === ProductionWIPStatus.PLANNED && operation.operation_code !== 'FABRIC_PROCESSING'
      )
    case PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION:
      return status === ProductionWIPStatus.PLANNED && !batch.execution_mode
    case PRODUCTION_WIP_ACTION.CANCEL_BATCH:
      return status === ProductionWIPStatus.PLANNED
    case PRODUCTION_WIP_ACTION.START_OPERATION:
      return status === ProductionWIPStatus.PLANNED && Boolean(batch.execution_mode)
    case PRODUCTION_WIP_ACTION.COMPLETE_OPERATION:
      return (
        status === ProductionWIPStatus.IN_PROGRESS &&
        batch.execution_mode === PRODUCTION_WIP_EXECUTION_MODE.IN_HOUSE
      )
    case PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN:
      return (
        status === ProductionWIPStatus.OUTSOURCED &&
        batch.execution_mode === PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED
      )
    case PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION:
      return status === ProductionWIPStatus.ACCEPTED && Boolean(nextOperation)
    case PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL:
      return (
        packagingConfirmation?.status === ProductionPackagingConfirmationStatus.PENDING &&
        ![ProductionWIPStatus.SPLIT, ProductionWIPStatus.CANCELLED].includes(status)
      )
    default:
      return false
  }
}

async function loadConfirmedOutsourcingSources(options = {}) {
  const data = await listAllOutsourcingOrders(
    { lifecycle_status: 'confirmed' },
    options
  )
  const orders = Array.isArray(data?.outsourcing_orders)
    ? data.outsourcing_orders
    : []
  const groups = new Array(orders.length)
  let cursor = 0
  const runners = Array.from(
    { length: Math.min(4, orders.length) },
    async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= orders.length) return
        const order = orders[index]
        const itemData = await listAllOutsourcingOrderItems(
          {
            outsourcing_order_id: order.id,
            expected_version: order.version,
            line_status: 'open',
          },
          options
        )
        groups[index] = (itemData?.outsourcing_order_items || []).map(
          (item) => ({ order, item })
        )
      }
    }
  )
  await Promise.all(runners)
  return groups.flat()
}

export default function ProductionRouteExecutionModal({
  open,
  productionOrder,
  assignmentOnly = false,
  originReworkFactID = null,
  canAssign = false,
  canExecute = false,
  canReceiveReturn = false,
  canCreateCompletion = false,
  completionLoading = false,
  canWarehousePackaging = false,
  canIssueCutting = false,
  initialBatchID = null,
  initialItemID = null,
  initialAction = '',
  onReturnToExecution,
  canConfirmPackaging = false,
  canReadOutsourcingContracts = false,
  onCancel,
  onChanged,
  onCreateCompletion,
}) {
  const outlet = useOutletContext()
  const taskNavigation = outlet?.workflowTaskNavigation
  const handling = taskNavigation?.productionHandling
  const reportBusinessResult = useWorkflowTaskBusinessResult()
  const navigate = useBusinessNavigate()
  const { modal } = App.useApp()
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const directEntryRef = useRef('')
  const [actionForm] = Form.useForm()
  const quantityUnitOptions = useQuantityUnits(open)
  const [aggregate, setAggregate] = useState(null)
  const [selectedBatchID, setSelectedBatchID] = useState(null)
  const [activeAction, setActiveAction] = useState('')
  const [prepareOutsourcingOpen, setPrepareOutsourcingOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [entrySaved, setEntrySaved] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [outsourcingSources, setOutsourcingSources] = useState([])
  const [outsourcingLoadState, setOutsourcingLoadState] = useState('idle')
  const [outsourcingLoadError, setOutsourcingLoadError] = useState('')
  const requestSequenceRef = useRef(0)
  const actionAttemptRef = useRef(null)
  const outsourcingAbortControllerRef = useRef(null)
  const outsourcingLoadStateRef = useRef('idle')
  const executionMode = Form.useWatch('execution_mode', actionForm)
  const selectedFabricRequirementIDs = Form.useWatch(
    'fabric_requirement_ids',
    actionForm
  )
  const selectedOutsourcingItemID = Form.useWatch(
    'outsourcing_order_item_id',
    actionForm
  )
  const selectedFabricContractID = Form.useWatch(
    'fabric_contract_order_id',
    actionForm
  )
  const orderID = Number(productionOrder?.id || 0)
  const hasProcessEntry = Boolean(!handling && initialBatchID && (initialAction === 'completion' || Object.values(PRODUCTION_WIP_ACTION).includes(initialAction)))
  const focusedEntry = Boolean(handling || hasProcessEntry)
  const authoritativeOrder = aggregate?.productionOrder || productionOrder
  const orderStatus = String(authoritativeOrder?.status || '')
    .trim()
    .toUpperCase()
  const batchScopeEnabled = originReworkFactID !== null
  const readOnly =
    !assignmentOnly &&
    !canAssign &&
    !canExecute &&
    !canReceiveReturn &&
    !canCreateCompletion &&
    !canWarehousePackaging &&
    !canIssueCutting &&
    !canConfirmPackaging
  const scopedReworkFactID = Number(originReworkFactID || 0)

  const loadOutsourcingSources = useCallback(
    async ({ force = false } = {}) => {
      if (!canReadOutsourcingContracts) return
      if (
        !force &&
        ['loading', 'loaded'].includes(outsourcingLoadStateRef.current)
      ) {
        return
      }
      outsourcingAbortControllerRef.current?.abort()
      const controller = new AbortController()
      outsourcingAbortControllerRef.current = controller
      outsourcingLoadStateRef.current = 'loading'
      setOutsourcingLoadState('loading')
      setOutsourcingLoadError('')
      try {
        const nextSources = await loadConfirmedOutsourcingSources({
          signal: controller.signal,
        })
        if (outsourcingAbortControllerRef.current !== controller) return
        setOutsourcingSources(nextSources)
        outsourcingLoadStateRef.current = 'loaded'
        setOutsourcingLoadState('loaded')
      } catch (error) {
        if (
          isRpcAbortError(error) ||
          outsourcingAbortControllerRef.current !== controller
        ) {
          return
        }
        outsourcingLoadStateRef.current = 'error'
        setOutsourcingLoadState('error')
        setOutsourcingLoadError(
          getActionErrorMessage(error, '读取加工合同候选')
        )
      }
    },
    [canReadOutsourcingContracts]
  )

  const loadCurrentRoute = useCallback(
    async ({ signal } = {}) => {
      if (!positiveSafeInteger(orderID)) return
      const requestSequence = requestSequenceRef.current + 1
      requestSequenceRef.current = requestSequence
      setLoading(true)
      setLoadError('')
      try {
        const nextAggregate = await getProductionWip(orderID, { signal })
        if (requestSequenceRef.current !== requestSequence) return
        setAggregate(nextAggregate)
      } catch (error) {
        if (
          isRpcAbortError(error) ||
          requestSequenceRef.current !== requestSequence
        ) {
          return
        }
        setLoadError(getActionErrorMessage(error, '加载生产工序'))
      } finally {
        if (requestSequenceRef.current === requestSequence) setLoading(false)
      }
    },
    [orderID]
  )

  useEffect(() => {
    if (!open || !positiveSafeInteger(orderID)) return undefined
    const controller = new AbortController()
    setAggregate(null)
    setSelectedBatchID(initialBatchID)
    setActiveAction('')
    setDirty(false)
    setEntrySaved(false)
    directEntryRef.current = ''
    setOutsourcingSources([])
    setOutsourcingLoadState('idle')
    setOutsourcingLoadError('')
    setPrepareOutsourcingOpen(false)
    outsourcingLoadStateRef.current = 'idle'
    outsourcingAbortControllerRef.current?.abort()
    outsourcingAbortControllerRef.current = null
    actionAttemptRef.current = null
    actionForm.resetFields()
    loadCurrentRoute({ signal: controller.signal })
    return () => {
      requestSequenceRef.current += 1
      controller.abort()
      outsourcingAbortControllerRef.current?.abort()
      outsourcingAbortControllerRef.current = null
    }
    // Opening a different order is a new source context; stale form values and
    // route responses must not cross that boundary.
  }, [
    actionForm,
    loadCurrentRoute,
    open,
    orderID,
    initialBatchID,
    initialItemID,
  ])

  const displayedBatches = useMemo(() => {
    const allBatches = Array.isArray(aggregate?.batches) ? aggregate.batches : []
    const batches = handling?.sourceType === 'production_wip_batch'
      ? allBatches.filter((batch) => Number(batch.id) === handling.sourceID)
      : handling?.sourceType === 'production_packaging_confirmation'
        ? allBatches.filter((batch) => Number(batch.production_order_item_id) === Number(initialItemID))
        : hasProcessEntry ? allBatches.filter((batch) => Number(batch.id) === Number(initialBatchID)) : allBatches
    if (!batchScopeEnabled) return batches
    if (!positiveSafeInteger(scopedReworkFactID)) return []
    return batches.filter(
      (batch) => batch.origin_rework_fact_id === scopedReworkFactID
    )
  }, [aggregate, batchScopeEnabled, scopedReworkFactID, handling, initialItemID, hasProcessEntry, initialBatchID])
  const scopedBatchMissing = Boolean(
    aggregate?.initialized && batchScopeEnabled && displayedBatches.length === 0
  )

  useEffect(() => {
    if (displayedBatches.length === 0) {
      setSelectedBatchID(null)
      return
    }
    if (!displayedBatches.some((batch) => batch.id === selectedBatchID)) {
      const selectableBatches =
        orderStatus === 'CLOSED'
          ? displayedBatches.filter((batch) =>
              positiveSafeInteger(batch.origin_rework_fact_id)
            )
          : displayedBatches
      const linkedBatch =
        selectableBatches.find(
          (batch) => Number(batch.id) === Number(initialBatchID)
        ) ||
        selectableBatches.find(
          (batch) =>
            Number(batch.production_order_item_id) === Number(initialItemID)
        )
      const preferredBatch = [...selectableBatches]
        .reverse()
        .find((batch) =>
          [
            ProductionWIPStatus.PLANNED,
            ProductionWIPStatus.IN_PROGRESS,
            ProductionWIPStatus.OUTSOURCED,
            ProductionWIPStatus.WAITING_QUALITY,
            ProductionWIPStatus.REJECTED,
          ].includes(batch.status)
        )
      setSelectedBatchID(
        linkedBatch?.id ||
          preferredBatch?.id ||
          selectableBatches.at(-1)?.id ||
          null
      )
    }
  }, [
    displayedBatches,
    orderStatus,
    selectedBatchID,
    initialBatchID,
    initialItemID,
  ])

  const selectedBatch = useMemo(
    () =>
      displayedBatches.find((batch) => batch.id === selectedBatchID) || null,
    [displayedBatches, selectedBatchID]
  )
  const currentOperation = useMemo(
    () => currentProductionWipOperation(aggregate, selectedBatch),
    [aggregate, selectedBatch]
  )
  const selectedOrderItem = useMemo(
    () => productionWipOrderItem(aggregate, selectedBatch),
    [aggregate, selectedBatch]
  )
  const selectedPackagingConfirmation = useMemo(
    () => productionWipPackagingConfirmationForBatch(aggregate, selectedBatch),
    [aggregate, selectedBatch]
  )
  const canReceiveFinishedGoods = Boolean(
    !assignmentOnly &&
      (!handling || (handling.group === 'handoff_production_completion' && !taskNavigation.businessReceipt)) &&
      canCreateCompletion &&
      onCreateCompletion &&
      selectedBatch &&
      selectedOrderItem &&
      productionWipCompletionEligibility(aggregate, selectedOrderItem, {
        orderStatus,
        productionWipBatchID: selectedBatch.id,
      }).eligible
  )
  const nextOperation = useMemo(() => {
    const candidate = nextProductionWipOperation(aggregate, selectedBatch)
    if (!candidate) return null
    return compareProductionWipQuantity(productionWipTransferRemainingQuantity(aggregate, selectedBatch, candidate), '0') > 0 ? candidate : null
  }, [aggregate, selectedBatch])
  const canRunAction = useCallback(
    (action) => {
      if (assignmentOnly && action !== PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION) {
        return false
      }
      if (action === PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL) {
        return canConfirmPackaging
      }
      if (
        [
          PRODUCTION_WIP_ACTION.SPLIT_BATCH,
          PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION,
          PRODUCTION_WIP_ACTION.CANCEL_BATCH,
        ].includes(action)
      ) {
        return canAssign
      }
      if (currentOperation?.operation_code === 'PACKAGING' || (currentOperation?.operation_code === 'HANDWORK' && action === PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION)) return canWarehousePackaging
      if (currentOperation?.operation_code === 'FABRIC_PROCESSING' && action === PRODUCTION_WIP_ACTION.START_OPERATION) return canIssueCutting
      if (action === PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN) {
        return canReceiveReturn
      }
      if (
        [
          PRODUCTION_WIP_ACTION.START_OPERATION,
          PRODUCTION_WIP_ACTION.COMPLETE_OPERATION,
          PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION,
        ].includes(action)
      ) {
        return canExecute
      }
      return false
    },
    [
      assignmentOnly,
      currentOperation,
      canWarehousePackaging,
      canIssueCutting,
      canAssign,
      canConfirmPackaging,
      canExecute,
      canReceiveReturn,
    ]
  )

  const visibleOperations = useMemo(
    () => productionWipOperationsForBatch(aggregate, selectedBatch),
    [aggregate, selectedBatch]
  )
  const isNormalFabricBatch =
    currentOperation?.operation_code === 'FABRIC_PROCESSING' &&
    [PRODUCTION_WIP_FLOW_TYPE.NORMAL, PRODUCTION_WIP_FLOW_TYPE.REMAKE].includes(selectedBatch?.flow_type)
  const availableFabricRequirements = useMemo(
    () => productionWipFabricMaterialRequirements(aggregate, selectedBatch),
    [aggregate, selectedBatch]
  )
  const fabricMaterialRequirements = useMemo(
    () =>
      availableFabricRequirements.filter((item) =>
        selectedFabricRequirementIDs?.includes(item.id)
      ),
    [availableFabricRequirements, selectedFabricRequirementIDs]
  )
  const fabricContractOptions = useMemo(
    () =>
      buildProductionWipFabricContractOptions(outsourcingSources, {
        requirements: fabricMaterialRequirements,
        operation: currentOperation,
        batch: selectedBatch,
      }),
    [currentOperation, fabricMaterialRequirements, outsourcingSources, selectedBatch]
  )
  const selectedFabricContract = useMemo(
    () =>
      fabricContractOptions.find(
        (option) => option.value === selectedFabricContractID
      ) || null,
    [fabricContractOptions, selectedFabricContractID]
  )
  const normalizedOutsourcingItemOptions = useMemo(
    () =>
      buildProductionWipOutsourcingCandidateOptions(outsourcingSources, {
        productionOrderItem: selectedOrderItem,
        operation: currentOperation,
        batch: selectedBatch,
      }),
    [currentOperation, outsourcingSources, selectedBatch, selectedOrderItem]
  )
  const selectedOutsourcingOption = useMemo(
    () =>
      normalizedOutsourcingItemOptions.find(
        (option) => option.value === selectedOutsourcingItemID
      ) || null,
    [normalizedOutsourcingItemOptions, selectedOutsourcingItemID]
  )
  const executionModeOptions = useMemo(() => {
    const options = []
    if (currentOperation?.inhouse_allowed) {
      options.push({
        label: '本厂生产',
        value: PRODUCTION_WIP_EXECUTION_MODE.IN_HOUSE,
      })
    }
    if (currentOperation?.outsourcing_allowed) {
      options.push({
        label: '外发加工',
        value: PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED,
        disabled: !canReadOutsourcingContracts,
      })
    }
    return options
  }, [canReadOutsourcingContracts, currentOperation])

  const selectAction = async (action) => {
    if (dirtyRef.current && !(await confirmLeave())) return
    if (
      !actionButtonEnabled(
        action,
        selectedBatch,
        currentOperation,
        nextOperation,
        selectedPackagingConfirmation,
        canRunAction(action),
        authoritativeOrder
      )
    ) {
      message.warning(
        orderStatus === 'CLOSED'
          ? '已关闭订单只能继续办理成品返工补制批次'
          : '当前批次状态已变化，暂不能办理该操作'
      )
      return
    }
    actionAttemptRef.current = null
    setDirty(false)
    actionForm.resetFields()
    const selectedExecutionMode = executionModeOptions.some(
      (option) =>
        !option.disabled && option.value === selectedBatch?.execution_mode
    )
      ? selectedBatch.execution_mode
      : executionModeOptions.find((option) => !option.disabled)?.value
    actionForm.setFieldsValue({
      quantity: action === PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION
        ? productionWipTransferRemainingQuantity(aggregate, selectedBatch, nextOperation)
        : undefined,
      finished_goods_receipt_id: undefined,
      execution_mode: selectedExecutionMode,
      outsourcing_order_item_id: undefined,
      fabric_contract_order_id: undefined,
      fabric_outsourcing_item_ids: {},
      target_operation_id: undefined,
      reason: '',
      packaging_version_snapshot:
        selectedPackagingConfirmation?.packaging_version_snapshot || '',
      note: selectedPackagingConfirmation?.note || '',
    })
    setActiveAction(action)
    if (selectedExecutionMode === PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED) {
      loadOutsourcingSources()
    }
  }

  const directAction = handling
    ? productionTaskWipAction(handling, selectedBatch)
    : Object.values(PRODUCTION_WIP_ACTION).includes(initialAction) ? initialAction : ''
  const directEntry = useRef(null)
  directEntry.current = () => {
    if (handling?.group === 'handoff_production_completion' || (!handling && initialAction === 'completion')) {
      if (canReceiveFinishedGoods) onCreateCompletion(selectedBatch)
      return
    }
    if (directAction && actionButtonEnabled(directAction, selectedBatch, currentOperation, nextOperation, selectedPackagingConfirmation, canRunAction(directAction), authoritativeOrder)) selectAction(directAction)
  }
  useEffect(() => {
    if (!open || loading || !aggregate || !selectedBatch || (!handling && (!initialAction || Number(selectedBatch.id) !== Number(initialBatchID))) || taskNavigation?.businessReceipt) return
    const key = `${handling?.taskID || `process:${initialAction}`}:${selectedBatch.id}`
    if (directEntryRef.current === key) return
    directEntryRef.current = key
    directEntry.current?.()
  }, [open, loading, aggregate, selectedBatch, handling, initialAction, initialBatchID, taskNavigation?.businessReceipt])

  const confirmLeave = useCallback(() => {
    if (saving) return Promise.resolve(false)
    if (!dirtyRef.current) return Promise.resolve(true)
    return new Promise((resolve) => modal.confirm({
      maskClosable: true,
      title: '离开当前办理？',
      content: '尚未保存的填写内容将丢失。',
      okText: '离开',
cancelText: '继续填写',
      onOk: () => resolve(true),
onCancel: () => resolve(false),
    }))
  }, [modal, saving])
  const registerLeave = outlet?.registerPageLeaveGuard
  useEffect(() => {
    if (!open) return undefined
    return registerLeave?.(confirmLeave)
  }, [open, registerLeave, confirmLeave])
  const close = async () => { if (await confirmLeave()) onCancel?.() }
  const returnToTask = () => {
    const target = workflowTaskReturnNavigation(taskNavigation, window.history.state?.idx)
    navigate(target.to, target.options)
  }

  const submitAction = async () => {
    if (!activeAction || !selectedBatch || !currentOperation) return
    if (!canRunAction(activeAction)) {
      message.warning('当前岗位没有办理该工序的权限')
      setActiveAction('')
      return
    }
    if (
      !actionButtonEnabled(
        activeAction,
        selectedBatch,
        currentOperation,
        nextOperation,
        selectedPackagingConfirmation,
        true,
        authoritativeOrder
      )
    ) {
      message.warning('当前订单或批次状态已变化，请重新选择后办理')
      setActiveAction('')
      actionForm.resetFields()
      return
    }
    let values
    try {
      values = await actionForm.validateFields()
    } catch (error) {
      if (error?.errorFields) return
      throw error
    }
    const payload = buildProductionWipFormPayload({
      action: activeAction,
      values,
      orderID,
      batch: selectedBatch,
      nextOperation,
      packagingConfirmation: selectedPackagingConfirmation,
      isNormalFabricBatch,
      materialRequirements: fabricMaterialRequirements,
    })
    const signature = JSON.stringify({ action: activeAction, payload })
    if (actionAttemptRef.current?.signature !== signature) {
      actionAttemptRef.current = {
        signature,
        idempotencyKey: productionWipUUID(),
      }
    }
    setSaving(true)
    try {
      const nextAggregate = await executeProductionWipAction(activeAction, {
        ...payload,
        idempotency_key: actionAttemptRef.current.idempotencyKey,
      })
      actionAttemptRef.current = null
      setAggregate(nextAggregate)
      setActiveAction('')
      setDirty(false)
      actionForm.resetFields()
      reportBusinessResult(ACTION_SUCCESS_TEXT[activeAction], selectedBatch)
      setEntrySaved(true)
      message.success(ACTION_SUCCESS_TEXT[activeAction])
      onChanged?.(nextAggregate)
    } catch (error) {
      message.error(
        getActionErrorMessage(
          error,
          ACTION_TITLE[activeAction] || '办理生产工序'
        )
      )
    } finally {
      setSaving(false)
    }
  }

  const currentStatusMeta = productionWipStatusMeta(selectedBatch?.status)
  const completionAction =
    selectedBatch?.execution_mode === PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED
      ? PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN
      : PRODUCTION_WIP_ACTION.COMPLETE_OPERATION
  const actionVisible = (action) =>
    (!handling || (!taskNavigation.businessReceipt && action === directAction)) &&
    canRunAction(action) &&
    productionWipActionRelevant({
      action,
      order: authoritativeOrder,
      batch: selectedBatch,
      operation: currentOperation,
      nextOperation,
      packagingConfirmation: selectedPackagingConfirmation,
    })
  const batchColumns = [
    {
      align: 'left',
      title: '在制批次',
      key: 'batch',
      width: 300,
      render: (_, batch) => {
        const lineage = productionWipBatchLineageMeta(batch)
        return (
          <Space size={4} wrap>
            <span>
              {productionWipBatchLabel(
                batch,
                productionWipOrderItem(aggregate, batch)
              )}
            </span>
            {lineage ? <Tag color={lineage.color}>{lineage.label}</Tag> : null}
          </Space>
        )
      },
    },
    {
      align: 'right',
      title: '数量',
      key: 'quantity',
      width: 130,
      render: (_, batch) => {
        const item = productionWipOrderItem(aggregate, batch)
        return `${batch.quantity}${item?.unit_name_snapshot ? ` ${item.unit_name_snapshot}` : ''}`
      },
    },
    {
      title: '生产安排',
      dataIndex: 'execution_mode',
      width: 130,
      render: (value) =>
        value ? (
          <Tag color={PRODUCTION_WIP_EXECUTION_MODE_META[value]?.color}>
            {PRODUCTION_WIP_EXECUTION_MODE_META[value]?.label || '安排待核对'}
          </Tag>
        ) : (
          '待安排'
        ),
    },
    {
      title: '当前工序',
      key: 'current_operation',
      width: 160,
      render: (_, batch) =>
        productionWipOperationLabel(
          currentProductionWipOperation(aggregate, batch)
        ),
    },
    {
      title: '质量关口',
      key: 'quality_gate',
      width: 260,
      render: (_, batch) => productionWipQualitySummary(aggregate, batch),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (value) => {
        const meta = productionWipStatusMeta(value)
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
  ]

  const actionPanel = activeAction ? (
    <Card
      size="small"
      title={
        activeAction === PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION &&
        isNormalFabricBatch
          ? '安排布料整单外发'
          : ACTION_TITLE[activeAction]
      }
    >
      <Form form={actionForm} layout="vertical" disabled={saving} onValuesChange={() => setDirty(true)}>
        {activeAction === PRODUCTION_WIP_ACTION.SPLIT_BATCH ? (
          <Form.Item
            name="quantity"
            label="拆出数量"
            extra={`当前批次数量：${selectedBatch?.quantity || '-'}`}
            rules={[
              unitQuantityRuleFromOptions(
                quantityUnitOptions,
                selectedOrderItem?.unit_id
              ),
              { required: true, message: '请填写拆出数量' },
              {
                validator: async (_, value) => {
                  try {
                    if (
                      compareProductionWipQuantity(
                        value,
                        selectedBatch?.quantity
                      ) >= 0
                    ) {
                      throw new Error('拆分数量必须小于当前批次数量')
                    }
                  } catch (error) {
                    throw new Error(error?.message || '拆分数量必须大于 0')
                  }
                },
              },
            ]}
          >
            <Input
              inputMode="decimal"
              maxLength={PRODUCTION_WIP_QUANTITY_MAX_LENGTH}
              placeholder="填写要独立安排的数量"
            />
          </Form.Item>
        ) : null}

        {activeAction === PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION ? (
          <>
            <Form.Item
              name="execution_mode"
              label="加工方式"
              rules={[{ required: true, message: '请选择加工方式' }]}
            >
              <Radio.Group
                options={executionModeOptions}
                onChange={(event) => {
                  if (
                    event.target.value ===
                    PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED
                  ) {
                    loadOutsourcingSources()
                  }
                }}
              />
            </Form.Item>
            {currentOperation?.outsourcing_allowed &&
            !canReadOutsourcingContracts ? (
              <Alert
                showIcon
                type="warning"
                message="当前岗位或客户配置未开放加工合同查看，暂不能安排外发。"
              />
            ) : null}
            {executionMode === PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED ? (
              <>
                {isNormalFabricBatch ? (
                  <Form.Item
                    name="fabric_requirement_ids"
                    label="本次外发的材料"
                    rules={[
                      { required: true, message: '请选择本次外发的材料' },
                    ]}
                  >
                    <Select
                      mode="multiple"
                      optionFilterProp="label"
                      options={availableFabricRequirements.map((item) => ({
                        value: item.id,
                        label: `${item.material_name_snapshot || item.material_code_snapshot} / ${item.planned_quantity} ${item.unit_name_snapshot || ''}`,
                      }))}
                      onChange={() =>
                        actionForm.setFieldsValue({
                          fabric_contract_order_id: undefined,
                          fabric_contract_items: {},
                        })
                      }
                    />
                  </Form.Item>
                ) : null}
                {canAssign && canReadOutsourcingContracts ? (
                  <Button
                    disabled={saving || !selectedBatch}
                    onClick={() => setPrepareOutsourcingOpen(true)}
                  >
                    按加工安排生成委外草稿
                  </Button>
                ) : null}
                {outsourcingLoadState === 'loading' ? (
                  <div className="erp-business-inline-note" role="status">
                    正在读取已确认加工合同的未关闭明细…
                  </div>
                ) : null}
                {outsourcingLoadState === 'error' ? (
                  <Alert
                    showIcon
                    type="error"
                    message={outsourcingLoadError}
                    action={
                      <Button
                        onClick={() => loadOutsourcingSources({ force: true })}
                      >
                        重新读取
                      </Button>
                    }
                  />
                ) : null}
                {outsourcingLoadState === 'loaded' ? (
                  isNormalFabricBatch ? (
                    <>
                      {fabricMaterialRequirements.length === 0 ? (
                        <Alert
                          showIcon
                          type="error"
                          message="请先选择本次外发的材料；其余材料按后续车缝、手工安排领用。"
                        />
                      ) : fabricContractOptions.length === 0 ? (
                        <Alert
                          showIcon
                          type="warning"
                          message={`暂无一份已确认加工合同能同时覆盖 ${fabricMaterialRequirements.length} 项布料需求。每项都必须在同一合同中有材料、工序、单位和数量完全一致的未关闭明细。`}
                        />
                      ) : (
                        <div className="erp-business-inline-note" role="note">
                          已找到 {fabricContractOptions.length} 份可完整覆盖{' '}
                          {fabricMaterialRequirements.length}{' '}
                          项布料需求的合同，提交时会再次核对。
                        </div>
                      )}
                      <Form.Item
                        name="fabric_contract_order_id"
                        label="布料加工合同"
                        preserve={false}
                        rules={[
                          { required: true, message: '请选择布料加工合同' },
                          {
                            validator: async (_, value) => {
                              if (
                                value &&
                                !fabricContractOptions.some(
                                  (option) => option.value === value
                                )
                              ) {
                                throw new Error(
                                  '所选合同已不能完整覆盖布料需求'
                                )
                              }
                            },
                          },
                        ]}
                      >
                        <Select
                          showSearch
                          options={fabricContractOptions}
                          placeholder="选择能覆盖全部布料的同一份合同"
                          disabled={fabricContractOptions.length === 0}
                          filterOption={(input, option) =>
                            String(option?.searchText || option?.label || '')
                              .toLocaleLowerCase('zh-CN')
                              .includes(
                                String(input || '')
                                  .trim()
                                  .toLocaleLowerCase('zh-CN')
                              )
                          }
                          onChange={() => {
                            actionForm.setFieldsValue({
                              fabric_outsourcing_item_ids: {},
                            })
                          }}
                        />
                      </Form.Item>
                      {selectedFabricContract
                        ? fabricMaterialRequirements.map((requirement) => {
                            const entry =
                              selectedFabricContract.requirementOptions.find(
                                (candidate) =>
                                  candidate.requirementID === requirement.id
                              )
                            const material = [
                              requirement.material_code_snapshot,
                              requirement.material_name_snapshot,
                            ]
                              .filter(Boolean)
                              .join(' ')
                            return (
                              <Form.Item
                                key={requirement.id}
                                name={[
                                  'fabric_outsourcing_item_ids',
                                  String(requirement.id),
                                ]}
                                label={material || '布料需求'}
                                extra={`冻结需求：${requirement.planned_quantity} ${requirement.unit_name_snapshot}`}
                                preserve={false}
                                rules={[
                                  {
                                    required: true,
                                    message: '请选择对应合同材料明细',
                                  },
                                  {
                                    validator: async (_, value) => {
                                      if (
                                        value &&
                                        !entry?.options.some(
                                          (option) => option.value === value
                                        )
                                      ) {
                                        throw new Error(
                                          '所选材料明细已不再匹配'
                                        )
                                      }
                                      const selected = Object.values(
                                        actionForm.getFieldValue(
                                          'fabric_outsourcing_item_ids'
                                        ) || {}
                                      ).filter(positiveSafeInteger)
                                      if (
                                        value &&
                                        selected.filter(
                                          (itemID) => itemID === value
                                        ).length > 1
                                      ) {
                                        throw new Error(
                                          '每条合同材料明细只能对应一项冻结需求'
                                        )
                                      }
                                    },
                                  },
                                ]}
                              >
                                <Select
                                  showSearch
                                  options={entry?.options || []}
                                  placeholder="选择材料、工序、单位和数量一致的明细"
                                  filterOption={(input, option) =>
                                    String(
                                      option?.searchText || option?.label || ''
                                    )
                                      .toLocaleLowerCase('zh-CN')
                                      .includes(
                                        String(input || '')
                                          .trim()
                                          .toLocaleLowerCase('zh-CN')
                                      )
                                  }
                                />
                              </Form.Item>
                            )
                          })
                        : null}
                      <div className="erp-business-inline-note" role="note">
                        布料加工按生产明细整单外发，不在首道拆批。保存安排后，外发开工前还必须把合同对应材料发料过账。
                      </div>
                    </>
                  ) : (
                    <>
                      {normalizedOutsourcingItemOptions.length === 0 ? (
                        <Alert
                          showIcon
                          type="warning"
                          message="暂无完全匹配的加工合同明细。候选必须来自已确认合同的未关闭产品行，且产品、规格、工序、单位和数量与当前批次一致。"
                        />
                      ) : (
                        <div className="erp-business-inline-note" role="note">
                          已筛出 {normalizedOutsourcingItemOptions.length}{' '}
                          条匹配当前批次的合同明细，提交时会再次核对。
                        </div>
                      )}
                      <Form.Item
                        name="outsourcing_order_item_id"
                        label="关联加工合同明细"
                        preserve={false}
                        rules={[
                          {
                            required: true,
                            message: '请选择关联加工合同明细',
                          },
                          {
                            validator: async (_, value) => {
                              if (
                                value &&
                                !normalizedOutsourcingItemOptions.some(
                                  (option) => option.value === value
                                )
                              ) {
                                throw new Error(
                                  '所选合同明细已不再匹配，请重新选择'
                                )
                              }
                            },
                          },
                        ]}
                      >
                        <Select
                          showSearch
                          options={normalizedOutsourcingItemOptions}
                          placeholder="按合同号、工序或加工厂选择"
                          filterOption={(input, option) =>
                            String(option?.searchText || option?.label || '')
                              .toLocaleLowerCase('zh-CN')
                              .includes(
                                String(input || '')
                                  .trim()
                                  .toLocaleLowerCase('zh-CN')
                              )
                          }
                        />
                      </Form.Item>
                      {selectedOutsourcingOption ? (
                        <Text type="secondary">
                          匹配核对：{selectedOutsourcingOption.matchSummary}
                        </Text>
                      ) : null}
                    </>
                  )
                ) : null}
              </>
            ) : (
              <div className="erp-business-inline-note" role="note">
                本厂生产使用车间移交；外发加工完成返回才登记回仓。需要分开安排时，请先拆分批次。
              </div>
            )}
          </>
        ) : null}

        {[
          PRODUCTION_WIP_ACTION.COMPLETE_OPERATION,
          PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN,
        ].includes(activeAction) ? (
          <Alert
            showIcon
            type="info"
            message={
              activeAction === PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN
                ? '仓库先清点本批次实收数量，点数一致后送 IQC 检验。当前按整批回货；少收、多收请先与业务及加工厂核对，不能按应收数量代填。'
                : '按当前批次登记本厂完工，系统随后生成正式质量检验；检验合格后才能转下道。'
            }
          />
        ) : null}

        {activeAction === PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN ? (
          <Form.Item
            name="quantity"
            label="仓库实点数量"
            extra={`本批次应收 ${selectedBatch?.quantity || '—'}；请按实物清点后填写。`}
            rules={[
            { required: true, message: '请填写仓库实点数量' },
            { validator: async (_, value) => {
              if (!value) return
              if (compareProductionWipQuantity(normalizeProductionWipQuantity(value), selectedBatch.quantity) !== 0) throw new Error('实点数量与本批次不一致，请先核对，暂不能整批送检')
            } },
          ]}
          >
            <Input inputMode="decimal" maxLength={PRODUCTION_WIP_QUANTITY_MAX_LENGTH} placeholder="实物清点后填写" />
          </Form.Item>
        ) : null}

        {activeAction === PRODUCTION_WIP_ACTION.START_OPERATION ? (
          <div className="erp-business-inline-note" role="note">
            开始后该批次进入当前工序，后续工序仍需按顺序办理。
          </div>
        ) : null}

        {activeAction === PRODUCTION_WIP_ACTION.CANCEL_BATCH ? (
          <>
            <Alert
              showIcon
              type="warning"
              message="取消只终止当前尚未开工的批次，不会重新拆分数量，也不会撤销已经形成的发料、库存或质检记录。"
            />
            <Form.Item
              name="reason"
              label="取消原因"
              rules={[
                { required: true, whitespace: true, message: '请填写取消原因' },
              ]}
            >
              <Input.TextArea rows={3} maxLength={255} showCount />
            </Form.Item>
          </>
        ) : null}

        {activeAction === PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION ? (
          <>
            <div className="erp-business-inline-note" role="note">
              {nextOperation?.operation_code === 'PACKAGING'
                ? '选择已入库的成品，仓库查货后办理包装。包装完成后才可发货。'
                : `移交进入${productionWipOperationLabel(nextOperation)}，可分批办理。`}
            </div>
            {nextOperation?.operation_code === 'PACKAGING' ? (
              <Form.Item name="finished_goods_receipt_id" label="成品入库单" rules={[{ required: true, message: '请选择已入库且尚有待包装数量的成品' }]}>
                <Select
                  placeholder="选择已确认的成品入库单"
                  options={productionWipPackagingReceiptChoices(aggregate, selectedBatch).map((receipt) => ({ value: receipt.id, label: `${receipt.fact_no} · 可包装 ${receipt.remaining_quantity}` }))}
                  onChange={(id) => actionForm.setFieldValue('quantity', productionWipPackagingReceiptChoices(aggregate, selectedBatch).find((receipt) => receipt.id === id)?.remaining_quantity)}
                />
              </Form.Item>
            ) : null}
            <Form.Item
              name="quantity"
              label="本次移交数量"
              rules={[
              unitQuantityRuleFromOptions(quantityUnitOptions, selectedOrderItem?.unit_id),
              { required: true, message: '请填写本次移交数量' },
              { validator: async (_, value) => {
                const remaining = nextOperation?.operation_code === 'PACKAGING'
                  ? productionWipPackagingReceiptChoices(aggregate, selectedBatch).find((receipt) => receipt.id === actionForm.getFieldValue('finished_goods_receipt_id'))?.remaining_quantity
                  : productionWipTransferRemainingQuantity(aggregate, selectedBatch, nextOperation)
                if (!remaining || compareProductionWipQuantity(value, remaining) > 0) throw new Error('不能超过当前可移交数量，请核对入库和已移交记录')
              } },
            ]}
            >
              <Input inputMode="decimal" maxLength={PRODUCTION_WIP_QUANTITY_MAX_LENGTH} />
            </Form.Item>
          </>
        ) : null}

        {activeAction === PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL ? (
          <>
            <Form.Item
              name="packaging_version_snapshot"
              label="包装版本"
              extra="填写已确认的彩盒、吊牌或包装版次"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: '请填写已确认的包装版本',
                },
              ]}
            >
              <Input maxLength={128} placeholder="例如：彩盒 V3" />
            </Form.Item>
            <Form.Item name="note" label="确认说明">
              <Input.TextArea
                rows={3}
                maxLength={255}
                showCount
                placeholder="可填写版面、颜色、包装方式等核对说明"
              />
            </Form.Item>
          </>
        ) : null}

        <Space wrap>
          <Button type="primary" loading={saving} onClick={submitAction}>
            确认办理
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              if (!(await confirmLeave())) return
              actionAttemptRef.current = null
              actionForm.resetFields()
              setDirty(false)
              setActiveAction('')
            }}
          >
            返回工序
          </Button>
        </Space>
      </Form>
    </Card>
  ) : null

  return (
    <BusinessFormModal
      open={open}
      size={focusedEntry || assignmentOnly ? 'localAction' : 'lineItems'}
      title={
        focusedEntry ? ACTION_TITLE[activeAction] || '生产事项办理' : assignmentOnly
          ? '安排本厂或外发加工'
          : readOnly
            ? orderStatus === 'CLOSED'
              ? '查看返工工序'
              : '查看生产工序'
            : orderStatus === 'CLOSED'
              ? '返工工序办理'
              : '生产工序办理'
      }
      description={
        focusedEntry ? '核对当前批次，完成本次办理。' : assignmentOnly
          ? '只为当前返工任务关联的在制批次选择生产方式。'
          : '按批次办理布料加工、缝制、手工制作和包装；成品收仓由生产登记、仓库确认，检验与包装完成后才可发货。'
      }
      icon={<BranchesOutlined />}
      footer={
        <Space>
          <Button disabled={saving} onClick={close}>关闭</Button>
          {taskNavigation?.businessReceipt ? <Button type="primary" onClick={returnToTask}>办完返回原任务</Button> : null}
          {!handling && onReturnToExecution ? <Button type={entrySaved ? 'primary' : 'default'} disabled={saving} onClick={async () => { if (await confirmLeave()) onReturnToExecution() }}>{entrySaved ? '办完返回生产执行' : '返回生产执行'}</Button> : null}
        </Space>
      }
      maskClosable={!saving}
      keyboard={!saving}
      onCancel={saving ? undefined : close}
      destroyOnHidden
    >
      {taskNavigation?.businessReceipt ? <Alert type="success" showIcon message={taskNavigation.businessReceipt.message} /> : null}
      {focusedEntry ? null : assignmentOnly ? (
        <div className="erp-business-inline-note" role="note">
          保存后只更新加工安排，不会自动完成当前任务，也不会登记完工、回仓、质检或库存。
        </div>
      ) : (
        <div className="erp-business-inline-note" role="note">
          裁片 → 车缝 → 手工 → 成品入库 → 查货与包装。车缝、手工可本厂或委外，质量判定在“质量检验”办理。
        </div>
      )}
      {orderStatus === 'CLOSED' ? (
        <div className="erp-business-inline-note" role="note">
          当前订单已关闭；原生产批次只读，仅“成品返工补制”批次可以继续办理。成品返工如需撤销，请回到返工记录办理。
        </div>
      ) : null}
      <Descriptions
        size="small"
        column={{ xs: 1, md: 2 }}
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'order',
            label: '生产订单',
            children:
              aggregate?.productionOrder?.order_no ||
              productionOrder?.order_no ||
              '生产订单待核对',
          },
          ...(!assignmentOnly
            ? [
                {
                  key: 'route',
                  label: '工序路线',
                  children: '标准毛绒生产路线',
                },
              ]
            : []),
          ...(selectedOrderItem?.product_id
            ? [
                {
                  key: 'product-image',
                  label: '产品参考',
                  children: (
                    <ProductIdentity
                      productId={selectedOrderItem.product_id}
                      name={selectedOrderItem.product_name_snapshot}
                      code={selectedOrderItem.product_code_snapshot}
                    />
                  ),
                },
              ]
            : []),
          {
            key: 'batch',
            label: '当前在制批次',
            children: selectedBatch
              ? productionWipBatchLabel(selectedBatch, selectedOrderItem)
              : '尚未选择',
          },
          ...(!assignmentOnly
            ? [
                {
                  key: 'packaging',
                  label: '包材要求',
                  children: packagingConfirmationText(
                    selectedPackagingConfirmation
                  ),
                },
              ]
            : []),
        ]}
      />

      {focusedEntry && !loading ? actionPanel : null}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Space direction="vertical" align="center">
            <Spin />
            <Text type="secondary">正在加载生产工序</Text>
          </Space>
        </div>
      ) : loadError ? (
        <Alert
          showIcon
          type="error"
          message={loadError}
          action={
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadCurrentRoute()}
            >
              重新加载
            </Button>
          }
          style={{ marginTop: 16 }}
        />
      ) : aggregate && !aggregate.initialized ? (
        <Empty
          description={
            aggregate.items.some(
              (item) => item.route_code === PRODUCTION_WIP_ROUTE_CODE
            )
              ? '当前生产订单的工序路线不完整'
              : '当前生产订单未启用标准工序路线'
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          {aggregate.items.some(
            (item) => item.route_code === PRODUCTION_WIP_ROUTE_CODE
          ) ? (
            <Text type="secondary">
              标准路线只在生产订单发布时冻结；请核对工序档案的标准路线绑定，并由管理员处理这条异常订单。
            </Text>
          ) : null}
        </Empty>
      ) : scopedBatchMissing ? (
        <Empty
          description="未找到与当前返工任务一致的在制批次"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Text type="secondary">
            请返回任务详情刷新后重试；仍无法办理时，到电脑端生产订单核对返工进度。
          </Text>
        </Empty>
      ) : aggregate?.initialized ? (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <section>
            <Title level={5}>{assignmentOnly ? '返工批次' : '在制批次'}</Title>
            {assignmentOnly || focusedEntry ? (
              <Select
                value={selectedBatch?.id}
                style={{ width: '100%' }}
                options={displayedBatches.map((batch) => ({
                  value: batch.id,
                  label: productionWipBatchLabel(
                    batch,
                    productionWipOrderItem(aggregate, batch)
                  ),
                }))}
                onChange={async (batchID) => {
                  if (batchID === selectedBatchID || !(await confirmLeave())) return
                  setDirty(false)
                  setActiveAction('')
                  actionForm.resetFields()
                  actionAttemptRef.current = null
                  setSelectedBatchID(batchID)
                }}
                placeholder="选择当前返工批次"
              />
            ) : (
              <Table
                size="small"
                rowKey="id"
                columns={batchColumns}
                dataSource={displayedBatches}
                pagination={false}
                scroll={{ x: 800 }}
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: selectedBatch ? [selectedBatch.id] : [],
                  onChange: async (_, rows) => {
                    if (rows[0]?.id === selectedBatchID || !(await confirmLeave())) return
                    setDirty(false)
                    setActiveAction('')
                    actionForm.resetFields()
                    actionAttemptRef.current = null
                    setSelectedBatchID(rows[0]?.id || null)
                  },
                }}
                onRow={(batch) => ({
                  onClick: async (event) => {
                    if (event.target.closest('button,input,label,.ant-radio-wrapper') || batch.id === selectedBatchID || !(await confirmLeave())) return
                    setDirty(false)
                    setActiveAction('')
                    actionForm.resetFields()
                    actionAttemptRef.current = null
                    setSelectedBatchID(batch.id)
                  },
                })}
              />
            )}
          </section>

          {selectedBatch ? (
            <section>
              <Space
                align="center"
                style={{ width: '100%', justifyContent: 'space-between' }}
                wrap
              >
                <div>
                  <Title level={5} style={{ marginBottom: 4 }}>
                    当前批次工序
                  </Title>
                  <Space wrap>
                    <Tag color={currentStatusMeta.color}>
                      {currentStatusMeta.label}
                    </Tag>
                    <Text type="secondary">
                      当前：{productionWipOperationLabel(currentOperation)}
                    </Text>
                  </Space>
                </div>
                <Space wrap>
                  {canReceiveFinishedGoods ? (
                    <Button
                      type="primary"
                      loading={completionLoading}
                      disabled={saving || loading || completionLoading}
                      onClick={() => onCreateCompletion(selectedBatch)}
                    >
                      登记成品收仓
                    </Button>
                  ) : null}
                  {(canAssign || canWarehousePackaging) ? (
                    <>
                      {actionVisible(PRODUCTION_WIP_ACTION.SPLIT_BATCH) ? (
                        <Button
                          disabled={
                            saving ||
                            !actionButtonEnabled(
                              PRODUCTION_WIP_ACTION.SPLIT_BATCH,
                              selectedBatch,
                              currentOperation,
                              nextOperation,
                              selectedPackagingConfirmation,
                              canRunAction(PRODUCTION_WIP_ACTION.SPLIT_BATCH),
                              authoritativeOrder
                            )
                          }
                          onClick={() =>
                            selectAction(PRODUCTION_WIP_ACTION.SPLIT_BATCH)
                          }
                        >
                          拆分批次
                        </Button>
                      ) : null}
                      {actionVisible(PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION) ? (
                        <Button
                          type="primary"
                          disabled={
                            saving ||
                            !actionButtonEnabled(
                              PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION,
                              selectedBatch,
                              currentOperation,
                              nextOperation,
                              selectedPackagingConfirmation,
                              canRunAction(PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION),
                              authoritativeOrder
                            )
                          }
                          onClick={() =>
                            selectAction(PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION)
                          }
                        >
                          安排加工
                        </Button>
                      ) : null}
                      {actionVisible(PRODUCTION_WIP_ACTION.CANCEL_BATCH) ? (
                        <Button
                          danger
                          disabled={
                            saving ||
                            !actionButtonEnabled(
                              PRODUCTION_WIP_ACTION.CANCEL_BATCH,
                              selectedBatch,
                              currentOperation,
                              nextOperation,
                              selectedPackagingConfirmation,
                              canRunAction(PRODUCTION_WIP_ACTION.CANCEL_BATCH),
                              authoritativeOrder
                            )
                          }
                          onClick={() =>
                            selectAction(PRODUCTION_WIP_ACTION.CANCEL_BATCH)
                          }
                        >
                          取消批次
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {(canExecute || canReceiveReturn || canWarehousePackaging || canIssueCutting) && !assignmentOnly ? (
                    <>
                      {actionVisible(PRODUCTION_WIP_ACTION.START_OPERATION) ? (
                        <Button
                          disabled={
                            saving ||
                            !actionButtonEnabled(
                              PRODUCTION_WIP_ACTION.START_OPERATION,
                              selectedBatch,
                              currentOperation,
                              nextOperation,
                              selectedPackagingConfirmation,
                              canRunAction(PRODUCTION_WIP_ACTION.START_OPERATION),
                              authoritativeOrder
                            )
                          }
                          onClick={() =>
                            selectAction(PRODUCTION_WIP_ACTION.START_OPERATION)
                          }
                        >
                          {currentOperation?.operation_code === 'PACKAGING' ? '查货完成，开始包装' : currentOperation?.operation_code === 'FABRIC_PROCESSING' ? '确认外发裁片' : '开始工序'}
                        </Button>
                      ) : null}
                      {actionVisible(completionAction) ? (
                        <Button
                          disabled={
                            saving ||
                            !actionButtonEnabled(
                              completionAction,
                              selectedBatch,
                              currentOperation,
                              nextOperation,
                              selectedPackagingConfirmation,
                              canRunAction(completionAction),
                              authoritativeOrder
                            )
                          }
                          onClick={() => selectAction(completionAction)}
                        >
                          {currentOperation?.operation_code === 'PACKAGING' ? '完成包装' : ACTION_TITLE[completionAction]}
                        </Button>
                      ) : null}
                      {actionVisible(
                        PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION
                      ) ? (
                        <Button
                          type="primary"
                          disabled={
                            saving ||
                            !actionButtonEnabled(
                              PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION,
                              selectedBatch,
                              currentOperation,
                              nextOperation,
                              selectedPackagingConfirmation,
                              canRunAction(PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION),
                              authoritativeOrder
                            )
                          }
                          onClick={() =>
                            selectAction(
                              PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION
                            )
                          }
                        >
                          {nextOperation?.operation_code === 'PACKAGING' ? '安排查货包装' : '移交下道工序'}
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {actionVisible(
                    PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL
                  ) ? (
                    <Button
                      disabled={
                        saving ||
                        !actionButtonEnabled(
                          PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL,
                          selectedBatch,
                          currentOperation,
                          nextOperation,
                          selectedPackagingConfirmation,
                          canConfirmPackaging,
                          authoritativeOrder
                        )
                      }
                      onClick={() =>
                        selectAction(
                          PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL
                        )
                      }
                    >
                      确认包材要求
                    </Button>
                  ) : null}
                  {selectedBatch?.status === ProductionWIPStatus.REJECTED ? <Text type="warning">检验不合格，请由业务在质检单发起异常方案，审批后继续办理。</Text> : null}
                </Space>
              </Space>
              {isNormalFabricBatch ? (
                <div className="erp-business-inline-note" role="note">
                  布料加工按当前批次外发；补料重做须使用本批次新合同重新发料。裁片检验合格后再移交缝制。
                </div>
              ) : currentOperation?.operation_code === 'FABRIC_PROCESSING' ? (
                <div className="erp-business-inline-note" role="note">
                  裁片返工按当前返工批次关联一条产品加工合同明细，不重复生成布料发料要求。
                </div>
              ) : null}
              {!assignmentOnly && !focusedEntry ? (
                <Steps
                  direction="vertical"
                  size="small"
                  current={Math.max(
                    0,
                    visibleOperations.findIndex(
                      (operation) => operation.id === currentOperation?.id
                    )
                  )}
                  items={visibleOperations.map((operation) => {
                    const operationBatch = productionWipBatchForOperation(
                      aggregate,
                      selectedBatch,
                      operation
                    )
                    const allowedModes = [
                      operation.inhouse_allowed ? '本厂' : '',
                      operation.outsourcing_allowed ? '外发' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                    return {
                      key: operation.id,
                      title: (
                        <Space wrap>
                          <span>{productionWipOperationLabel(operation)}</span>
                          <Tag color="blue">{allowedModes}</Tag>
                          {operation.required_quality_gates.length > 0 ? (
                            <Tag color="gold">需品质检验</Tag>
                          ) : null}
                          {operation.business_confirmation_code ===
                          'PACKAGING_MATERIAL' ? (
                            <Tag color="purple">需业务确认包材</Tag>
                          ) : null}
                        </Space>
                      ),
                      description: [
                        `产出：${productionWipOutputLabel(operation)}`,
                        qualityGateText(aggregate, operation, operationBatch),
                        `环节状态：${operationBatch ? productionWipStatusMeta(operationBatch.status).label : '尚未到达'}`,
                      ]
                        .filter(Boolean)
                        .join('；'),
                      status: operationStepStatus(
                        operationBatch,
                        operation,
                        currentOperation?.id
                      ),
                    }
                  })}
                  style={{ marginTop: 16 }}
                />
              ) : null}
            </section>
          ) : null}

          {!focusedEntry ? actionPanel : null}
          <ProductionOutsourcingPrepareModal
            open={prepareOutsourcingOpen}
            batch={selectedBatch}
            operation={currentOperation}
            requirements={availableFabricRequirements}
            onCancel={() => setPrepareOutsourcingOpen(false)}
            onPrepared={() => {
              setPrepareOutsourcingOpen(false)
              onChanged?.()
              onCancel()
            }}
          />
        </Space>
      ) : null}
    </BusinessFormModal>
  )
}
