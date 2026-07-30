import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Form, Input, Popconfirm, Select, Space, Tag } from 'antd'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

import {
  cancelSalesReturn,
  createSalesReturn,
  getSalesReturn,
  listAllSalesReturns,
  listAllShipments,
  listSalesReturns,
  reverseSalesReturn,
} from '../api/operationalFactApi.mjs'
import {
  listAllProducts,
  listAllProductSKUs,
  listAllUnits,
  listAllWarehouses,
} from '../api/masterDataOrderApi.mjs'
import { listAllInventoryLots } from '../api/inventoryApi.mjs'
import {
  executeSalesReturnReceive,
  findExceptionProcessActiveNode,
  getSalesReturnAcceptanceProcess,
  startSalesReturnAcceptanceProcess,
} from '../api/customerConfigApi.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import ExceptionProcessRecoveryButton from '../components/workflow/ExceptionProcessRecoveryButton.jsx'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
} from '../utils/businessPagination.mjs'
import {
  compactParams,
  formatUnixDateTime,
  hasActionPermission,
  trimOptional,
} from '../utils/masterDataOrderView.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../utils/sourceBusinessAction.mjs'
import {
  addNumeric20Scale6Units,
  compareNumeric20Scale6Units,
  isPositiveNumeric20Scale6Units,
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
  subtractNumeric20Scale6Units,
} from '../utils/numeric20Scale6.mjs'
import { resolveSalesReturnActionAvailability } from '../utils/operationalActionAvailability.mjs'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '待审批' },
  { value: 'APPROVED', label: '已批准待收货' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'RECEIVED', label: '已收货' },
  { value: 'CANCELLED', label: '已取消' },
  { value: 'REVERSED', label: '已冲正' },
]
const STATUS_META = Object.freeze({
  DRAFT: ['待审批', 'blue'],
  APPROVED: ['已批准待收货', 'gold'],
  REJECTED: ['已驳回', 'red'],
  RECEIVED: ['已收货', 'green'],
  CANCELLED: ['已取消', 'default'],
  REVERSED: ['已冲正', 'magenta'],
})

const TRANSITION_RECEIPTS = Object.freeze({
  receive: { status: 'RECEIVED', actorField: 'received_by' },
  cancel: {
    status: 'CANCELLED',
    actorField: 'cancelled_by',
    reasonField: 'cancel_reason',
  },
  reverse: {
    status: 'REVERSED',
    actorField: 'reversed_by',
    reasonField: 'reverse_reason',
  },
})

function transitionReceiptMatches(item, previous, action, reason, actorID) {
  const receipt = TRANSITION_RECEIPTS[action]
  return Boolean(
    receipt &&
      item?.id &&
      Number(item.id) === Number(previous?.id) &&
      Number(item.version) === Number(previous?.version) + 1 &&
      item.status === receipt.status &&
      Number(item[receipt.actorField]) === Number(actorID) &&
      (!receipt.reasonField ||
        String(item[receipt.reasonField] || '').trim() === reason.trim())
  )
}

function statusTag(value) {
  const [label, color] = STATUS_META[value] || ['状态待核对', 'default']
  return <Tag color={color}>{label}</Tag>
}

function shipmentOption(shipment) {
  return {
    value: Number(shipment.id),
    label: `${shipment.shipment_no || '出货单'} / ${
      shipment.customer_snapshot || '客户已关联'
    }`,
  }
}

function referenceLabel(record, codeKeys, nameKeys, fallback) {
  const code = codeKeys
    .map((key) => String(record?.[key] || '').trim())
    .find(Boolean)
  const name = nameKeys
    .map((key) => String(record?.[key] || '').trim())
    .find(Boolean)
  return [code, name].filter(Boolean).join(' / ') || fallback
}

function referenceByID(records, id) {
  return records.find((item) => Number(item?.id) === Number(id || 0)) || null
}

export default function SalesReturnsPage() {
  const [searchParams] = useSearchParams()
  const outletContext = useOutletContext()
  const adminProfile = outletContext?.adminProfile || {}
  const customerKey = adminProfile?.effective_session?.customer?.key || ''
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')
  const [shipments, setShipments] = useState([])
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [references, setReferences] = useState({
    products: [],
    productSKUs: [],
    units: [],
    warehouses: [],
    lots: [],
  })
  const [returnUsage, setReturnUsage] = useState({
    shipmentID: 0,
    status: 'idle',
    byShipmentItemID: {},
  })
  const [usageRetryKey, setUsageRetryKey] = useState(0)
  const [form] = Form.useForm()
  const attemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const beginLatestRequest = useLatestRequestCoordinator()
  const selectedShipmentID = Form.useWatch('shipment_id', form)
  const linkedSalesReturnID = Number(searchParams.get('sales_return_id') || 0)
  const selectedShipment = useMemo(
    () =>
      shipments.find(
        (item) => Number(item.id) === Number(selectedShipmentID || 0)
      ) || null,
    [selectedShipmentID, shipments]
  )
  const selectedShipmentItems = useMemo(() => {
    if (!selectedShipment) return []
    return (selectedShipment.items || []).map((item, index) => {
      const product = referenceByID(references.products, item.product_id)
      const productSKU = referenceByID(
        references.productSKUs,
        item.product_sku_id
      )
      const warehouse = referenceByID(references.warehouses, item.warehouse_id)
      const unit = referenceByID(references.units, item.unit_id)
      const lot = referenceByID(references.lots, item.lot_id)
      const sourceUnits = numeric20Scale6Units(item.quantity) || '0'
      const returnedUnits =
        returnUsage.shipmentID === Number(selectedShipment.id)
          ? returnUsage.byShipmentItemID[item.id] || '0'
          : '0'
      const remainingUnits =
        subtractNumeric20Scale6Units(sourceUnits, returnedUnits) || '0'
      return {
        ...item,
        productLabel: referenceLabel(
          product,
          ['product_code', 'code'],
          ['product_name', 'name'],
          `产品明细 ${index + 1}`
        ),
        skuLabel: item.product_sku_id
          ? referenceLabel(
              productSKU,
              ['sku_code', 'code'],
              ['sku_name', 'name'],
              'SKU 已关联'
            )
          : '未指定 SKU',
        warehouseLabel: referenceLabel(
          warehouse,
          ['warehouse_code', 'code'],
          ['warehouse_name', 'name'],
          '仓库已关联'
        ),
        unitLabel: referenceLabel(
          unit,
          ['unit_code', 'code'],
          ['unit_name', 'name'],
          '单位'
        ),
        lotLabel: item.lot_id
          ? referenceLabel(lot, ['lot_no'], [], '批次已关联')
          : '未指定来源批次',
        sourceQuantity: numeric20Scale6TextFromUnits(sourceUnits),
        activeReturnedQuantity: numeric20Scale6TextFromUnits(returnedUnits),
        remainingQuantity: numeric20Scale6TextFromUnits(remainingUnits),
        remainingUnits,
      }
    })
  }, [references, returnUsage, selectedShipment])

  const canCreate = hasActionPermission(adminProfile, 'sales_return.create')
  const canReceive = hasActionPermission(adminProfile, 'sales_return.receive')
  const canCancel = hasActionPermission(adminProfile, 'sales_return.cancel')
  const canReverse = hasActionPermission(adminProfile, 'sales_return.reverse')
  const canRecoverProcess = hasActionPermission(
    adminProfile,
    'process_runtime.recover'
  )

  const loadRows = useCallback(async () => {
    const request = beginLatestRequest('sales-return-list')
    setLoading(true)
    try {
      const data = await listSalesReturns(
        compactParams({
          status,
          ...getBusinessPaginationParams(pagination),
        }),
        { signal: request.signal }
      )
      if (!request.isCurrent()) return
      const nextRows = Array.isArray(data?.sales_returns)
        ? data.sales_returns
        : []
      setRows(nextRows)
      setTotal(Number(data?.total || 0))
      setSelected((current) =>
        current?.id
          ? nextRows.find((item) => item.id === current.id) ||
            (current.id === linkedSalesReturnID ? current : null)
          : null
      )
    } catch (error) {
      if (!request.isCurrent() || isRpcAbortError(error)) return
      message.error(getActionErrorMessage(error, '加载客户退货记录'))
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }, [beginLatestRequest, linkedSalesReturnID, pagination, status])

  const loadReferences = useCallback(async () => {
    const request = beginLatestRequest('sales-return-references')
    setReferenceLoading(true)
    try {
      const results = await Promise.allSettled([
        listAllShipments({ status: 'SHIPPED' }, { signal: request.signal }),
        listAllProducts({}, { signal: request.signal }),
        listAllProductSKUs({}, { signal: request.signal }),
        listAllUnits({}, { signal: request.signal }),
        listAllWarehouses({}, { signal: request.signal }),
        listAllInventoryLots({}, { signal: request.signal }),
      ])
      if (!request.isCurrent()) return
      const [
        shipmentResult,
        productResult,
        skuResult,
        unitResult,
        warehouseResult,
        lotResult,
      ] = results
      if (shipmentResult.status === 'fulfilled') {
        setShipments(
          Array.isArray(shipmentResult.value?.shipments)
            ? shipmentResult.value.shipments
            : []
        )
      } else if (!isRpcAbortError(shipmentResult.reason)) {
        message.error(
          getActionErrorMessage(shipmentResult.reason, '加载可退货出货记录')
        )
      }
      const optionalResults = [
        ['products', 'products', productResult],
        ['productSKUs', 'product_skus', skuResult],
        ['units', 'units', unitResult],
        ['warehouses', 'warehouses', warehouseResult],
        ['lots', 'inventory_lots', lotResult],
      ]
      setReferences((current) =>
        optionalResults.reduce(
          (next, [stateKey, responseKey, result]) => {
            if (result.status === 'fulfilled') {
              next[stateKey] = Array.isArray(result.value?.[responseKey])
                ? result.value[responseKey]
                : []
            }
            return next
          },
          { ...current }
        )
      )
      if (
        optionalResults.some(
          ([, , result]) =>
            result.status === 'rejected' && !isRpcAbortError(result.reason)
        )
      ) {
        message.warning('部分产品、仓库或批次名称暂未加载，退货事实未受影响')
      }
    } finally {
      if (request.isCurrent()) setReferenceLoading(false)
      request.finish()
    }
  }, [beginLatestRequest])

  const refreshPage = useCallback(
    () => Promise.allSettled([loadRows(), loadReferences()]),
    [loadReferences, loadRows]
  )

  useEffect(() => {
    loadRows()
  }, [loadRows])
  useEffect(() => {
    loadReferences()
  }, [loadReferences])
  useEffect(
    () => outletContext?.registerPageRefresh?.(refreshPage),
    [outletContext, refreshPage]
  )
  useEffect(() => {
    if (
      !Number.isSafeInteger(linkedSalesReturnID) ||
      linkedSalesReturnID <= 0
    ) {
      return
    }
    getSalesReturn({ id: linkedSalesReturnID })
      .then((item) => {
        if (item?.id === linkedSalesReturnID) setSelected(item)
      })
      .catch((error) =>
        message.error(getActionErrorMessage(error, '打开关联客户退货'))
      )
  }, [linkedSalesReturnID])

  const openCreate = async () => {
    setCreateOpen(true)
    form.resetFields()
  }

  const openCancel = async () => {
    if (!selected?.id) return
    setSaving(true)
    try {
      const processData = await getSalesReturnAcceptanceProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        sales_return_id: selected.id,
      })
      const next = processData.source_readback
      setSelected(next)
      const processStatus =
        processData.process_context?.process_instance?.status || ''
      if (
        !['DRAFT', 'APPROVED'].includes(next.status) ||
        (processData.process_context && processStatus !== 'blocked')
      ) {
        message.warning(
          ['DRAFT', 'APPROVED'].includes(next.status)
            ? '该退货流程仍在办理，请先在任务中心驳回或阻塞流程'
            : '当前状态不能取消客户退货'
        )
        return
      }
      setCancelReason('')
      setCancelOpen(true)
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对客户退货取消条件'))
    } finally {
      setSaving(false)
    }
  }

  const ensureApprovalProcess = async () => {
    if (!selected?.id || selected.status !== 'DRAFT') return
    setSaving(true)
    try {
      let processData = await getSalesReturnAcceptanceProcess({
        ...(customerKey ? { customer_key: customerKey } : {}),
        sales_return_id: selected.id,
      })
      const alreadyStarted = Boolean(processData?.process_context)
      if (!alreadyStarted) {
        try {
          processData = await startSalesReturnAcceptanceProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            sales_return_id: selected.id,
            idempotency_key: `sales-return-acceptance/${selected.id}`,
          })
        } catch (error) {
          if (!isSourceBusinessActionResultUnknown(error)) throw error
          processData = await getSalesReturnAcceptanceProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            sales_return_id: selected.id,
          })
          if (!processData?.process_context) throw error
        }
      }
      if (!processData?.process_context || !processData?.source_readback?.id) {
        throw Object.assign(new Error('客户退货审批流结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      setSelected(processData.source_readback)
      await loadRows()
      message[alreadyStarted ? 'info' : 'success'](
        alreadyStarted
          ? '客户退货审批流已存在，请到任务中心继续办理'
          : '客户退货审批流已恢复发起'
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '核对客户退货审批流'))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const request = beginLatestRequest('sales-return-entitlement')
    if (!createOpen || !selectedShipment?.id) {
      setReturnUsage({
        shipmentID: 0,
        status: 'idle',
        byShipmentItemID: {},
      })
      request.finish()
      return
    }
    const shipmentID = Number(selectedShipment.id)
    setReturnUsage({
      shipmentID,
      status: 'loading',
      byShipmentItemID: {},
    })
    listAllSalesReturns({ shipment_id: shipmentID }, { signal: request.signal })
      .then((result) => {
        if (!request.isCurrent()) return
        const byShipmentItemID = {}
        for (const salesReturn of result?.sales_returns || []) {
          if (!['DRAFT', 'APPROVED', 'RECEIVED'].includes(salesReturn.status)) {
            continue
          }
          for (const item of salesReturn.items || []) {
            const itemID = Number(item?.shipment_item_id || 0)
            const quantityUnits = numeric20Scale6Units(item?.quantity)
            if (!itemID || quantityUnits === null) {
              throw new Error('历史退货数量无法确认')
            }
            byShipmentItemID[itemID] = addNumeric20Scale6Units(
              byShipmentItemID[itemID] || '0',
              quantityUnits
            )
          }
        }
        setReturnUsage({
          shipmentID,
          status: 'success',
          byShipmentItemID,
        })
      })
      .catch((error) => {
        if (!request.isCurrent() || isRpcAbortError(error)) return
        setReturnUsage({
          shipmentID,
          status: 'error',
          byShipmentItemID: {},
        })
        message.error(getActionErrorMessage(error, '核对来源出货的可退数量'))
      })
      .finally(request.finish)
  }, [beginLatestRequest, createOpen, selectedShipment, usageRetryKey])

  useEffect(() => {
    if (
      !createOpen ||
      !selectedShipment ||
      returnUsage.shipmentID !== Number(selectedShipment.id) ||
      returnUsage.status !== 'success'
    ) {
      return
    }
    form.setFieldsValue({
      return_no: sourceBusinessActionNo(
        'RMA',
        selectedShipment.shipment_no || 'SHIPMENT',
        sourceBusinessActionUUID()
      ),
      reason: '',
      items: selectedShipmentItems.map(() => ({
        quantity: '',
        note: '',
      })),
    })
  }, [
    createOpen,
    form,
    returnUsage.shipmentID,
    returnUsage.status,
    selectedShipment,
    selectedShipmentItems,
  ])

  const submitCreate = async () => {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    if (
      !selectedShipment?.id ||
      returnUsage.shipmentID !== Number(selectedShipment.id) ||
      returnUsage.status !== 'success'
    ) {
      message.error('来源出货的可退数量尚未核对完成，请稍后重试')
      return
    }
    const sourceItems = selectedShipmentItems
    const requestedItems = (values.items || [])
      .map((item, index) => ({ item, sourceItem: sourceItems[index] }))
      .filter(({ item }) => String(item.quantity || '').trim())
    if (requestedItems.length === 0) {
      message.warning('请至少填写一项退货数量')
      return
    }
    if (
      requestedItems.some(
        ({ item, sourceItem }) =>
          !Number.isSafeInteger(Number(sourceItem?.id)) ||
          Number(sourceItem?.id) <= 0 ||
          compareNumeric20Scale6Units(
            numeric20Scale6Units(item.quantity),
            sourceItem.remainingUnits
          ) === 1
      )
    ) {
      message.error('退货数量超过当前可退数量，请核对来源出货明细')
      return
    }
    const items = requestedItems.map(({ item, sourceItem }) => ({
      shipment_item_id: Number(sourceItem.id),
      quantity: String(item.quantity).trim(),
      ...(trimOptional(item.note) ? { note: trimOptional(item.note) } : {}),
    }))
    const payload = compactParams({
      customer_key: customerKey || undefined,
      return_no: trimOptional(values.return_no),
      shipment_id: Number(values.shipment_id),
      reason: trimOptional(values.reason),
      items,
    })
    const scope = `sales-return:${payload.shipment_id}`
    const attempt = attemptsRef.current.prepare(scope, payload)
    setSaving(true)
    try {
      const created = await createSalesReturn(attempt.params)
      if (!created?.id || created.status !== 'DRAFT') {
        throw Object.assign(new Error('客户退货结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      let processData
      try {
        processData = await startSalesReturnAcceptanceProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          sales_return_id: created.id,
          idempotency_key: `sales-return-acceptance/${created.id}`,
        })
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) throw error
        processData = await getSalesReturnAcceptanceProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          sales_return_id: created.id,
        })
        if (!processData?.process_context) throw error
      }
      const next = processData.source_readback
      attemptsRef.current.settle(scope, attempt, null)
      setCreateOpen(false)
      form.resetFields()
      await loadRows()
      setSelected(next)
      message.success('客户退货申请已生成，等待审批')
    } catch (error) {
      const retained = attemptsRef.current.settle(scope, attempt, error)
      message[retained ? 'warning' : 'error'](
        retained
          ? '提交结果暂时无法确认，请保持填写内容不变后重试'
          : getActionErrorMessage(error, '创建客户退货')
      )
    } finally {
      setSaving(false)
    }
  }

  const transition = async (action, reason = '') => {
    if (!selected?.id || !selected?.version) return
    const previous = selected
    setSaving(true)
    try {
      const params = compactParams({
        customer_key: customerKey || undefined,
        id: previous.id,
        expected_version: previous.version,
        reason: trimOptional(reason),
      })
      let next
      if (action === 'receive') {
        const processData = await getSalesReturnAcceptanceProcess({
          ...(customerKey ? { customer_key: customerKey } : {}),
          sales_return_id: previous.id,
        })
        const node = findExceptionProcessActiveNode(
          processData,
          'receive_sales_return'
        )
        const execution = await executeSalesReturnReceive({
          ...(customerKey ? { customer_key: customerKey } : {}),
          process_instance_id: processData.process_context.process_instance.id,
          process_node_instance_id: node.id,
          expected_version: node.version,
          sales_return_id: previous.id,
          idempotency_key: `sales-return-receive/${previous.id}/${node.id}`,
        })
        next = execution.source_readback
      } else {
        next =
          action === 'reverse'
            ? await reverseSalesReturn(params)
            : await cancelSalesReturn(params)
      }
      if (
        !transitionReceiptMatches(
          next,
          previous,
          action,
          reason,
          Number(adminProfile?.id || 0)
        )
      ) {
        throw Object.assign(new Error('客户退货结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      setSelected(next)
      setCancelOpen(false)
      setCancelReason('')
      setReverseOpen(false)
      setReverseReason('')
      await loadRows()
      message.success(
        action === 'receive'
          ? '退货已收货入库'
          : action === 'reverse'
            ? '客户退货入库已冲正'
            : '客户退货已取消'
      )
    } catch (error) {
      if (isSourceBusinessActionResultUnknown(error)) {
        let recovered = null
        if (action === 'receive') {
          recovered = await getSalesReturnAcceptanceProcess({
            ...(customerKey ? { customer_key: customerKey } : {}),
            sales_return_id: previous.id,
          })
            .then((data) => data.source_readback)
            .catch(() => null)
        }
        if (!recovered) {
          recovered = await getSalesReturn({ id: previous.id }).catch(
            () => null
          )
        }
        if (
          transitionReceiptMatches(
            recovered,
            previous,
            action,
            reason,
            Number(adminProfile?.id || 0)
          )
        ) {
          setSelected(recovered)
          await loadRows()
          message.success('已重新读取客户退货结果')
          return
        }
        if (recovered?.id) {
          setSelected(recovered)
          await loadRows()
          message.warning('客户退货状态已被其他操作更新，请核对后重试')
          return
        }
      }
      message.error(getActionErrorMessage(error, '处理客户退货'))
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { title: '退货单号', dataIndex: 'return_no', width: 190 },
    {
      title: '客户',
      dataIndex: 'customer_name',
      width: 180,
      render: (value) => value || '客户已关联',
    },
    {
      title: '来源出货',
      key: 'shipment',
      width: 150,
      render: (_, record) =>
        record.shipment_no ||
        shipments.find(
          (shipment) => Number(shipment.id) === Number(record.shipment_id)
        )?.shipment_no ||
        '已关联出货单',
    },
    { title: '状态', dataIndex: 'status', width: 150, render: statusTag },
    { title: '退货原因', dataIndex: 'reason', width: 300 },
    {
      title: '退货明细',
      dataIndex: 'items',
      width: 120,
      render: (items) => `${Array.isArray(items) ? items.length : 0} 项`,
    },
    {
      title: '批准时间',
      dataIndex: 'approved_at',
      width: 170,
      render: formatUnixDateTime,
    },
    {
      title: '收货时间',
      dataIndex: 'received_at',
      width: 170,
      render: formatUnixDateTime,
    },
    {
      title: '冲正时间',
      dataIndex: 'reversed_at',
      width: 170,
      render: formatUnixDateTime,
    },
  ]
  const detailLineItems = {
    title: '退货明细',
    items: Array.isArray(detail?.items) ? detail.items : [],
    emptyDescription: '当前退货单暂无明细',
    getItemKey: (item) => item?.id,
    getItemLabel: (item, { index }) =>
      [
        item?.product_code,
        item?.product_name,
        item?.product_sku_code,
        item?.product_sku_name,
      ]
        .filter(Boolean)
        .join(' / ') || `退货明细 ${index + 1}`,
    getItemSummary: (item) =>
      `${item?.quantity || '-'} ${item?.unit_code || item?.unit_name || ''}`,
    getItemFields: (item) => [
      {
        key: 'warehouse',
        label: '退回仓库',
        value:
          [item?.warehouse_code, item?.warehouse_name]
            .filter(Boolean)
            .join(' / ') || '仓库已关联',
      },
      {
        key: 'lot',
        label: '退货批次',
        value: item?.lot_no || '退货批次已生成',
      },
      {
        key: 'source',
        label: '来源出货数量',
        value:
          item?.source_shipped_quantity ||
          item?.shipment_quantity ||
          item?.source_quantity ||
          '-',
      },
      {
        key: 'active-returned',
        label: '累计有效退货',
        value: item?.active_returned_quantity ?? '-',
      },
      {
        key: 'remaining',
        label: '当前可退数量',
        value: item?.remaining_returnable_quantity ?? '-',
      },
      {
        key: 'quality',
        label: '退货质检',
        value:
          [
            item?.current_quality_inspection_no,
            item?.current_quality_inspection_status,
            item?.current_quality_inspection_result,
          ]
            .filter(Boolean)
            .join(' / ') || '待质检',
      },
      {
        key: 'note',
        label: '明细备注',
        value: item?.note || '-',
        wide: true,
      },
    ],
  }
  const actionAvailability = {
    receive: resolveSalesReturnActionAvailability({
      action: 'receive',
      authorized: canReceive,
      salesReturn: selected,
      busy: saving,
    }),
    approval: resolveSalesReturnActionAvailability({
      action: 'approval',
      authorized: canCreate,
      salesReturn: selected,
      busy: saving,
    }),
    cancel: resolveSalesReturnActionAvailability({
      action: 'cancel',
      authorized: canCancel,
      salesReturn: selected,
      busy: saving,
    }),
    reverse: resolveSalesReturnActionAvailability({
      action: 'reverse',
      authorized: canReverse,
      salesReturn: selected,
      busy: saving,
    }),
  }

  return (
    <BusinessPageLayout className="erp-sales-returns-page">
      <PageHeaderCard
        compact
        title="客户退货 / RMA"
        description="从真实已出货记录创建客户退货；审批通过不代表已经收货，仓库确认收货后才增加退回库存。收货前可取消，收货后必须独立冲正并保留质检记录。"
        tags={[
          <Tag color="blue" key="source">
            来源出货
          </Tag>,
          <Tag color="gold" key="approval">
            审批后收货
          </Tag>,
          <Tag color="green" key="fact">
            收货写库存事实
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '筛选结果', value: total },
          { key: 'page', label: '本页显示', value: rows.length },
        ]}
      />
      <BusinessOperationPanel
        compact
        filters={
          <SelectFilter
            className="erp-business-filter-control--status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={(value) => {
              setStatus(value || '')
              setPagination((current) => ({ ...current, current: 1 }))
            }}
          />
        }
        primaryAction={
          canCreate ? (
            <ToolbarButton
              type="primary"
              className="erp-business-list-toolbar__primary-action"
              onClick={openCreate}
            >
              新建客户退货
            </ToolbarButton>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selected ? 1 : 0}
          selectedLabel={selected?.return_no || '请选择客户退货记录'}
          boundaryText="审批只确认退货申请；只有收货会写入退回库存。入库前可取消，入库后只能冲正，均不物理删除。"
        >
          <SelectionClearAction
            selectedCount={selected ? 1 : 0}
            selectionLabel="客户退货记录"
            onClear={() => setSelected(null)}
          />
          <BusinessActionTooltip
            disabled={!selected}
            disabledReason="请先选择一条客户退货记录"
          >
            <Button
              data-business-action-key="sales-return-details"
              disabled={!selected}
              onClick={() => setDetail(selected)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          {actionAvailability.receive.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.receive.disabled}
              disabledReason={actionAvailability.receive.disabledReason}
            >
              <Popconfirm
                title="确认已收到客户退货？"
                description="确认后会按退货明细形成库存入库。"
                onConfirm={() => transition('receive')}
              >
                <Button
                  data-business-action-key="sales-return-receive"
                  disabled={actionAvailability.receive.disabled}
                >
                  确认收货
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.approval.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.approval.disabled}
              disabledReason={actionAvailability.approval.disabledReason}
            >
              <Button
                data-business-action-key="sales-return-approval"
                disabled={actionAvailability.approval.disabled}
                onClick={ensureApprovalProcess}
              >
                核对审批流
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.cancel.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.cancel.disabled}
              disabledReason={actionAvailability.cancel.disabledReason}
            >
              <Button
                danger
                data-business-action-key="sales-return-cancel"
                disabled={actionAvailability.cancel.disabled}
                onClick={openCancel}
              >
                核对并取消
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {actionAvailability.reverse.visible ? (
            <BusinessActionTooltip
              disabled={actionAvailability.reverse.disabled}
              disabledReason={actionAvailability.reverse.disabledReason}
            >
              <Button
                danger
                data-business-action-key="sales-return-reverse"
                disabled={actionAvailability.reverse.disabled}
                onClick={() => setReverseOpen(true)}
              >
                冲正退货入库
              </Button>
            </BusinessActionTooltip>
          ) : null}
          <ExceptionProcessRecoveryButton
            canRecover={canRecoverProcess}
            disabled={!selected || saving}
            disabledReason="请先选择一条客户退货记录"
            loadProcess={() =>
              getSalesReturnAcceptanceProcess({
                ...(customerKey ? { customer_key: customerKey } : {}),
                sales_return_id: selected.id,
              })
            }
            onRecovered={loadRows}
          />
        </SelectionActionBar>
      </BusinessOperationPanel>
      <BusinessDataTable
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        scroll={{ x: 1400 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelected(selectedRows[0] || null),
        }}
        onRow={(record) => ({ onClick: () => setSelected(record) })}
        onOpenRecord={(record) => setDetail(record)}
        emptyDescription="暂无客户退货记录"
      />
      <BusinessFormModal
        className="erp-business-action-modal--operational-fact"
        title="新建客户退货"
        description="只允许选择已出货记录；系统会核对累计有效退货与当前可退数量。"
        open={createOpen}
        width={900}
        okText="提交退货申请"
        cancelText="取消"
        confirmLoading={saving}
        okButtonProps={{
          disabled:
            Boolean(selectedShipment) && returnUsage.status !== 'success',
        }}
        destroyOnHidden
        onCancel={() => !saving && setCreateOpen(false)}
        onOk={submitCreate}
      >
        <Form
          form={form}
          className="erp-business-action-form"
          layout="vertical"
          preserve={false}
          disabled={saving}
        >
          <Form.Item
            name="shipment_id"
            label="来源出货"
            rules={[{ required: true, message: '请选择已出货记录' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={referenceLoading}
              options={shipments.map(shipmentOption)}
            />
          </Form.Item>
          {selectedShipment ? (
            <Alert
              showIcon
              type={
                returnUsage.status === 'error'
                  ? 'error'
                  : returnUsage.status === 'success'
                    ? 'success'
                    : 'info'
              }
              message={
                returnUsage.status === 'error'
                  ? '可退数量核对失败，提交已停用'
                  : returnUsage.status === 'success'
                    ? '已核对来源出货与累计有效退货数量'
                    : '正在核对来源出货的当前可退数量'
              }
              action={
                returnUsage.status === 'error' ? (
                  <Button
                    size="small"
                    onClick={() => setUsageRetryKey((value) => value + 1)}
                  >
                    重试
                  </Button>
                ) : null
              }
            />
          ) : null}
          <Form.Item
            name="return_no"
            label="退货单号"
            rules={[
              { required: true, whitespace: true, message: '请填写退货单号' },
            ]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="退货原因"
            rules={[
              { required: true, whitespace: true, message: '请填写退货原因' },
            ]}
          >
            <Input.TextArea rows={2} maxLength={255} showCount />
          </Form.Item>
          <Form.List name="items">
            {(fields) => (
              <Space direction="vertical" style={{ width: '100%' }}>
                {fields.map((field) => {
                  const sourceItem = selectedShipmentItems[field.name]
                  const productLabel = [
                    sourceItem?.productLabel,
                    sourceItem?.skuLabel,
                  ]
                    .filter(Boolean)
                    .join(' / ')
                  return (
                    <Space key={field.key} align="start" size={12} wrap>
                      <Form.Item label="产品 / SKU">
                        <Input
                          aria-label="产品 / SKU"
                          disabled
                          value={productLabel}
                          style={{ width: 300 }}
                        />
                      </Form.Item>
                      <Form.Item label="来源仓库">
                        <Input
                          aria-label="来源仓库"
                          disabled
                          value={sourceItem?.warehouseLabel || ''}
                          style={{ width: 180 }}
                        />
                      </Form.Item>
                      <Form.Item label="来源批次">
                        <Input
                          aria-label="来源批次"
                          disabled
                          value={sourceItem?.lotLabel || ''}
                          style={{ width: 180 }}
                        />
                      </Form.Item>
                      <Form.Item label="已出货">
                        <Input
                          aria-label="已出货"
                          disabled
                          value={sourceItem?.sourceQuantity || ''}
                          style={{ width: 110 }}
                        />
                      </Form.Item>
                      <Form.Item label="已退货">
                        <Input
                          aria-label="已退货"
                          disabled
                          value={sourceItem?.activeReturnedQuantity || ''}
                          style={{ width: 110 }}
                        />
                      </Form.Item>
                      <Form.Item label="当前可退">
                        <Input
                          aria-label="当前可退"
                          disabled
                          value={sourceItem?.remainingQuantity || ''}
                          style={{ width: 110 }}
                        />
                      </Form.Item>
                      <Form.Item label="单位">
                        <Input
                          aria-label="单位"
                          disabled
                          value={sourceItem?.unitLabel || ''}
                          style={{ width: 120 }}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'quantity']}
                        label="退货数量"
                        rules={[
                          {
                            validator: (_, value) =>
                              !String(value || '').trim() ||
                              (isPositiveNumeric20Scale6Units(
                                numeric20Scale6Units(value)
                              ) &&
                                compareNumeric20Scale6Units(
                                  numeric20Scale6Units(value),
                                  sourceItem?.remainingUnits
                                ) !== 1)
                                ? Promise.resolve()
                                : Promise.reject(
                                    new Error(
                                      '数量须大于 0 且不超过当前可退数量'
                                    )
                                  ),
                          },
                        ]}
                      >
                        <Input inputMode="decimal" style={{ width: 140 }} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'note']} label="明细备注">
                        <Input maxLength={255} style={{ width: 220 }} />
                      </Form.Item>
                    </Space>
                  )
                })}
              </Space>
            )}
          </Form.List>
        </Form>
      </BusinessFormModal>
      <BusinessFormModal
        title="冲正客户退货入库"
        description="冲正会补偿库存事实并保留原退货与质检审计记录。"
        open={reverseOpen}
        okText="确认冲正"
        cancelText="返回"
        okButtonProps={{ danger: true }}
        confirmLoading={saving}
        onCancel={() => !saving && setReverseOpen(false)}
        onOk={() => {
          if (!reverseReason.trim()) {
            message.warning('请填写冲正原因')
            return
          }
          transition('reverse', reverseReason)
        }}
      >
        <Input.TextArea
          value={reverseReason}
          rows={3}
          maxLength={255}
          showCount
          placeholder="请填写冲正原因"
          onChange={(event) => setReverseReason(event.target.value)}
        />
      </BusinessFormModal>
      <BusinessFormModal
        title="取消客户退货"
        description="取消不会删除退货单；已进入流程的记录仍保留审计。"
        open={cancelOpen}
        okText="确认取消"
        cancelText="返回"
        okButtonProps={{ danger: true }}
        confirmLoading={saving}
        onCancel={() => !saving && setCancelOpen(false)}
        onOk={() => {
          if (!cancelReason.trim()) {
            message.warning('请填写取消原因')
            return
          }
          transition('cancel', cancelReason)
        }}
      >
        <Input.TextArea
          value={cancelReason}
          rows={3}
          maxLength={255}
          showCount
          placeholder="请填写取消原因"
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </BusinessFormModal>
      <BusinessRecordDetailsModal
        open={Boolean(detail)}
        title="客户退货详情"
        description="明细来源于已出货记录；页面不显示内部关联编号。"
        record={detail}
        columns={columns}
        lineItems={detailLineItems}
        onClose={() => setDetail(null)}
      />
    </BusinessPageLayout>
  )
}
