import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  PlusOutlined,
  PrinterOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Alert, Button, Descriptions, Form, Input, Space, Tag } from 'antd'
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
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessLifecycleMoreAction,
  BusinessLifecyclePrimaryAction,
  BusinessOperationPanel,
  BusinessPageLayout,
  CollaborationTaskPanel,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  ColumnOrderHeaderMenu,
  ColumnOrderModal,
} from '../components/business-list/ColumnOrderModal.jsx'
import { useBusinessRowItemsPreview } from '../components/business-list/BusinessRowItemsPreview.jsx'
import {
  getPreferredColumnOrder,
  writeStoredColumnOrder,
} from '../components/business-list/businessListPreferences.mjs'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessDetailsModal from '../components/business-list/BusinessDetailsModal.jsx'
import BusinessLineItemOrderModal from '../components/business-list/BusinessLineItemOrderModal.jsx'
import SourceOrderLifecycleConfirmContent from '../components/business-list/SourceOrderLifecycleConfirmContent.jsx'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import LifecycleScopeFilter from '../components/business-list/LifecycleScopeFilter.jsx'
import OutsourcingOrderForm, {
  materialLabel,
  productLabel,
  processLabel,
  supplierLabel,
  unitLabel,
  outsourcingOrderLineOrderLabel,
} from '../components/outsourcing-orders/OutsourcingOrderForm.jsx'
import OutsourcingOrderSourceFactModal from '../components/outsourcing-orders/OutsourcingOrderSourceFactModal.jsx'
import OutsourcingReturnRecordsModal from '../components/outsourcing-orders/OutsourcingReturnRecordsModal.jsx'
import OutsourcingReturnQualityInspectionModal from '../components/quality-inspections/OutsourcingReturnQualityInspectionModal.jsx'
import OutsourcingReturnDispositionModal from '../components/quality-inspections/OutsourcingReturnDispositionModal.jsx'
import FinanceBusinessSourceModal from '../components/finance/FinanceBusinessSourceModal.jsx'
import { buildOutsourcingOrderColumns } from '../components/outsourcing-orders/outsourcingOrderColumns.jsx'
import {
  listAllOutsourcingOrderItems,
  listAllOutsourcingOrders,
  getOutsourcingOrder,
  listOutsourcingOrderItemsPreview,
  listOutsourcingOrders,
  listAllMaterials,
  listAllProcesses,
  listAllProducts,
  listAllProductSKUs,
  listAllContactsByOwner,
  listAllSuppliers,
  listAllUnits,
  listAllWarehouses,
  reorderOutsourcingOrderItems,
  saveOutsourcingOrderWithItems,
} from '../api/masterDataOrderApi.mjs'
import {
  downloadBusinessAttachment,
  listBusinessAttachments,
} from '../api/attachmentApi.mjs'
import {
  createOutsourcingMaterialIssueFromOrder,
  createOutsourcingReturnReceiptFromOrder,
  createPayableFromOutsourcingReturn,
  cancelOutsourcingFact,
  listAllOutsourcingFacts,
  postOutsourcingFact,
  saveOutsourcingMaterialIssueDraft,
  saveOutsourcingReturnReceiptDraft,
} from '../api/operationalFactApi.mjs'
import { listAllInventoryLots } from '../api/inventoryApi.mjs'
import {
  createQualityInspectionFromOutsourcingReturn,
  listAllOutsourcingReturnQualityInspections,
} from '../api/qualityApi.mjs'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'
import { listWorkflowTasks } from '../api/workflowApi.mjs'
import {
  OUTSOURCING_ORDER_STATUS_LABELS,
  OUTSOURCING_ORDER_ITEM_STATUS_LABELS,
  OUTSOURCING_ORDER_SUBJECT_TYPES,
  buildOutsourcingOrderItemSourceValuesFromMaterial,
  buildOutsourcingOrderItemSourceValuesFromProduct,
  buildOutsourcingOrderItemSourceValuesFromProductSKU,
  buildOutsourcingOrderSubjectSwitchValues,
  buildOutsourcingOrderItemParams,
  buildOutsourcingOrderParams,
  buildOutsourcingSupplierSnapshot,
  buildSequentialDraftCode,
  contractPartySnapshotFromPrintTemplateDefaults,
  createBlankOutsourcingLine,
  buildSupplierSnapshot,
  buildSupplierSnapshotWithContacts,
  canRunOutsourcingOrderLifecycleAction,
  formatUnixDate,
  hasActionPermission,
  normalizeOutsourcingLineFormValue,
  SUPPLIER_CONTACT_OWNER_TYPE,
  V1_ROUTE_PATHS,
  statusText,
  unixToDateInputValue,
} from '../utils/masterDataOrderView.mjs'
import { referenceLabel } from '../utils/referenceSelectOptions.mjs'
import {
  resolveBusinessLifecycleActions,
  resolveContextualBusinessActionAvailability,
} from '../utils/businessActionAvailability.mjs'
import {
  filterBusinessCollaborationTasksBySource,
  loadBusinessCollaborationTasksForSource,
} from '../utils/businessCollaborationTasks.mjs'
import {
  buildSourceDocumentItemSaveParams,
  canReorderSourceDocumentItems,
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
  PRINT_WORKSPACE_ENTRY_SOURCE,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  openPrintWorkspaceWindow,
  resolveRuntimeCustomerPrintCompanyName,
} from '../utils/printWorkspace.js'
import {
  loadProductPrintImageSnapshots,
  resolveSharedProductIDForPrintImages,
} from '../utils/productPrintImages.mjs'
import { getEffectivePrintTemplateDefaults } from '../utils/adminProfileSync.mjs'
import { buildProcessingContractDraftFromOutsourcingOrder } from '../data/processingContractTemplate.mjs'
import {
  WORK_INSTRUCTION_TEMPLATE_KEY,
  buildWorkInstructionDraftFromOutsourcingOrder,
} from '../data/engineeringPrintTemplates.mjs'
import { completeProcessingContractDraft } from '../utils/contractPrintDraftCompleteness.mjs'
import { loadBusinessAttachmentPrintAppendixSnapshots } from '../utils/businessAttachmentPrintAppendix.mjs'
import {
  DEFAULT_OUTSOURCING_ORDER_PAGINATION,
  OUTSOURCING_ORDER_DATE_FILTER_OPTIONS,
  OUTSOURCING_ORDER_LIFECYCLE_ACTIONS,
  OUTSOURCING_ORDER_SORT_OPTIONS,
  OUTSOURCING_ORDER_STATUS_OPTIONS,
  OUTSOURCING_ORDERS_MODULE_KEY,
  buildOutsourcingOrderStats,
  canEditOutsourcingOrder,
  getOutsourcingOrderDisplayNo,
  parseOutsourcingOrderSortValue,
} from '../components/outsourcing-orders/outsourcingOrderPageConfig.mjs'
import { useOutsourcingOrderWorkflowActions } from '../components/outsourcing-orders/useOutsourcingOrderWorkflowActions.mjs'
import {
  OUTSOURCING_SOURCE_ACTIONS,
  buildOutsourcingSourceFactPayload,
  filterOutsourcingSourceActionLots,
  findOutsourcingSourceFactResult,
  isOutsourcingSourceActionEligible,
  validateOutsourcingSourceFactResult,
} from '../utils/outsourcingOrderFactAction.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
  sourceBusinessActionNo,
} from '../utils/sourceBusinessAction.mjs'
import {
  normalizeSourceOrderLifecycleReason,
  prepareSourceOrderLifecycleAttempt,
} from '../utils/sourceOrderLifecycleAction.mjs'
import { matchesOperationalFactLifecycleResult } from '../utils/operationalFactLifecycle.mjs'
import {
  FINANCE_BUSINESS_SOURCE_ACTIONS,
  buildOutsourcingReturnPayablePayload,
  financeBusinessSourceFormValuesFromRequest,
} from '../utils/financeBusinessSourceAction.mjs'
import {
  buildOutsourcingReturnQualityInspectionPayload,
  groupOutsourcingReturnQualityInspections,
  isMatchingOutsourcingReturnQualityInspection,
  isPostedOutsourcingReturn,
  OUTSOURCING_RETURN_QUALITY_GATE_STATES,
  resolveOutsourcingReturnQualityGate,
} from '../utils/qualityInspectionSourceAction.mjs'
import { searchParamPositiveInt } from '../utils/routeQuery.mjs'
import {
  canOpenRelatedDocumentPath,
  clearLinkedDocumentParams,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
  relatedDocumentRoute,
} from '../utils/relatedDocumentNavigation.mjs'
import { resolveExactRecordPage } from '../utils/businessPagination.mjs'
import {
  buildOutsourcingContractConfirmationSummary,
  inspectOutsourcingContractReadiness,
} from '../utils/outsourcingContractReadiness.mjs'
import {
  LIFECYCLE_SCOPE,
  filterLifecycleStatusOptions,
  lifecycleScopeFromSearchParams,
  lifecycleScopeIncludesStatus,
  withLifecycleScopeSearchParam,
} from '../utils/lifecycleScope.mjs'
import {
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS,
  buildOperationalFactDraftSavePayload,
  findOperationalFactDraftSaveResult,
  operationalFactDraftFormValues,
} from '../utils/operationalFactDraftEdit.mjs'

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

export default function V1OutsourcingOrdersPage() {
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
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [printingAction, setPrintingAction] = useState('')
  const [workflowTasks, setWorkflowTasks] = useState([])
  const [workflowTaskLoadState, setWorkflowTaskLoadState] = useState('idle')
  const workflowTaskSourceIDRef = useRef(0)
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [lineOrderLoading, setLineOrderLoading] = useState(false)
  const [lineOrderOpen, setLineOrderOpen] = useState(false)
  const [lineOrderContext, setLineOrderContext] = useState({
    order: null,
    items: [],
  })
  const [keyword, setKeyword] = useState('')
  const [lifecycleScope, setLifecycleScope] = useState(() =>
    lifecycleScopeFromSearchParams(searchParams)
  )
  const [statusFilter, setStatusFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateField, setDateField] = useState('order_date')
  const [dateRange, setDateRange] = useState([null, null])
  const [sortValue, setSortValue] = useState('updated_at:desc')
  const [pagination, setPagination] = useState(
    DEFAULT_OUTSOURCING_ORDER_PAGINATION
  )
  const [selectedRow, setSelectedRow] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [detailOrder, setDetailOrder] = useState(null)
  const orderAttachmentRef = useRef(null)
  const lineOrderRequestRef = useRef(0)
  const selectedRowIDRef = useRef(0)
  const [suppliers, setSuppliers] = useState([])
  const [supplierContacts, setSupplierContacts] = useState([])
  const [supplierContactsLoading, setSupplierContactsLoading] = useState(false)
  const supplierContactsRequestRef = useRef(0)
  const [products, setProducts] = useState([])
  const [productSKUs, setProductSKUs] = useState([])
  const [materials, setMaterials] = useState([])
  const [processes, setProcesses] = useState([])
  const [units, setUnits] = useState([])
  const [warehouses, setWarehouses] = useState([])
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
  const [financeSourceFact, setFinanceSourceFact] = useState(null)
  const [financeSourceLoading, setFinanceSourceLoading] = useState(false)
  const lifecycleStatusOptions = useMemo(
    () =>
      filterLifecycleStatusOptions(
        OUTSOURCING_ORDER_STATUS_OPTIONS,
        lifecycleScope,
        ['closed', 'canceled']
      ),
    [lifecycleScope]
  )
  const sourceFactRequestRef = useRef(0)
  const sourceFactInFlightRef = useRef(false)
  const sourceFactAttemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const lifecycleInFlightRef = useRef(false)
  const lifecycleAttemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const financeSourceAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const financeSourceInFlightRef = useRef(false)
  const qualitySourceInFlightRef = useRef(false)
  const returnRecordActionInFlightRef = useRef(false)
  const routeOutsourcingOrderID = searchParamPositiveInt(
    searchParams,
    'outsourcing_order_id'
  )
  const routeOutsourcingFactID = searchParamPositiveInt(
    searchParams,
    'outsourcing_fact_id'
  )
  const linkedKeyword = linkedDocumentContext(searchParams).keyword
  const linkedRouteKey = `${routeOutsourcingOrderID}:${routeOutsourcingFactID}`
  const [resolvedLinkedContext, setResolvedLinkedContext] = useState({
    routeKey: '',
    keyword: '',
  })
  const resolvedLinkedKeyword =
    resolvedLinkedContext.routeKey === linkedRouteKey
      ? resolvedLinkedContext.keyword
      : ''
  const canReadOutsourcingFacts = hasActionPermission(
    adminProfile,
    'outsourcing.fact.read'
  )
  const canPostOutsourcingFact = hasActionPermission(
    adminProfile,
    'outsourcing.fact.post'
  )
  const canCancelOutsourcingFact = hasActionPermission(
    adminProfile,
    'outsourcing.fact.cancel'
  )
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
  const beginLatestRequest = useLatestRequestCoordinator()
  const sourceDocumentOpenEditController = useMemo(
    () =>
      createSourceDocumentOpenEditController({
        beginLatestRequest,
        setLoading: setItemsLoading,
      }),
    [beginLatestRequest]
  )

  useEffect(() => {
    selectedRowIDRef.current = Number(selectedRow?.id || 0)
  }, [selectedRow?.id])

  const supplierOptions = useMemo(
    () =>
      suppliers.map((item) => ({
        value: item.id,
        label: supplierLabel(item),
        item,
      })),
    [suppliers]
  )

  const productOptions = useMemo(
    () =>
      products.map((item) => ({
        value: item.id,
        label: productLabel(item),
        item,
      })),
    [products]
  )

  const materialOptions = useMemo(
    () =>
      materials.map((item) => ({
        value: item.id,
        label: materialLabel(item),
        item,
      })),
    [materials]
  )

  const processOptions = useMemo(
    () =>
      processes
        .filter((item) => item.outsourcing_enabled === true)
        .map((item) => ({
          value: item.id,
          label: processLabel(item),
          item,
        })),
    [processes]
  )

  const unitOptions = useMemo(
    () =>
      units.map((item) => ({
        value: item.id,
        label: unitLabel(item),
        precision:
          Number.isInteger(Number(item.precision)) &&
          Number(item.precision) >= 0
            ? Number(item.precision)
            : undefined,
        item,
      })),
    [units]
  )

  const unitByID = useMemo(
    () => new Map(units.map((item) => [item.id, item])),
    [units]
  )

  const loadReferenceData = useCallback(async () => {
    try {
      const [
        supplierData,
        productData,
        productSKUData,
        materialData,
        processData,
        unitData,
        warehouseData,
      ] = await Promise.all([
        listAllSuppliers({
          active_only: true,
          supplier_types: ['outsourcing', 'mixed'],
        }),
        listAllProducts({ active_only: true }),
        listAllProductSKUs(),
        listAllMaterials({ active_only: true }),
        listAllProcesses({ active_only: true }),
        listAllUnits(),
        listAllWarehouses({ active_only: true }),
      ])
      setSuppliers(supplierData?.suppliers || [])
      setProducts(productData?.products || [])
      setProductSKUs(productSKUData?.product_skus || [])
      setMaterials(materialData?.materials || [])
      setProcesses(processData?.processes || [])
      setUnits(unitData?.units || [])
      setWarehouses(warehouseData?.warehouses || [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载加工基础资料失败'))
    }
  }, [])

  const outsourcingListParams = useMemo(() => {
    const routeSelectedID = Number(routeOutsourcingOrderID || 0)
    const routeFactID = Number(routeOutsourcingFactID || 0)
    const { sortBy, sortDirection } = parseOutsourcingOrderSortValue(sortValue)
    return {
      keyword: linkedDocumentRequestKeyword({
        localKeyword: keyword,
        linkedKeyword,
        hasExactContext: Boolean(routeSelectedID || routeFactID),
      }),
      supplier_id: supplierFilter || undefined,
      lifecycle_status: statusFilter,
      lifecycle_scope: lifecycleScope,
      date_field: dateField,
      date_from: dateRange?.[0] || undefined,
      date_to: dateRange?.[1] || undefined,
      sort_by: sortBy,
      sort_direction: sortDirection,
    }
  }, [
    dateField,
    dateRange,
    keyword,
    linkedKeyword,
    lifecycleScope,
    routeOutsourcingFactID,
    routeOutsourcingOrderID,
    sortValue,
    statusFilter,
    supplierFilter,
  ])

  const loadRouteOrder = useCallback(
    async ({ signal }) => {
      const routeSelectedID = Number(routeOutsourcingOrderID || 0)
      if (routeSelectedID > 0) {
        return getOutsourcingOrder({ id: routeSelectedID }, { signal })
      }
      const routeFactID = Number(routeOutsourcingFactID || 0)
      if (routeFactID <= 0 || !canReadOutsourcingFacts) return null
      const factData = await listAllOutsourcingFacts(
        { keyword: String(routeFactID) },
        { signal }
      )
      const sourceFact = (factData?.outsourcing_facts || []).find(
        (fact) => Number(fact?.id || 0) === routeFactID
      )
      if (
        String(sourceFact?.source_type || '').toUpperCase() !==
          'OUTSOURCING_ORDER' ||
        Number(sourceFact?.source_id || 0) <= 0
      ) {
        return null
      }
      return getOutsourcingOrder(
        { id: Number(sourceFact.source_id) },
        { signal }
      )
    },
    [canReadOutsourcingFacts, routeOutsourcingFactID, routeOutsourcingOrderID]
  )

  const loadOrders = useCallback(async () => {
    const request = beginLatestRequest('orders')
    const routeSelectedID = Number(routeOutsourcingOrderID || 0)
    const routeFactID = Number(routeOutsourcingFactID || 0)
    const requestRouteKey = `${routeOutsourcingOrderID}:${routeOutsourcingFactID}`
    setResolvedLinkedContext({ routeKey: requestRouteKey, keyword: '' })
    setLoading(true)
    try {
      const [data, routeOrder] = await Promise.all([
        listOutsourcingOrders(
          {
            ...outsourcingListParams,
            limit: pagination.pageSize,
            offset: (pagination.current - 1) * pagination.pageSize,
          },
          { signal: request.signal }
        ),
        loadRouteOrder({ signal: request.signal }),
      ])
      if (!request.isCurrent()) {
        return
      }
      const listedRows = data?.outsourcing_orders || []
      const exactPage = resolveExactRecordPage({
        records: listedRows,
        exactRecord: routeOrder,
        hasExactContext: routeSelectedID > 0 || routeFactID > 0,
        total: Number(data?.total || 0),
      })
      const nextRows = exactPage.records
      setRows(nextRows)
      setTotal(exactPage.total)
      setSelectedRow((prev) => {
        if (routeSelectedID > 0 || routeFactID > 0) return routeOrder
        return prev
          ? nextRows.find((item) => item.id === prev.id) || null
          : null
      })
      setResolvedLinkedContext({
        routeKey: requestRouteKey,
        keyword:
          routeSelectedID > 0 || routeFactID > 0
            ? routeOrder?.outsourcing_order_no || ''
            : '',
      })
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return
      }
      setResolvedLinkedContext({ routeKey: requestRouteKey, keyword: '' })
      message.error(getActionErrorMessage(error, '加载委外订单失败'))
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    loadRouteOrder,
    outsourcingListParams,
    pagination,
    routeOutsourcingFactID,
    routeOutsourcingOrderID,
  ])

  const loadOrderItems = useCallback(async (order, options = {}) => {
    if (!order?.id) {
      throw new Error('缺少加工合同，无法加载明细')
    }
    const data = await listAllOutsourcingOrderItems(
      {
        outsourcing_order_id: order.id,
        expected_version: order.version,
      },
      options
    )
    return data.outsourcing_order_items
  }, [])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const canCreate = hasActionPermission(
    adminProfile,
    'outsourcing.order.create'
  )
  const canRead = hasActionPermission(adminProfile, 'outsourcing.order.read')
  const canUpdate = hasActionPermission(
    adminProfile,
    'outsourcing.order.update'
  )
  const selectedOrderCanReorder = Boolean(
    canUpdate &&
      canReorderSourceDocumentItems('outsourcing_order', selectedRow)
  )
  const canCreateMaterialIssue = hasActionPermission(
    adminProfile,
    'outsourcing.material_issue.create'
  )
  const canCreateReturnReceipt = hasActionPermission(
    adminProfile,
    'outsourcing.return_receipt.create'
  )
  const canCreateQualityInspection = hasActionPermission(
    adminProfile,
    'quality.inspection.create'
  )
  const canReadQualityInspection = hasActionPermission(
    adminProfile,
    'quality.inspection.read'
  )
  const canOpenQualityInspection =
    canReadQualityInspection &&
    canOpenRelatedPath(V1_ROUTE_PATHS.qualityInspections)
  const canCreatePayable = hasActionPermission(
    adminProfile,
    'finance.payable.confirm'
  )
  const canViewPayable =
    (canCreatePayable ||
      hasActionPermission(adminProfile, 'finance.payable.read')) &&
    canOpenRelatedPath(V1_ROUTE_PATHS.payables)
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

  const financeSourceScope = financeSourceFact?.id
    ? `outsourcing-return-payable:${financeSourceFact.id}`
    : ''
  const financeSourceInitialValues = useMemo(() => {
    if (!financeSourceScope) return undefined
    const retained = financeSourceAttemptsRef.current.peek(financeSourceScope)
    return retained
      ? financeBusinessSourceFormValuesFromRequest(retained.params)
      : undefined
  }, [financeSourceScope])

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
  }, [returnRecordsLoading])

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

  const openOutsourcingReturnPayable = useCallback(
    (fact) => {
      if (!canCreatePayable || !isPostedOutsourcingReturn(fact)) {
        message.warning('请先选择已过账的委外回货记录')
        return
      }
      const qualityGate = resolveOutsourcingReturnQualityGate(
        qualityInspectionByFactID?.[fact.id] || []
      )
      if (
        qualityGate.state !== OUTSOURCING_RETURN_QUALITY_GATE_STATES.ACCEPTED
      ) {
        message.warning(
          qualityGate.state === OUTSOURCING_RETURN_QUALITY_GATE_STATES.REJECTED
            ? '该委外回货质检不合格，请先完成返工、退回等质量处置'
            : '该委外回货尚未完成合格或让步接收判定，不能生成应付'
        )
        return
      }
      setReturnRecordsOpen(false)
      setReturnRecordsOrder(null)
      setRelatedReturnFacts([])
      setFinanceSourceFact(fact)
    },
    [canCreatePayable, qualityInspectionByFactID]
  )

  const closeOutsourcingReturnPayable = useCallback(() => {
    if (financeSourceInFlightRef.current) return
    setFinanceSourceFact(null)
  }, [])

  const submitOutsourcingReturnPayable = useCallback(
    async (values) => {
      const fact = financeSourceFact
      if (financeSourceInFlightRef.current || !canCreatePayable || !fact?.id) {
        return
      }
      const scope = `outsourcing-return-payable:${fact.id}`
      let attempt
      try {
        const payload = {
          ...buildOutsourcingReturnPayablePayload(values, fact),
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
        await createPayableFromOutsourcingReturn(attempt.params)
        financeSourceAttemptsRef.current.settle(scope, attempt, null)
        setFinanceSourceFact(null)
        message.success('应付草稿已生成，请到应付管理核对并确认')
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
    [activeCustomerKey, canCreatePayable, financeSourceFact]
  )

  const viewOutsourcingReturnPayable = useCallback(
    (fact) => {
      if (!fact?.id || !canViewPayable) return
      navigate(
        relatedDocumentRoute(
          V1_ROUTE_PATHS.payables,
          { source_type: 'OUTSOURCING_FACT', source_id: fact.id },
          {
            keyword: fact.fact_no,
            source: 'outsourcing-order',
            fields: ['source_no'],
          }
        )
      )
    },
    [canViewPayable, navigate]
  )

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
    [loadRelatedOutsourcingFacts]
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
              { label: '产品名称', value: item?.product_name_snapshot },
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

  const processingPrintTemplateDefaults = useMemo(
    () =>
      getEffectivePrintTemplateDefaults(
        adminProfile,
        PROCESSING_CONTRACT_TEMPLATE_KEY
      ),
    [adminProfile]
  )

  const openCreate = () => {
    sourceDocumentOpenEditController.invalidate()
    orderAttachmentRef.current?.clearPendingAttachments()
    setEditingRow(null)
    form.setFieldsValue({
      outsourcing_order_no: buildSequentialDraftCode(rows, {
        prefix: 'OUT',
        field: 'outsourcing_order_no',
      }),
      supplier_id: undefined,
      currency: 'CNY',
      payment_term_days: undefined,
      supplier_snapshot: {},
      source_order_no: '',
      order_date: currentBusinessDate(),
      expected_return_date: '',
      contract_party_snapshot: contractPartySnapshotFromPrintTemplateDefaults(
        processingPrintTemplateDefaults,
        PROCESSING_CONTRACT_TEMPLATE_KEY
      ),
      note: '',
      items: [createBlankOutsourcingLine(1)],
    })
    setSupplierContacts([])
    setModalOpen(true)
  }

  const openEdit = async (record) => {
    const editResult = await openSourceDocumentEditWithAccessGate({
      canUpdate,
      document: record,
      invalidatePending: () => sourceDocumentOpenEditController.invalidate(),
      isEditable: canEditOutsourcingOrder,
      open: () =>
        sourceDocumentOpenEditController.open({
          loadItems: ({ signal }) => loadOrderItems(record, { signal }),
          enterEditing: (items) => {
            const openItems = selectOpenSourceDocumentItems(items)
            orderAttachmentRef.current?.clearPendingAttachments()
            setEditingRow(record)
            form.setFieldsValue({
              ...record,
              order_date: unixToDateInputValue(record.order_date),
              expected_return_date: unixToDateInputValue(
                record.expected_return_date
              ),
              contract_party_snapshot:
                record.contract_party_snapshot &&
                typeof record.contract_party_snapshot === 'object'
                  ? record.contract_party_snapshot
                  : contractPartySnapshotFromPrintTemplateDefaults(
                      processingPrintTemplateDefaults,
                      PROCESSING_CONTRACT_TEMPLATE_KEY
                    ),
              items:
                openItems.length > 0
                  ? openItems.map((item) =>
                      normalizeOutsourcingLineFormValue(item)
                    )
                  : [createBlankOutsourcingLine(1)],
            })
            loadSupplierContacts(record.supplier_id)
            setModalOpen(true)
          },
        }),
    })
    if (editResult.status === 'blocked') {
      if (editResult.reason === 'forbidden') {
        message.warning('当前账号没有编辑加工合同的权限。')
      } else if (editResult.reason === 'not_editable') {
        message.warning('加工合同提交后已冻结，不能继续编辑。')
      }
      return
    }
    if (editResult.status === 'load_failed') {
      message.error(
        `${getActionErrorMessage(
          editResult.error,
          '加载加工合同明细失败'
        )}，未进入编辑`
      )
    }
  }

  const openOutsourcingOrderDetails = (record) => {
    if (!record?.id) return
    sourceDocumentOpenEditController.invalidate()
    setSelectedRow(record)
    setDetailOrder(record)
  }

  const openOutsourcingOrderRecord = (record) => {
    if (!record?.id) return
    setSelectedRow(record)
    if (canUpdate && canEditOutsourcingOrder(record)) {
      setDetailOrder(null)
      openEdit(record)
      return
    }
    openOutsourcingOrderDetails(record)
  }

  const openOutsourcingOrderLineOrder = async () => {
    const order = selectedRow
    if (!selectedOrderCanReorder) {
      message.warning(
        order ? '当前状态不能调整加工明细顺序' : '请先选择一条加工合同'
      )
      return
    }
    const requestID = lineOrderRequestRef.current + 1
    lineOrderRequestRef.current = requestID
    setLineOrderLoading(true)
    try {
      const items = await loadOrderItems(order)
      if (
        lineOrderRequestRef.current !== requestID ||
        selectedRowIDRef.current !== Number(order.id)
      ) {
        return
      }
      setLineOrderContext({
        order,
        items: selectOpenSourceDocumentItems(items),
      })
      setLineOrderOpen(true)
    } catch (error) {
      if (isResourceVersionConflict(error)) {
        message.warning('加工合同已被其他操作更新，请刷新后重试')
      } else {
        message.error(getActionErrorMessage(error, '加载加工明细顺序'))
      }
    } finally {
      if (lineOrderRequestRef.current === requestID) {
        setLineOrderLoading(false)
      }
    }
  }

  const applyOutsourcingOrderLineOrder = async (orderedItems) => {
    const { order } = lineOrderContext
    if (!order?.id || !Array.isArray(orderedItems)) return false
    setSaving(true)
    try {
      const result = await reorderOutsourcingOrderItems({
        customer_key: activeCustomerKey,
        id: order.id,
        expected_version: order.version,
        item_ids: orderedItems.map((item) => item.id),
      })
      const { outsourcing_order: savedOrder } = result
      const openItems = selectOpenSourceDocumentItems(
        result.outsourcing_order_items
      )
      outsourcingOrderItemsPreview.invalidate(order)
      setRows((current) =>
        current.map((item) =>
          item.id === savedOrder.id ? savedOrder : item
        )
      )
      setSelectedRow(savedOrder)
      setLineOrderContext({ order: savedOrder, items: openItems })
      message.success('加工明细顺序已保存')
      return true
    } catch (error) {
      if (isResourceVersionConflict(error)) {
        message.warning('加工合同已被其他操作更新，请刷新后重试')
        setLineOrderOpen(false)
        await loadOrders()
      } else if (isMutationResultUnknown(error)) {
        message.warning(
          '加工明细顺序保存结果尚未确认，请先刷新核对，不要连续重复提交'
        )
        setLineOrderOpen(false)
        await loadOrders()
      } else {
        message.error(getActionErrorMessage(error, '保存加工明细顺序'))
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  const closeModal = () => {
    sourceDocumentOpenEditController.invalidate()
    orderAttachmentRef.current?.clearPendingAttachments()
    setModalOpen(false)
    setEditingRow(null)
    setSupplierContacts([])
    form.resetFields()
  }

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
            getActionErrorMessage(error, '加载当前加工合同任务失败')
          ),
        setLoadState: setWorkflowTaskLoadState,
        setTasks: setWorkflowTasks,
        sourceID: requestedSourceID,
        sourceType: OUTSOURCING_ORDERS_MODULE_KEY,
      })
    },
    [beginLatestRequest, canReadWorkflowTasks]
  )

  useEffect(() => {
    const sourceID = Number(selectedRow?.id || 0)
    workflowTaskSourceIDRef.current = sourceID
    loadWorkflowTasks(sourceID)
  }, [loadWorkflowTasks, selectedRow?.id])
  useEffect(
    () => () => {
      workflowTaskSourceIDRef.current = 0
    },
    []
  )

  const refreshPageData = useCallback(async () => {
    await Promise.all([loadOrders(), loadWorkflowTasks()])
  }, [loadOrders, loadWorkflowTasks])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPageData)
  }, [outletContext, refreshPageData])

  const setLineValues = (fieldName, values = {}) => {
    form.setFields(
      Object.entries(values).map(([key, value]) => ({
        name: ['items', fieldName, key],
        value,
      }))
    )
  }

  const handleSubjectTypeChange = (fieldName, subjectType) => {
    setLineValues(
      fieldName,
      buildOutsourcingOrderSubjectSwitchValues(subjectType)
    )
  }

  const handleProductChange = (fieldName, productID) => {
    const product = products.find((item) => item.id === productID)
    const unit = unitByID.get(product?.default_unit_id)
    setLineValues(
      fieldName,
      buildOutsourcingOrderItemSourceValuesFromProduct(product, unit)
    )
  }

  const handleProductSKUChange = (fieldName, productSKUID) => {
    const productSKU = productSKUs.find((item) => item.id === productSKUID)
    const productID = form.getFieldValue(['items', fieldName, 'product_id'])
    const product = products.find((item) => item.id === productID)
    const unit = unitByID.get(
      productSKU?.default_unit_id || product?.default_unit_id
    )
    setLineValues(
      fieldName,
      buildOutsourcingOrderItemSourceValuesFromProductSKU(productSKU, unit)
    )
  }

  const handleMaterialChange = (fieldName, materialID) => {
    const material = materials.find((item) => item.id === materialID)
    const unit = unitByID.get(material?.default_unit_id)
    setLineValues(
      fieldName,
      buildOutsourcingOrderItemSourceValuesFromMaterial(material, unit)
    )
  }

  const handleProcessChange = (fieldName, processID) => {
    const process = processes.find((item) => item.id === processID)
    if (!process) return
    form.setFieldValue(
      ['items', fieldName, 'process_name_snapshot'],
      process.name
    )
    form.setFieldValue(
      ['items', fieldName, 'process_category_snapshot'],
      process.category || ''
    )
    const supplierID = Number(form.getFieldValue('supplier_id') || 0)
    const supplier = suppliers.find(
      (item) => Number(item?.id || 0) === supplierID
    )
    const capabilityIDs = Array.isArray(supplier?.process_ids)
      ? supplier.process_ids.map(Number)
      : []
    if (
      capabilityIDs.length > 0 &&
      !capabilityIDs.includes(Number(processID))
    ) {
      message.warning(
        `“${supplier?.short_name || supplier?.name || '当前加工厂'}”档案中未登记“${process.name}”能力，请核对后再继续；本提示不会阻止保存。`
      )
    }
  }

  const handleUnitChange = (fieldName, unitID) => {
    const unit = unitByID.get(unitID)
    const productSKUID = form.getFieldValue([
      'items',
      fieldName,
      'product_sku_id',
    ])
    const productSKU = productSKUs.find((item) => item.id === productSKUID)
    setLineValues(fieldName, {
      unit_name_snapshot: unit?.name || '',
      ...(productSKU &&
      Number(productSKU.default_unit_id || 0) !== Number(unitID)
        ? { product_sku_id: undefined, sku_code_snapshot: '' }
        : {}),
    })
  }

  const loadSupplierContacts = useCallback(async (supplierID) => {
    const requestID = supplierContactsRequestRef.current + 1
    supplierContactsRequestRef.current = requestID
    if (!Number(supplierID || 0)) {
      setSupplierContacts([])
      setSupplierContactsLoading(false)
      return []
    }
    setSupplierContactsLoading(true)
    try {
      const data = await listAllContactsByOwner({
        owner_type: SUPPLIER_CONTACT_OWNER_TYPE,
        owner_id: supplierID,
        active_only: true,
      })
      const contacts = Array.isArray(data?.contacts) ? data.contacts : []
      if (supplierContactsRequestRef.current === requestID) {
        setSupplierContacts(contacts)
      }
      return contacts
    } catch (error) {
      if (supplierContactsRequestRef.current === requestID) {
        setSupplierContacts([])
        message.warning(getActionErrorMessage(error, '加载加工厂联系人'))
      }
      return []
    } finally {
      if (supplierContactsRequestRef.current === requestID) {
        setSupplierContactsLoading(false)
      }
    }
  }, [])

  const handleSupplierChange = (supplierID) => {
    const supplier = suppliers.find((item) => item.id === supplierID)
    form.setFieldValue('supplier_snapshot', buildSupplierSnapshot(supplier))
    if (!editingRow?.id) {
      const termDays = supplier?.default_payment_term_days
      const normalizedTermDays = Number(termDays)
      form.setFieldValue(
        'payment_term_days',
        termDays !== undefined &&
          termDays !== null &&
          termDays !== '' &&
          Number.isFinite(normalizedTermDays) &&
          Number.isInteger(normalizedTermDays) &&
          normalizedTermDays >= 0
          ? normalizedTermDays
          : undefined
      )
    }
    setSupplierContacts([])
    loadSupplierContacts(supplierID).then((contacts) => {
      if (
        String(form.getFieldValue('supplier_id') ?? '') !==
        String(supplierID ?? '')
      ) {
        return
      }
      form.setFieldValue(
        'supplier_snapshot',
        buildSupplierSnapshotWithContacts(supplier, contacts)
      )
    })
  }

  const handleSupplierContactNameChange = () => {
    form.setFields([
      { name: ['supplier_snapshot', 'contact_id'], value: undefined },
      { name: ['supplier_snapshot', 'contact_phone'], value: '' },
      { name: ['supplier_snapshot', 'contact_mobile'], value: '' },
    ])
  }

  const handleSupplierContactSelect = (contact) => {
    form.setFields([
      {
        name: ['supplier_snapshot', 'contact_id'],
        value: Number(contact?.id || 0) || undefined,
      },
      {
        name: ['supplier_snapshot', 'contact_name'],
        value: contact?.name || '',
      },
      {
        name: ['supplier_snapshot', 'contact_phone'],
        value: contact?.phone || contact?.mobile || '',
      },
      {
        name: ['supplier_snapshot', 'contact_mobile'],
        value: contact?.mobile || '',
      },
    ])
  }

  const submitForm = async () => {
    const isCreatingOrder = !editingRow?.id
    setSaving(true)
    try {
      let payload
      try {
        const values = await form.validateFields()
        const supplier = suppliers.find(
          (item) => item.id === values.supplier_id
        )
        const supplierSnapshot = buildOutsourcingSupplierSnapshot(
          supplier,
          values.supplier_snapshot
        )
        payload = buildOutsourcingOrderParams(
          {
            ...values,
            supplier_snapshot: supplierSnapshot,
          },
          {
            id: editingRow?.id || undefined,
            expected_version: editingRow?.id ? editingRow.version : undefined,
            items: buildSourceDocumentItemSaveParams(
              values.items,
              buildOutsourcingOrderItemParams
            ),
          }
        )
      } catch (error) {
        if (!error?.errorFields) {
          message.error(getActionErrorMessage(error, '准备加工合同保存'))
        }
        return
      }

      const saveResult = await commitSourceDocumentSaveResult({
        save: async () => {
          const result = await saveOutsourcingOrderWithItems(payload)
          return result.outsourcing_order
        },
        bindSaved: (savedOrder) => {
          setEditingRow(savedOrder)
          setSelectedRow(savedOrder)
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
          message.error(getActionErrorMessage(saveError, '保存加工合同失败'))
        }
        return
      }

      const { saved: savedOrder } = saveResult
      const attachmentEffect = await settleSourceDocumentPostSaveEffect(() =>
        orderAttachmentRef.current?.flushPendingAttachments(savedOrder.id)
      )
      const attachmentSaved =
        attachmentEffect.status === 'fulfilled' &&
        attachmentEffect.value !== false
      if (attachmentEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(attachmentEffect.error, '上传加工合同附件')
        )
      }
      message.success(
        attachmentSaved
          ? editingRow
            ? '加工合同已更新'
            : '加工合同已创建'
          : '加工合同已保存，未上传的附件请重新选择'
      )
      closeModal()
      const refreshEffect = await settleSourceDocumentPostSaveEffect(
        async () => {
          if (isCreatingOrder) {
            setPagination((current) => ({ ...current, current: 1 }))
            await loadWorkflowTasks()
            return
          }
          await Promise.all([loadOrders(), loadWorkflowTasks()])
        }
      )
      if (refreshEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(
            refreshEffect.error,
            '刷新加工合同列表和相关任务'
          )
        )
      }
    } finally {
      setSaving(false)
    }
  }

  const runLifecycleAction = async (action) => {
    if (!selectedRow || lifecycleInFlightRef.current || saving) return
    const execute = async (reason = '') => {
      lifecycleInFlightRef.current = true
      setSaving(true)
      let lifecycleAttempt = null
      try {
        lifecycleAttempt = prepareSourceOrderLifecycleAttempt({
          action,
          attemptStore: lifecycleAttemptsRef.current,
          customerKey: activeCustomerKey,
          reason,
          record: selectedRow,
        })
        const updated = await action.run(lifecycleAttempt.attempt.params)
        lifecycleAttemptsRef.current.settle(
          lifecycleAttempt.scope,
          lifecycleAttempt.attempt,
          null
        )
        setSelectedRow(updated)
        message.success(`${action.label}成功`)
        await Promise.all([loadOrders(), loadWorkflowTasks()])
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
            '暂时无法确认合同是否处理成功，请刷新核对最新状态；内容不变时可安全重试'
          )
        } else {
          message.error(getActionErrorMessage(error, `${action.label}失败`))
        }
      } finally {
        lifecycleInFlightRef.current = false
        setSaving(false)
      }
    }

    if (['submit', 'confirm'].includes(action.key)) {
      setSaving(true)
      let summary
      try {
        const [items, attachments] = await Promise.all([
          loadOrderItems(selectedRow),
          listBusinessAttachments({
            owner_type: 'outsourcing_order',
            owner_id: selectedRow.id,
          }),
        ])
        summary = buildOutsourcingContractConfirmationSummary(
          selectedRow,
          items,
          Array.isArray(attachments)
            ? attachments.filter((item) => !item?.withdrawn_at).length
            : 0
        )
      } catch (error) {
        message.error(getActionErrorMessage(error, '核对加工合同完整性'))
        return
      } finally {
        setSaving(false)
      }
      if (!summary.complete) {
        modal.warning({
          title: '加工合同信息尚未齐全',
          content: (
            <Alert
              showIcon
              type="warning"
              message="补齐以下内容后才能提交或确认下单"
              description={summary.missing.join('、')}
            />
          ),
          okText:
            selectedRow.lifecycle_status === 'draft' ? '返回补充' : '我知道了',
          onOk:
            selectedRow.lifecycle_status === 'draft'
              ? () => openEdit(selectedRow)
              : undefined,
        })
        return
      }
      modal.confirm({
        title: action.key === 'submit' ? '确认提交加工合同' : '确认下单',
        content: (
          <Descriptions
            bordered
            column={1}
            size="small"
            items={[
              {
                key: 'buyer',
                label: '甲方',
                children: summary.buyerName,
              },
              {
                key: 'supplier',
                label: '乙方',
                children: summary.supplierName,
              },
              {
                key: 'expected-return',
                label: '预计回货',
                children: formatUnixDate(summary.expectedReturnDate),
              },
              {
                key: 'lines',
                label: '加工明细',
                children: `${summary.lineCount} 条`,
              },
              {
                key: 'amount',
                label: '合同金额',
                children: summary.totalAmountText,
              },
              {
                key: 'attachments',
                label: '附件',
                children: `${summary.attachmentCount} 个`,
              },
            ]}
          />
        ),
        okText: action.key === 'submit' ? '确认提交' : '确认下单',
        cancelText: '返回核对',
        onOk: execute,
      })
      return
    }

    if (action.confirmTitle) {
      let reason = ''
      modal.confirm({
        title: action.confirmTitle,
        content: (
          <SourceOrderLifecycleConfirmContent
            action={action}
            onReasonChange={(value) => {
              reason = value
            }}
          />
        ),
        okText: action.okText || '确认',
        cancelText: '取消',
        okButtonProps: { danger: action.danger },
        onOk: (_close) => {
          try {
            normalizeSourceOrderLifecycleReason(action, reason)
          } catch (error) {
            message.warning(getActionErrorMessage(error, '校验业务原因'))
            return
          }
          return execute(reason)
        },
      })
      return
    }
    await execute()
  }

  const openProcessingContractPrint = async () => {
    if (!selectedRow) return
    setPrintingAction(PROCESSING_CONTRACT_TEMPLATE_KEY)
    try {
      const [items, appendixImages] = await Promise.all([
        loadOrderItems(selectedRow),
        loadBusinessAttachmentPrintAppendixSnapshots(selectedRow.id, {
          listAttachments: listBusinessAttachments,
          downloadAttachment: downloadBusinessAttachment,
        }),
      ])
      const readiness = inspectOutsourcingContractReadiness(selectedRow, items)
      if (!readiness.complete) {
        modal.warning({
          title: '加工合同信息尚未齐全',
          content: `请先补齐：${readiness.missing.join('、')}`,
          okText: '我知道了',
        })
        return
      }
      const initialDraft = completeProcessingContractDraft({
        ...buildProcessingContractDraftFromOutsourcingOrder(
          selectedRow,
          items,
          {
            printTemplateDefaults: processingPrintTemplateDefaults,
          }
        ),
        appendixImages,
      })
      if (initialDraft.lines.length === 0) {
        message.warning('当前委外订单没有可打印的明细')
        return
      }
      openPrintWorkspaceWindow(PROCESSING_CONTRACT_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        customerKey: activeCustomerKey,
        accountKey: adminProfile?.id,
        configRevision: adminProfile?.effective_session?.config_revision || '',
      })
      message.success('已打开加工合同打印模板')
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开加工合同打印失败'))
    } finally {
      setPrintingAction('')
    }
  }

  const openWorkInstructionPrint = async () => {
    if (!selectedRow) return
    setPrintingAction(WORK_INSTRUCTION_TEMPLATE_KEY)
    try {
      const items = await loadOrderItems(selectedRow)
      const activeItems = (Array.isArray(items) ? items : []).filter((item) => {
        const status = String(item?.line_status || '')
          .trim()
          .toLowerCase()
        return (
          status !== 'canceled' &&
          status !== 'cancelled' &&
          String(item?.subject_type || '')
            .trim()
            .toUpperCase() === OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT
        )
      })
      if (activeItems.length === 0) {
        message.warning('当前加工合同没有可带入作业指导书的产品 / 半成品明细')
        return
      }
      const productImageSource =
        resolveSharedProductIDForPrintImages(activeItems)
      const productImages =
        productImageSource.reason === 'single'
          ? await loadProductPrintImageSnapshots(productImageSource.productID, {
              listAttachments: listBusinessAttachments,
              downloadAttachment: downloadBusinessAttachment,
            })
          : {}
      const initialDraft = buildWorkInstructionDraftFromOutsourcingOrder(
        selectedRow,
        activeItems,
        {
          companyName: resolveRuntimeCustomerPrintCompanyName(),
          productImages,
        }
      )
      openPrintWorkspaceWindow(WORK_INSTRUCTION_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        customerKey: activeCustomerKey,
        accountKey: adminProfile?.id,
        configRevision: adminProfile?.effective_session?.config_revision || '',
      })
      if (productImageSource.reason === 'multiple') {
        message.warning(
          '已打开作业指导书；当前加工合同包含多个产品，未自动带入产品图，请在打印窗口核对后补充。'
        )
      } else if (productImageSource.reason === 'missing') {
        message.warning(
          '已打开作业指导书；部分产品明细未关联明确产品，未自动带入产品图，请在打印窗口核对后补充。'
        )
      } else {
        message.success('已打开作业指导书打印模板')
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开作业指导书打印失败'))
    } finally {
      setPrintingAction('')
    }
  }

  const {
    blockWorkflowTask,
    completeWorkflowTask,
    rejectWorkflowTask,
    resumeWorkflowTask,
    urgeOutsourcingWorkflowTask,
  } = useOutsourcingOrderWorkflowActions({ loadWorkflowTasks })

  const pageStats = buildOutsourcingOrderStats({
    rows,
    total,
  })

  const resolveSupplierName = useCallback(
    (record = {}) =>
      record?.supplier_snapshot?.short_name ||
      record?.supplier_snapshot?.name ||
      suppliers.find((item) => item.id === record.supplier_id)?.short_name ||
      suppliers.find((item) => item.id === record.supplier_id)?.name ||
      '未指定加工厂',
    [suppliers]
  )

  const selectedLabel = selectedRow
    ? `${getOutsourcingOrderDisplayNo(selectedRow)} / ${resolveSupplierName(
        selectedRow
      )}`
    : '请先选择一份加工合同'

  const persistColumnOrder = useCallback(
    async (nextOrder, columnsForOrder) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        columnsForOrder
      )
      setColumnOrder(sanitizedOrder)
      writeStoredColumnOrder(OUTSOURCING_ORDERS_MODULE_KEY, sanitizedOrder)
      setColumnOrderSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: OUTSOURCING_ORDERS_MODULE_KEY,
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
    () => buildOutsourcingOrderColumns({ resolveSupplierName }),
    [resolveSupplierName]
  )

  const detailColumns = useMemo(
    () => [
      ...dataColumns,
      {
        key: 'buyer-company',
        title: '委托单位（甲方）',
        dataIndex: ['contract_party_snapshot', 'buyerCompany'],
      },
      {
        key: 'buyer-contact',
        title: '委托人',
        dataIndex: ['contract_party_snapshot', 'buyerContact'],
      },
      {
        key: 'buyer-phone',
        title: '委托方电话',
        dataIndex: ['contract_party_snapshot', 'buyerPhone'],
      },
      {
        key: 'buyer-address',
        title: '委托方地址',
        dataIndex: ['contract_party_snapshot', 'buyerAddress'],
      },
      {
        key: 'supplier-company',
        title: '乙方单位',
        dataIndex: ['supplier_snapshot', 'name'],
        render: (value, record) =>
          value || record?.supplier_snapshot?.short_name || '-',
      },
      {
        key: 'supplier-contact',
        title: '乙方联系人',
        dataIndex: ['supplier_snapshot', 'contact_name'],
      },
      {
        key: 'supplier-phone',
        title: '乙方联系电话',
        dataIndex: ['supplier_snapshot', 'contact_phone'],
        render: (value, record) =>
          value || record?.supplier_snapshot?.contact_mobile || '-',
      },
      {
        key: 'supplier-address',
        title: '乙方地址',
        dataIndex: ['supplier_snapshot', 'address'],
      },
      {
        key: 'supplier-signer',
        title: '乙方签约人',
        dataIndex: ['supplier_snapshot', 'signer_name'],
      },
    ],
    [dataColumns]
  )

  const preferredColumnOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey: OUTSOURCING_ORDERS_MODULE_KEY,
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
      if (routeOutsourcingOrderID || routeOutsourcingFactID) {
        const routeOrder = await loadRouteOrder({ signal })
        return routeOrder ? [routeOrder] : []
      }
      const result = await listAllOutsourcingOrders(outsourcingListParams, {
        signal,
      })
      return result?.outsourcing_orders
    },
    [
      loadRouteOrder,
      outsourcingListParams,
      routeOutsourcingFactID,
      routeOutsourcingOrderID,
    ]
  )
  const { exporting, exportRows: exportOrders } = useBusinessListExport({
    requestKey: 'outsourcing-orders-export',
    loadRows: loadExportOrders,
    filename: `委外订单-${currentBusinessDate()}.csv`,
    columns: visibleDataColumns,
    recordLabel: '加工合同',
  })

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      linkedKeyword ||
      routeOutsourcingOrderID ||
      routeOutsourcingFactID ||
      lifecycleScope !== LIFECYCLE_SCOPE.CURRENT ||
      statusFilter ||
      supplierFilter ||
      dateRange?.[0] ||
      dateRange?.[1]
  )
  const clearRouteContext = useCallback(
    (resetScope = false) => {
      const nextParams = clearLinkedDocumentParams(searchParams)
      nextParams.delete('outsourcing_order_id')
      nextParams.delete('outsourcing_fact_id')
      setSearchParams(
        resetScope
          ? withLifecycleScopeSearchParam(nextParams, LIFECYCLE_SCOPE.CURRENT)
          : nextParams,
        { replace: true }
      )
      setResolvedLinkedContext({ routeKey: '', keyword: '' })
      setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
    },
    [searchParams, setSearchParams]
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setLifecycleScope(LIFECYCLE_SCOPE.CURRENT)
    setStatusFilter('')
    setSupplierFilter('')
    setDateField('order_date')
    setDateRange([null, null])
    setPagination((current) => ({ ...current, current: 1 }))
    clearRouteContext(true)
  }, [clearRouteContext])

  const selectedWorkflowTasks = useMemo(
    () =>
      selectedRow?.id
        ? filterBusinessCollaborationTasksBySource({
            tasks: workflowTasks,
            sourceType: OUTSOURCING_ORDERS_MODULE_KEY,
            sourceIDs: [selectedRow.id],
          })
        : [],
    [selectedRow, workflowTasks]
  )

  const selectedItems = selectedRow
    ? [
        {
          key: selectedRow.id,
          label: getOutsourcingOrderDisplayNo(selectedRow),
          title: `${resolveSupplierName(selectedRow)} / ${statusText(
            selectedRow.lifecycle_status,
            OUTSOURCING_ORDER_STATUS_LABELS,
            '委外订单状态'
          )}`,
        },
      ]
    : []
  const lifecycleActions = resolveBusinessLifecycleActions({
    actions: OUTSOURCING_ORDER_LIFECYCLE_ACTIONS,
    selected: Boolean(selectedRow),
    busy: saving,
    hasPermission: (action) =>
      hasActionPermission(adminProfile, action.permission),
    canRun: (action) =>
      canRunOutsourcingOrderLifecycleAction(
        selectedRow?.lifecycle_status,
        action.nextStatus
      ),
    selectionReason: '请先选择一条加工合同',
    busyReason: '当前合同操作完成后可继续办理',
    getUnavailableReason: (action) => `当前加工合同状态不能${action.label}`,
  })
  const {
    showPrimarySlot: showLifecyclePrimary,
    showMoreSlot: showLifecycleMore,
    primaryAction: primaryLifecycleAction,
    secondaryActions: secondaryLifecycleActions,
    actionStates: lifecycleActionStates,
  } = lifecycleActions
  const primaryLifecycleState = lifecycleActionStates[
    primaryLifecycleAction?.key
  ] || {
    disabled: true,
    disabledReason: '请先选择一条加工合同',
  }
  const relatedOutsourcingFactsAvailability =
    resolveContextualBusinessActionAvailability({
      authorized: canReadOutsourcingFacts,
      selected: Boolean(selectedRow),
      busy: returnRecordsLoading,
      busyReason: '委外记录加载完成后可继续',
    })

  return (
    <BusinessPageLayout className="erp-v1-outsourcing-orders-page">
      <PageHeaderCard
        compact
        helpKey="processing-contracts"
        title="委外订单"
        description="维护加工合同、工序明细、加工厂承诺和打印内容；已确认合同可从对应明细登记发料或回货草稿，之后请分别到委外记录、质量检验和应付页面继续办理。"
        tags={[
          <Tag color="blue" key="source">
            业务单据：加工合同
          </Tag>,
          <Tag color="green" key="process">
            工序来自加工环节字典
          </Tag>,
          <Tag color="purple" key="checking">
            查货只是工序候选
          </Tag>,
          <Tag color="gold" key="fact">
            发料、质检、应付分开办理
          </Tag>,
        ]}
        stats={pageStats}
      />

      <BusinessOperationPanel
        compact
        onClearFilters={clearFilters}
        clearFiltersDisabled={!hasActiveFilters}
        filters={
          <>
            <SearchInput
              value={resolvedLinkedKeyword || linkedKeyword || keyword}
              placeholder="搜索合同"
              searchHint="可搜索：合同号、来源订单"
              onChange={(event) => {
                if (
                  linkedKeyword ||
                  routeOutsourcingOrderID ||
                  routeOutsourcingFactID
                ) {
                  clearRouteContext()
                }
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
                setKeyword(event.target.value)
              }}
              onPressEnter={() => {
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
                loadOrders()
              }}
            />
            <LifecycleScopeFilter
              value={lifecycleScope}
              onChange={(nextScope) => {
                setLifecycleScope(nextScope)
                if (
                  !lifecycleScopeIncludesStatus(nextScope, statusFilter, [
                    'closed',
                    'canceled',
                  ])
                ) {
                  setStatusFilter('')
                }
                const nextParams = clearLinkedDocumentParams(searchParams)
                nextParams.delete('outsourcing_order_id')
                nextParams.delete('outsourcing_fact_id')
                setSearchParams(
                  withLifecycleScopeSearchParam(nextParams, nextScope),
                  { replace: true }
                )
                setResolvedLinkedContext({ routeKey: '', keyword: '' })
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={lifecycleStatusOptions}
              onChange={(value) => {
                setStatusFilter(value)
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={supplierFilter}
              options={[{ label: '全部加工厂', value: '' }, ...supplierOptions]}
              placeholder="全部加工厂"
              showSearch
              optionFilterProp="label"
              onChange={(value) => {
                setSupplierFilter(value || '')
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
            />
            <DateRangeFilter
              options={OUTSOURCING_ORDER_DATE_FILTER_OPTIONS}
              value={dateField}
              onTypeChange={(value) => {
                setDateField(value || 'order_date')
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
              startValue={dateRange?.[0] || ''}
              endValue={dateRange?.[1] || ''}
              onStartChange={(value) => {
                setDateRange((current) => [value, current?.[1] || ''])
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
              onEndChange={(value) => {
                setDateRange((current) => [current?.[0] || '', value])
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--sort"
              value={sortValue}
              options={OUTSOURCING_ORDER_SORT_OPTIONS}
              onChange={(value) => {
                setSortValue(value)
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
              }}
            />
          </>
        }
        actions={
          <Space wrap>
            <ToolbarButton
              icon={<DownloadOutlined />}
              loading={exporting}
              disabled={loading || exporting || total === 0}
              onClick={exportOrders}
            >
              导出筛选结果
            </ToolbarButton>
            <ToolbarButton
              icon={<SettingOutlined />}
              onClick={() => setColumnOrderOpen(true)}
            >
              列顺序
            </ToolbarButton>
            {canUpdate ? (
              <BusinessActionTooltip
                disabled={
                  !selectedOrderCanReorder ||
                  lineOrderLoading ||
                  saving
                }
                disabledReason={
                  !selectedRow
                    ? '请先选择一条加工合同'
                    : !selectedOrderCanReorder
                      ? '当前状态不能调整加工明细顺序'
                      : lineOrderLoading || saving
                        ? '当前合同操作完成后可调整加工明细顺序'
                        : ''
                }
              >
                <ToolbarButton
                  icon={<OrderedListOutlined />}
                  loading={lineOrderLoading}
                  disabled={
                    !selectedOrderCanReorder ||
                    lineOrderLoading ||
                    saving
                  }
                  onClick={openOutsourcingOrderLineOrder}
                >
                  加工明细顺序
                </ToolbarButton>
              </BusinessActionTooltip>
            ) : null}
          </Space>
        }
        primaryAction={
          canCreate ? (
            <ToolbarButton
              type="primary"
              className="erp-business-list-toolbar__primary-action"
              icon={<PlusOutlined />}
              onClick={openCreate}
            >
              新建加工合同
            </ToolbarButton>
          ) : null
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedLabel}
          selectedItems={selectedItems}
          summaryItems={
            selectedRow
              ? [
                  {
                    key: 'status',
                    label: '状态',
                    value: statusText(
                      selectedRow.lifecycle_status,
                      OUTSOURCING_ORDER_STATUS_LABELS,
                      '委外订单状态'
                    ),
                  },
                ]
              : []
          }
          boundaryText="确认下单只确认加工合同，不会同时完成发料、回货、质检或应付；这些事项请到对应页面继续办理。"
        >
          <SelectionClearAction
            selectedCount={selectedRow ? 1 : 0}
            selectionLabel="加工合同"
            label="清空"
            onClear={() => setSelectedRow(null)}
          />
          {canUpdate ? (
            <BusinessActionTooltip
              disabled={
                !selectedRow ||
                !canEditOutsourcingOrder(selectedRow) ||
                itemsLoading
              }
              disabledReason={
                !selectedRow
                  ? '请先选择一条加工合同'
                  : !canEditOutsourcingOrder(selectedRow)
                    ? '只有草稿加工合同可以编辑'
                    : itemsLoading
                      ? '合同明细加载完成后可编辑'
                      : ''
              }
            >
              <Button
                data-business-action-key="outsourcing-edit"
                size="small"
                icon={<EditOutlined />}
                loading={itemsLoading}
                disabled={
                  !selectedRow ||
                  !canEditOutsourcingOrder(selectedRow) ||
                  itemsLoading
                }
                onClick={() => openEdit(selectedRow)}
              >
                编辑
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {relatedOutsourcingFactsAvailability.visible ? (
            <BusinessActionTooltip
              disabled={relatedOutsourcingFactsAvailability.disabled}
              disabledReason={
                relatedOutsourcingFactsAvailability.disabledReason
              }
            >
              <Button
                data-business-action-key="related-outsourcing-facts"
                size="small"
                disabled={relatedOutsourcingFactsAvailability.disabled}
                loading={returnRecordsLoading}
                onClick={() => openRelatedReturnRecords(selectedRow)}
              >
                委外记录
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {showLifecyclePrimary ? (
            <BusinessLifecyclePrimaryAction
              action={primaryLifecycleAction}
              disabled={primaryLifecycleState.disabled}
              disabledReason={primaryLifecycleState.disabledReason}
              loading={saving && Boolean(primaryLifecycleAction)}
              onAction={runLifecycleAction}
            />
          ) : null}
          <BusinessActionTooltip
            disabled={!selectedRow || printingAction !== ''}
            disabledReason={
              !selectedRow ? '请先选择一条加工合同' : '当前打印任务完成后可继续'
            }
          >
            <Button
              data-business-action-key="processing-contract-print"
              size="small"
              icon={<PrinterOutlined />}
              disabled={!selectedRow || printingAction !== ''}
              loading={printingAction === PROCESSING_CONTRACT_TEMPLATE_KEY}
              onClick={openProcessingContractPrint}
            >
              加工合同打印
            </Button>
          </BusinessActionTooltip>
          <BusinessActionTooltip
            disabled={!selectedRow || printingAction !== ''}
            disabledReason={
              !selectedRow ? '请先选择一条加工合同' : '当前打印任务完成后可继续'
            }
          >
            <Button
              data-business-action-key="work-instruction-print"
              size="small"
              icon={<PrinterOutlined />}
              disabled={!selectedRow || printingAction !== ''}
              loading={printingAction === WORK_INSTRUCTION_TEMPLATE_KEY}
              onClick={openWorkInstructionPrint}
            >
              作业指导书打印
            </Button>
          </BusinessActionTooltip>
          {showLifecycleMore ? (
            <BusinessLifecycleMoreAction
              actions={secondaryLifecycleActions}
              actionStates={lifecycleActionStates}
              getPopupContainer={(triggerNode) =>
                triggerNode.parentElement || document.body
              }
              onAction={runLifecycleAction}
            />
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessDataTable
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        expandable={outsourcingOrderItemsPreview.expandable}
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
        onOpenRecord={openOutsourcingOrderRecord}
        emptyDescription="暂无加工合同"
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
          showTotal: (nextTotal, range) =>
            `第 ${range[0]}-${range[1]} 条 / 共 ${nextTotal} 条`,
        }}
        scroll={{ x: 1220 }}
      />

      {outsourcingOrderItemsPreview.modal}

      <BusinessDetailsModal
        columns={detailColumns}
        description="查看加工合同摘要和完整明细；草稿且具备编辑权限时，双击会直接进入编辑。"
        lineItems={
          canRead
            ? {
                emptyDescription: '当前加工合同暂无明细',
                getItemFields: getOutsourcingOrderItemFields,
                getItemLabel: (item, { index }) =>
                  `明细 ${item?.line_no || index + 1}`,
                getItemSummary: (item) => {
                  const isMaterial =
                    item?.subject_type ===
                    OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL
                  const subject = isMaterial
                    ? [
                        item?.material_code_snapshot,
                        item?.material_name_snapshot,
                      ]
                    : [
                        item?.product_no_snapshot,
                        item?.sku_code_snapshot,
                        item?.product_name_snapshot,
                      ]
                  return [...subject, item?.process_name_snapshot]
                    .filter(Boolean)
                    .join(' / ')
                },
                load: loadAllOutsourcingOrderItemsForPreview,
                title: '加工合同明细',
              }
            : null
        }
        open={Boolean(detailOrder)}
        record={detailOrder}
        title="加工合同详情"
        onClose={() => setDetailOrder(null)}
      >
        {detailOrder?.id ? (
          <BusinessAttachmentPanel
            ownerType="outsourcing_order"
            ownerId={detailOrder.id}
            title="加工合同附件"
            description="查看本合同归档附件；“合同附图”会在打开打印窗口时带入末尾。"
            canUpload={false}
            canWithdraw={false}
          />
        ) : null}
      </BusinessDetailsModal>

      <OutsourcingOrderSourceFactModal
        open={sourceFactOpen}
        mode={sourceFactContext.mode}
        initialValues={sourceFactContext.initialValues}
        record={sourceFactContext.record}
        actionType={sourceFactContext.actionType}
        order={sourceFactContext.order}
        item={sourceFactContext.item}
        warehouses={warehouses}
        lots={sourceFactContext.lots}
        facts={sourceFactContext.facts}
        loading={sourceFactLoading}
        onCancel={closeOutsourcingSourceFact}
        onSubmit={submitOutsourcingSourceFact}
      />

      <OutsourcingReturnRecordsModal
        open={returnRecordsOpen}
        order={returnRecordsOrder}
        facts={relatedReturnFacts}
        loading={returnRecordsLoading}
        actionLoading={returnRecordActionLoading}
        canPostFact={canPostOutsourcingFact}
        canCancelFact={canCancelOutsourcingFact}
        canEditMaterialIssue={canCreateMaterialIssue}
        canEditReturnReceipt={canCreateReturnReceipt}
        canCreateQualityInspection={canCreateQualityInspection}
        canViewQualityInspection={canOpenQualityInspection}
        canViewDisposition={canReadOutsourcingFacts}
        qualityInspectionByFactID={qualityInspectionByFactID}
        canCreatePayable={canCreatePayable}
        canViewPayable={canViewPayable}
        onCancel={closeRelatedReturnRecords}
        onPostFact={postSelectedOutsourcingFact}
        onCancelFact={cancelSelectedOutsourcingFact}
        onEditFact={openOutsourcingFactDraftEditor}
        onCreateQualityInspection={openOutsourcingReturnQualityInspection}
        onViewQualityInspection={viewOutsourcingReturnQualityInspection}
        onViewDisposition={openOutsourcingReturnDisposition}
        onGeneratePayable={openOutsourcingReturnPayable}
        onViewPayable={viewOutsourcingReturnPayable}
      />

      <OutsourcingReturnQualityInspectionModal
        open={Boolean(qualitySourceFact)}
        order={returnRecordsOrder}
        fact={qualitySourceFact}
        loading={qualitySourceLoading}
        onCancel={closeOutsourcingReturnQualityInspection}
        onSubmit={submitOutsourcingReturnQualityInspection}
      />

      <OutsourcingReturnDispositionModal
        open={Boolean(dispositionSourceFact)}
        fact={dispositionSourceFact}
        canCreate={false}
        canPost={canPostOutsourcingFact}
        canCancel={canCancelOutsourcingFact}
        onClose={closeOutsourcingReturnDisposition}
      />

      <FinanceBusinessSourceModal
        action={FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_RETURN_PAYABLE}
        open={Boolean(financeSourceFact)}
        source={financeSourceFact}
        initialValues={financeSourceInitialValues}
        loading={financeSourceLoading}
        onCancel={closeOutsourcingReturnPayable}
        onSubmit={submitOutsourcingReturnPayable}
      />

      <CollaborationTaskPanel
        tasks={
          canReadWorkflowTasks && workflowTaskLoadState === 'ready'
            ? selectedWorkflowTasks
            : []
        }
        selectedRecordLabel={
          selectedRow ? getOutsourcingOrderDisplayNo(selectedRow) : ''
        }
        adminProfile={adminProfile}
        onOpenTaskBoard={() => navigate('/erp/task-board')}
        onCompleteTask={
          canCompleteWorkflowTasks ? completeWorkflowTask : undefined
        }
        onBlockTask={canUpdateWorkflowTasks ? blockWorkflowTask : undefined}
        onRejectTask={canUpdateWorkflowTasks ? rejectWorkflowTask : undefined}
        onResumeTask={canUpdateWorkflowTasks ? resumeWorkflowTask : undefined}
        onUrgeTask={
          canUpdateWorkflowTasks ? urgeOutsourcingWorkflowTask : undefined
        }
      />

      <ColumnOrderModal
        open={columnOrderOpen}
        columns={dataColumns}
        order={preferredColumnOrder}
        saving={columnOrderSaving}
        moduleTitle="委外订单列表"
        onChange={(nextOrder) => persistColumnOrder(nextOrder, dataColumns)}
        onClose={() => setColumnOrderOpen(false)}
      />

      <BusinessLineItemOrderModal
        description="保存后只调整当前加工合同的明细展示顺序，不修改产品或材料、数量、价格或稳定行号。"
        getItemLabel={outsourcingOrderLineOrderLabel}
        itemNoun="加工明细"
        items={lineOrderContext.items}
        open={lineOrderOpen}
        title="调整加工明细顺序"
        onApply={applyOutsourcingOrderLineOrder}
        onClose={() => {
          lineOrderRequestRef.current += 1
          setLineOrderOpen(false)
        }}
      />

      <BusinessFormModal
        icon={<FileTextOutlined />}
        title={editingRow ? '编辑加工合同' : '新建加工合同'}
        description="只维护委外订单和加工明细；车缝、手工等选产品 / 半成品，布料加工选材料。结果判定、库存和应付由后续业务处理。"
        open={modalOpen}
        onCancel={closeModal}
        onOk={submitForm}
        confirmLoading={saving}
        forceRender
      >
        <OutsourcingOrderForm
          form={form}
          supplierOptions={supplierOptions}
          onSupplierChange={handleSupplierChange}
          supplierContacts={supplierContacts}
          supplierContactsLoading={supplierContactsLoading}
          onSupplierContactNameChange={handleSupplierContactNameChange}
          onSupplierContactSelect={handleSupplierContactSelect}
          productOptions={productOptions}
          productSKUs={productSKUs}
          materialOptions={materialOptions}
          processOptions={processOptions}
          unitOptions={unitOptions}
          onSubjectTypeChange={handleSubjectTypeChange}
          onProductChange={handleProductChange}
          onProductSKUChange={handleProductSKUChange}
          onMaterialChange={handleMaterialChange}
          onProcessChange={handleProcessChange}
          onUnitChange={handleUnitChange}
          attachmentPanel={
            <BusinessAttachmentPanel
              ref={orderAttachmentRef}
              ownerType="outsourcing_order"
              ownerId={editingRow?.id}
              title="加工合同附件"
              description="普通附件用于归档纸样、图纸、签回合同或报价依据；标记为合同附图的图片会在打开加工合同打印时冻结带入末尾。"
              enablePrintAppendixUpload
              canUpload={canUpdate || canCreate}
              canWithdraw={canUpdate || canCreate}
              variant="inline"
            />
          }
        />
      </BusinessFormModal>
    </BusinessPageLayout>
  )
}
