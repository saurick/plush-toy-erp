import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  PrinterOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Form, Space, Tag } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import useLatestRequestCoordinator from '../hooks/useLatestRequestCoordinator.js'
import {
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  CollaborationTaskPanel,
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
} from '../components/business-list/ColumnOrderModal.jsx'
import { useBusinessRowItemsPreview } from '../components/business-list/BusinessRowItemsPreview.jsx'
import {
  downloadBusinessCSV,
  getPreferredColumnOrder,
  writeStoredColumnOrder,
} from '../components/business-list/businessListPreferences.mjs'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import OutsourcingOrderForm, {
  materialLabel,
  productLabel,
  processLabel,
  supplierLabel,
  todayInputValue,
  unitLabel,
} from '../components/outsourcing-orders/OutsourcingOrderForm.jsx'
import OutsourcingOrderSourceFactModal from '../components/outsourcing-orders/OutsourcingOrderSourceFactModal.jsx'
import OutsourcingReturnRecordsModal from '../components/outsourcing-orders/OutsourcingReturnRecordsModal.jsx'
import OutsourcingReturnQualityInspectionModal from '../components/quality-inspections/OutsourcingReturnQualityInspectionModal.jsx'
import FinanceBusinessSourceModal from '../components/finance/FinanceBusinessSourceModal.jsx'
import {
  buildOutsourcingOrderColumns,
  renderOutsourcingOrderStatusTag,
} from '../components/outsourcing-orders/outsourcingOrderColumns.jsx'
import {
  listAllOutsourcingOrderItems,
  getOutsourcingOrder,
  listOutsourcingOrderItemsPreview,
  listOutsourcingOrders,
  listMaterials,
  listProcesses,
  listProducts,
  listProductSKUs,
  listContactsByOwner,
  listSuppliers,
  listUnits,
  listWarehouses,
  saveOutsourcingOrderWithItems,
} from '../api/masterDataOrderApi.mjs'
import {
  createOutsourcingMaterialIssueFromOrder,
  createOutsourcingReturnReceiptFromOrder,
  createPayableFromOutsourcingReturn,
  listOutsourcingFacts,
} from '../api/operationalFactApi.mjs'
import { listInventoryLots } from '../api/inventoryApi.mjs'
import {
  createQualityInspectionFromOutsourcingReturn,
  listOutsourcingReturnQualityInspections,
} from '../api/qualityApi.mjs'
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
import { filterBusinessCollaborationTasksBySource } from '../utils/businessCollaborationTasks.mjs'
import {
  buildSourceDocumentItemSaveParams,
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
import { getEffectivePrintTemplateDefaults } from '../utils/adminProfileSync.mjs'
import { buildProcessingContractDraftFromOutsourcingOrder } from '../data/processingContractTemplate.mjs'
import {
  WORK_INSTRUCTION_TEMPLATE_KEY,
  buildWorkInstructionDraftFromOutsourcingOrder,
} from '../data/engineeringPrintTemplates.mjs'
import {
  completeProcessingContractDraft,
  mergeSnapshotMissingFields,
} from '../utils/contractPrintDraftCompleteness.mjs'
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
import {
  routeWithQuery,
  searchParamPositiveIntText,
} from '../utils/routeQuery.mjs'

const EMPTY_SOURCE_FACT_CONTEXT = Object.freeze({
  actionType: '',
  order: null,
  item: null,
  lots: [],
  facts: [],
})

export default function V1OutsourcingOrdersPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
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
  const orderAttachmentRef = useRef(null)
  const [suppliers, setSuppliers] = useState([])
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
  const [qualityInspectionByFactID, setQualityInspectionByFactID] = useState({})
  const [qualitySourceFact, setQualitySourceFact] = useState(null)
  const [qualitySourceLoading, setQualitySourceLoading] = useState(false)
  const [financeSourceFact, setFinanceSourceFact] = useState(null)
  const [financeSourceLoading, setFinanceSourceLoading] = useState(false)
  const sourceFactRequestRef = useRef(0)
  const sourceFactInFlightRef = useRef(false)
  const sourceFactAttemptsRef = useRef(createSourceBusinessActionAttemptStore())
  const financeSourceAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const financeSourceInFlightRef = useRef(false)
  const qualitySourceInFlightRef = useRef(false)
  const routeOutsourcingOrderID = searchParamPositiveIntText(
    searchParams,
    'outsourcing_order_id'
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
        listSuppliers({ active_only: true, limit: 200 }),
        listProducts({ active_only: true, limit: 200 }),
        listProductSKUs({ limit: 500 }),
        listMaterials({ active_only: true, limit: 200 }),
        listProcesses({ active_only: true, limit: 200 }),
        listUnits({ limit: 200 }),
        listWarehouses({ active_only: true, limit: 200 }),
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

  const loadOrders = useCallback(async () => {
    const request = beginLatestRequest('orders')
    setLoading(true)
    try {
      const { sortBy, sortDirection } =
        parseOutsourcingOrderSortValue(sortValue)
      const routeSelectedID = Number(routeOutsourcingOrderID || 0)
      const [data, routeOrder] = await Promise.all([
        listOutsourcingOrders(
          {
            keyword,
            supplier_id: supplierFilter || undefined,
            lifecycle_status: statusFilter,
            date_field: dateField,
            date_from: dateRange?.[0] || undefined,
            date_to: dateRange?.[1] || undefined,
            sort_by: sortBy,
            sort_direction: sortDirection,
            limit: pagination.pageSize,
            offset: (pagination.current - 1) * pagination.pageSize,
          },
          { signal: request.signal }
        ),
        routeSelectedID > 0
          ? getOutsourcingOrder(
              { id: routeSelectedID },
              { signal: request.signal }
            )
          : Promise.resolve(null),
      ])
      if (!request.isCurrent()) {
        return
      }
      const listedRows = data?.outsourcing_orders || []
      const nextRows = routeOrder
        ? [
            routeOrder,
            ...listedRows.filter((item) => item.id !== routeOrder.id),
          ]
        : listedRows
      setRows(nextRows)
      setTotal(
        Number(data?.total || 0) +
          (routeOrder && !listedRows.some((item) => item.id === routeOrder.id)
            ? 1
            : 0)
      )
      setSelectedRow((prev) => {
        if (routeSelectedID > 0) return routeOrder
        return prev
          ? nextRows.find((item) => item.id === prev.id) || null
          : null
      })
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return
      }
      message.error(getActionErrorMessage(error, '加载委外订单失败'))
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [
    beginLatestRequest,
    dateField,
    dateRange,
    keyword,
    pagination,
    routeOutsourcingOrderID,
    sortValue,
    statusFilter,
    supplierFilter,
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
  const canReadOutsourcingFacts = hasActionPermission(
    adminProfile,
    'outsourcing.fact.read'
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
  const canCreatePayable = hasActionPermission(
    adminProfile,
    'finance.payable.confirm'
  )
  const canViewPayable =
    canCreatePayable ||
    hasActionPermission(adminProfile, 'finance.payable.read')
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
      const data = await listOutsourcingFacts({
        source_type: 'OUTSOURCING_ORDER',
        source_id: Number(orderID),
        limit: 500,
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
            const data = await listOutsourcingReturnQualityInspections({
              customer_key: activeCustomerKey || undefined,
              fact_id: fact.id,
              limit: 200,
            })
            return Array.isArray(data?.quality_inspections)
              ? data.quality_inspections
              : []
          })
        )
      ).flat()
      return groupOutsourcingReturnQualityInspections(
        inspections,
        facts
      )
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
        message.error(getActionErrorMessage(error, '读取委外回货记录'))
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
            const reread = await listOutsourcingReturnQualityInspections({
              customer_key: activeCustomerKey || undefined,
              fact_id: fact.id,
              limit: 50,
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
            : '质检草稿已生成，请到质量检验继续办理'
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

  const openOutsourcingReturnPayable = useCallback(
    (fact) => {
      if (
        !canCreatePayable ||
        !isPostedOutsourcingReturn(fact)
      ) {
        message.warning('请先选择已过账的委外回货记录')
        return
      }
      const qualityGate = resolveOutsourcingReturnQualityGate(
        qualityInspectionByFactID?.[fact.id] || []
      )
      if (
        qualityGate.state !==
        OUTSOURCING_RETURN_QUALITY_GATE_STATES.ACCEPTED
      ) {
        message.warning(
          qualityGate.state ===
            OUTSOURCING_RETURN_QUALITY_GATE_STATES.REJECTED
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
            '应付生成结果暂时无法确认，已保留本次请求，请使用相同内容重试'
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
      if (!fact?.id) return
      navigate(
        routeWithQuery(V1_ROUTE_PATHS.payables, {
          source_type: 'OUTSOURCING_FACT',
          source_id: fact.id,
        })
      )
    },
    [navigate]
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
          listInventoryLots({
            subject_type: subjectType,
            subject_id: subjectID,
            ...(Number(item.product_sku_id || 0) > 0
              ? { product_sku_id: Number(item.product_sku_id) }
              : {}),
            status: 'ACTIVE',
            limit: 500,
          }),
          loadRelatedOutsourcingFacts(order.id),
          listWarehouses({ active_only: true, limit: 500 }),
        ])
        if (sourceFactRequestRef.current !== requestID) {
          return
        }
        setSourceFactContext({
          actionType,
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
          message.error(getActionErrorMessage(error, '加载委外办理上下文'))
        }
      } finally {
        if (sourceFactRequestRef.current === requestID) {
          setSourceFactLoading(false)
        }
      }
    },
    [loadRelatedOutsourcingFacts]
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
          label: '加工对象类型',
          value: isMaterial ? '材料' : '产品 / 半成品',
        },
        ...(isMaterial
          ? [
              { label: '材料编码', value: item?.material_code_snapshot },
              { label: '材料名称', value: item?.material_name_snapshot },
            ]
          : [
              {
                label: '产品订单编号',
                value: item?.product_order_no_snapshot,
              },
              { label: '产品编号', value: item?.product_no_snapshot },
              { label: '产品规格', value: item?.sku_code_snapshot },
              { label: '产品名称', value: item?.product_name_snapshot },
            ]),
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
        ...(view === 'modal'
          ? [{ label: '备注', value: item?.note, wide: true }]
          : []),
        ...(sourceAction
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
      const { actionType, order, item, facts } = sourceFactContext
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
              '委外业务生成结果仍无法确认，已保留本次请求，请使用相同内容重试'
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
              ? '已重新读取并确认委外发料草稿，请到委外记录核对并过账'
              : '已重新读取并确认委外回货草稿，请到委外记录核对并过账'
            : actionType === OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
              ? '委外发料草稿已生成，请到委外记录核对并过账'
              : '委外回货草稿已生成，请到委外记录核对并过账'
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
      source_order_no: '',
      order_date: todayInputValue(),
      expected_return_date: '',
      contract_party_snapshot: contractPartySnapshotFromPrintTemplateDefaults(
        processingPrintTemplateDefaults,
        PROCESSING_CONTRACT_TEMPLATE_KEY
      ),
      note: '',
      items: [createBlankOutsourcingLine(1)],
    })
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

  const closeModal = () => {
    sourceDocumentOpenEditController.invalidate()
    orderAttachmentRef.current?.clearPendingAttachments()
    setModalOpen(false)
    setEditingRow(null)
    form.resetFields()
  }

  const loadWorkflowTasks = useCallback(async () => {
    if (!canReadWorkflowTasks) {
      setWorkflowTasks([])
      return
    }
    try {
      const data = await listWorkflowTasks({
        source_type: OUTSOURCING_ORDERS_MODULE_KEY,
        limit: 200,
      })
      setWorkflowTasks(data?.tasks || [])
    } catch (error) {
      setWorkflowTasks([])
      message.error(getActionErrorMessage(error, '加载委外协同任务失败'))
    }
  }, [canReadWorkflowTasks])

  useEffect(() => {
    loadWorkflowTasks()
  }, [loadWorkflowTasks])

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
      ...(productSKU && Number(productSKU.default_unit_id || 0) !== Number(unitID)
        ? { product_sku_id: undefined, sku_code_snapshot: '' }
        : {}),
    })
  }

  const resolveSupplierSnapshot = useCallback(
    async (supplier, options = {}) => {
      const baseSnapshot = buildSupplierSnapshot(supplier)
      if (!supplier?.id) {
        return baseSnapshot
      }
      try {
        const data = await listContactsByOwner({
          owner_type: SUPPLIER_CONTACT_OWNER_TYPE,
          owner_id: supplier.id,
          active_only: true,
          limit: 50,
        })
        return buildSupplierSnapshotWithContacts(supplier, data?.contacts || [])
      } catch (error) {
        if (options.notifyOnError) {
          message.warning(
            `${getActionErrorMessage(error, '加载加工厂联系人')}，将仅保存加工厂基本信息`
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

  const submitForm = async () => {
    setSaving(true)
    try {
      let payload
      try {
        const values = await form.validateFields()
        const supplier = suppliers.find(
          (item) => item.id === values.supplier_id
        )
        const supplierSnapshot = await resolveSupplierSnapshot(supplier, {
          notifyOnError: true,
        })
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
      const refreshEffect = await settleSourceDocumentPostSaveEffect(() =>
        Promise.all([loadOrders(), loadWorkflowTasks()])
      )
      if (refreshEffect.status === 'rejected') {
        message.warning(
          getActionErrorMessage(
            refreshEffect.error,
            '刷新加工合同列表和协同任务'
          )
        )
      }
    } finally {
      setSaving(false)
    }
  }

  const runLifecycleAction = async (action) => {
    if (!selectedRow) return
    const execute = async () => {
      setSaving(true)
      try {
        const updated = await action.run({ id: selectedRow.id })
        setSelectedRow(updated)
        message.success(`${action.label}成功`)
        await Promise.all([loadOrders(), loadWorkflowTasks()])
      } catch (error) {
        message.error(getActionErrorMessage(error, `${action.label}失败`))
      } finally {
        setSaving(false)
      }
    }

    if (action.confirmTitle) {
      modal.confirm({
        title: action.confirmTitle,
        content: action.confirmContent,
        okText: action.okText || '确认',
        cancelText: '取消',
        okButtonProps: { danger: action.danger },
        onOk: execute,
      })
      return
    }
    await execute()
  }

  const openProcessingContractPrint = async () => {
    if (!selectedRow) return
    setPrintingAction(PROCESSING_CONTRACT_TEMPLATE_KEY)
    try {
      const items = await loadOrderItems(selectedRow)
      const supplier = suppliers.find(
        (item) => item.id === selectedRow.supplier_id
      )
      const liveSupplierSnapshot =
        typeof resolveSupplierSnapshot === 'function' && supplier
          ? await resolveSupplierSnapshot(supplier)
          : {}
      const printRecord = {
        ...selectedRow,
        supplier_snapshot: mergeSnapshotMissingFields(
          selectedRow.supplier_snapshot,
          liveSupplierSnapshot
        ),
      }
      const initialDraft = completeProcessingContractDraft(
        buildProcessingContractDraftFromOutsourcingOrder(printRecord, items, {
          printTemplateDefaults: processingPrintTemplateDefaults,
        })
      )
      if (initialDraft.lines.length === 0) {
        message.warning('当前委外订单没有可打印的明细')
        return
      }
      openPrintWorkspaceWindow(PROCESSING_CONTRACT_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        customerKey: activeCustomerKey,
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
      const initialDraft = buildWorkInstructionDraftFromOutsourcingOrder(
        selectedRow,
        activeItems,
        {
          companyName: resolveRuntimeCustomerPrintCompanyName(),
        }
      )
      openPrintWorkspaceWindow(WORK_INSTRUCTION_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        customerKey: activeCustomerKey,
      })
      message.success('已打开作业指导书打印模板')
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

  const exportOrders = useCallback(() => {
    if (rows.length === 0) return
    downloadBusinessCSV({
      filename: `outsourcing-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: visibleDataColumns,
      rows,
    })
  }, [rows, visibleDataColumns])

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      supplierFilter ||
      dateRange?.[0] ||
      dateRange?.[1]
  )
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setSupplierFilter('')
    setDateField('order_date')
    setDateRange([null, null])
    setPagination((current) => ({ ...current, current: 1 }))
  }, [])

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
  const visibleLifecycleActions = selectedRow
    ? OUTSOURCING_ORDER_LIFECYCLE_ACTIONS.filter(
        (action) =>
          hasActionPermission(adminProfile, action.permission) &&
          canRunOutsourcingOrderLifecycleAction(
            selectedRow.lifecycle_status,
            action.nextStatus
          )
      )
    : []
  const primaryLifecycleAction =
    visibleLifecycleActions.find((action) => action.key !== 'cancel') || null
  const secondaryLifecycleActions = visibleLifecycleActions.filter(
    (action) => action.key !== primaryLifecycleAction?.key
  )
  const lifecycleMenuItems =
    secondaryLifecycleActions.length > 0
      ? [
          {
            key: 'status-transitions',
            label: '状态变更',
            type: 'group',
            children: secondaryLifecycleActions.map((action) => ({
              key: action.key,
              label: action.label,
              danger: action.danger,
            })),
          },
        ]
      : []

  return (
    <BusinessPageLayout className="erp-v1-outsourcing-orders-page">
      <PageHeaderCard
        compact
        title="委外订单"
        description="维护加工合同、工序明细、加工厂承诺和打印内容；已确认合同可从对应明细发起发料或回货草稿，过账、质检和应付仍在对应业务模块处理。"
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
            不直接写质检 / 库存 / 应付
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
              value={keyword}
              placeholder="搜索合同"
              searchHint="可搜索：合同号、来源订单"
              onChange={(event) => {
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
                setKeyword(event.target.value)
              }}
              onPressEnter={() => {
                setPagination(DEFAULT_OUTSOURCING_ORDER_PAGINATION)
                loadOrders()
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={OUTSOURCING_ORDER_STATUS_OPTIONS}
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
              disabled={rows.length === 0}
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
            新建加工合同
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedLabel}
          selectedItems={selectedItems}
          boundaryText="加工合同只确认委外承诺和打印内容；查货只作为工序候选，判定结果在质检模块处理；确认下单不会自动更新库存、质检、应付或协同任务状态。"
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedRow}
            onClick={() => setSelectedRow(null)}
          >
            清空
          </Button>
          {selectedRow
            ? renderOutsourcingOrderStatusTag(selectedRow.lifecycle_status)
            : null}
          <Button
            size="small"
            icon={<EditOutlined />}
            loading={itemsLoading}
            disabled={
              !selectedRow ||
              !canUpdate ||
              !canEditOutsourcingOrder(selectedRow) ||
              itemsLoading
            }
            onClick={() => openEdit(selectedRow)}
          >
            编辑
          </Button>
          {canReadOutsourcingFacts ? (
            <Button
              size="small"
              disabled={!selectedRow || returnRecordsLoading}
              loading={returnRecordsLoading}
              onClick={() => openRelatedReturnRecords(selectedRow)}
            >
              相关回货记录
            </Button>
          ) : null}
          {primaryLifecycleAction ? (
            <Button
              size="small"
              type="primary"
              danger={primaryLifecycleAction.danger}
              icon={
                primaryLifecycleAction.danger ? (
                  <CloseCircleOutlined />
                ) : (
                  <CheckCircleOutlined />
                )
              }
              disabled={!selectedRow || saving}
              loading={saving}
              onClick={() => runLifecycleAction(primaryLifecycleAction)}
            >
              {primaryLifecycleAction.label}
            </Button>
          ) : null}
          <Button
            size="small"
            icon={<PrinterOutlined />}
            disabled={!selectedRow || printingAction !== ''}
            loading={printingAction === PROCESSING_CONTRACT_TEMPLATE_KEY}
            onClick={openProcessingContractPrint}
          >
            加工合同打印
          </Button>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            disabled={!selectedRow || printingAction !== ''}
            loading={printingAction === WORK_INSTRUCTION_TEMPLATE_KEY}
            onClick={openWorkInstructionPrint}
          >
            作业指导书打印
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            getPopupContainer={(triggerNode) =>
              triggerNode.parentElement || document.body
            }
            disabled={
              !selectedRow || saving || secondaryLifecycleActions.length === 0
            }
            menu={{
              items: lifecycleMenuItems,
              onClick: ({ key }) => {
                const action = secondaryLifecycleActions.find(
                  (item) => item.key === key
                )
                if (action) runLifecycleAction(action)
              },
            }}
          >
            <Button
              size="small"
              aria-label="更多操作"
              disabled={
                !selectedRow || saving || secondaryLifecycleActions.length === 0
              }
            >
              更多 <DownOutlined />
            </Button>
          </Dropdown>
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
          onDoubleClick: () => openEdit(record),
        })}
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

      <OutsourcingOrderSourceFactModal
        open={sourceFactOpen}
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
        productSKUs={productSKUs}
        loading={returnRecordsLoading}
        canCreateQualityInspection={canCreateQualityInspection}
        qualityInspectionByFactID={qualityInspectionByFactID}
        canCreatePayable={canCreatePayable}
        canViewPayable={canViewPayable}
        onCancel={closeRelatedReturnRecords}
        onCreateQualityInspection={openOutsourcingReturnQualityInspection}
        onGeneratePayable={openOutsourcingReturnPayable}
        onViewPayable={viewOutsourcingReturnPayable}
      />

      <OutsourcingReturnQualityInspectionModal
        open={Boolean(qualitySourceFact)}
        order={returnRecordsOrder}
        fact={qualitySourceFact}
        productSKUs={productSKUs}
        loading={qualitySourceLoading}
        onCancel={closeOutsourcingReturnQualityInspection}
        onSubmit={submitOutsourcingReturnQualityInspection}
      />

      <FinanceBusinessSourceModal
        action={FINANCE_BUSINESS_SOURCE_ACTIONS.OUTSOURCING_RETURN_PAYABLE}
        open={Boolean(financeSourceFact)}
        source={financeSourceFact}
        productSKUs={productSKUs}
        initialValues={financeSourceInitialValues}
        loading={financeSourceLoading}
        onCancel={closeOutsourcingReturnPayable}
        onSubmit={submitOutsourcingReturnPayable}
      />

      <CollaborationTaskPanel
        tasks={workflowTasks}
        selectedTasks={selectedWorkflowTasks}
        selectedRecordLabel={
          selectedRow ? getOutsourcingOrderDisplayNo(selectedRow) : ''
        }
        adminProfile={adminProfile}
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
              description="上传纸样、图纸、签回合同、加工要求或报价结算依据；附件不会改变库存、质检或应付记录。"
              canUpload={canUpdate || canCreate}
              canDelete={canUpdate}
              variant="inline"
            />
          }
        />
      </BusinessFormModal>
    </BusinessPageLayout>
  )
}
