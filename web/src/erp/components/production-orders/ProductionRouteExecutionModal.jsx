import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
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
  Table,
  Tag,
  Typography,
} from 'antd'
import { BranchesOutlined, ReloadOutlined } from '@ant-design/icons'

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
  buildProductionWipConservingSplits,
  buildProductionWipFabricContractOptions,
  buildProductionWipOutsourcingCandidateOptions,
  compareProductionWipQuantity,
  currentProductionWipOperation,
  nextProductionWipOperation,
  positiveSafeInteger,
  productionWipBatchForOperation,
  productionWipBatchLabel,
  productionWipFabricMaterialRequirements,
  productionWipOperationLabel,
  productionWipOperationsForBatch,
  productionWipOrderItem,
  productionWipOutputLabel,
  productionWipPackagingConfirmationForBatch,
  productionWipQualityGateLabel,
  productionWipQualitySummary,
  productionWipStatusMeta,
  productionWipUUID,
} from '../../utils/productionWipModel.mjs'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'

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
  [PRODUCTION_WIP_ACTION.REWORK]: '返工去向已登记',
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
  [PRODUCTION_WIP_ACTION.REWORK]: '登记返工去向',
})

function operationStepStatus(batch, operation, currentOperationID) {
  const status = String(batch?.status || '').trim()
  if (status === 'ACCEPTED') return 'finish'
  if (status === 'REJECTED') return 'error'
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
  if (!confirmation || confirmation.status !== 'CONFIRMED') {
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
  canAct
) {
  if (!canAct || !batch || !operation) return false
  const status = String(batch.status || '').trim()
  switch (action) {
    case PRODUCTION_WIP_ACTION.SPLIT_BATCH:
      return (
        status === 'PLANNED' && operation.operation_code !== 'FABRIC_PROCESSING'
      )
    case PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION:
      return status === 'PLANNED'
    case PRODUCTION_WIP_ACTION.CANCEL_BATCH:
      return status === 'PLANNED'
    case PRODUCTION_WIP_ACTION.START_OPERATION:
      return status === 'PLANNED' && Boolean(batch.execution_mode)
    case PRODUCTION_WIP_ACTION.COMPLETE_OPERATION:
      return (
        status === 'IN_PROGRESS' &&
        batch.execution_mode === PRODUCTION_WIP_EXECUTION_MODE.IN_HOUSE
      )
    case PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN:
      return (
        status === 'OUTSOURCED' &&
        batch.execution_mode === PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED
      )
    case PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION:
      return status === 'ACCEPTED' && Boolean(nextOperation)
    case PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL:
      return (
        packagingConfirmation?.status === 'PENDING' &&
        !['SPLIT', 'CANCELLED'].includes(status)
      )
    case PRODUCTION_WIP_ACTION.REWORK:
      return status === 'REJECTED'
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
  canAssign = false,
  canExecute = false,
  canRework = false,
  canConfirmPackaging = false,
  canReadOutsourcingContracts = false,
  onCancel,
  onChanged,
}) {
  const [actionForm] = Form.useForm()
  const [aggregate, setAggregate] = useState(null)
  const [selectedBatchID, setSelectedBatchID] = useState(null)
  const [activeAction, setActiveAction] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [outsourcingSources, setOutsourcingSources] = useState([])
  const [outsourcingLoadState, setOutsourcingLoadState] = useState('idle')
  const [outsourcingLoadError, setOutsourcingLoadError] = useState('')
  const requestSequenceRef = useRef(0)
  const actionAttemptRef = useRef(null)
  const outsourcingAbortControllerRef = useRef(null)
  const outsourcingLoadStateRef = useRef('idle')
  const executionMode = Form.useWatch('execution_mode', actionForm)
  const selectedOutsourcingItemID = Form.useWatch(
    'outsourcing_order_item_id',
    actionForm
  )
  const selectedFabricContractID = Form.useWatch(
    'fabric_contract_order_id',
    actionForm
  )
  const orderID = Number(productionOrder?.id || 0)
  const canRunAction = useCallback(
    (action) => {
      if (
        [
          PRODUCTION_WIP_ACTION.SPLIT_BATCH,
          PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION,
          PRODUCTION_WIP_ACTION.CANCEL_BATCH,
        ].includes(action)
      ) {
        return canAssign
      }
      if (
        [
          PRODUCTION_WIP_ACTION.START_OPERATION,
          PRODUCTION_WIP_ACTION.COMPLETE_OPERATION,
          PRODUCTION_WIP_ACTION.RECEIVE_OUTSOURCING_RETURN,
          PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION,
        ].includes(action)
      ) {
        return canExecute
      }
      if (action === PRODUCTION_WIP_ACTION.REWORK) return canRework
      if (action === PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL) {
        return canConfirmPackaging
      }
      return false
    },
    [canAssign, canConfirmPackaging, canExecute, canRework]
  )

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
    setSelectedBatchID(null)
    setActiveAction('')
    setOutsourcingSources([])
    setOutsourcingLoadState('idle')
    setOutsourcingLoadError('')
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
  }, [actionForm, loadCurrentRoute, open, orderID])

  useEffect(() => {
    if (!aggregate?.batches?.length) {
      setSelectedBatchID(null)
      return
    }
    if (!aggregate.batches.some((batch) => batch.id === selectedBatchID)) {
      const preferredBatch = [...aggregate.batches]
        .reverse()
        .find((batch) =>
          [
            'PLANNED',
            'IN_PROGRESS',
            'OUTSOURCED',
            'WAITING_QUALITY',
            'REJECTED',
          ].includes(batch.status)
        )
      setSelectedBatchID(
        preferredBatch?.id || aggregate.batches.at(-1)?.id || null
      )
    }
  }, [aggregate, selectedBatchID])

  const selectedBatch = useMemo(
    () =>
      aggregate?.batches?.find((batch) => batch.id === selectedBatchID) || null,
    [aggregate, selectedBatchID]
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
  const nextOperation = useMemo(() => {
    const candidate = nextProductionWipOperation(aggregate, selectedBatch)
    if (!candidate) return null
    const alreadyTransferred = aggregate.batches.some(
      (batch) =>
        batch.source_batch_id === selectedBatch.id &&
        batch.production_order_operation_id === candidate.id &&
        batch.status !== 'CANCELLED'
    )
    return alreadyTransferred ? null : candidate
  }, [aggregate, selectedBatch])
  const visibleOperations = useMemo(
    () => productionWipOperationsForBatch(aggregate, selectedBatch),
    [aggregate, selectedBatch]
  )
  const eligibleReworkTargets = useMemo(
    () =>
      visibleOperations.filter(
        (operation) =>
          !currentOperation || operation.step_no <= currentOperation.step_no
      ),
    [currentOperation, visibleOperations]
  )
  const isNormalFabricBatch =
    currentOperation?.operation_code === 'FABRIC_PROCESSING' &&
    selectedBatch?.flow_type === PRODUCTION_WIP_FLOW_TYPE.NORMAL
  const fabricMaterialRequirements = useMemo(
    () => productionWipFabricMaterialRequirements(aggregate, selectedBatch),
    [aggregate, selectedBatch]
  )
  const fabricContractOptions = useMemo(
    () =>
      buildProductionWipFabricContractOptions(outsourcingSources, {
        requirements: fabricMaterialRequirements,
        operation: currentOperation,
      }),
    [currentOperation, fabricMaterialRequirements, outsourcingSources]
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

  const selectAction = (action) => {
    if (
      action === PRODUCTION_WIP_ACTION.SPLIT_BATCH &&
      currentOperation?.operation_code === 'FABRIC_PROCESSING'
    ) {
      return
    }
    actionAttemptRef.current = null
    actionForm.resetFields()
    const selectedExecutionMode = executionModeOptions.some(
      (option) =>
        !option.disabled && option.value === selectedBatch?.execution_mode
    )
      ? selectedBatch.execution_mode
      : executionModeOptions.find((option) => !option.disabled)?.value
    actionForm.setFieldsValue({
      quantity: undefined,
      execution_mode: selectedExecutionMode,
      outsourcing_order_item_id: undefined,
      fabric_contract_order_id: undefined,
      fabric_outsourcing_item_ids: {},
      target_operation_id:
        action === PRODUCTION_WIP_ACTION.REWORK
          ? eligibleReworkTargets.at(-1)?.id
          : undefined,
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

  const submitAction = async () => {
    if (!activeAction || !selectedBatch || !currentOperation) return
    if (!canRunAction(activeAction)) {
      message.warning('当前岗位没有办理该工序的权限')
      setActiveAction('')
      return
    }
    let values
    try {
      values = await actionForm.validateFields()
    } catch (error) {
      if (error?.errorFields) return
      throw error
    }
    const payload =
      activeAction === PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL
        ? {
            production_order_id: orderID,
            production_order_item_id: selectedBatch.production_order_item_id,
            expected_version: selectedPackagingConfirmation?.version,
            packaging_version_snapshot: values.packaging_version_snapshot,
            note: values.note,
          }
        : {
            production_order_id: orderID,
            production_wip_batch_id: selectedBatch.id,
            expected_version: selectedBatch.version,
            ...(activeAction === PRODUCTION_WIP_ACTION.SPLIT_BATCH
              ? {
                  splits: buildProductionWipConservingSplits(
                    selectedBatch.quantity,
                    values.quantity
                  ),
                }
              : {}),
            ...([
              PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION,
              PRODUCTION_WIP_ACTION.REWORK,
            ].includes(activeAction)
              ? {
                  quantity:
                    activeAction ===
                    PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION
                      ? selectedBatch.quantity
                      : values.quantity,
                }
              : {}),
            ...(activeAction === PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION
              ? {
                  execution_mode: values.execution_mode,
                  outsourcing_allocations:
                    values.execution_mode ===
                    PRODUCTION_WIP_EXECUTION_MODE.OUTSOURCED
                      ? isNormalFabricBatch
                        ? fabricMaterialRequirements.map((requirement) => ({
                            outsourcing_order_item_id:
                              values.fabric_outsourcing_item_ids?.[
                                String(requirement.id)
                              ],
                            production_order_material_requirement_id:
                              requirement.id,
                          }))
                        : positiveSafeInteger(values.outsourcing_order_item_id)
                          ? [
                              {
                                outsourcing_order_item_id:
                                  values.outsourcing_order_item_id,
                              },
                            ]
                          : []
                      : [],
                }
              : {}),
            target_operation_id:
              activeAction === PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION
                ? nextOperation?.id
                : values.target_operation_id,
            reason: values.reason,
          }
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
      actionForm.resetFields()
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
  const batchColumns = [
    {
      title: '在制批次',
      key: 'batch',
      width: 260,
      render: (_, batch) =>
        productionWipBatchLabel(
          batch,
          productionWipOrderItem(aggregate, batch)
        ),
    },
    {
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
      <Form form={actionForm} layout="vertical" disabled={saving}>
        {activeAction === PRODUCTION_WIP_ACTION.SPLIT_BATCH ? (
          <Form.Item
            name="quantity"
            label="拆出数量"
            extra={`当前批次数量：${selectedBatch?.quantity || '-'}`}
            rules={[
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
                {outsourcingLoadState === 'loading' ? (
                  <Alert
                    showIcon
                    type="info"
                    message="正在读取已确认加工合同的未关闭明细……"
                  />
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
                          message="未找到发布时明确归属“布料加工”的冻结材料需求，暂不能安排首道外发。"
                        />
                      ) : fabricContractOptions.length === 0 ? (
                        <Alert
                          showIcon
                          type="warning"
                          message={`暂无一份已确认加工合同能同时覆盖 ${fabricMaterialRequirements.length} 项布料需求。每项都必须在同一合同中有材料、工序、单位和数量完全一致的未关闭明细。`}
                        />
                      ) : (
                        <Alert
                          showIcon
                          type="success"
                          message={`已找到 ${fabricContractOptions.length} 份可完整覆盖 ${fabricMaterialRequirements.length} 项布料需求的合同；提交时后端仍会逐项复核。`}
                        />
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
                              .join(' / ')
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
                      <Alert
                        showIcon
                        type="info"
                        message="布料加工按生产明细整单外发，不在首道拆批。保存安排后，外发开工前还必须把合同对应材料发料过账；系统会复核每项数量和库存批次。"
                      />
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
                        <Alert
                          showIcon
                          type="success"
                          message={`已按产品、规格、工序、单位和当前批次数量筛出 ${normalizedOutsourcingItemOptions.length} 条候选；提交时后端仍会最终复核。`}
                        />
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
              <Alert
                showIcon
                type="info"
                message="本厂生产使用车间移交 / WIP 转移；只有外发加工完成返回才登记回仓。需要分开安排时，请先拆分批次。"
              />
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
                ? '按当前批次登记外发回仓，系统随后生成正式质量检验；检验合格后才能转下道。'
                : '按当前批次登记本厂完工，系统随后生成正式质量检验；检验合格后才能转下道。'
            }
          />
        ) : null}

        {activeAction === PRODUCTION_WIP_ACTION.START_OPERATION ? (
          <Alert
            showIcon
            type="info"
            message="开始后该批次进入当前工序；后续工序仍需按顺序办理。"
          />
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
          <Alert
            showIcon
            type="info"
            message={`当前批次已检验合格，将通过车间移交 / WIP 转移进入${productionWipOperationLabel(nextOperation)}。完工或回仓不会自动跳到下道工序。`}
          />
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

        {activeAction === PRODUCTION_WIP_ACTION.REWORK ? (
          <>
            <Form.Item
              name="quantity"
              label="返工数量"
              extra={`当前批次数量：${selectedBatch?.quantity || '-'}`}
              rules={[
                { required: true, message: '请填写返工数量' },
                {
                  validator: async (_, value) => {
                    if (
                      compareProductionWipQuantity(
                        value,
                        selectedBatch?.quantity
                      ) > 0
                    ) {
                      throw new Error('返工数量不能超过当前批次数量')
                    }
                  },
                },
              ]}
            >
              <Input
                inputMode="decimal"
                maxLength={PRODUCTION_WIP_QUANTITY_MAX_LENGTH}
              />
            </Form.Item>
            <Form.Item
              name="target_operation_id"
              label="返工去向"
              rules={[{ required: true, message: '请选择返工去向' }]}
            >
              <Select
                options={eligibleReworkTargets.map((operation) => ({
                  value: operation.id,
                  label: productionWipOperationLabel(operation),
                }))}
                placeholder="选择退回的生产工序"
              />
            </Form.Item>
            <Form.Item
              name="reason"
              label="返工原因"
              rules={[
                { required: true, whitespace: true, message: '请填写返工原因' },
              ]}
            >
              <Input.TextArea rows={3} maxLength={255} showCount />
            </Form.Item>
          </>
        ) : null}

        <Space wrap>
          <Button type="primary" loading={saving} onClick={submitAction}>
            确认办理
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              actionAttemptRef.current = null
              actionForm.resetFields()
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
      width="min(1280px, calc(100vw - 48px))"
      title="生产工序办理"
      description="按在制批次依次办理布料加工、车缝、手工和包装；完工或回仓后由品质办理质量关口，合格后再转下道。"
      icon={<BranchesOutlined />}
      footer={
        <Button disabled={saving} onClick={onCancel}>
          关闭
        </Button>
      }
      maskClosable={false}
      keyboard={!saving}
      onCancel={saving ? undefined : onCancel}
      destroyOnHidden
    >
      <Alert
        showIcon
        type="info"
        message="固定顺序：布料加工 → 车缝 → 手工 → 包装。正常首道布料加工固定按生产明细整单外发，裁片返工按返工批次处理；车缝、手工两道分别独立决定本厂或外发，包装在本厂完成；特别是先车缝、后手工。"
      />
      <Alert
        showIcon
        type="warning"
        message="本页只显示质量关口状态；检验判定仍由品质人员到“质量检验”办理。内部流转叫车间移交 / WIP 转移，外发完成返回才叫回仓。"
        style={{ marginTop: 12 }}
      />
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
          {
            key: 'route',
            label: '工序路线',
            children: '标准毛绒生产路线',
          },
          {
            key: 'batch',
            label: '当前在制批次',
            children: selectedBatch
              ? productionWipBatchLabel(selectedBatch, selectedOrderItem)
              : '尚未选择',
          },
          {
            key: 'packaging',
            label: '包材要求',
            children: packagingConfirmationText(selectedPackagingConfirmation),
          },
        ]}
      />

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
      ) : aggregate?.initialized ? (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <section>
            <Title level={5}>在制批次</Title>
            <Table
              size="small"
              rowKey="id"
              columns={batchColumns}
              dataSource={aggregate.batches}
              pagination={false}
              scroll={{ x: 800 }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedBatch ? [selectedBatch.id] : [],
                onChange: (_, rows) => {
                  setActiveAction('')
                  actionForm.resetFields()
                  actionAttemptRef.current = null
                  setSelectedBatchID(rows[0]?.id || null)
                },
              }}
              onRow={(batch) => ({
                onClick: () => {
                  setActiveAction('')
                  actionForm.resetFields()
                  actionAttemptRef.current = null
                  setSelectedBatchID(batch.id)
                },
              })}
            />
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
                  {canAssign ? (
                    <>
                      {currentOperation?.operation_code !==
                      'FABRIC_PROCESSING' ? (
                        <Button
                          disabled={
                            saving ||
                            !actionButtonEnabled(
                              PRODUCTION_WIP_ACTION.SPLIT_BATCH,
                              selectedBatch,
                              currentOperation,
                              nextOperation,
                              selectedPackagingConfirmation,
                              canAssign
                            )
                          }
                          onClick={() =>
                            selectAction(PRODUCTION_WIP_ACTION.SPLIT_BATCH)
                          }
                        >
                          拆分批次
                        </Button>
                      ) : null}
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
                            canAssign
                          )
                        }
                        onClick={() =>
                          selectAction(PRODUCTION_WIP_ACTION.ASSIGN_EXECUTION)
                        }
                      >
                        安排加工
                      </Button>
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
                            canAssign
                          )
                        }
                        onClick={() =>
                          selectAction(PRODUCTION_WIP_ACTION.CANCEL_BATCH)
                        }
                      >
                        取消批次
                      </Button>
                    </>
                  ) : null}
                  {canExecute ? (
                    <>
                      <Button
                        disabled={
                          saving ||
                          !actionButtonEnabled(
                            PRODUCTION_WIP_ACTION.START_OPERATION,
                            selectedBatch,
                            currentOperation,
                            nextOperation,
                            selectedPackagingConfirmation,
                            canExecute
                          )
                        }
                        onClick={() =>
                          selectAction(PRODUCTION_WIP_ACTION.START_OPERATION)
                        }
                      >
                        开始工序
                      </Button>
                      <Button
                        disabled={
                          saving ||
                          !actionButtonEnabled(
                            completionAction,
                            selectedBatch,
                            currentOperation,
                            nextOperation,
                            selectedPackagingConfirmation,
                            canExecute
                          )
                        }
                        onClick={() => selectAction(completionAction)}
                      >
                        {ACTION_TITLE[completionAction]}
                      </Button>
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
                            canExecute
                          )
                        }
                        onClick={() =>
                          selectAction(
                            PRODUCTION_WIP_ACTION.TRANSFER_TO_NEXT_OPERATION
                          )
                        }
                      >
                        转下道工序
                      </Button>
                    </>
                  ) : null}
                  {canConfirmPackaging ? (
                    <Button
                      disabled={
                        saving ||
                        !actionButtonEnabled(
                          PRODUCTION_WIP_ACTION.CONFIRM_PACKAGING_MATERIAL,
                          selectedBatch,
                          currentOperation,
                          nextOperation,
                          selectedPackagingConfirmation,
                          canConfirmPackaging
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
                  {canRework ? (
                    <Button
                      danger
                      disabled={
                        saving ||
                        !actionButtonEnabled(
                          PRODUCTION_WIP_ACTION.REWORK,
                          selectedBatch,
                          currentOperation,
                          nextOperation,
                          selectedPackagingConfirmation,
                          canRework
                        )
                      }
                      onClick={() => selectAction(PRODUCTION_WIP_ACTION.REWORK)}
                    >
                      登记返工
                    </Button>
                  ) : null}
                </Space>
              </Space>
              {isNormalFabricBatch ? (
                <Alert
                  showIcon
                  type="info"
                  message="布料加工按整单外发，首道不拆批；裁片检验合格并转入车缝后，才可按产品数量拆分为本厂或外发。"
                />
              ) : currentOperation?.operation_code === 'FABRIC_PROCESSING' ? (
                <Alert
                  showIcon
                  type="info"
                  message="裁片返工按当前返工批次关联一条产品加工合同明细，不重复生成布料发料要求。"
                />
              ) : null}
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
                    .join(' / ')
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
            </section>
          ) : null}

          {actionPanel}
        </Space>
      ) : null}
    </BusinessFormModal>
  )
}
