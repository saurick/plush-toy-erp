import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Form } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  BusinessDataTable,
  CollaborationTaskPanel,
  BusinessPageLayout,
  PageHeaderCard,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  ColumnOrderHeaderMenu,
  ColumnOrderModal,
} from '../components/business-list/ColumnOrderModal.jsx'
import { useBusinessRowItemsPreview } from '../components/business-list/BusinessRowItemsPreview.jsx'
import BusinessDetailsModal from '../components/business-list/BusinessDetailsModal.jsx'
import SourceOrderLifecycleConfirmContent from '../components/business-list/SourceOrderLifecycleConfirmContent.jsx'
import {
  createBlankPurchaseLine,
  normalizePurchaseLineFormValue,
} from '../components/purchase-orders/PurchaseOrderForm.jsx'
import PurchaseOrderBusinessModal from '../components/purchase-orders/PurchaseOrderBusinessModal.jsx'
import PurchaseOrderInboundDraftModal from '../components/purchase-orders/PurchaseOrderInboundDraftModal.jsx'
import PurchaseOrderOperationPanel from '../components/purchase-orders/PurchaseOrderOperationPanel.jsx'
import { buildPurchaseOrderColumns } from '../components/purchase-orders/purchaseOrderColumns.jsx'
import {
  listAllMaterials,
  listAllContactsByOwner,
  listAllPurchaseOrderItems,
  listAllPurchaseOrders,
  listPurchaseOrderItemsPreview,
  listPurchaseOrders,
  getPurchaseOrder,
  listAllSuppliers,
  listAllUnits,
  listAllWarehouses,
  savePurchaseOrderWithItems,
} from '../api/masterDataOrderApi.mjs'
import {
  buildPurchaseOrderStats,
  buildSelectedPurchaseOrderItems,
  canCreateInboundDraftFromPurchaseOrder,
  canEditPurchaseOrderSelection,
  getSingleSelectedPurchaseOrder,
  PURCHASE_ORDER_LIFECYCLE_ACTIONS,
  PURCHASE_ORDERS_MODULE_KEY,
  selectedPurchaseOrderDisplayText,
  todayInputValue,
} from '../components/purchase-orders/purchaseOrderPageConfig.mjs'
import { usePurchaseOrderContractPrint } from '../components/purchase-orders/usePurchaseOrderContractPrint.mjs'
import { usePurchaseOrderInboundDraft } from '../components/purchase-orders/usePurchaseOrderInboundDraft.mjs'
import { usePurchaseOrderWorkflowActions } from '../components/purchase-orders/usePurchaseOrderWorkflowActions.mjs'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import { listWorkflowTasks } from '../api/workflowApi.mjs'
import {
  V1_ROUTE_PATHS,
  buildPurchaseOrderItemSourceValuesFromMaterial,
  buildPurchaseOrderItemParams,
  buildPurchaseOrderParams,
  buildSequentialDraftCode,
  contractPartySnapshotFromPrintTemplateDefaults,
  buildSupplierSnapshot,
  buildSupplierSnapshotWithContacts,
  canRunPurchaseOrderLifecycleAction,
  formatUnixDate,
  hasActionPermission,
  PURCHASE_ORDER_ITEM_STATUS_LABELS,
  statusText,
  SUPPLIER_CONTACT_OWNER_TYPE,
  unixToDateInputValue,
} from '../utils/masterDataOrderView.mjs'
import {
  filterBusinessCollaborationTasksBySource,
  loadBusinessCollaborationTasksForSource,
} from '../utils/businessCollaborationTasks.mjs'
import {
  commitSourceDocumentSaveResult,
  createSourceDocumentOpenEditController,
  isMutationResultUnknown,
  isResourceVersionConflict,
  openSourceDocumentEditWithAccessGate,
  selectOpenSourceDocumentItems,
  settleSourceDocumentPostSaveEffect,
} from '../utils/sourceDocumentMutation.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../utils/moduleTableColumns.mjs'
import {
  getPreferredColumnOrder,
  parseBusinessSortValue,
  writeStoredColumnOrder,
} from '../utils/businessTableActions.mjs'
import {
  referenceLabel,
  supplierOption,
  uniqueReferenceOptions,
  unitOption,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
import { getEffectivePrintTemplateDefaults } from '../utils/adminProfileSync.mjs'
import { searchParamPositiveInt } from '../utils/routeQuery.mjs'
import {
  canOpenRelatedDocumentPath,
  clearLinkedDocumentParams,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
  relatedDocumentRoute,
} from '../utils/relatedDocumentNavigation.mjs'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import { resolveExactRecordPage } from '../utils/businessPagination.mjs'
import { resolveBusinessLifecycleActions } from '../utils/businessActionAvailability.mjs'
import { createSourceBusinessActionAttemptStore } from '../utils/sourceBusinessAction.mjs'
import {
  normalizeSourceOrderLifecycleReason,
  prepareSourceOrderLifecycleAttempt,
} from '../utils/sourceOrderLifecycleAction.mjs'
import { MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY } from '../utils/printWorkspace.js'
import {
  LIFECYCLE_SCOPE,
  lifecycleScopeFromSearchParams,
  lifecycleScopeIncludesStatus,
  withLifecycleScopeSearchParam,
} from '../utils/lifecycleScope.mjs'

export default function V1PurchaseOrdersPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const activeCustomerKey = useMemo(
    () => adminProfile?.effective_session?.customer?.key || '',
    [adminProfile]
  )
  const [form] = Form.useForm()
  const [inboundDraftForm] = Form.useForm()
  const canRead = hasActionPermission(adminProfile, 'purchase.order.read')
  const canCreate = hasActionPermission(adminProfile, 'purchase.order.create')
  const canUpdate = hasActionPermission(adminProfile, 'purchase.order.update')
  const canCreatePurchaseReceipt = hasActionPermission(
    adminProfile,
    'purchase.receipt.create'
  )
  const canReadWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.read'
  )
  const canUpdateWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.update'
  )
  const canCompleteWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.complete'
  )

  const [loading, setLoading] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [workflowTasks, setWorkflowTasks] = useState([])
  const [workflowTaskLoadState, setWorkflowTaskLoadState] = useState('idle')
  const workflowTaskSourceIDRef = useRef(0)
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const selectedRowKeysRef = useRef([])
  const lifecycleInFlightRef = useRef(false)
  const lifecycleAttemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [materials, setMaterials] = useState([])
  const [units, setUnits] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [referenceDataState, setReferenceDataState] = useState('loading')
  const [inboundReferenceDataState, setInboundReferenceDataState] =
    useState('loading')
  const [keyword, setKeyword] = useState('')
  const [lifecycleScope, setLifecycleScope] = useState(() =>
    lifecycleScopeFromSearchParams(searchParams)
  )
  const [status, setStatus] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateFilterField, setDateFilterField] = useState('purchase_date')
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [sortValue, setSortValue] = useState('updated_at:desc')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [editingOrder, setEditingOrder] = useState(null)
  const [detailOrder, setDetailOrder] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const orderAttachmentRef = useRef(null)
  const routePurchaseOrderID = searchParamPositiveInt(
    searchParams,
    'purchase_order_id'
  )
  const linkedKeyword = linkedDocumentContext(searchParams).keyword
  const resolvedRouteKeyword =
    routePurchaseOrderID &&
    Number(selectedOrder?.id || 0) === Number(routePurchaseOrderID)
      ? String(selectedOrder?.purchase_order_no || '').trim()
      : ''
  const allowedMenuPaths = useMemo(
    () => outletContext?.allowedMenuPaths || [],
    [outletContext?.allowedMenuPaths]
  )
  const canOpenRelatedPath = useCallback(
    (path) =>
      canOpenRelatedDocumentPath({
        path,
        adminProfile,
        allowedMenuPaths,
      }),
    [adminProfile, allowedMenuPaths]
  )
  const supplierOptions = useMemo(
    () => uniqueReferenceOptions(suppliers, supplierOption),
    [suppliers]
  )

  const applySelectedRowKeys = useCallback((nextKeys = []) => {
    const normalizedKeys = Array.isArray(nextKeys) ? nextKeys : []
    selectedRowKeysRef.current = normalizedKeys
    setSelectedRowKeys(normalizedKeys)
  }, [])

  const beginLatestRequest = useLatestRequestCoordinator()
  const sourceDocumentOpenEditController = useMemo(
    () =>
      createSourceDocumentOpenEditController({
        beginLatestRequest,
        setLoading: setItemsLoading,
      }),
    [beginLatestRequest]
  )

  const unitOptions = useMemo(
    () => uniqueReferenceOptions(units, unitOption),
    [units]
  )
  const getPurchaseOrderItemFields = useCallback(
    (item, { view }) => [
      { label: '下单材料编码', value: item?.material_code_snapshot },
      { label: '下单材料名称', value: item?.material_name_snapshot },
      { label: '下单颜色', value: item?.color_snapshot },
      { label: '产品订单编号', value: item?.product_order_no_snapshot },
      { label: '产品编号', value: item?.product_no_snapshot },
      { label: '产品名称', value: item?.product_name_snapshot },
      { label: '采购数量', value: item?.purchased_quantity },
      {
        label: '单位',
        value: referenceLabel(unitOptions, item?.unit_id, '单位'),
      },
      { label: '单价', value: item?.unit_price },
      { label: '金额', value: item?.amount },
      {
        label: '预计到货日期',
        value: formatUnixDate(item?.expected_arrival_date),
      },
      {
        label: '行状态',
        value: statusText(
          item?.line_status,
          PURCHASE_ORDER_ITEM_STATUS_LABELS,
          '明细状态待核对'
        ),
      },
      ...(view !== 'preview'
        ? [{ label: '备注', value: item?.note, wide: true }]
        : []),
    ],
    [unitOptions]
  )
  const loadPurchaseOrderItemsPreview = useCallback(
    async (order, { signal }) => {
      const data = await listPurchaseOrderItemsPreview(
        {
          purchase_order_id: order.id,
          expected_version: order.version,
        },
        { signal }
      )
      return {
        items: data?.purchase_order_items,
        total: data?.total,
      }
    },
    []
  )
  const loadAllPurchaseOrderItemsForPreview = useCallback(
    async (order, { signal }) => {
      const data = await listAllPurchaseOrderItems(
        {
          purchase_order_id: order.id,
          expected_version: order.version,
        },
        { signal }
      )
      return {
        items: data?.purchase_order_items,
        total: data?.total,
      }
    },
    []
  )
  const purchaseOrderItemsPreview = useBusinessRowItemsPreview({
    records: orders,
    getItemTotal: (order) => order?.item_count,
    rowExpandable: (order) =>
      canRead && Number(order?.id || 0) > 0 && Number(order?.version || 0) > 0,
    loadPreview: loadPurchaseOrderItemsPreview,
    loadAll: loadAllPurchaseOrderItemsForPreview,
    getItemFields: getPurchaseOrderItemFields,
    getItemLabel: (item, { index }) => `明细 ${item?.line_no || index + 1}`,
    getItemSummary: (item) =>
      [item?.material_code_snapshot, item?.material_name_snapshot]
        .filter(Boolean)
        .join(' / '),
    getRecordLabel: (order) => order?.purchase_order_no || '当前采购订单',
    modalTitle: '采购订单全部明细',
    emptyDescription: '当前采购订单暂无明细',
  })
  const warehouseOptions = useMemo(
    () => uniqueReferenceOptions(warehouses, warehouseOptionFromRecord),
    [warehouses]
  )

  const loadReferenceData = useCallback(async () => {
    const request = beginLatestRequest('reference-data')
    setReferenceDataState('loading')
    try {
      const [supplierData, materialData, unitData] = await Promise.all([
        listAllSuppliers({ active_only: true }, { signal: request.signal }),
        listAllMaterials({ active_only: true }, { signal: request.signal }),
        listAllUnits({}, { signal: request.signal }),
      ])
      if (!request.isCurrent()) return false
      setSuppliers(supplierData?.suppliers || [])
      setMaterials(materialData?.materials || [])
      setUnits(unitData?.units || [])
      setReferenceDataState('ready')
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return false
      setReferenceDataState('error')
      message.error(getActionErrorMessage(error, '加载采购基础资料失败'))
      return false
    } finally {
      if (request.isCurrent()) request.finish()
    }
  }, [beginLatestRequest])

  const loadInboundReferenceData = useCallback(async () => {
    const request = beginLatestRequest('inbound-reference-data')
    setInboundReferenceDataState('loading')
    try {
      const warehouseData = await listAllWarehouses(
        { active_only: true },
        { signal: request.signal }
      )
      if (!request.isCurrent()) return false
      setWarehouses(warehouseData?.warehouses || [])
      setInboundReferenceDataState('ready')
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return false
      setInboundReferenceDataState('error')
      message.error(getActionErrorMessage(error, '加载采购入库仓库资料失败'))
      return false
    } finally {
      if (request.isCurrent()) request.finish()
    }
  }, [beginLatestRequest])

  const orderListParams = useMemo(() => {
    const { sortBy, sortDirection } = parseBusinessSortValue(sortValue)
    return {
      keyword: linkedDocumentRequestKeyword({
        localKeyword: keyword,
        linkedKeyword,
        hasExactContext: Boolean(routePurchaseOrderID),
      }),
      supplier_id: supplierFilter || undefined,
      lifecycle_status: status,
      lifecycle_scope: lifecycleScope,
      date_field: dateFilterField,
      date_from: dateFilterStart || undefined,
      date_to: dateFilterEnd || undefined,
      sort_by: sortBy,
      sort_direction: sortDirection,
    }
  }, [
    dateFilterEnd,
    dateFilterField,
    dateFilterStart,
    keyword,
    linkedKeyword,
    lifecycleScope,
    routePurchaseOrderID,
    sortValue,
    status,
    supplierFilter,
  ])

  const loadOrders = useCallback(async () => {
    const request = beginLatestRequest('orders')
    setLoading(true)
    try {
      const routeSelectedID = Number(routePurchaseOrderID || 0)
      const [data, routeOrder] = await Promise.all([
        listPurchaseOrders(
          {
            ...orderListParams,
            limit: pagination.pageSize,
            offset: (pagination.current - 1) * pagination.pageSize,
          },
          { signal: request.signal }
        ),
        routeSelectedID > 0
          ? getPurchaseOrder(
              { id: routeSelectedID },
              { signal: request.signal }
            )
          : Promise.resolve(null),
      ])
      if (!request.isCurrent()) {
        return false
      }
      const listedOrders = data?.purchase_orders || []
      const exactPage = resolveExactRecordPage({
        records: listedOrders,
        exactRecord: routeOrder,
        hasExactContext: routeSelectedID > 0,
        total: Number(data?.total || 0),
      })
      const nextOrders = exactPage.records
      setOrders(nextOrders)
      setTotal(exactPage.total)
      if (routeSelectedID > 0) {
        applySelectedRowKeys(routeOrder ? [routeSelectedID] : [])
        setSelectedOrder(routeOrder)
        return true
      }
      const validKeys = selectedRowKeysRef.current.filter((key) =>
        nextOrders.some((item) => item.id === key)
      )
      applySelectedRowKeys(validKeys)
      if (validKeys.length === 1) {
        setSelectedOrder(nextOrders.find((item) => item.id === validKeys[0]))
      } else {
        setSelectedOrder(null)
      }
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return false
      }
      message.error(getActionErrorMessage(error, '加载采购订单失败'))
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    applySelectedRowKeys,
    beginLatestRequest,
    orderListParams,
    pagination,
    routePurchaseOrderID,
  ])

  const loadWorkflowTasks = useCallback(
    (sourceID) => {
      const requestedSourceID = Number(
        sourceID ?? workflowTaskSourceIDRef.current ?? 0
      )
      return loadBusinessCollaborationTasksForSource({
        beginLatestRequest,
        canRead: canReadWorkflowTasks,
        isAbortError: isRpcAbortError,
        isCurrentSource: (candidateSourceID) =>
          candidateSourceID === workflowTaskSourceIDRef.current,
        listTasks: listWorkflowTasks,
        onError: (error) =>
          message.error(
            getActionErrorMessage(error, '加载当前采购订单任务失败')
          ),
        setLoadState: setWorkflowTaskLoadState,
        setTasks: setWorkflowTasks,
        sourceID: requestedSourceID,
        sourceType: PURCHASE_ORDERS_MODULE_KEY,
      })
    },
    [beginLatestRequest, canReadWorkflowTasks]
  )
  const {
    blockWorkflowTask,
    completeWorkflowTask,
    rejectWorkflowTask,
    resumeWorkflowTask,
    urgePurchaseWorkflowTask,
  } = usePurchaseOrderWorkflowActions({ loadWorkflowTasks })

  const loadOrderItems = useCallback(async (order, options = {}) => {
    if (!order?.id) {
      throw new Error('缺少采购订单，无法加载明细')
    }
    const data = await listAllPurchaseOrderItems(
      {
        purchase_order_id: order.id,
        expected_version: order.version,
      },
      options
    )
    return data.purchase_order_items
  }, [])

  const loadPrintReferenceData = useCallback(async () => {
    const [materialData, unitData] = await Promise.all([
      listAllMaterials({ active_only: true }),
      listAllUnits(),
    ])
    const nextMaterials = materialData?.materials || []
    const nextUnits = unitData?.units || []
    if (nextMaterials.length > 0) {
      setMaterials(nextMaterials)
    }
    if (nextUnits.length > 0) {
      setUnits(nextUnits)
    }
    return {
      materials: nextMaterials.length > 0 ? nextMaterials : materials,
      unitOptions:
        nextUnits.length > 0
          ? uniqueReferenceOptions(nextUnits, unitOption)
          : unitOptions,
    }
  }, [materials, unitOptions])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
    loadInboundReferenceData()
  }, [loadInboundReferenceData])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const refreshPageData = useCallback(async () => {
    const [ordersOK, referencesOK, inboundReferencesOK, workflowResult] =
      await Promise.all([
        loadOrders(),
        loadReferenceData(),
        loadInboundReferenceData(),
        loadWorkflowTasks(),
      ])
    return (
      ordersOK !== false &&
      referencesOK !== false &&
      inboundReferencesOK !== false &&
      workflowResult?.status !== 'error'
    )
  }, [
    loadInboundReferenceData,
    loadOrders,
    loadReferenceData,
    loadWorkflowTasks,
  ])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPageData)
  }, [outletContext, refreshPageData])

  const openCreateModal = () => {
    if (referenceDataState !== 'ready') {
      message.warning(
        referenceDataState === 'loading'
          ? '采购基础资料正在加载，请稍后再新建采购订单'
          : '采购基础资料加载失败，请先刷新当前页后重试'
      )
      return
    }
    sourceDocumentOpenEditController.invalidate()
    orderAttachmentRef.current?.clearPendingAttachments()
    setEditingOrder(null)
    form.setFieldsValue({
      purchase_order_no: buildSequentialDraftCode(orders, {
        prefix: 'PO',
        field: 'purchase_order_no',
      }),
      supplier_id: undefined,
      supplier_purchase_order_no: '',
      purchase_date: todayInputValue(),
      expected_arrival_date: '',
      contract_party_snapshot: contractPartySnapshotFromPrintTemplateDefaults(
        purchasePrintTemplateDefaults,
        MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY
      ),
      note: '',
      items: [createBlankPurchaseLine(1)],
    })
    setModalOpen(true)
  }

  const openEditModal = async (record) => {
    if (referenceDataState !== 'ready') {
      message.warning(
        referenceDataState === 'loading'
          ? '采购基础资料正在加载，请稍后再编辑采购订单'
          : '采购基础资料加载失败，请先刷新当前页后重试'
      )
      return
    }
    const editResult = await openSourceDocumentEditWithAccessGate({
      canUpdate,
      document: record,
      invalidatePending: () => sourceDocumentOpenEditController.invalidate(),
      isEditable: (order) =>
        canEditPurchaseOrderSelection({ canUpdate: true, order }),
      open: () =>
        sourceDocumentOpenEditController.open({
          loadItems: ({ signal }) => loadOrderItems(record, { signal }),
          enterEditing: (lines) => {
            const openLines = selectOpenSourceDocumentItems(lines).map(
              normalizePurchaseLineFormValue
            )
            orderAttachmentRef.current?.clearPendingAttachments()
            setEditingOrder(record)
            form.setFieldsValue({
              purchase_order_no: record.purchase_order_no || '',
              supplier_id: record.supplier_id,
              supplier_purchase_order_no:
                record.supplier_purchase_order_no || '',
              supplier_snapshot:
                record.supplier_snapshot &&
                typeof record.supplier_snapshot === 'object'
                  ? record.supplier_snapshot
                  : {},
              purchase_date: unixToDateInputValue(record.purchase_date),
              expected_arrival_date: unixToDateInputValue(
                record.expected_arrival_date
              ),
              contract_party_snapshot:
                record.contract_party_snapshot &&
                typeof record.contract_party_snapshot === 'object'
                  ? record.contract_party_snapshot
                  : contractPartySnapshotFromPrintTemplateDefaults(
                      purchasePrintTemplateDefaults,
                      MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY
                    ),
              note: record.note || '',
              items:
                openLines.length > 0 ? openLines : [createBlankPurchaseLine(1)],
            })
            setModalOpen(true)
          },
        }),
    })
    if (editResult.status === 'blocked') {
      if (editResult.reason === 'forbidden') {
        message.warning('当前账号没有编辑采购订单的权限。')
      } else if (editResult.reason === 'not_editable') {
        message.warning('采购订单提交后已冻结，不能继续编辑。')
      }
      return
    }
    if (editResult.status === 'load_failed') {
      message.error(
        `${getActionErrorMessage(
          editResult.error,
          '加载采购订单明细失败'
        )}，未进入编辑`
      )
    }
  }

  const openPurchaseOrderDetails = (record) => {
    if (!record?.id) return
    sourceDocumentOpenEditController.invalidate()
    applySelectedRowKeys([record.id])
    setSelectedOrder(record)
    setDetailOrder(record)
  }

  const openPurchaseOrderRecord = (record) => {
    if (!record?.id) return
    applySelectedRowKeys([record.id])
    setSelectedOrder(record)
    if (canEditPurchaseOrderSelection({ canUpdate, order: record })) {
      setDetailOrder(null)
      openEditModal(record)
      return
    }
    openPurchaseOrderDetails(record)
  }

  const resolveSupplierSnapshot = useCallback(
    async (supplier, options = {}) => {
      const baseSnapshot = buildSupplierSnapshot(supplier)
      if (!supplier?.id) {
        return baseSnapshot
      }
      try {
        const data = await listAllContactsByOwner({
          owner_type: SUPPLIER_CONTACT_OWNER_TYPE,
          owner_id: supplier.id,
          active_only: true,
        })
        return buildSupplierSnapshotWithContacts(supplier, data?.contacts || [])
      } catch (error) {
        if (options.notifyOnError) {
          message.warning(
            `${getActionErrorMessage(error, '加载供应商联系人')}，将仅保存供应商基本信息`
          )
        }
        return baseSnapshot
      }
    },
    []
  )

  const handleSupplierChange = (supplierID) => {
    const supplier = suppliers.find((item) => item.id === supplierID)
    form.setFieldValue('supplier_snapshot', buildSupplierSnapshot(supplier))
    resolveSupplierSnapshot(supplier).then((snapshot) => {
      if (
        String(form.getFieldValue('supplier_id') ?? '') !==
        String(supplierID ?? '')
      ) {
        return
      }
      form.setFieldValue('supplier_snapshot', snapshot)
    })
  }

  const handleMaterialChange = (fieldName, materialID) => {
    const material = materials.find((item) => item.id === materialID)
    const sourceValues =
      buildPurchaseOrderItemSourceValuesFromMaterial(material)
    form.setFields([
      { name: ['items', fieldName, 'unit_id'], value: sourceValues.unit_id },
      {
        name: ['items', fieldName, 'material_code_snapshot'],
        value: sourceValues.material_code_snapshot,
      },
      {
        name: ['items', fieldName, 'material_name_snapshot'],
        value: sourceValues.material_name_snapshot,
      },
      {
        name: ['items', fieldName, 'color_snapshot'],
        value: sourceValues.color_snapshot,
      },
    ])
  }

  const handleSave = async () => {
    if (referenceDataState !== 'ready') {
      message.warning('采购基础资料尚未就绪，本次未保存，请刷新后重试')
      return
    }
    const isCreatingOrder = !editingOrder?.id
    setSaving(true)
    try {
      let params
      try {
        const values = await form.validateFields()
        const supplier = suppliers.find(
          (item) => item.id === values.supplier_id
        )
        const supplierSnapshot = await resolveSupplierSnapshot(supplier, {
          notifyOnError: true,
        })
        params = buildPurchaseOrderParams(values, {
          id: editingOrder?.id,
          expected_version: editingOrder?.id ? editingOrder.version : undefined,
          supplier_snapshot: supplierSnapshot,
          items: (values.items || []).map((line, index) =>
            buildPurchaseOrderItemParams(line, {
              id: line.id,
              line_no: Number(line.line_no || index + 1),
            })
          ),
        })
      } catch (error) {
        if (!error?.errorFields) {
          message.error(getActionErrorMessage(error, '准备采购订单保存'))
        }
        return
      }

      const saveResult = await commitSourceDocumentSaveResult({
        save: async () => {
          const result = await savePurchaseOrderWithItems(params)
          return result.purchase_order
        },
        bindSaved: (savedOrder) => {
          setEditingOrder(savedOrder)
          setSelectedOrder(savedOrder)
          applySelectedRowKeys([savedOrder.id])
        },
      })
      if (saveResult.status === 'save_failed') {
        const saveError = saveResult.error
        if (isResourceVersionConflict(saveError)) {
          message.warning(
            '该单据已被其他人更新，本次内容没有覆盖最新数据。请核对最新单据后再保存。'
          )
        } else if (isMutationResultUnknown(saveError)) {
          message.warning(
            '保存结果尚未确认，请先核对该单据的最新状态，不要连续重复提交。'
          )
        } else {
          message.error(getActionErrorMessage(saveError, '保存采购订单失败'))
        }
        return
      }

      const { saved } = saveResult
      const attachmentEffect = await settleSourceDocumentPostSaveEffect(() =>
        orderAttachmentRef.current?.flushPendingAttachments(saved.id)
      )
      const attachmentSaved =
        attachmentEffect.status === 'fulfilled' &&
        attachmentEffect.value !== false
      if (attachmentEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(attachmentEffect.error, '上传采购订单附件')
        )
      }
      orderAttachmentRef.current?.clearPendingAttachments()
      setModalOpen(false)
      message.success(
        attachmentSaved
          ? '采购订单已保存'
          : '采购订单已保存，未上传的附件请重新选择'
      )
      const detailEffect = await settleSourceDocumentPostSaveEffect(() =>
        loadOrderItems(saved)
      )
      if (detailEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(detailEffect.error, '刷新采购订单明细')
        )
      }
      if (isCreatingOrder) {
        setPagination((current) => ({ ...current, current: 1 }))
      } else {
        const refreshEffect =
          await settleSourceDocumentPostSaveEffect(loadOrders)
        if (refreshEffect.status === 'rejected') {
          message.warning(
            getActionErrorMessage(refreshEffect.error, '刷新采购订单列表')
          )
        }
      }
    } finally {
      setSaving(false)
    }
  }

  const runLifecycleAction = async (action, record, reason = '') => {
    if (lifecycleInFlightRef.current || !action || !record) {
      return
    }
    lifecycleInFlightRef.current = true
    setSaving(true)
    let lifecycleAttempt = null
    try {
      let params = { id: record.id }
      if (action.sourceLifecycle) {
        lifecycleAttempt = prepareSourceOrderLifecycleAttempt({
          action,
          attemptStore: lifecycleAttemptsRef.current,
          customerKey: activeCustomerKey,
          reason,
          record,
        })
        params = lifecycleAttempt.attempt.params
      }
      const updated = await action.run(params)
      if (lifecycleAttempt) {
        lifecycleAttemptsRef.current.settle(
          lifecycleAttempt.scope,
          lifecycleAttempt.attempt,
          null
        )
      }
      message.success(action.successMessage || `采购订单已${action.label}`)
      if (updated && action.returnsRecord !== false) {
        setSelectedOrder(updated)
        applySelectedRowKeys([updated.id])
        const detailEffect = await settleSourceDocumentPostSaveEffect(() =>
          loadOrderItems(updated)
        )
        if (detailEffect.status === 'rejected') {
          message.warning(
            getActionErrorMessage(detailEffect.error, '刷新采购订单明细')
          )
        }
      }
      const refreshEffect = await settleSourceDocumentPostSaveEffect(loadOrders)
      if (refreshEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(refreshEffect.error, '刷新采购订单列表')
        )
      }
    } catch (error) {
      const resultUnknown = lifecycleAttempt
        ? lifecycleAttemptsRef.current.settle(
            lifecycleAttempt.scope,
            lifecycleAttempt.attempt,
            error
          )
        : false
      if (resultUnknown) {
        message.warning(
          '暂时无法确认订单是否处理成功，请刷新核对最新状态；内容不变时可安全重试'
        )
      } else {
        message.error(
          getActionErrorMessage(error, `${action.label}采购订单失败`)
        )
      }
    } finally {
      lifecycleInFlightRef.current = false
      setSaving(false)
    }
  }

  const requestLifecycleAction = (action, record) => {
    if (!action || !record || lifecycleInFlightRef.current || saving) {
      return
    }
    if (!action.confirmTitle) {
      runLifecycleAction(action, record)
      return
    }
    let reason = ''
    modal.confirm({
      centered: true,
      title: action.confirmTitle,
      content: (
        <SourceOrderLifecycleConfirmContent
          action={action}
          onReasonChange={(value) => {
            reason = value
          }}
        />
      ),
      okText: action.okText || `确认${action.label}`,
      cancelText: '取消',
      okButtonProps: action.danger ? { danger: true } : undefined,
      onOk: () => {
        try {
          normalizeSourceOrderLifecycleReason(action, reason)
        } catch (error) {
          message.warning(error.message)
          return Promise.reject()
        }
        return runLifecycleAction(action, record, reason)
      },
    })
  }

  const resolveSupplierName = useCallback(
    (record = {}) => {
      const source = record || {}
      return (
        source?.supplier_snapshot?.name ||
        suppliers.find((item) => item.id === source.supplier_id)?.name ||
        (source.supplier_id ? '供应商已关联' : '') ||
        '未指定供应商'
      )
    },
    [suppliers]
  )

  const persistColumnOrder = useCallback(
    async (nextOrder, columnsForOrder) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        columnsForOrder
      )
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(PURCHASE_ORDERS_MODULE_KEY, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: PURCHASE_ORDERS_MODULE_KEY,
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

  const dataColumns = useMemo(
    () => buildPurchaseOrderColumns({ resolveSupplierName }),
    [resolveSupplierName]
  )

  const preferredColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: PURCHASE_ORDERS_MODULE_KEY,
        columns: dataColumns,
        localOrder: columnOrder,
      }),
    [adminProfile, columnOrder, dataColumns]
  )

  const visibleDataColumns = useMemo(
    () => applyModuleColumnOrder(dataColumns, preferredColumnOrder),
    [dataColumns, preferredColumnOrder]
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

  const loadExportOrders = useCallback(
    async ({ signal }) => {
      const routeSelectedID = Number(routePurchaseOrderID || 0)
      if (routeSelectedID > 0) {
        const order = await getPurchaseOrder(
          { id: routeSelectedID },
          { signal }
        )
        return order ? [order] : []
      }
      const result = await listAllPurchaseOrders(orderListParams, { signal })
      return result?.purchase_orders
    },
    [orderListParams, routePurchaseOrderID]
  )
  const { exporting, exportRows: exportOrders } = useBusinessListExport({
    requestKey: 'purchase-orders-export',
    loadRows: loadExportOrders,
    filename: `采购订单-${currentBusinessDate()}.csv`,
    columns: visibleDataColumns,
    recordLabel: '采购订单',
  })

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      linkedKeyword ||
      routePurchaseOrderID ||
      lifecycleScope !== LIFECYCLE_SCOPE.CURRENT ||
      status ||
      supplierFilter ||
      dateFilterStart ||
      dateFilterEnd
  )
  const clearRouteContext = useCallback(
    (resetScope = false) => {
      const nextParams = clearLinkedDocumentParams(searchParams)
      nextParams.delete('purchase_order_id')
      setSearchParams(
        resetScope
          ? withLifecycleScopeSearchParam(nextParams, LIFECYCLE_SCOPE.CURRENT)
          : nextParams,
        { replace: true }
      )
      setPagination((current) => ({ ...current, current: 1 }))
    },
    [searchParams, setSearchParams]
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setLifecycleScope(LIFECYCLE_SCOPE.CURRENT)
    setStatus('')
    setSupplierFilter('')
    setDateFilterField('purchase_date')
    setDateFilterStart('')
    setDateFilterEnd('')
    setPagination((current) => ({ ...current, current: 1 }))
    clearRouteContext(true)
  }, [clearRouteContext])

  const selectedOrders = useMemo(
    () => orders.filter((record) => selectedRowKeys.includes(record.id)),
    [orders, selectedRowKeys]
  )
  const singleSelectedOrder = getSingleSelectedPurchaseOrder({
    selectedOrder,
    selectedOrders,
    selectedRowKeys,
  })
  useEffect(() => {
    const sourceID = Number(singleSelectedOrder?.id || 0)
    workflowTaskSourceIDRef.current = sourceID
    loadWorkflowTasks(sourceID)
  }, [loadWorkflowTasks, singleSelectedOrder?.id])
  useEffect(
    () => () => {
      workflowTaskSourceIDRef.current = 0
    },
    []
  )
  const purchasePrintTemplateDefaults = useMemo(
    () =>
      getEffectivePrintTemplateDefaults(
        adminProfile,
        MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY
      ),
    [adminProfile]
  )
  const { printPurchaseContract, printingContract } =
    usePurchaseOrderContractPrint({
      loadOrderItems,
      loadPrintReferenceData,
      materials,
      printTemplateDefaults: purchasePrintTemplateDefaults,
      resolveSupplierSnapshot,
      suppliers,
      unitOptions,
      customerKey: activeCustomerKey,
    })
  const {
    closeInboundDraftModal,
    createInboundDraftFromOrder,
    generatingInboundDraft,
    hasInboundDraftRemaining,
    inboundDraftModalOpen,
    inboundDraftPreviewLoading,
    inboundDraftPreviewRows,
    openInboundDraftModal: openInboundDraftModalWithReadySource,
  } = usePurchaseOrderInboundDraft({
    form: inboundDraftForm,
    loadOrderItems,
    materials,
    navigate,
    selectedOrder: singleSelectedOrder,
    unitOptions,
  })
  const recordActionBusy =
    saving || generatingInboundDraft || printingContract || itemsLoading
  const inboundReferenceDataReady = inboundReferenceDataState === 'ready'
  const hasInboundWarehouse = warehouseOptions.length > 0
  const openInboundDraftModal = useCallback(
    (record) => {
      if (!inboundReferenceDataReady) {
        message.warning(
          inboundReferenceDataState === 'loading'
            ? '入库仓库资料正在加载，请稍后再生成采购入库草稿'
            : '入库仓库资料加载失败，请先刷新当前页后重试'
        )
        return
      }
      if (!hasInboundWarehouse) {
        message.warning('请先维护至少一个启用的入库仓库')
        return
      }
      openInboundDraftModalWithReadySource(record)
    },
    [
      hasInboundWarehouse,
      inboundReferenceDataReady,
      inboundReferenceDataState,
      openInboundDraftModalWithReadySource,
    ]
  )
  const createInboundDraftWithReadySource = useCallback(() => {
    if (!inboundReferenceDataReady) {
      message.warning('入库仓库资料尚未就绪，本次未生成，请刷新后重试')
      return
    }
    if (!hasInboundWarehouse) {
      message.warning('请先维护至少一个启用的入库仓库')
      return
    }
    return createInboundDraftFromOrder()
  }, [
    createInboundDraftFromOrder,
    hasInboundWarehouse,
    inboundReferenceDataReady,
  ])
  const selectedOrderWorkflowTasks = useMemo(
    () =>
      singleSelectedOrder?.id
        ? filterBusinessCollaborationTasksBySource({
            tasks: workflowTasks,
            sourceType: PURCHASE_ORDERS_MODULE_KEY,
            sourceIDs: [singleSelectedOrder.id],
          })
        : [],
    [singleSelectedOrder, workflowTasks]
  )

  const stats = buildPurchaseOrderStats({
    orders,
    total,
  })
  const selectedOrderDisplayText = selectedPurchaseOrderDisplayText({
    resolveSupplierName,
    selectedOrders,
  })
  const selectedItems = buildSelectedPurchaseOrderItems({
    resolveSupplierName,
    selectedOrders,
  })
  const selectedOrderCanEdit = canEditPurchaseOrderSelection({
    canUpdate,
    order: singleSelectedOrder,
  })
  const canGenerateInboundDraft = canCreateInboundDraftFromPurchaseOrder({
    canCreatePurchaseReceipt,
    order: singleSelectedOrder,
  })
  const relatedMenuItems = useMemo(
    () =>
      [
        { key: 'order-items', label: '采购订单明细' },
        canOpenRelatedPath(V1_ROUTE_PATHS.purchaseReceipts)
          ? { key: 'purchase-receipts', label: '采购入库' }
          : null,
        canOpenRelatedPath(V1_ROUTE_PATHS.qualityInspections)
          ? { key: 'quality-inspections', label: '来料质检' }
          : null,
      ].filter(Boolean),
    [canOpenRelatedPath]
  )
  const openRelatedTable = ({ key }) => {
    if (!singleSelectedOrder) {
      return
    }
    if (key === 'order-items') {
      openPurchaseOrderDetails(singleSelectedOrder)
      return
    }
    if (key === 'purchase-receipts') {
      navigate(
        relatedDocumentRoute(
          V1_ROUTE_PATHS.purchaseReceipts,
          { purchase_order_id: singleSelectedOrder.id },
          {
            keyword: singleSelectedOrder.purchase_order_no,
            source: 'purchase-order',
            fields: ['purchase_order_no'],
          }
        )
      )
      return
    }
    if (key === 'quality-inspections') {
      navigate(
        relatedDocumentRoute(
          V1_ROUTE_PATHS.qualityInspections,
          { purchase_order_id: singleSelectedOrder.id },
          {
            keyword: singleSelectedOrder.purchase_order_no,
            source: 'purchase-order',
            fields: ['source_no'],
          }
        )
      )
    }
  }
  const lifecycleActions = useMemo(
    () =>
      resolveBusinessLifecycleActions({
        actions: PURCHASE_ORDER_LIFECYCLE_ACTIONS,
        selected: Boolean(singleSelectedOrder),
        busy: recordActionBusy,
        hasPermission: (action) =>
          hasActionPermission(adminProfile, action.permission),
        canRun: (action) =>
          canRunPurchaseOrderLifecycleAction(
            singleSelectedOrder?.lifecycle_status,
            action.nextStatus
          ),
        selectionReason: '请先选择一条采购订单',
        busyReason: '当前订单操作完成后可继续办理',
        getUnavailableReason: (action) => `当前采购订单状态不能${action.label}`,
      }),
    [adminProfile, recordActionBusy, singleSelectedOrder]
  )
  const {
    showPrimarySlot: showLifecyclePrimary,
    showMoreSlot: showLifecycleMore,
    primaryAction: primaryLifecycleAction,
    secondaryActions: secondaryLifecycleActions,
    actionStates: lifecycleActionStates,
  } = lifecycleActions

  return (
    <BusinessPageLayout className="erp-v1-purchase-orders-page">
      <PageHeaderCard
        title="采购订单"
        description="维护供应商采购承诺；采购入库、退货、质检或应付请到对应业务页面处理。"
        stats={stats}
        compact
      />

      <PurchaseOrderOperationPanel
        applySelectedRowKeys={applySelectedRowKeys}
        canCreate={canCreate}
        canCreateInboundDraftAction={canCreatePurchaseReceipt}
        canUpdate={canUpdate}
        referenceDataReady={referenceDataState === 'ready'}
        canGenerateInboundDraft={canGenerateInboundDraft}
        hasInboundWarehouse={hasInboundWarehouse}
        inboundReferenceDataState={inboundReferenceDataState}
        clearFilters={clearFilters}
        dateFilterEnd={dateFilterEnd}
        dateFilterField={dateFilterField}
        dateFilterStart={dateFilterStart}
        exportDisabled={loading || exporting || total === 0}
        exporting={exporting}
        exportOrders={exportOrders}
        generatingInboundDraft={generatingInboundDraft}
        hasActiveFilters={hasActiveFilters}
        itemsLoading={itemsLoading}
        keyword={resolvedRouteKeyword || linkedKeyword || keyword}
        lifecycleScope={lifecycleScope}
        onLifecycleScopeChange={(nextScope) => {
          setLifecycleScope(nextScope)
          if (
            !lifecycleScopeIncludesStatus(nextScope, status, [
              'closed',
              'canceled',
            ])
          ) {
            setStatus('')
          }
          const nextParams = clearLinkedDocumentParams(searchParams)
          nextParams.delete('purchase_order_id')
          setSearchParams(
            withLifecycleScopeSearchParam(nextParams, nextScope),
            { replace: true }
          )
          setPagination((current) => ({ ...current, current: 1 }))
        }}
        showLifecyclePrimary={showLifecyclePrimary}
        showLifecycleMore={showLifecycleMore}
        loadOrders={loadOrders}
        openCreateModal={openCreateModal}
        openEditModal={openEditModal}
        openInboundDraftModal={openInboundDraftModal}
        openRelatedTable={openRelatedTable}
        relatedMenuItems={relatedMenuItems}
        orders={orders}
        primaryLifecycleAction={primaryLifecycleAction}
        lifecycleActionStates={lifecycleActionStates}
        printPurchaseContract={printPurchaseContract}
        printingContract={printingContract}
        requestLifecycleAction={requestLifecycleAction}
        saving={saving}
        secondaryLifecycleActions={secondaryLifecycleActions}
        selectedItems={selectedItems}
        selectedOrderCanEdit={selectedOrderCanEdit}
        selectedOrderDisplayText={selectedOrderDisplayText}
        selectedRowKeys={selectedRowKeys}
        setColumnOrderOpen={setColumnOrderOpen}
        setDateFilterEnd={setDateFilterEnd}
        setDateFilterField={setDateFilterField}
        setDateFilterStart={setDateFilterStart}
        setKeyword={(nextKeyword) => {
          if (linkedKeyword || routePurchaseOrderID) {
            clearRouteContext()
          }
          setKeyword(nextKeyword)
        }}
        setPagination={setPagination}
        setSelectedOrder={setSelectedOrder}
        setSortValue={setSortValue}
        setStatus={setStatus}
        setSupplierFilter={setSupplierFilter}
        singleSelectedOrder={singleSelectedOrder}
        sortValue={sortValue}
        status={status}
        supplierFilter={supplierFilter}
        supplierOptions={supplierOptions}
      />

      <BusinessDataTable
        loading={loading}
        rowKey="id"
        columns={columns}
        dataSource={orders}
        expandable={purchaseOrderItemsPreview.expandable}
        scroll={{ x: 1200 }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys,
          getCheckboxProps: () => ({ disabled: recordActionBusy }),
          onChange: (nextKeys, nextRows) => {
            if (recordActionBusy) return
            applySelectedRowKeys(nextKeys)
            const nextSingle = nextKeys.length === 1 ? nextRows[0] : null
            if (nextSingle?.id) {
              setSelectedOrder(nextSingle)
            } else {
              setSelectedOrder(null)
            }
          },
        }}
        rowClassName={(record) =>
          selectedRowKeys.includes(record?.id) ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: (event) => {
            if (recordActionBusy) return
            if (
              event.target?.closest?.(
                '.ant-checkbox-wrapper, .ant-checkbox, .ant-radio-wrapper, .ant-radio, .ant-table-selection-column'
              )
            ) {
              return
            }
            applySelectedRowKeys([record.id])
            setSelectedOrder(record)
          },
        })}
        onOpenRecord={recordActionBusy ? undefined : openPurchaseOrderRecord}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        }}
        emptyDescription="暂无采购订单"
      />

      {purchaseOrderItemsPreview.modal}

      <BusinessDetailsModal
        columns={dataColumns}
        description="查看采购订单摘要和完整明细；草稿且具备编辑权限时，双击会直接进入编辑。"
        lineItems={
          canRead
            ? {
                emptyDescription: '当前采购订单暂无明细',
                getItemFields: getPurchaseOrderItemFields,
                getItemLabel: (item, { index }) =>
                  `明细 ${item?.line_no || index + 1}`,
                getItemSummary: (item) =>
                  [item?.material_code_snapshot, item?.material_name_snapshot]
                    .filter(Boolean)
                    .join(' / '),
                load: loadAllPurchaseOrderItemsForPreview,
                title: '采购订单明细',
              }
            : null
        }
        open={Boolean(detailOrder)}
        record={detailOrder}
        title="采购订单详情"
        onClose={() => setDetailOrder(null)}
      />

      <CollaborationTaskPanel
        tasks={
          canReadWorkflowTasks && workflowTaskLoadState === 'ready'
            ? selectedOrderWorkflowTasks
            : []
        }
        selectedRecordLabel={singleSelectedOrder?.purchase_order_no || ''}
        adminProfile={adminProfile}
        onOpenTaskBoard={() => navigate('/erp/task-board')}
        onCompleteTask={
          canCompleteWorkflowTasks ? completeWorkflowTask : undefined
        }
        onBlockTask={canUpdateWorkflowTasks ? blockWorkflowTask : undefined}
        onRejectTask={canUpdateWorkflowTasks ? rejectWorkflowTask : undefined}
        onResumeTask={canUpdateWorkflowTasks ? resumeWorkflowTask : undefined}
        onUrgeTask={
          canUpdateWorkflowTasks ? urgePurchaseWorkflowTask : undefined
        }
      />

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="采购订单列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />

      <PurchaseOrderBusinessModal
        open={modalOpen}
        form={form}
        editingOrder={editingOrder}
        saving={saving}
        itemsLoading={itemsLoading}
        referenceDataReady={referenceDataState === 'ready'}
        orderAttachmentRef={orderAttachmentRef}
        suppliers={suppliers}
        materials={materials}
        unitOptions={unitOptions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        onOk={handleSave}
        onCancel={() => {
          sourceDocumentOpenEditController.invalidate()
          orderAttachmentRef.current?.clearPendingAttachments()
          setModalOpen(false)
        }}
        onSupplierChange={handleSupplierChange}
        onMaterialChange={handleMaterialChange}
      />
      <PurchaseOrderInboundDraftModal
        open={inboundDraftModalOpen}
        form={inboundDraftForm}
        order={singleSelectedOrder}
        rows={inboundDraftPreviewRows}
        loading={inboundDraftPreviewLoading}
        submitting={generatingInboundDraft}
        referenceDataReady={inboundReferenceDataReady}
        warehouseOptions={warehouseOptions}
        hasRemaining={hasInboundDraftRemaining}
        resolveSupplierName={resolveSupplierName}
        onOk={createInboundDraftWithReadySource}
        onCancel={closeInboundDraftModal}
      />
    </BusinessPageLayout>
  )
}
