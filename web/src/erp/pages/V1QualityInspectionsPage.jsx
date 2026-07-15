import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  LinkOutlined,
  PlusOutlined,
  RollbackOutlined,
  SettingOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Dropdown,
  Form,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd'
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
  cancelQualityInspection,
  createQualityInspectionDraft,
  getQualityInspection,
  listQualityInspections,
  passQualityInspection,
  rejectQualityInspection,
  submitQualityInspection,
} from '../api/qualityApi.mjs'
import {
  createPurchaseReturnFromQualityInspection,
  listPurchaseReceipts,
  listPurchaseReturns,
} from '../api/purchaseApi.mjs'
import { listInventoryLots } from '../api/inventoryApi.mjs'
import {
  listMaterials,
  listProducts,
  listWarehouses,
} from '../api/masterDataOrderApi.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  ColumnOrderHeaderMenu,
  ColumnOrderModal,
  getColumnLabel,
} from '../components/business-list/ColumnOrderModal.jsx'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import QualityInspectionPurchaseReturnModal from '../components/quality-inspections/QualityInspectionPurchaseReturnModal.jsx'
import {
  QualityInspectionCreateForm,
  QualityInspectionDecisionForm,
  buildDecisionParams,
  buildInspectionParams,
  positiveInt,
  todayInputValue,
} from '../components/quality-inspections/QualityInspectionForms.jsx'
import {
  buildQualityInspectionDataColumns,
  buildQualityInspectionExportColumns,
  QUALITY_DATE_FILTER_OPTIONS,
  QUALITY_INSPECTION_TYPE_FILTER_OPTIONS,
  QUALITY_INSPECTIONS_MODULE_KEY,
  QUALITY_RESULT_FILTER_OPTIONS,
  QUALITY_STATUS_OPTIONS,
} from '../components/quality-inspections/qualityInspectionColumns.jsx'
import { decimalNumber, formatQuantity } from '../utils/businessLineItems.mjs'
import {
  compactParams,
  buildSequentialDraftCode,
  hasActionPermission,
  statusText,
  trimOptional,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import { applyEffectiveFieldPolicyFlags } from '../utils/adminProfileSync.mjs'
import {
  inventoryLotOption,
  materialOption,
  productOption,
  purchaseReceiptItemOption,
  purchaseReceiptOption,
  referenceLabel,
  uniqueReferenceOptions,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
import {
  routeWithQuery,
  searchParamPositiveIntText,
} from '../utils/routeQuery.mjs'
import {
  buildPurchaseReturnFromQualityInspectionPayload,
  isRejectedIncomingInspection,
} from '../utils/qualityInspectionSourceAction.mjs'
import { createSourceBusinessActionAttemptStore } from '../utils/sourceBusinessAction.mjs'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const EMPTY_ADMIN_PROFILE = Object.freeze({})
const PURCHASE_RECEIPT_STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  POSTED: '已过账',
  CANCELLED: '已取消',
})
const { Text } = Typography

function readStoredColumnOrder(moduleKey) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(
      `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
    )
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredColumnOrder(moduleKey, order = []) {
  if (typeof window === 'undefined') return
  const storageKey = `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
  if (!Array.isArray(order) || order.length === 0) {
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, JSON.stringify(order))
}

function getPreferredColumnOrder({
  adminProfile,
  moduleKey,
  columns,
  localOrder,
}) {
  applyEffectiveFieldPolicyFlags({ adminProfile, moduleKey, columns })
  if (Array.isArray(localOrder)) {
    return sanitizeModuleColumnOrder(localOrder, columns)
  }
  const accountOrder = adminProfile?.erp_preferences?.column_orders?.[moduleKey]
  const sanitizedAccountOrder = sanitizeModuleColumnOrder(accountOrder, columns)
  if (sanitizedAccountOrder.length > 0) return sanitizedAccountOrder
  return sanitizeModuleColumnOrder(readStoredColumnOrder(moduleKey), columns)
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCSV({ filename, columns, rows }) {
  const header = columns.map((column) => csvEscape(getColumnLabel(column)))
  const body = rows.map((row) =>
    columns.map((column) => {
      const rawValue =
        typeof column.exportValue === 'function'
          ? column.exportValue(row)
          : row?.[column.dataIndex]
      return csvEscape(rawValue)
    })
  )
  const csv = [header, ...body].map((line) => line.join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function findByPositiveID(id, records = []) {
  const targetID = positiveInt(id)
  if (!targetID) return null
  return (Array.isArray(records) ? records : []).find(
    (record) => Number(record?.id || record?.lot_id || 0) === targetID
  )
}

export default function V1QualityInspectionsPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = outletContext?.adminProfile || EMPTY_ADMIN_PROFILE
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [resultFilter, setResultFilter] = useState('')
  const [inspectionTypeFilter, setInspectionTypeFilter] = useState('')
  const [dateFilterField, setDateFilterField] = useState('inspected_at')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [purchaseReceiptFilter, setPurchaseReceiptFilter] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [lotFilter, setLotFilter] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [inspectionModal, setInspectionModal] = useState(null)
  const [purchaseReturnModal, setPurchaseReturnModal] = useState(null)
  const [purchaseReturnLoading, setPurchaseReturnLoading] = useState(false)
  const [returnedInspectionIDs, setReturnedInspectionIDs] = useState(
    () => new Set()
  )
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [purchaseReceipts, setPurchaseReceipts] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
  const [materials, setMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [inspectionForm] = Form.useForm()
  const [decisionForm] = Form.useForm()
  const inspectionAttachmentRef = useRef(null)
  const purchaseReturnInFlightRef = useRef(false)
  const purchaseReturnAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const routePurchaseOrderID = searchParamPositiveIntText(
    searchParams,
    'purchase_order_id'
  )
  const routePurchaseReceiptID = searchParamPositiveIntText(
    searchParams,
    'purchase_receipt_id'
  )
  const routeQualityInspectionID = searchParamPositiveIntText(
    searchParams,
    'quality_inspection_id'
  )

  const beginLatestRequest = useLatestRequestCoordinator()
  const selectedPurchaseReceiptID = Form.useWatch(
    'purchase_receipt_id',
    inspectionForm
  )
  const selectedPurchaseReceiptItemID = Form.useWatch(
    'purchase_receipt_item_id',
    inspectionForm
  )

  const canCreate = hasActionPermission(
    adminProfile,
    'quality.inspection.create'
  )
  const canUpdate = hasActionPermission(
    adminProfile,
    'quality.inspection.update'
  )
  const canCreatePurchaseReturn = hasActionPermission(
    adminProfile,
    'purchase.return.create'
  )
  const canReadPurchaseReturn = hasActionPermission(
    adminProfile,
    'purchase.return.read'
  )
  const activeCustomerKey = adminProfile?.effective_session?.customer?.key || ''
  const selectedSourceType = String(
    selectedRow?.source_type || ''
  ).toUpperCase()
  const relatedMenuItems =
    selectedSourceType === 'PURCHASE_RECEIPT'
      ? [
          { key: 'purchase-receipts', label: '采购入库' },
          { key: 'inventory', label: '库存台账' },
        ]
      : [{ key: 'inventory', label: '库存台账' }]
  const purchaseReceiptOptions = useMemo(
    () => uniqueReferenceOptions(purchaseReceipts, purchaseReceiptOption),
    [purchaseReceipts]
  )
  const purchaseReceiptItemOptions = useMemo(
    () =>
      uniqueReferenceOptions(
        purchaseReceipts
          .filter((receipt) => {
            const selectedReceiptID = positiveInt(selectedPurchaseReceiptID)
            return (
              !selectedReceiptID ||
              Number(receipt.id || 0) === selectedReceiptID
            )
          })
          .flatMap((receipt) =>
            Array.isArray(receipt?.items) ? receipt.items : []
          ),
        purchaseReceiptItemOption
      ),
    [purchaseReceipts, selectedPurchaseReceiptID]
  )
  const purchaseReceiptItems = useMemo(
    () =>
      purchaseReceipts.flatMap((receipt) =>
        Array.isArray(receipt?.items) ? receipt.items : []
      ),
    [purchaseReceipts]
  )
  const allPurchaseReceiptItemOptions = useMemo(
    () =>
      uniqueReferenceOptions(purchaseReceiptItems, purchaseReceiptItemOption),
    [purchaseReceiptItems]
  )
  const inventoryLotOptions = useMemo(
    () => uniqueReferenceOptions(inventoryLots, inventoryLotOption),
    [inventoryLots]
  )
  const materialOptions = useMemo(
    () => uniqueReferenceOptions(materials, materialOption),
    [materials]
  )
  const productOptions = useMemo(
    () => uniqueReferenceOptions(products, productOption),
    [products]
  )
  const warehouseOptions = useMemo(
    () => uniqueReferenceOptions(warehouses, warehouseOptionFromRecord),
    [warehouses]
  )
  const selectedPurchaseReceipt = useMemo(
    () => findByPositiveID(selectedPurchaseReceiptID, purchaseReceipts) || null,
    [purchaseReceipts, selectedPurchaseReceiptID]
  )
  const selectedPurchaseReceiptItem = useMemo(
    () =>
      findByPositiveID(selectedPurchaseReceiptItemID, purchaseReceiptItems) ||
      null,
    [purchaseReceiptItems, selectedPurchaseReceiptItemID]
  )
  const purchaseReturnSourceSummary = useMemo(() => {
    const inspection = purchaseReturnModal?.inspection
    const receipt = findByPositiveID(
      inspection?.purchase_receipt_id,
      purchaseReceipts
    )
    const item = findByPositiveID(
      inspection?.purchase_receipt_item_id,
      purchaseReceiptItems
    )
    return {
      receipt: receipt?.receipt_no || '采购入库已关联',
      supplier: receipt?.supplier_name || '供应商已关联',
      material: referenceLabel(
        materialOptions,
        item?.material_id || inspection?.material_id,
        '材料'
      ),
      warehouse: referenceLabel(
        warehouseOptions,
        item?.warehouse_id || inspection?.warehouse_id,
        '仓库'
      ),
      lot: referenceLabel(
        inventoryLotOptions,
        item?.lot_id || inspection?.inventory_lot_id,
        '批次'
      ),
    }
  }, [
    inventoryLotOptions,
    materialOptions,
    purchaseReceiptItems,
    purchaseReceipts,
    purchaseReturnModal?.inspection,
    warehouseOptions,
  ])

  const persistColumnOrder = useCallback(
    async (nextOrder, columnsForOrder) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        columnsForOrder
      )
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(QUALITY_INSPECTIONS_MODULE_KEY, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: QUALITY_INSPECTIONS_MODULE_KEY,
          order: sanitizedOrder,
        })
        outletContext?.updateAdminERPPreferences?.(erpPreferences)
        message.success(
          sanitizedOrder.length > 0 ? '列顺序已保存' : '列顺序已恢复默认'
        )
      } catch (error) {
        message.warning(
          `${getActionErrorMessage(error, '保存列顺序')}，已保留本地设置`
        )
      } finally {
        setColumnOrderSaving(false)
      }
    },
    [outletContext]
  )

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    const pathByKey = {
      'purchase-receipts': routeWithQuery(V1_ROUTE_PATHS.purchaseReceipts, {
        receipt_id: selectedRow.purchase_receipt_id,
      }),
      inventory: routeWithQuery(V1_ROUTE_PATHS.inventory, {
        source_type: selectedRow.source_type,
        source_id: selectedRow.source_id,
        lot_id: selectedRow.inventory_lot_id,
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
      const routeSelectedID = Number(routeQualityInspectionID || 0)
      const [data, routeInspection] = await Promise.all([
        listQualityInspections(
          compactParams({
            status: statusFilter,
            result: resultFilter,
            inspection_type: inspectionTypeFilter || undefined,
            keyword: trimOptional(keyword),
            date_field: dateFilterField,
            date_from: dateFilterStart || undefined,
            date_to: dateFilterEnd || undefined,
            purchase_receipt_id:
              purchaseReceiptFilter || routePurchaseReceiptID || undefined,
            purchase_order_id: routePurchaseOrderID || undefined,
            material_id: materialFilter || undefined,
            warehouse_id: warehouseFilter || undefined,
            inventory_lot_id: lotFilter || undefined,
            ...getBusinessPaginationParams(pagination),
          }),
          { signal: request.signal }
        ),
        routeSelectedID > 0
          ? getQualityInspection({ id: routeSelectedID })
          : Promise.resolve(null),
      ])
      if (!request.isCurrent()) {
        return
      }
      const listedRows = Array.isArray(data?.quality_inspections)
        ? data.quality_inspections
        : []
      const nextRows = routeInspection
        ? [
            routeInspection,
            ...listedRows.filter((item) => item.id !== routeInspection.id),
          ]
        : listedRows
      setRows(nextRows)
      setSelectedRow((current) => {
        if (routeSelectedID > 0) return routeInspection
        return current?.id
          ? nextRows.find((item) => item.id === current.id) || null
          : null
      })
      setTotal(
        Number(data?.total || 0) +
          (routeInspection &&
          !listedRows.some((item) => item.id === routeInspection.id)
            ? 1
            : 0)
      )
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return
      }
      message.error(getActionErrorMessage(error, '加载质量检验单'))
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
    inspectionTypeFilter,
    lotFilter,
    materialFilter,
    pagination,
    purchaseReceiptFilter,
    routePurchaseOrderID,
    routePurchaseReceiptID,
    routeQualityInspectionID,
    resultFilter,
    statusFilter,
    warehouseFilter,
  ])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const loadReferenceOptions = useCallback(async () => {
    try {
      const [
        receiptResult,
        lotResult,
        materialResult,
        productResult,
        warehouseResult,
      ] = await Promise.all([
        listPurchaseReceipts({ limit: 500 }),
        listInventoryLots({ limit: 500 }),
        listMaterials({ limit: 500, active_only: true }),
        listProducts({ limit: 500, active_only: true }),
        listWarehouses({ limit: 500, active_only: true }),
      ])
      setPurchaseReceipts(
        Array.isArray(receiptResult?.purchase_receipts)
          ? receiptResult.purchase_receipts
          : []
      )
      setInventoryLots(
        Array.isArray(lotResult?.inventory_lots) ? lotResult.inventory_lots : []
      )
      setMaterials(
        Array.isArray(materialResult?.materials) ? materialResult.materials : []
      )
      setProducts(
        Array.isArray(productResult?.products) ? productResult.products : []
      )
      setWarehouses(
        Array.isArray(warehouseResult?.warehouses)
          ? warehouseResult.warehouses
          : []
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载质检相关资料'))
      setPurchaseReceipts([])
      setInventoryLots([])
      setMaterials([])
      setProducts([])
      setWarehouses([])
    }
  }, [])

  const clearRouteContext = useCallback(
    (keys) => {
      const nextParams = new URLSearchParams(searchParams)
      const keysToDelete =
        Array.isArray(keys) && keys.length > 0
          ? keys
          : [
              'purchase_order_id',
              'purchase_receipt_id',
              'quality_inspection_id',
            ]
      keysToDelete.forEach((key) => nextParams.delete(key))
      setSearchParams(nextParams, { replace: true })
      resetBusinessPaginationCurrent(setPagination)
    },
    [searchParams, setSearchParams]
  )

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRows)
  }, [loadRows, outletContext])

  useEffect(() => {
    if (inspectionModal?.mode === 'create') {
      inspectionForm.setFieldsValue({
        inspection_no: buildSequentialDraftCode(rows, {
          prefix: 'QI',
          field: 'inspection_no',
        }),
        purchase_receipt_id: undefined,
        purchase_receipt_item_id: undefined,
        decision_note: '',
      })
    }
    if (['pass', 'reject', 'cancel'].includes(inspectionModal?.mode)) {
      decisionForm.setFieldsValue({
        result: inspectionModal?.mode === 'pass' ? 'PASS' : undefined,
        inspected_at:
          inspectionModal?.mode === 'cancel' ? undefined : todayInputValue(),
        decision_note: '',
      })
    }
  }, [decisionForm, inspectionForm, inspectionModal?.mode, rows])

  const openCreate = useCallback(() => {
    inspectionAttachmentRef.current?.clearPendingAttachments()
    setInspectionModal({ mode: 'create' })
  }, [])

  const openDecision = useCallback((mode, inspection) => {
    inspectionAttachmentRef.current?.clearPendingAttachments()
    setInspectionModal({ mode, inspection })
  }, [])

  const closeModal = useCallback(() => {
    inspectionAttachmentRef.current?.clearPendingAttachments()
    setInspectionModal(null)
  }, [])

  const handleReceiptChange = useCallback(() => {
    inspectionForm.setFieldsValue({
      purchase_receipt_item_id: undefined,
    })
  }, [inspectionForm])

  const handleCreateInspection = useCallback(async () => {
    const values = await inspectionForm.validateFields()
    setSaving(true)
    try {
      const inspection = await createQualityInspectionDraft(
        compactParams({
          customer_key: activeCustomerKey || undefined,
          ...buildInspectionParams(values),
        })
      )
      const attachmentSaved =
        (await inspectionAttachmentRef.current?.flushPendingAttachments(
          inspection?.id
        )) !== false
      message.success(
        attachmentSaved
          ? '来料质检草稿已创建'
          : '来料质检草稿已创建，未上传的附件请重新选择'
      )
      setSelectedRow(inspection)
      closeModal()
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '创建来料质检草稿'))
    } finally {
      setSaving(false)
    }
  }, [activeCustomerKey, closeModal, inspectionForm, loadRows])

  const markInspectionReturned = useCallback((inspectionID) => {
    const id = positiveInt(inspectionID)
    if (!id) return
    setReturnedInspectionIDs((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  }, [])

  const openPurchaseReturn = useCallback(
    async (inspection) => {
      if (
        !canCreatePurchaseReturn ||
        !isRejectedIncomingInspection(inspection)
      ) {
        message.warning('只有已判定不合格的来料质检单可以退供应商')
        return
      }
      if (returnedInspectionIDs.has(inspection.id)) {
        message.info('该质检单已生成采购退货')
        return
      }
      setPurchaseReturnLoading(true)
      try {
        if (canReadPurchaseReturn) {
          const data = await listPurchaseReturns(
            compactParams({
              customer_key: activeCustomerKey || undefined,
              quality_inspection_id: inspection.id,
              limit: 20,
            })
          )
          const activeReturn = (
            Array.isArray(data?.purchase_returns) ? data.purchase_returns : []
          ).find(
            (item) => String(item?.status || '').toUpperCase() !== 'CANCELLED'
          )
          if (activeReturn) {
            markInspectionReturned(inspection.id)
            message.info('该质检单已生成采购退货')
            return
          }
        }
        setPurchaseReturnModal({ inspection })
      } catch (error) {
        message.error(getActionErrorMessage(error, '核对采购退货状态'))
      } finally {
        setPurchaseReturnLoading(false)
      }
    },
    [
      activeCustomerKey,
      canCreatePurchaseReturn,
      canReadPurchaseReturn,
      markInspectionReturned,
      returnedInspectionIDs,
    ]
  )

  const closePurchaseReturn = useCallback(() => {
    if (purchaseReturnInFlightRef.current) return
    setPurchaseReturnModal(null)
  }, [])

  const submitPurchaseReturn = useCallback(
    async (values) => {
      const inspection = purchaseReturnModal?.inspection
      if (
        purchaseReturnInFlightRef.current ||
        !isRejectedIncomingInspection(inspection)
      ) {
        return
      }
      let scope
      let attempt
      try {
        const payload = buildPurchaseReturnFromQualityInspectionPayload(
          values,
          inspection,
          activeCustomerKey
        )
        scope = `quality-purchase-return:${inspection.id}`
        attempt = purchaseReturnAttemptsRef.current.prepare(scope, payload)
      } catch (error) {
        message.error(getActionErrorMessage(error, '准备采购退货'))
        return
      }

      purchaseReturnInFlightRef.current = true
      setPurchaseReturnLoading(true)
      try {
        const created = await createPurchaseReturnFromQualityInspection(
          attempt.params
        )
        if (
          Number(created?.id || 0) <= 0 ||
          Number(created?.quality_inspection_id || 0) !== inspection.id ||
          String(created?.status || '').toUpperCase() !== 'DRAFT'
        ) {
          const error = new Error('采购退货返回结果与当前质检单不一致')
          error.isInvalidResponse = true
          throw error
        }
        purchaseReturnAttemptsRef.current.settle(scope, attempt, null)
        markInspectionReturned(inspection.id)
        setPurchaseReturnModal(null)
        message.success('采购退货草稿已生成，请到采购退货记录核对并确认')
        await loadRows()
      } catch (error) {
        const retained = purchaseReturnAttemptsRef.current.settle(
          scope,
          attempt,
          error
        )
        if (retained) {
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
        } else {
          message.error(getActionErrorMessage(error, '生成采购退货草稿'))
        }
      } finally {
        purchaseReturnInFlightRef.current = false
        setPurchaseReturnLoading(false)
      }
    },
    [activeCustomerKey, loadRows, markInspectionReturned, purchaseReturnModal]
  )

  const runInspectionAction = useCallback(
    async (inspection, action, successText) => {
      if (!inspection?.id) return
      setSaving(true)
      try {
        const nextInspection = await action({ id: inspection.id })
        setSelectedRow(nextInspection || inspection)
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

  const handleDecision = useCallback(async () => {
    const inspection = inspectionModal?.inspection
    if (!inspection?.id) return
    const values = await decisionForm.validateFields()
    setSaving(true)
    try {
      let action = passQualityInspection
      let params = buildDecisionParams(inspection.id, values)
      let successText = '质量检验已判定合格'
      if (inspectionModal?.mode === 'reject') {
        action = rejectQualityInspection
        params = buildDecisionParams(inspection.id, values, 'REJECT')
        successText = '质量检验已判定不合格'
      } else if (inspectionModal?.mode === 'cancel') {
        action = cancelQualityInspection
        params = buildDecisionParams(inspection.id, values)
        successText = '质量检验已取消'
      }
      const nextInspection = await action(params)
      const attachmentSaved =
        (await inspectionAttachmentRef.current?.flushPendingAttachments(
          nextInspection?.id || inspection.id
        )) !== false
      setSelectedRow(nextInspection || inspection)
      message.success(
        attachmentSaved ? successText : `${successText}，未上传的附件请重新选择`
      )
      closeModal()
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '处理质量检验'))
    } finally {
      setSaving(false)
    }
  }, [closeModal, decisionForm, inspectionModal, loadRows])

  const selectedRowLabel = selectedRow
    ? `${selectedRow.inspection_no || '质量检验单已关联'} / ${referenceLabel(
        inventoryLotOptions,
        selectedRow.inventory_lot_id,
        '批次'
      )}`
    : '请先选择一张质量检验单'

  const modalTitle = {
    create: '生成来料质检草稿',
    pass: '判定合格',
    reject: '判定不合格',
    cancel: '取消质检',
  }[inspectionModal?.mode || 'create']

  const modalDescription = {
    create:
      '选择采购入库单和入库明细；系统会自动带出材料、仓库和批次，无需重复填写。',
    pass: '合格或让步接收只更新质检判定和批次状态，不会增减库存数量。',
    reject: '不合格只更新质检判定和批次状态，供应商退货仍走采购退货。',
    cancel: '取消只关闭当前质检流程，不会修改库存或采购入库记录。',
  }[inspectionModal?.mode || 'create']

  const modalOkText = {
    create: '生成草稿',
    pass: '确认合格',
    reject: '确认不合格',
    cancel: '确认取消',
  }[inspectionModal?.mode || 'create']

  const exportColumns = useMemo(() => {
    const columns = buildQualityInspectionExportColumns({
      allPurchaseReceiptItemOptions,
      inventoryLotOptions,
      materialOptions,
      productOptions,
      purchaseReceiptOptions,
      warehouseOptions,
    })
    return applyEffectiveFieldPolicyFlags({
      adminProfile,
      moduleKey: QUALITY_INSPECTIONS_MODULE_KEY,
      columns,
    })
  }, [
    allPurchaseReceiptItemOptions,
    adminProfile,
    inventoryLotOptions,
    materialOptions,
    productOptions,
    purchaseReceiptOptions,
    warehouseOptions,
  ])

  const dataColumns = useMemo(
    () =>
      buildQualityInspectionDataColumns({
        allPurchaseReceiptItemOptions,
        inventoryLotOptions,
        materialOptions,
        productOptions,
        purchaseReceiptOptions,
        warehouseOptions,
      }),
    [
      allPurchaseReceiptItemOptions,
      inventoryLotOptions,
      materialOptions,
      productOptions,
      purchaseReceiptOptions,
      warehouseOptions,
    ]
  )

  const preferredColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: QUALITY_INSPECTIONS_MODULE_KEY,
        columns: dataColumns,
        localOrder: columnOrder,
      }),
    [adminProfile, columnOrder, dataColumns]
  )

  const visibleDataColumns = useMemo(
    () => applyModuleColumnOrder(dataColumns, preferredColumnOrder),
    [preferredColumnOrder, dataColumns]
  )

  const columns = useMemo(
    () =>
      visibleDataColumns.map((column) => ({
        ...column,
        title: (
          <ColumnOrderHeaderMenu
            column={column}
            columns={dataColumns}
            order={preferredColumnOrder}
            saving={columnOrderSaving}
            onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
            onOpenPanel={() => setColumnOrderOpen(true)}
          />
        ),
      })),
    [
      columnOrderSaving,
      dataColumns,
      persistColumnOrder,
      preferredColumnOrder,
      visibleDataColumns,
    ]
  )

  const exportQualityInspections = useCallback(() => {
    if (rows.length === 0) return
    downloadCSV({
      filename: `质量检验-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: exportColumns,
      rows,
    })
  }, [exportColumns, rows])

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      resultFilter ||
      inspectionTypeFilter ||
      purchaseReceiptFilter ||
      materialFilter ||
      warehouseFilter ||
      lotFilter ||
      dateFilterStart ||
      dateFilterEnd ||
      routePurchaseOrderID ||
      routePurchaseReceiptID ||
      routeQualityInspectionID
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setResultFilter('')
    setInspectionTypeFilter('')
    setPurchaseReceiptFilter('')
    setMaterialFilter('')
    setWarehouseFilter('')
    setLotFilter('')
    setDateFilterField('inspected_at')
    setDateFilterStart('')
    setDateFilterEnd('')
    clearRouteContext()
  }, [clearRouteContext])

  return (
    <BusinessPageLayout className="erp-v1-quality-inspections-page">
      <PageHeaderCard
        compact
        title="质量检验"
        description="质量检验用于处理采购来料、委外回货等业务的检验判定；提交会冻结对应批次，合格 / 让步接收后恢复可用，不合格后置为不可用。质检判定不会增减库存数量；采购来料不合格退供应商仍需办理采购退货，其他情况请到对应业务页面处理。"
        tags={[
          <Tag color="gold" key="hold">
            已提交：批次冻结
          </Tag>,
          <Tag color="green" key="pass">
            通过：批次可用
          </Tag>,
          <Tag color="red" key="reject">
            不合格：批次不可用
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总质检单', value: total },
          { key: 'current', label: '本页显示', value: rows.length },
          {
            key: 'submitted',
            label: '已提交',
            value: rows.filter((item) => item.status === 'SUBMITTED').length,
          },
          {
            key: 'rejected',
            label: '不合格',
            value: rows.filter((item) => item.status === 'REJECTED').length,
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
              placeholder="搜索质检单"
              searchHint="可搜索：质检单号、业务来源、批次"
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadRows}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={QUALITY_STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={resultFilter}
              options={QUALITY_RESULT_FILTER_OPTIONS}
              onChange={(nextResult) => {
                setResultFilter(nextResult)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={inspectionTypeFilter}
              options={QUALITY_INSPECTION_TYPE_FILTER_OPTIONS}
              onChange={(nextType) => {
                setInspectionTypeFilter(nextType || '')
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={purchaseReceiptFilter}
              options={[
                { label: '全部入库单', value: '' },
                ...purchaseReceiptOptions,
              ]}
              placeholder="全部入库单"
              showSearch
              optionFilterProp="label"
              onChange={(nextReceipt) => {
                setPurchaseReceiptFilter(nextReceipt || '')
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
              options={QUALITY_DATE_FILTER_OPTIONS}
              value={dateFilterField}
              onTypeChange={(nextField) => {
                setDateFilterField(nextField || 'inspected_at')
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
            {routePurchaseReceiptID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['purchase_receipt_id'])}
              >
                已按采购入库筛选
              </Tag>
            ) : null}
            {routeQualityInspectionID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['quality_inspection_id'])}
              >
                已定位质检单
              </Tag>
            ) : null}
          </>
        }
        actions={
          <Space wrap>
            <ToolbarButton
              icon={<DownloadOutlined />}
              disabled={rows.length === 0}
              onClick={exportQualityInspections}
            >
              导出筛选结果
            </ToolbarButton>
            <ToolbarButton
              icon={<SettingOutlined />}
              onClick={() => setColumnOrderOpen(true)}
            >
              列顺序
            </ToolbarButton>
          </Space>
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreate}
          >
            生成质检草稿
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedRowLabel}
          boundaryText="提交、判定和取消均由系统按质检规则处理；不会绕过规则直接修改批次状态或库存数量。"
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
          <Popconfirm
            title="确认提交质检并冻结该批次？"
            onConfirm={() =>
              runInspectionAction(
                selectedRow,
                submitQualityInspection,
                '来料质检已提交'
              )
            }
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              icon={<FileDoneOutlined />}
              disabled={
                !selectedRow ||
                selectedRow.status !== 'DRAFT' ||
                !canUpdate ||
                saving
              }
            >
              提交质检
            </Button>
          </Popconfirm>
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={
              !selectedRow ||
              selectedRow.status !== 'SUBMITTED' ||
              !canUpdate ||
              saving
            }
            onClick={() => openDecision('pass', selectedRow)}
          >
            判定合格
          </Button>
          <Button
            size="small"
            danger
            icon={<StopOutlined />}
            disabled={
              !selectedRow ||
              selectedRow.status !== 'SUBMITTED' ||
              !canUpdate ||
              saving
            }
            onClick={() => openDecision('reject', selectedRow)}
          >
            判定不合格
          </Button>
          {canCreatePurchaseReturn ? (
            <Button
              size="small"
              icon={<RollbackOutlined />}
              disabled={
                !selectedRow ||
                !isRejectedIncomingInspection(selectedRow) ||
                returnedInspectionIDs.has(selectedRow.id) ||
                purchaseReturnLoading
              }
              onClick={() => openPurchaseReturn(selectedRow)}
            >
              {selectedRow && returnedInspectionIDs.has(selectedRow.id)
                ? '已生成退货'
                : '退供应商'}
            </Button>
          ) : null}
          <Button
            size="small"
            icon={<CloseCircleOutlined />}
            disabled={
              !selectedRow ||
              !['DRAFT', 'SUBMITTED'].includes(selectedRow.status) ||
              !canUpdate ||
              saving
            }
            onClick={() => openDecision('cancel', selectedRow)}
          >
            取消质检
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={createBusinessTablePagination({
          pagination,
          total,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        })}
        scroll={{ x: 1460 }}
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
        emptyDescription="暂无质量检验单"
      />

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="质量检验列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />

      <QualityInspectionPurchaseReturnModal
        open={Boolean(purchaseReturnModal)}
        inspection={purchaseReturnModal?.inspection}
        sourceSummary={purchaseReturnSourceSummary}
        loading={purchaseReturnLoading}
        onCancel={closePurchaseReturn}
        onSubmit={submitPurchaseReturn}
      />

      <BusinessFormModal
        title={modalTitle}
        description={modalDescription}
        open={Boolean(inspectionModal)}
        onCancel={closeModal}
        onOk={
          inspectionModal?.mode === 'create'
            ? handleCreateInspection
            : handleDecision
        }
        confirmLoading={saving}
        destroyOnHidden
        okText={modalOkText}
        cancelText="关闭"
      >
        {inspectionModal?.mode === 'create' ? (
          <>
            {selectedPurchaseReceipt ? (
              <Alert
                className="erp-business-source-summary"
                showIcon
                type={selectedPurchaseReceiptItem ? 'info' : 'warning'}
                message={`来源采购入库：${
                  selectedPurchaseReceipt.receipt_no || '采购入库已关联'
                }`}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>
                      {[
                        `供应商：${selectedPurchaseReceipt.supplier_name || '-'}`,
                        `状态：${statusText(
                          selectedPurchaseReceipt.status,
                          PURCHASE_RECEIPT_STATUS_LABELS,
                          '状态待确认'
                        )}`,
                        selectedPurchaseReceiptItem
                          ? `来源行：${
                              selectedPurchaseReceiptItem.source_line_no ||
                              '入库明细已关联'
                            }`
                          : '来源行：未选择',
                      ].join('；')}
                    </Text>
                    {selectedPurchaseReceiptItem ? (
                      <Text type="secondary">
                        {[
                          `到货数量：${formatQuantity(
                            decimalNumber(selectedPurchaseReceiptItem.quantity)
                          )}`,
                          `材料：${referenceLabel(
                            materialOptions,
                            selectedPurchaseReceiptItem.material_id,
                            '材料'
                          )}`,
                          `仓库：${referenceLabel(
                            warehouseOptions,
                            selectedPurchaseReceiptItem.warehouse_id,
                            '仓库'
                          )}`,
                          selectedPurchaseReceiptItem.lot_id
                            ? `批次：${referenceLabel(
                                inventoryLotOptions,
                                selectedPurchaseReceiptItem.lot_id,
                                '批次'
                              )}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join('；')}
                      </Text>
                    ) : (
                      <Text type="secondary">
                        请选择采购入库行后再生成质检草稿，材料、仓库和批次会按来源行带出。
                      </Text>
                    )}
                    <Text type="secondary">
                      当前质检单按采购入库行建单；本次送检数量和已检数量暂未记录，页面不会自行补造。
                    </Text>
                  </Space>
                }
              />
            ) : null}
            <QualityInspectionCreateForm
              form={inspectionForm}
              purchaseReceiptOptions={purchaseReceiptOptions}
              purchaseReceiptItemOptions={purchaseReceiptItemOptions}
              onReceiptChange={handleReceiptChange}
            />
          </>
        ) : (
          <QualityInspectionDecisionForm
            form={decisionForm}
            mode={inspectionModal?.mode}
          />
        )}
        <BusinessAttachmentPanel
          ref={inspectionAttachmentRef}
          ownerType="quality_inspection"
          ownerId={inspectionModal?.inspection?.id}
          title="质检附件"
          description="上传不良照片、检验报告、让步说明或批次异常证据；附件不能代替质检处理。"
          canUpload={canCreate || canUpdate}
          canDelete={canUpdate}
          variant="inline"
        />
      </BusinessFormModal>
    </BusinessPageLayout>
  )
}
