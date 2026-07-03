import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  LinkOutlined,
  PlusOutlined,
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
import {
  cancelQualityInspection,
  createQualityInspectionDraft,
  listQualityInspections,
  passQualityInspection,
  rejectQualityInspection,
  submitQualityInspection,
} from '../api/qualityApi.mjs'
import { listPurchaseReceipts } from '../api/purchaseApi.mjs'
import { listInventoryLots } from '../api/inventoryApi.mjs'
import { listMaterials, listWarehouses } from '../api/masterDataOrderApi.mjs'
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
  QUALITY_INSPECTIONS_MODULE_KEY,
  QUALITY_RESULT_FILTER_OPTIONS,
  QUALITY_STATUS_OPTIONS,
} from '../components/quality-inspections/qualityInspectionColumns.jsx'
import { decimalNumber, formatQuantity } from '../utils/businessLineItems.mjs'
import {
  compactParams,
  buildSequentialDraftCode,
  hasActionPermission,
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
import {
  inventoryLotOption,
  materialOption,
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

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'
const EMPTY_ADMIN_PROFILE = Object.freeze({})
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
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [purchaseReceipts, setPurchaseReceipts] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
  const [materials, setMaterials] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [inspectionForm] = Form.useForm()
  const [decisionForm] = Form.useForm()
  const inspectionAttachmentRef = useRef(null)
  const routePurchaseOrderID = searchParamPositiveIntText(
    searchParams,
    'purchase_order_id'
  )
  const routePurchaseReceiptID = searchParamPositiveIntText(
    searchParams,
    'purchase_receipt_id'
  )
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
  const relatedMenuItems = [
    { key: 'purchase-receipts', label: '采购入库' },
    { key: 'inventory', label: '库存台账' },
  ]
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
        source_type: 'PURCHASE_RECEIPT',
        source_id: selectedRow.purchase_receipt_id,
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
    setLoading(true)
    try {
      const data = await listQualityInspections(
        compactParams({
          status: statusFilter,
          result: resultFilter,
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
        })
      )
      const nextRows = Array.isArray(data?.quality_inspections)
        ? data.quality_inspections
        : []
      setRows(nextRows)
      setSelectedRow((current) =>
        current?.id
          ? nextRows.find((item) => item.id === current.id) || null
          : null
      )
      setTotal(Number(data?.total || 0))
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载来料质检单'))
    } finally {
      setLoading(false)
    }
  }, [
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    keyword,
    lotFilter,
    materialFilter,
    pagination,
    purchaseReceiptFilter,
    routePurchaseOrderID,
    routePurchaseReceiptID,
    resultFilter,
    statusFilter,
    warehouseFilter,
  ])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const loadReferenceOptions = useCallback(async () => {
    try {
      const [receiptResult, lotResult, materialResult, warehouseResult] =
        await Promise.all([
          listPurchaseReceipts({ limit: 500 }),
          listInventoryLots({ limit: 500 }),
          listMaterials({ limit: 500, active_only: true }),
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
      setWarehouses(
        Array.isArray(warehouseResult?.warehouses)
          ? warehouseResult.warehouses
          : []
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载质检引用数据'))
      setPurchaseReceipts([])
      setInventoryLots([])
      setMaterials([])
      setWarehouses([])
    }
  }, [])

  const clearRouteContext = useCallback(
    (keys) => {
      const nextParams = new URLSearchParams(searchParams)
      const keysToDelete =
        Array.isArray(keys) && keys.length > 0
          ? keys
          : ['purchase_order_id', 'purchase_receipt_id']
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
        inventory_lot_id: undefined,
        material_id: undefined,
        warehouse_id: undefined,
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
      inventory_lot_id: undefined,
      material_id: undefined,
      warehouse_id: undefined,
    })
  }, [inspectionForm])

  const handleReceiptItemChange = useCallback(
    (value) => {
      const item = findByPositiveID(value, purchaseReceiptItems)
      inspectionForm.setFieldsValue({
        inventory_lot_id: item?.lot_id || undefined,
        material_id: item?.material_id || undefined,
        warehouse_id: item?.warehouse_id || undefined,
      })
    },
    [inspectionForm, purchaseReceiptItems]
  )

  const handleInventoryLotChange = useCallback(
    (value) => {
      const lot = findByPositiveID(value, inventoryLots)
      if (lot?.subject_type === 'MATERIAL' && positiveInt(lot?.subject_id)) {
        inspectionForm.setFieldsValue({ material_id: lot.subject_id })
      }
    },
    [inspectionForm, inventoryLots]
  )

  const handleCreateInspection = useCallback(async () => {
    const values = await inspectionForm.validateFields()
    setSaving(true)
    try {
      const inspection = await createQualityInspectionDraft(
        buildInspectionParams(values)
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
  }, [closeModal, inspectionForm, loadRows])

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
      let successText = '来料质检已判定合格'
      if (inspectionModal?.mode === 'reject') {
        action = rejectQualityInspection
        params = buildDecisionParams(inspection.id, values, 'REJECT')
        successText = '来料质检已判定不合格'
      } else if (inspectionModal?.mode === 'cancel') {
        action = cancelQualityInspection
        params = buildDecisionParams(inspection.id, values)
        successText = '来料质检已取消'
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
      message.error(getActionErrorMessage(error, '处理来料质检'))
    } finally {
      setSaving(false)
    }
  }, [closeModal, decisionForm, inspectionModal, loadRows])

  const selectedRowLabel = selectedRow
    ? `${selectedRow.inspection_no || '来料质检单已关联'} / ${referenceLabel(
        inventoryLotOptions,
        selectedRow.inventory_lot_id,
        '批次'
      )}`
    : '请先选择一张来料质检单'

  const modalTitle = {
    create: '生成来料质检草稿',
    pass: '判定合格',
    reject: '判定不合格',
    cancel: '取消质检',
  }[inspectionModal?.mode || 'create']

  const modalDescription = {
    create:
      '选择采购入库、入库行和批次；切换来源会清空已带出的材料、仓库和批次，避免残值。',
    pass: '合格或让步接收只更新质检判定和批次状态，不写库存流水。',
    reject: '不合格只更新质检判定和批次状态，供应商退货仍走采购退货。',
    cancel: '取消只关闭当前质检流程，不本地改库存或采购入库事实。',
  }[inspectionModal?.mode || 'create']

  const modalOkText = {
    create: '生成草稿',
    pass: '确认合格',
    reject: '确认不合格',
    cancel: '确认取消',
  }[inspectionModal?.mode || 'create']

  const exportColumns = useMemo(
    () =>
      buildQualityInspectionExportColumns({
        allPurchaseReceiptItemOptions,
        inventoryLotOptions,
        materialOptions,
        purchaseReceiptOptions,
        warehouseOptions,
      }),
    [
      allPurchaseReceiptItemOptions,
      inventoryLotOptions,
      materialOptions,
      purchaseReceiptOptions,
      warehouseOptions,
    ]
  )

  const dataColumns = useMemo(
    () =>
      buildQualityInspectionDataColumns({
        allPurchaseReceiptItemOptions,
        inventoryLotOptions,
        materialOptions,
        purchaseReceiptOptions,
        warehouseOptions,
      }),
    [
      allPurchaseReceiptItemOptions,
      inventoryLotOptions,
      materialOptions,
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
      filename: `quality-inspections-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: exportColumns,
      rows,
    })
  }, [exportColumns, rows])

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      resultFilter ||
      purchaseReceiptFilter ||
      materialFilter ||
      warehouseFilter ||
      lotFilter ||
      dateFilterStart ||
      dateFilterEnd ||
      routePurchaseOrderID ||
      routePurchaseReceiptID
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setResultFilter('')
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
        title="来料质检"
        description="来料质检当前承接质检判定；提交质检会冻结材料批次，合格 / 让步接收放回可用，不合格置为不可用。质检状态变化不写库存流水，不合格退供应商仍走采购退货。"
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
          { key: 'current', label: '当前结果', value: rows.length },
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
              searchHint="可搜索：质检单号、入库单、批次"
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
          boundaryText="提交 / 判定 / 取消只调用后端 QualityUsecase；前端不本地改批次状态，不写库存流水。"
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
            title="确认提交质检并将批次置为 HOLD？"
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
        emptyDescription="暂无来料质检单"
      />

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="来料质检列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
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
                  selectedPurchaseReceipt.receipt_no ||
                  selectedPurchaseReceipt.id
                }`}
                description={
                  <Space direction="vertical" size={2}>
                    <Text>
                      {[
                        `供应商：${selectedPurchaseReceipt.supplier_name || '-'}`,
                        `状态：${selectedPurchaseReceipt.status || '-'}`,
                        selectedPurchaseReceiptItem
                          ? `来源行：${
                              selectedPurchaseReceiptItem.source_line_no ||
                              selectedPurchaseReceiptItem.id
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
                      当前质检单按采购入库行建单；本次送检数量和已检数量还没有后端字段，不在前端伪造。
                    </Text>
                  </Space>
                }
              />
            ) : null}
            <QualityInspectionCreateForm
              form={inspectionForm}
              purchaseReceiptOptions={purchaseReceiptOptions}
              purchaseReceiptItemOptions={purchaseReceiptItemOptions}
              inventoryLotOptions={inventoryLotOptions}
              materialOptions={materialOptions}
              warehouseOptions={warehouseOptions}
              onReceiptChange={handleReceiptChange}
              onReceiptItemChange={handleReceiptItemChange}
              onInventoryLotChange={handleInventoryLotChange}
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
          description="上传不良照片、检验报告、让步说明或批次异常证据；附件不替代质检状态动作。"
          canUpload={canCreate || canUpdate}
          canDelete={canUpdate}
          variant="inline"
        />
      </BusinessFormModal>
    </BusinessPageLayout>
  )
}
