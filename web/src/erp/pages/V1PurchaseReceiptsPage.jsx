import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  EyeOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Form, Input, Popconfirm, Select, Tag } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  addPurchaseReceiptItem,
  cancelPurchaseReceipt,
  createPurchaseReceiptAdjustmentFromReceipt,
  createPurchaseReturnFromReceipt,
  listPurchaseReceipts,
  postPurchaseReceipt,
} from '../api/purchaseApi.mjs'
import { createPayableFromPurchaseReceipt } from '../api/operationalFactApi.mjs'
import { listInventoryLots } from '../api/inventoryApi.mjs'
import {
  listMaterials,
  listSuppliers,
  listUnits,
  listWarehouses,
} from '../api/masterDataOrderApi.mjs'
import {
  BusinessOperationPanel,
  BusinessDataTable,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  downloadBusinessListCSV,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessAttachmentModalButton from '../components/business-list/BusinessAttachmentModalButton.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import BusinessLineItemsFooter from '../components/business-list/BusinessLineItemsFooter.jsx'
import { useBusinessRowItemsPreview } from '../components/business-list/BusinessRowItemsPreview.jsx'
import PurchaseReceiptExceptionModal from '../components/purchase-receipts/PurchaseReceiptExceptionModal.jsx'
import PurchaseReceiptExceptionRecordsModal from '../components/purchase-receipts/PurchaseReceiptExceptionRecordsModal.jsx'
import FinanceBusinessSourceModal from '../components/finance/FinanceBusinessSourceModal.jsx'
import {
  compactParams,
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
  trimOptional,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  buildPurchaseReceiptItemParams,
  createBlankPurchaseReceiptItem,
  decimalNumber,
  formatQuantity,
} from '../utils/businessLineItems.mjs'
import {
  createPurchaseReceiptMutationAttemptStore,
  isPurchaseReceiptMutationResultUnknown,
} from '../utils/purchaseReceiptMutation.mjs'
import {
  buildPurchaseReceiptAdjustmentPayload,
  buildPurchaseReturnFromReceiptPayload,
} from '../utils/purchaseReceiptExceptionAction.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
} from '../utils/sourceBusinessAction.mjs'
import {
  FINANCE_BUSINESS_SOURCE_ACTIONS,
  buildPurchaseReceiptPayablePayload,
  financeBusinessSourceFormValuesFromRequest,
} from '../utils/financeBusinessSourceAction.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import { applyBusinessColumnSorters } from '../utils/moduleTableColumns.mjs'
import {
  inventoryLotOption,
  materialOption,
  referenceLabel,
  uniqueReferenceOptions,
  unitOption,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
import {
  routeWithQuery,
  searchParamPositiveIntText,
  searchParamText,
} from '../utils/routeQuery.mjs'

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已过账', value: 'POSTED' },
  { label: '已取消', value: 'CANCELLED' },
]

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  POSTED: '已过账',
  CANCELLED: '已取消',
})

const STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  POSTED: 'blue',
  CANCELLED: 'red',
})
const DATE_FILTER_OPTIONS = [{ label: '入库日期', value: 'received_at' }]
const REFERENCE_LOAD_RETRY_DELAYS_MS = [500, 1000]

function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={STATUS_COLORS[key] || 'default'}>
      {STATUS_LABELS[key] || (key ? '入库状态' : '-')}
    </Tag>
  )
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function optionalText(value) {
  const text = String(value ?? '').trim()
  return text || '-'
}

function receiptItemCount(receipt = {}) {
  return Array.isArray(receipt.items) ? receipt.items.length : 0
}

function receiptQuantityTotal(receipt = {}) {
  return (receipt.items || []).reduce(
    (total, item) => total + decimalNumber(item?.quantity),
    0
  )
}

function formListName(field, name) {
  return field ? [field.name, name] : name
}

function PurchaseReceiptItemFormFields({
  field,
  inventoryLotOptions = [],
  materialOptions = [],
  unitOptions = [],
  warehouseOptions = [],
}) {
  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="材料"
        name={formListName(field, 'material_id')}
        rules={[{ required: true, message: '请选择材料' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={materialOptions}
          placeholder="请选择材料"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="仓库"
        name={formListName(field, 'warehouse_id')}
        rules={[{ required: true, message: '请选择仓库' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={warehouseOptions}
          placeholder="请选择仓库"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="单位"
        name={formListName(field, 'unit_id')}
        rules={[{ required: true, message: '请选择单位' }]}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={unitOptions}
          placeholder="请选择单位"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="入库数量"
        name={formListName(field, 'quantity')}
        rules={[{ required: true, message: '请填写入库数量' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="批次"
        name={formListName(field, 'lot_id')}
      >
        <Select
          allowClear
          optionFilterProp="label"
          options={inventoryLotOptions}
          placeholder="请选择批次"
          showSearch
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="批次号"
        name={formListName(field, 'lot_no')}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="来源行号"
        name={formListName(field, 'source_line_no')}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="单价"
        name={formListName(field, 'unit_price')}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="金额"
        name={formListName(field, 'amount')}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--wide"
        label="备注"
        name={formListName(field, 'note')}
      >
        <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
      </Form.Item>
    </>
  )
}

function PurchaseReceiptInlineItemEditor({
  inventoryLotOptions = [],
  materialOptions = [],
  receipt,
  saving,
  unitOptions = [],
  warehouseOptions = [],
  onCancel,
  onSave,
}) {
  const [form] = Form.useForm()
  const editorRef = useRef(null)

  useEffect(() => {
    form.resetFields()
    form.setFieldsValue(createBlankPurchaseReceiptItem(receipt?.id))
    const timer = window.setTimeout(() => {
      const firstControl = editorRef.current?.querySelector(
        [
          '.ant-select-selection-search-input:not([disabled])',
          'input:not([type="hidden"]):not([disabled])',
          'textarea:not([disabled])',
          'button:not([disabled])',
        ].join(', ')
      )
      firstControl?.focus?.({ preventScroll: true })
    }, 60)
    return () => window.clearTimeout(timer)
  }, [form, receipt?.id])

  const save = async () => {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    await onSave(values)
  }

  return (
    <section
      ref={editorRef}
      className="erp-purchase-receipt-inline-item-editor"
    >
      <div className="erp-purchase-receipt-inline-item-editor__head">
        <div>
          <strong>添加入库明细</strong>
          <span>保存后写入当前入库草稿；库存将在入库过账后由系统更新。</span>
        </div>
        <Tag color="blue">{receipt?.receipt_no || '已选入库草稿'}</Tag>
      </div>
      <Form
        form={form}
        layout="vertical"
        className="erp-business-action-form erp-purchase-receipt-inline-item-form"
      >
        <PurchaseReceiptItemFormFields
          inventoryLotOptions={inventoryLotOptions}
          materialOptions={materialOptions}
          unitOptions={unitOptions}
          warehouseOptions={warehouseOptions}
        />
      </Form>
      <div className="erp-purchase-receipt-inline-item-editor__footer">
        <Button
          className="erp-purchase-receipt-inline-item-editor__button"
          onClick={onCancel}
        >
          取消
        </Button>
        <Button
          className="erp-purchase-receipt-inline-item-editor__button"
          type="primary"
          loading={saving}
          onClick={save}
        >
          添加明细
        </Button>
      </div>
    </section>
  )
}

export default function V1PurchaseReceiptsPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = outletContext?.adminProfile || {}
  const activeCustomerKey = adminProfile?.effective_session?.customer?.key || ''
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilterField, setDateFilterField] = useState('received_at')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [lotFilter, setLotFilter] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [detailReceipt, setDetailReceipt] = useState(null)
  const [itemEditorReceipt, setItemEditorReceipt] = useState(null)
  const [receiptExceptionMode, setReceiptExceptionMode] = useState(null)
  const [receiptExceptionRecordsOpen, setReceiptExceptionRecordsOpen] =
    useState(false)
  const [financeSourceReceipt, setFinanceSourceReceipt] = useState(null)
  const [financeSourceLoading, setFinanceSourceLoading] = useState(false)
  const [materials, setMaterials] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [units, setUnits] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
  const mutationAttemptsRef = useRef(
    createPurchaseReceiptMutationAttemptStore()
  )
  const exceptionAttemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const financeSourceAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const financeSourceInFlightRef = useRef(false)
  const routePurchaseOrderID = searchParamPositiveIntText(
    searchParams,
    'purchase_order_id'
  )
  const routeReceiptID =
    searchParamPositiveIntText(searchParams, 'receipt_id') ||
    (searchParamText(searchParams, 'source_type').toUpperCase() ===
    'PURCHASE_RECEIPT'
      ? searchParamPositiveIntText(searchParams, 'source_id')
      : '')

  const beginLatestRequest = useLatestRequestCoordinator()

  const canRead = hasActionPermission(adminProfile, 'purchase.receipt.read')
  const canCreate = hasActionPermission(adminProfile, 'purchase.receipt.create')
  const canPost =
    canCreate || hasActionPermission(adminProfile, 'warehouse.inbound.confirm')
  const canCreateReturn = hasActionPermission(
    adminProfile,
    'purchase.return.create'
  )
  const canPostReturn = hasActionPermission(
    adminProfile,
    'purchase.return.post'
  )
  const canCancelReturn = hasActionPermission(
    adminProfile,
    'purchase.return.cancel'
  )
  const canReadReturn = hasActionPermission(
    adminProfile,
    'purchase.return.read'
  )
  const canReadAdjustment = hasActionPermission(
    adminProfile,
    'purchase.receipt.adjustment.read'
  )
  const canCreateAdjustment = hasActionPermission(
    adminProfile,
    'purchase.receipt.adjustment.create'
  )
  const canPostAdjustment = hasActionPermission(
    adminProfile,
    'purchase.receipt.adjustment.post'
  )
  const canCancelAdjustment = hasActionPermission(
    adminProfile,
    'purchase.receipt.adjustment.cancel'
  )
  const canCreatePayable = hasActionPermission(
    adminProfile,
    'finance.payable.confirm'
  )
  const canViewPayable =
    canCreatePayable ||
    hasActionPermission(adminProfile, 'finance.payable.read')
  const relatedMenuItems = [
    { key: 'purchase-orders', label: '采购订单' },
    { key: 'quality-inspections', label: '来料质检' },
    { key: 'inventory', label: '库存台账' },
  ]
  const materialOptions = useMemo(
    () => uniqueReferenceOptions(materials, materialOption),
    [materials]
  )
  const supplierOptions = useMemo(() => {
    const seen = new Set()
    return suppliers
      .map((supplier) => {
        const value = String(supplier?.name || '').trim()
        if (!value || seen.has(value)) return null
        seen.add(value)
        return {
          label: [supplier.code, value].filter(Boolean).join(' / '),
          value,
        }
      })
      .filter(Boolean)
  }, [suppliers])
  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const inventoryLotOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, inventoryLotOption),
    [inventoryLots]
  )
  const warehouseOptions = useMemo(
    () => uniqueReferenceOptions(warehouses, warehouseOptionFromRecord),
    [warehouses]
  )
  const getPurchaseReceiptItemSummary = useCallback(
    (item) =>
      `数量 ${formatQuantity(decimalNumber(item?.quantity))} / 金额 ${optionalText(item?.amount)}`,
    []
  )
  const getPurchaseReceiptItemFields = useCallback(
    (item) => [
      {
        key: 'material',
        label: '材料',
        value: referenceLabel(materialOptions, item?.material_id, '材料'),
        wide: true,
      },
      {
        key: 'warehouse',
        label: '仓库',
        value: referenceLabel(warehouseOptions, item?.warehouse_id, '仓库'),
      },
      {
        key: 'unit',
        label: '单位',
        value: referenceLabel(unitOptions, item?.unit_id, '单位'),
      },
      {
        key: 'lot',
        label: '批次',
        value: referenceLabel(inventoryLotOptions, item?.lot_id, '批次'),
        wide: true,
      },
      { key: 'lot_no', label: '批次号', value: optionalText(item?.lot_no) },
      {
        key: 'quantity',
        label: '数量',
        value: formatQuantity(decimalNumber(item?.quantity)),
      },
      {
        key: 'unit_price',
        label: '单价',
        value: optionalText(item?.unit_price),
      },
      { key: 'amount', label: '金额', value: optionalText(item?.amount) },
      {
        key: 'purchase_order_item',
        label: '采购订单行',
        value: item?.purchase_order_item_id
          ? item?.source_line_no
            ? `来源第 ${item.source_line_no} 行`
            : '已关联采购订单行'
          : '-',
      },
      {
        key: 'source_line_no',
        label: '来源行号',
        value: optionalText(item?.source_line_no),
      },
      {
        key: 'note',
        label: '备注',
        value: optionalText(item?.note),
        wide: true,
      },
    ],
    [inventoryLotOptions, materialOptions, unitOptions, warehouseOptions]
  )
  const receiptItemsPreview = useBusinessRowItemsPreview({
    records: rows,
    getEmbeddedItems: (record) => record?.items,
    getItemTotal: (record) =>
      Array.isArray(record?.items) ? record.items.length : undefined,
    rowExpandable: (record) =>
      canRead && Number.isSafeInteger(record?.id) && record.id > 0,
    getRecordLabel: (record) => record?.receipt_no || '当前采购入库单',
    getItemKey: (item) => item?.id,
    getItemLabel: (_item, { index }) => `明细 ${index + 1}`,
    getItemSummary: getPurchaseReceiptItemSummary,
    getItemFields: getPurchaseReceiptItemFields,
    modalTitle: '采购入库单完整明细',
  })

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    const pathByKey = {
      'purchase-orders': V1_ROUTE_PATHS.purchaseOrders,
      'quality-inspections': routeWithQuery(V1_ROUTE_PATHS.qualityInspections, {
        purchase_receipt_id: selectedRow.id,
      }),
      inventory: routeWithQuery(V1_ROUTE_PATHS.inventory, {
        source_type: 'PURCHASE_RECEIPT',
        source_id: selectedRow.id,
        view: 'txns',
      }),
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }

  const loadRows = useCallback(async () => {
    const request = beginLatestRequest('rows')
    setLoading(true)
    try {
      const data = await listPurchaseReceipts(
        compactParams({
          status: statusFilter,
          keyword: trimOptional(keyword) || routeReceiptID || undefined,
          supplier_name: supplierFilter || undefined,
          date_field: dateFilterField,
          date_from: dateFilterStart || undefined,
          date_to: dateFilterEnd || undefined,
          material_id: materialFilter || undefined,
          warehouse_id: warehouseFilter || undefined,
          lot_id: lotFilter || undefined,
          purchase_order_id: routePurchaseOrderID || undefined,
          ...getBusinessPaginationParams(pagination),
        }),
        { signal: request.signal }
      )
      if (!request.isCurrent()) {
        return
      }
      const nextRows = Array.isArray(data?.purchase_receipts)
        ? data.purchase_receipts
        : []
      setRows(nextRows)
      setSelectedRow((current) => {
        const routeSelectedID = Number(routeReceiptID || 0)
        if (routeSelectedID > 0) {
          return nextRows.find((item) => item.id === routeSelectedID) || null
        }
        return current?.id
          ? nextRows.find((item) => item.id === current.id) || null
          : null
      })
      setTotal(Number(data?.total || 0))
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return
      }
      message.error(getActionErrorMessage(error, '加载采购入库单'))
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    keyword,
    lotFilter,
    materialFilter,
    pagination,
    routePurchaseOrderID,
    routeReceiptID,
    statusFilter,
    supplierFilter,
    warehouseFilter,
  ])

  const clearRouteContext = useCallback(
    (keys) => {
      const nextParams = new URLSearchParams(searchParams)
      const keysToDelete =
        Array.isArray(keys) && keys.length > 0
          ? keys
          : ['purchase_order_id', 'receipt_id', 'source_type', 'source_id']
      keysToDelete.forEach((key) => nextParams.delete(key))
      setSearchParams(nextParams, { replace: true })
      resetBusinessPaginationCurrent(setPagination)
    },
    [searchParams, setSearchParams]
  )

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const loadReferenceOptions = useCallback(async () => {
    let lastError
    try {
      let materialResult
      let supplierResult
      let unitResult
      let warehouseResult
      let lotResult
      for (
        let attempt = 0;
        attempt <= REFERENCE_LOAD_RETRY_DELAYS_MS.length;
        attempt += 1
      ) {
        try {
          materialResult = await listMaterials({
            limit: 500,
            active_only: true,
          })
          supplierResult = await listSuppliers({ limit: 500 })
          unitResult = await listUnits({ limit: 500 })
          warehouseResult = await listWarehouses({
            limit: 500,
            active_only: true,
          })
          lotResult = await listInventoryLots({ limit: 500 })
          lastError = null
          break
        } catch (error) {
          lastError = error
          const retryDelay = REFERENCE_LOAD_RETRY_DELAYS_MS[attempt]
          if (!retryDelay) {
            break
          }
          await wait(retryDelay)
        }
      }
      if (lastError) {
        throw lastError
      }
      setMaterials(
        Array.isArray(materialResult?.materials) ? materialResult.materials : []
      )
      setSuppliers(
        Array.isArray(supplierResult?.suppliers) ? supplierResult.suppliers : []
      )
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
      setWarehouses(
        Array.isArray(warehouseResult?.warehouses)
          ? warehouseResult.warehouses
          : []
      )
      setInventoryLots(
        Array.isArray(lotResult?.inventory_lots) ? lotResult.inventory_lots : []
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载入库相关资料'))
      setMaterials([])
      setSuppliers([])
      setUnits([])
      setWarehouses([])
      setInventoryLots([])
    }
  }, [])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRows)
  }, [loadRows, outletContext])

  const openAddItem = useCallback((receipt) => {
    if (!receipt?.id) return
    setItemEditorReceipt(receipt)
  }, [])

  const closeItemEditor = useCallback(() => {
    setItemEditorReceipt(null)
  }, [])

  const handleAddItem = useCallback(
    async (values) => {
      const receipt = itemEditorReceipt
      if (!receipt?.id) return
      const scope = `add-item:${receipt.id}`
      let attempt
      setSaving(true)
      try {
        attempt = mutationAttemptsRef.current.prepare(
          scope,
          buildPurchaseReceiptItemParams(receipt.id, values)
        )
        await addPurchaseReceiptItem(attempt.params)
        mutationAttemptsRef.current.settle(scope, attempt)
        message.success('入库明细已添加')
        closeItemEditor()
        await loadRows()
      } catch (error) {
        const retained = attempt
          ? mutationAttemptsRef.current.settle(scope, attempt, error)
          : isPurchaseReceiptMutationResultUnknown(error)
        if (retained) {
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
        } else {
          message.error(getActionErrorMessage(error, '添加入库明细'))
        }
      } finally {
        setSaving(false)
      }
    },
    [closeItemEditor, itemEditorReceipt, loadRows]
  )

  const runReceiptAction = useCallback(
    async (receipt, action, successText) => {
      if (!receipt?.id) return
      setSaving(true)
      try {
        const nextReceipt = await action({ id: receipt.id })
        setSelectedRow(nextReceipt || receipt)
        message.success(successText)
        await loadRows()
      } catch (error) {
        message.error(getActionErrorMessage(error, successText))
      } finally {
        setSaving(false)
      }
    },
    [loadRows]
  )

  const submitReceiptException = useCallback(
    async (values) => {
      const receipt = selectedRow
      const mode = receiptExceptionMode
      if (!receipt?.id || !['return', 'adjustment'].includes(mode)) return
      const scope = `${mode}:${receipt.id}`
      let attempt
      setSaving(true)
      try {
        const sourcePayload =
          mode === 'return'
            ? buildPurchaseReturnFromReceiptPayload(values, receipt)
            : buildPurchaseReceiptAdjustmentPayload(values, receipt)
        const payload = {
          ...sourcePayload,
          customer_key: activeCustomerKey || undefined,
        }
        attempt = exceptionAttemptsRef.current.prepare(scope, payload)
        const businessNo = sourceBusinessActionNo(
          mode === 'return' ? 'PRT' : 'PRA',
          receipt.receipt_no,
          attempt.params.idempotency_key
        )
        let createdRecord
        if (mode === 'return') {
          createdRecord = await createPurchaseReturnFromReceipt({
            ...attempt.params,
            return_no: businessNo,
          })
        } else {
          createdRecord = await createPurchaseReceiptAdjustmentFromReceipt({
            ...attempt.params,
            adjustment_no: businessNo,
          })
        }
        if (
          Number(createdRecord?.id || 0) <= 0 ||
          Number(createdRecord?.purchase_receipt_id || 0) !==
            Number(receipt.id) ||
          String(createdRecord?.status || '').toUpperCase() !== 'DRAFT'
        ) {
          const error = new Error('采购异常记录返回结果无法确认')
          error.isInvalidResponse = true
          throw error
        }
        exceptionAttemptsRef.current.settle(scope, attempt)
        message.success(
          mode === 'return' ? '采购退货草稿已生成' : '入库调整草稿已生成'
        )
        setReceiptExceptionMode(null)
        if (
          (mode === 'return' && canReadReturn) ||
          (mode === 'adjustment' && canReadAdjustment)
        ) {
          setReceiptExceptionRecordsOpen(true)
        }
        await loadRows()
      } catch (error) {
        const retained = attempt
          ? exceptionAttemptsRef.current.settle(scope, attempt, error)
          : isSourceBusinessActionResultUnknown(error)
        if (retained) {
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
        } else {
          message.error(
            getActionErrorMessage(
              error,
              mode === 'return' ? '生成采购退货' : '生成入库调整'
            )
          )
        }
      } finally {
        setSaving(false)
      }
    },
    [
      activeCustomerKey,
      canReadAdjustment,
      canReadReturn,
      loadRows,
      receiptExceptionMode,
      selectedRow,
    ]
  )

  const purchasePayableScope = financeSourceReceipt?.id
    ? `purchase-receipt-payable:${financeSourceReceipt.id}`
    : ''
  const financeSourceInitialValues = useMemo(() => {
    if (!purchasePayableScope) return undefined
    const retained = financeSourceAttemptsRef.current.peek(purchasePayableScope)
    return retained
      ? financeBusinessSourceFormValuesFromRequest(retained.params)
      : undefined
  }, [purchasePayableScope])

  const openPurchaseReceiptPayable = useCallback(
    (receipt) => {
      if (
        !canCreatePayable ||
        !receipt?.id ||
        String(receipt.status || '').toUpperCase() !== 'POSTED'
      ) {
        message.warning('请先选择已过账的采购入库单')
        return
      }
      setFinanceSourceReceipt(receipt)
    },
    [canCreatePayable]
  )

  const closePurchaseReceiptPayable = useCallback(() => {
    if (financeSourceInFlightRef.current) return
    setFinanceSourceReceipt(null)
  }, [])

  const submitPurchaseReceiptPayable = useCallback(
    async (values) => {
      const receipt = financeSourceReceipt
      if (
        financeSourceInFlightRef.current ||
        !canCreatePayable ||
        !receipt?.id
      ) {
        return
      }
      const scope = `purchase-receipt-payable:${receipt.id}`
      let attempt
      try {
        const payload = {
          ...buildPurchaseReceiptPayablePayload(values, receipt),
          customer_key: activeCustomerKey || undefined,
        }
        attempt = financeSourceAttemptsRef.current.prepare(scope, payload)
      } catch (error) {
        message.error(getActionErrorMessage(error, '准备应付草稿'))
        return
      }

      financeSourceInFlightRef.current = true
      setFinanceSourceLoading(true)
      try {
        await createPayableFromPurchaseReceipt(attempt.params)
        financeSourceAttemptsRef.current.settle(scope, attempt, null)
        setFinanceSourceReceipt(null)
        message.success('应付草稿已生成，请到应付管理核对并确认')
        await loadRows()
      } catch (error) {
        const retained = financeSourceAttemptsRef.current.settle(
          scope,
          attempt,
          error
        )
        if (retained) {
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
        } else {
          message.error(getActionErrorMessage(error, '生成应付'))
        }
      } finally {
        financeSourceInFlightRef.current = false
        setFinanceSourceLoading(false)
      }
    },
    [activeCustomerKey, canCreatePayable, financeSourceReceipt, loadRows]
  )

  const viewPurchaseReceiptPayable = useCallback(
    (receipt) => {
      if (!receipt?.id) return
      navigate(
        routeWithQuery(V1_ROUTE_PATHS.payables, {
          source_type: 'PURCHASE_RECEIPT',
          source_id: receipt.id,
        })
      )
    },
    [navigate]
  )

  const selectedRowLabel = selectedRow
    ? `${selectedRow.receipt_no || '采购入库单已关联'} / ${
        selectedRow.supplier_name || '未填写供应商'
      }`
    : '请先选择一张采购入库单'

  const openPurchaseReceiptDetails = useCallback((receipt) => {
    if (!receipt?.id) return
    setSelectedRow(receipt)
    setDetailReceipt(receipt)
  }, [])

  const columns = useMemo(
    () =>
      applyBusinessColumnSorters([
        {
          title: '入库单号',
          exportTitle: '入库单号',
          dataIndex: 'receipt_no',
          width: 160,
          sortType: 'text',
        },
        {
          title: '状态',
          exportTitle: '状态',
          dataIndex: 'status',
          width: 110,
          sortType: 'text',
          render: statusTag,
          exportValue: (record) =>
            STATUS_LABELS[record?.status] || (record?.status ? '入库状态' : ''),
        },
        {
          title: '供应商',
          exportTitle: '供应商',
          dataIndex: 'supplier_name',
          width: 180,
          sortType: 'text',
        },
        {
          title: '收货日期',
          exportTitle: '收货日期',
          dataIndex: 'received_at',
          width: 130,
          sortType: 'date',
          render: formatUnixDate,
          exportValue: (record) => formatUnixDate(record?.received_at),
        },
        {
          title: '过账时间',
          exportTitle: '过账时间',
          dataIndex: 'posted_at',
          width: 170,
          sortType: 'date',
          render: formatUnixDateTime,
          exportValue: (record) => formatUnixDateTime(record?.posted_at),
        },
        {
          title: '明细行数',
          exportTitle: '明细行数',
          key: 'item_count',
          hidden: true,
          width: 100,
          sortValue: receiptItemCount,
          render: (_, record) => receiptItemCount(record),
          exportValue: receiptItemCount,
        },
        {
          title: '入库数量',
          exportTitle: '入库数量',
          key: 'quantity_total',
          width: 120,
          sortValue: receiptQuantityTotal,
          render: (_, record) => formatQuantity(receiptQuantityTotal(record)),
          exportValue: (record) => formatQuantity(receiptQuantityTotal(record)),
        },
        {
          title: '备注',
          exportTitle: '备注',
          dataIndex: 'note',
          width: 300,
          sortable: false,
        },
      ]),
    []
  )
  const {
    tableColumns,
    exportColumns,
    visibleColumns,
    openColumnOrder,
    columnOrderModal,
  } = useBusinessColumnOrder({
      adminProfile,
      moduleKey: 'inbound',
      moduleTitle: '入库管理',
      columns,
    })
  const exportRows = useCallback(() => {
    downloadBusinessListCSV({
      filename: `采购入库-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: exportColumns,
      rows,
    })
  }, [exportColumns, rows])
  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      supplierFilter ||
      materialFilter ||
      warehouseFilter ||
      lotFilter ||
      dateFilterStart ||
      dateFilterEnd ||
      routePurchaseOrderID ||
      routeReceiptID
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setSupplierFilter('')
    setMaterialFilter('')
    setWarehouseFilter('')
    setLotFilter('')
    setDateFilterField('received_at')
    setDateFilterStart('')
    setDateFilterEnd('')
    clearRouteContext()
  }, [clearRouteContext])

  return (
    <BusinessPageLayout className="erp-v1-purchase-receipts-page">
      <PageHeaderCard
        compact
        title="入库管理"
        description="入库管理维护采购入库草稿和明细；确认过账后系统会更新库存数量、余额和批次，完成入库跟进任务不等于采购入库已经过账。"
        tags={[
          <Tag color="gold" key="workflow">
            待办任务：入库跟进
          </Tag>,
          <Tag color="blue" key="receipt">
            入库单：正式入库记录
          </Tag>,
          <Tag color="green" key="inventory">
            过账后更新库存记录
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总入库单', value: total },
          { key: 'current', label: '本页显示', value: rows.length },
          {
            key: 'draft',
            label: '草稿',
            value: rows.filter((item) => item.status === 'DRAFT').length,
          },
          {
            key: 'posted',
            label: '已过账',
            value: rows.filter((item) => item.status === 'POSTED').length,
          },
        ]}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索入库单"
              searchHint="可搜索：入库单号、供应商"
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadRows}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={supplierFilter}
              options={[{ label: '全部供应商', value: '' }, ...supplierOptions]}
              placeholder="全部供应商"
              showSearch
              optionFilterProp="label"
              onChange={(nextSupplier) => {
                setSupplierFilter(nextSupplier || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={materialFilter}
              options={[{ label: '全部材料', value: '' }, ...materialOptions]}
              placeholder="全部材料"
              showSearch
              optionFilterProp="label"
              onChange={(nextMaterial) => {
                setMaterialFilter(nextMaterial || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={warehouseFilter}
              options={[{ label: '全部仓库', value: '' }, ...warehouseOptions]}
              placeholder="全部仓库"
              showSearch
              optionFilterProp="label"
              onChange={(nextWarehouse) => {
                setWarehouseFilter(nextWarehouse || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={lotFilter}
              options={[
                { label: '全部批次', value: '' },
                ...inventoryLotOptions,
              ]}
              placeholder="全部批次"
              showSearch
              optionFilterProp="label"
              onChange={(nextLot) => {
                setLotFilter(nextLot || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <DateRangeFilter
              options={DATE_FILTER_OPTIONS}
              value={dateFilterField}
              onTypeChange={(nextField) => {
                setDateFilterField(nextField || 'received_at')
                resetBusinessPaginationCurrent(setPagination)
              }}
              startValue={dateFilterStart}
              endValue={dateFilterEnd}
              onStartChange={(nextStart) => {
                setDateFilterStart(nextStart)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onEndChange={(nextEnd) => {
                setDateFilterEnd(nextEnd)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            {routePurchaseOrderID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['purchase_order_id'])}
              >
                已按采购订单筛选
              </Tag>
            ) : null}
            {routeReceiptID ? (
              <Tag
                closable
                color="blue"
                onClose={() =>
                  clearRouteContext(['receipt_id', 'source_type', 'source_id'])
                }
              >
                已按采购入库筛选
              </Tag>
            ) : null}
          </>
        }
        actions={
          <BusinessListToolbarActions
            moduleTitle="入库管理"
            onExport={exportRows}
            exportDisabled={rows.length === 0}
            onOpenColumnOrder={openColumnOrder}
          />
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedRowLabel}
          boundaryText="过账和取消均由系统按采购入库规则更新库存或生成撤销调整记录；页面不会绕过这些规则直接修改库存。"
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedRow}
            onClick={() => setSelectedRow(null)}
          >
            清空已选
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            disabled={!selectedRow}
            menu={{
              items: relatedMenuItems,
              onClick: openRelatedTable,
            }}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!selectedRow}
            >
              相关单据 <DownOutlined />
            </Button>
          </Dropdown>
          <Button
            size="small"
            icon={<EyeOutlined />}
            disabled={!selectedRow}
            onClick={() => openPurchaseReceiptDetails(selectedRow)}
          >
            查看详情
          </Button>
          <BusinessAttachmentModalButton
            ownerType="purchase_receipt"
            ownerId={selectedRow?.id}
            modalTitle="入库附件"
            panelTitle="入库附件"
            description="上传送货单、物流单、仓库收货照片或异常说明；附件不能代替入库确认。"
            canUpload={canCreate || canPost}
            canDelete={canCreate || canPost}
            disabled={!selectedRow}
            disabledReason="请先选择一条入库记录"
          />
          <Button
            size="small"
            disabled={
              !selectedRow || (!canReadReturn && !canReadAdjustment) || saving
            }
            onClick={() => setReceiptExceptionRecordsOpen(true)}
          >
            退货与调整记录
          </Button>
          <Button
            size="small"
            disabled={
              !selectedRow ||
              selectedRow.status !== 'POSTED' ||
              !canCreateReturn ||
              saving
            }
            onClick={() => setReceiptExceptionMode('return')}
          >
            生成采购退货
          </Button>
          <Button
            size="small"
            disabled={
              !selectedRow ||
              selectedRow.status !== 'POSTED' ||
              !canCreateAdjustment ||
              saving
            }
            onClick={() => setReceiptExceptionMode('adjustment')}
          >
            登记入库调整
          </Button>
          {selectedRow?.status === 'POSTED' && canViewPayable ? (
            <Button
              size="small"
              disabled={saving || financeSourceLoading}
              onClick={() => viewPurchaseReceiptPayable(selectedRow)}
            >
              查看应付
            </Button>
          ) : null}
          {selectedRow?.status === 'POSTED' && canCreatePayable ? (
            <Button
              size="small"
              disabled={saving || financeSourceLoading}
              onClick={() => openPurchaseReceiptPayable(selectedRow)}
            >
              生成应付
            </Button>
          ) : null}
          <Popconfirm
            title="确认过账并更新库存？"
            onConfirm={() =>
              runReceiptAction(
                selectedRow,
                postPurchaseReceipt,
                '采购入库已过账'
              )
            }
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={
                !selectedRow ||
                selectedRow.status !== 'DRAFT' ||
                !canPost ||
                saving
              }
            >
              过账入库
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认取消已过账入库并同步冲减相应库存？"
            onConfirm={() =>
              runReceiptAction(
                selectedRow,
                cancelPurchaseReceipt,
                '采购入库已取消'
              )
            }
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              disabled={
                !selectedRow ||
                selectedRow.status !== 'POSTED' ||
                !canPost ||
                saving
              }
            >
              取消入库
            </Button>
          </Popconfirm>
        </SelectionActionBar>
      </BusinessOperationPanel>

      {selectedRow ? (
        <section className="erp-master-contact-list erp-purchase-receipt-inline-item-panel">
          <div className="erp-master-contact-list__head">
            <div>
              <strong>入库明细</strong>
              <span>在当前入库草稿下新增材料、仓库、批次和数量。</span>
            </div>
          </div>
          {itemEditorReceipt ? (
            <PurchaseReceiptInlineItemEditor
              inventoryLotOptions={inventoryLotOptions}
              materialOptions={materialOptions}
              receipt={itemEditorReceipt}
              saving={saving}
              unitOptions={unitOptions}
              warehouseOptions={warehouseOptions}
              onCancel={closeItemEditor}
              onSave={handleAddItem}
            />
          ) : null}
          <BusinessLineItemsFooter
            addLabel="添加明细"
            addDisabled={
              selectedRow.status !== 'DRAFT' ||
              !canCreate ||
              saving ||
              Boolean(itemEditorReceipt)
            }
            onAdd={() => openAddItem(selectedRow)}
            stats={[
              {
                key: 'count',
                label: '已录入',
                value: receiptItemCount(selectedRow),
                suffix: '条',
              },
              {
                key: 'quantity',
                label: '数量合计',
                value: formatQuantity(receiptQuantityTotal(selectedRow)),
              },
            ]}
          />
        </section>
      ) : null}

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={tableColumns}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        scroll={{ x: 1320 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedRow ? [selectedRow.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelectedRow(selectedRows[0] || null),
        }}
        rowClassName={(record) =>
          record.id === selectedRow?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () => setSelectedRow(record),
        })}
        onOpenRecord={openPurchaseReceiptDetails}
        expandable={receiptItemsPreview.expandable}
        emptyDescription="暂无采购入库单"
      />
      {receiptItemsPreview.modal}

      <BusinessRecordDetailsModal
        columns={visibleColumns}
        description="查看采购入库单头、状态、数量汇总和完整材料明细。"
        lineItems={{
          emptyDescription: '当前采购入库单暂无明细',
          getItemFields: getPurchaseReceiptItemFields,
          getItemKey: (item) => item?.id,
          getItemLabel: (_item, { index }) => `明细 ${index + 1}`,
          getItemSummary: getPurchaseReceiptItemSummary,
          items: detailReceipt?.items,
          title: '采购入库明细',
        }}
        open={Boolean(detailReceipt)}
        record={detailReceipt}
        title="采购入库详情"
        onClose={() => setDetailReceipt(null)}
      />

      <PurchaseReceiptExceptionModal
        open={Boolean(receiptExceptionMode)}
        mode={receiptExceptionMode}
        receipt={selectedRow}
        materialOptions={materialOptions}
        warehouseOptions={warehouseOptions}
        lotOptions={inventoryLotOptions}
        loading={saving}
        onCancel={() => {
          if (!saving) setReceiptExceptionMode(null)
        }}
        onSubmit={submitReceiptException}
      />
      <FinanceBusinessSourceModal
        action={FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE}
        open={Boolean(financeSourceReceipt)}
        source={financeSourceReceipt}
        initialValues={financeSourceInitialValues}
        loading={financeSourceLoading}
        onCancel={closePurchaseReceiptPayable}
        onSubmit={submitPurchaseReceiptPayable}
      />
      <PurchaseReceiptExceptionRecordsModal
        open={receiptExceptionRecordsOpen}
        receipt={selectedRow}
        customerKey={activeCustomerKey}
        canReadReturns={canReadReturn}
        canReadAdjustments={canReadAdjustment}
        canPostReturns={canPostReturn}
        canCancelReturns={canCancelReturn}
        canPostAdjustments={canPostAdjustment}
        canCancelAdjustments={canCancelAdjustment}
        onCancel={() => setReceiptExceptionRecordsOpen(false)}
        onChanged={loadRows}
      />
      {columnOrderModal}
    </BusinessPageLayout>
  )
}
