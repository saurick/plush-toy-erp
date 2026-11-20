import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  PrinterOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Input, Popconfirm, Tag } from 'antd'
import { useLocation } from 'react-router-dom'
import { getBusinessDocumentTitle } from '../config/businessModules.mjs'
import useBusinessPageContext from '../hooks/useBusinessPageContext.js'
import useWorkflowTaskBusinessBusy from '../hooks/useWorkflowTaskBusinessBusy.js'
import useBusinessSearchParams from '../hooks/useBusinessSearchParams.js'
import useBusinessNavigate from '../hooks/useBusinessNavigate.js'
import { OperationalFactStatus, ShipmentStatus, StockReservationStatus } from '../../common/consts/statuses.generated.mjs'
import BusinessTaskActions from '../components/workflow/BusinessTaskActions.jsx'
import { operationalFactTaskContext } from '../utils/workflowFollowup.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import BusinessStatusFilter from '../components/business-list/BusinessStatusFilter.jsx'
import useBusinessPageState from '../hooks/useBusinessPageState.js'
import Tabs from '@/common/components/navigation/SlidingTabs'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import { BUSINESS_SEARCH_SCOPES } from '../utils/businessSearchScopes.mjs'
import { canReadProductionProcess, productionFactSummary } from '../utils/productionRecordViews.mjs'
import ProductionRecordDrawer from '../components/production-records/ProductionRecordDrawer.jsx'
import useTaskBusinessEditor from '../hooks/useTaskBusinessEditor.js'
import { useOperationalFactQuery } from '../components/operational-facts/useOperationalFactQuery.mjs'
import { useOperationalFactMutations } from '../components/operational-facts/useOperationalFactMutations.mjs'
import { operationalFactActionPresentation } from '../utils/businessFactActionPresentation.mjs'
import {
  useProductionFactActions,
  productionDraftSaveActionFor,
  productionDraftEditPermissions,
} from '../components/production-orders/useProductionFactActions.mjs'
import { useFinanceReconciliationAction } from '../components/finance/useFinanceReconciliationAction.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import {
  hasActionPermission,
  BUSINESS_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'

import { createBusinessTablePagination } from '../utils/businessPagination.mjs'
import { applyBusinessColumnSorters } from '../utils/moduleTableColumns.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
} from '../components/business-list/BusinessListLayout.jsx'
import { DateRangeFilter } from '../components/business-list/BusinessDateInputs.jsx'
import {
  BusinessListToolbarActions,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessAttachmentModalButton from '../components/business-list/BusinessAttachmentModalButton.jsx'
import BusinessDetailsModal from '../components/business-list/BusinessDetailsModal.jsx'
import FinanceBusinessSourceModal from '../components/finance/FinanceBusinessSourceModal.jsx'
import ProductionReworkModal from '../components/production-facts/ProductionReworkModal.jsx'
import ProductionCompletionModal from '../components/production-orders/ProductionCompletionModal.jsx'
import ProductionMaterialIssueModal from '../components/production-orders/ProductionMaterialIssueModal.jsx'
import ProductionReworkProgressModal from '../components/production-orders/ProductionReworkProgressModal.jsx'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import { buildFinanceDueModel, financeDueFilterOptions, paginateVisualizationRows } from '../utils/businessVisualizationModels.mjs'
import { financeDueColumns, FinanceDueQuickFilters, financeDueRowProps } from '../components/business-visualizations/FinanceDueOverview.jsx'
import ProductionProcessProgress from '../components/business-visualizations/ProductionProcessProgress.jsx'
import {
  VisualizationState,
  BusinessViewSurface,
  BusinessViewSwitch,
} from '../components/business-visualizations/BusinessVisualizationFrame.jsx'
import { listAllProductionOrders } from '../api/productionOrderApi.mjs'
import { getProductionWip } from '../api/productionWipApi.mjs'
import { routeWithQuery } from '../utils/routeQuery.mjs'
import {
  canOpenRelatedDocumentPath,
  relatedDocumentRoute,
} from '../utils/relatedDocumentNavigation.mjs'
import {
  PRINT_WORKSPACE_ENTRY_SOURCE,
  PROCESSING_CONTRACT_TEMPLATE_KEY,
  openPrintWorkspaceWindow,
} from '../utils/printWorkspace.js'
import { buildProcessingContractDraftFromOutsourcingFact } from '../data/processingContractTemplate.mjs'
import { canConfirmFinanceFact } from '../utils/financeFactPermissions.mjs'
import { canCancelFinanceFact } from '../utils/financeCancellation.mjs'

import {
  FINANCE_BUSINESS_SOURCE_ACTIONS,
  hasValidFinanceTransitionSource,
  isOutsourcingReturnPayableSource,
  isSingleFactReconciliationSource,
} from '../utils/financeBusinessSourceAction.mjs'

import useBusinessListExport from '../hooks/useBusinessListExport.js'
import useBusinessVisualizationData from '../hooks/useBusinessVisualizationData.js'
import { resolveContextualBusinessActionAvailability } from '../utils/businessActionAvailability.mjs'
import { resolveRelatedRecordActionAvailability } from '../utils/operationalActionAvailability.mjs'
import { isProductionReworkEligible } from '../utils/productionReworkAction.mjs'
import {
  hasAnyPermission,
  isFinishedGoodsReceipt,
  productionFactCancelPermissions,
  productionFactPostPermissions,
  selectedLabelForKey,
} from '../components/operational-facts/OperationalFactForms.jsx'
import { hasRequiredOperationalFactDraftSource } from '../utils/operationalFactDraftSource.mjs'

import {
  businessSourceInventoryRouteFor,
  businessSourceRouteFor,
  sourceRouteFor,
} from '../utils/businessSourceNavigation.mjs'
import { resolveOperationalFactRouteRecord } from '../utils/operationalFactRelatedNavigation.mjs'
import {
  EMPTY_VIEW_OVERRIDES,
  OCCURRED_DATE_FILTER_OPTIONS,
  STATUS_OPTIONS,
  FINANCE_STATUS_OPTIONS,
  PRODUCTION_STATUS_OPTIONS,
  RESERVATION_STATUS_OPTIONS,
  buildOperationalFactColumns,
  buildOperationalFactRelatedMenuItems,
  financeSettlementActionFor,
  getOperationalFactAttachmentOwnerType,
  operationalFactProductID,
  sourceTypeLabel,
} from '../components/operational-facts/operationalFactPageConfig.mjs'

export function OperationalFactWorkspace({
  pageTitle = '业务记录处理',
  toolbarModuleKey = 'operational-facts',
  initialActiveKey = 'production',
  enabledViews,
  viewOverrides = EMPTY_VIEW_OVERRIDES,
  showTabs = true,
}) {
  const outletContext = useBusinessPageContext()
  const productionRecordsWorkspace =
    outletContext?.productionRecordsWorkspace || null
  const financeWorkspace = outletContext?.financeWorkspace || null
  const navigate = useBusinessNavigate()
  const location = useLocation()
  const [searchParams] = useBusinessSearchParams()
  const [savedContentView, setContentView] = useBusinessPageState(
    'contentView',
    () => (searchParams.get('display') === 'process' ? 'process' : 'list')
  )

  const [visualViewState, setVisualViewState] = useBusinessPageState(
    'visualViewState',
    {}
  )

  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const contentView =
    toolbarModuleKey === 'production-progress'
      ? searchParams.get('display') === 'process' &&
        canReadProductionProcess(adminProfile)
        ? 'process'
        : 'list'
      : financeWorkspace?.contentView || savedContentView
  const {
    setActiveKey,
    keyword,
    setKeyword,
    statusFilter,
    setStatusFilter,
    setDateFieldByKey,
    dateRangeByKey,
    setDateRangeByKey,
    loading,
    rowsByKey,
    setPaginationByKey,
    selectedByKey,
    setSelectedByKey,
    detailRecord,
    detailRecordID,
    setDetailRecord,
    routeSalesOrderID,
    routeSourceID,
    routeSourceType,
    routeFactID,
    linkedKeyword,
    configs,
    currentActiveKey,
    activeConfig,
    activeTotal,
    statusCounts,
    openOperationalFactDetails,
    activePagination,
    activeDateField,
    resetPaginationForKey,
    loadRows,
    loadExportRows,
    clearRouteContext,
    clearFilters,
  } = useOperationalFactQuery({
    initialActiveKey,
    enabledViews,
    viewOverrides,
    adminProfile,
  })

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

  const activeRows = useMemo(
    () => rowsByKey[currentActiveKey] || [],
    [currentActiveKey, rowsByKey]
  )

  const activeSelectedRow = selectedByKey[currentActiveKey] || null
  const [productionReviewID, setProductionReviewID] = useState(null)
  const taskContext = operationalFactTaskContext(
    currentActiveKey,
    activeSelectedRow
  )
  const resolvedRouteRecord = useMemo(
    () =>
      resolveOperationalFactRouteRecord(activeRows, {
        activeKey: currentActiveKey,
        factID: routeFactID,
        sourceType: routeSourceType,
        sourceID: routeSourceID,
        total: activeTotal,
      }),
    [
      activeRows,
      currentActiveKey,
      routeFactID,
      routeSourceID,
      routeSourceType,
      activeTotal,
    ]
  )
  const resolvedRouteKeyword = String(
    resolvedRouteRecord?.fact_no || resolvedRouteRecord?.shipment_no || ''
  ).trim()

  const activeDateRange = dateRangeByKey[currentActiveKey] || ['', '']
  const activeFinanceFactType = activeConfig.listParams?.fact_type
  const canWriteActive =
    currentActiveKey === 'finance'
      ? canConfirmFinanceFact(adminProfile, activeFinanceFactType)
      : hasAnyPermission(adminProfile, activeConfig.writePermissions)
  const canCreateProductionRework = hasActionPermission(
    adminProfile,
    PermissionCode.PRODUCTION_REWORK_CREATE
  )
  const canEditAnyProductionDraft = [
    PermissionCode.PRODUCTION_MATERIAL_ISSUE_CREATE,
    PermissionCode.PRODUCTION_COMPLETION_CREATE,
    PermissionCode.PRODUCTION_REWORK_CREATE,
    PermissionCode.WAREHOUSE_INBOUND_CONFIRM,
  ].some((permission) => hasActionPermission(adminProfile, permission))
  const canViewProductionReworkProgress = canReadProductionProcess(adminProfile)
  const isProductionRecordsPage =
    toolbarModuleKey === 'production-progress' &&
    currentActiveKey === 'production'
  const canUseProductionProcessView =
    isProductionRecordsPage && canViewProductionReworkProgress
  const isFinanceDuePage =
    currentActiveKey === 'finance' &&
    ['RECEIVABLE', 'PAYABLE'].includes(activeFinanceFactType)
  useEffect(() => {
    if (
      (contentView === 'process' && !canUseProductionProcessView) ||
      (contentView === 'due' && !isFinanceDuePage)
    ) {
      setContentView('list')
    }
  }, [
    canUseProductionProcessView,
    contentView,
    isFinanceDuePage,
    setContentView,
  ])

  const showingFinanceDue = contentView === 'due' && isFinanceDuePage
  const financeDueData = useBusinessVisualizationData({
    enabled: showingFinanceDue,
    load: loadExportRows,
    actionLabel: '加载财务到期顺序',
  })
  const dueModel = useMemo(
    () => showingFinanceDue ? buildFinanceDueModel(financeDueData.rows) : null,
    [showingFinanceDue, financeDueData.rows]
  )
  const dueFilter = visualViewState.finance?.filter || 'all'
  const dueRows = useMemo(() => {
    const rows = dueModel?.rows || []
    return dueFilter === 'all' ? rows : rows.filter((row) => row.dueStatus.key === dueFilter)
  }, [dueModel, dueFilter])
  const duePage = useMemo(
    () => paginateVisualizationRows(dueRows, visualViewState.finance?.page),
    [dueRows, visualViewState.finance?.page]
  )
  const dueCountsUnavailable = financeDueData.loading || Boolean(financeDueData.error)
  const dueOptions = dueModel ? financeDueFilterOptions(dueModel.counts).map((option) =>
    dueCountsUnavailable ? { ...option, count: '—' } : option
  ) : []
  const additionalDueOptions = dueOptions.filter((option) => option.additional)
  const hasAdditionalDueFilter = additionalDueOptions.some((option) => option.value === dueFilter)
  const changeDueFilter = (filter) => {
    setVisualViewState((current) => ({ ...current, finance: { ...current.finance, filter, page: 1 } }))
  }
  const changeStatusFilter = (nextStatus) => {
    setStatusFilter(nextStatus)
    resetPaginationForKey()
    if (showingFinanceDue) changeDueFilter(dueFilter)
  }
  const reloadFinanceDueData = financeDueData.reload
  const refreshMutationRows = useCallback(
    (key) => {
      if (key === 'finance' && showingFinanceDue) reloadFinanceDueData()
      return loadRows(key)
    },
    [loadRows, reloadFinanceDueData, showingFinanceDue]
  )
  const {
    activeCustomerKey,
    saving,
    financeCancelOpen,
    setFinanceCancelOpen,
    financeCancelReason,
    setFinanceCancelReason,
    runRowAction,
    confirmFinanceCancellation,
  } = useOperationalFactMutations({
    adminProfile,
    currentActiveKey,
    loadRows: refreshMutationRows,
    activeSelectedRow,
    activeConfig,
  })
  useWorkflowTaskBusinessBusy(saving)

  const visibleDetailRecord =
    detailRecord ||
    (showingFinanceDue ? dueModel.rows : activeRows).find(
      (record) => record.id === detailRecordID
    ) ||
    null
  const detailSourceRoute = visibleDetailRecord
    ? businessSourceRouteFor(
        visibleDetailRecord.source_type,
        visibleDetailRecord.source_id,
        { keyword: visibleDetailRecord.source_no, source: 'finance-fact' }
      )
    : ''

  const loadProcessOrders = useCallback(async ({ signal }) => {
    const data = await listAllProductionOrders(
      {
        lifecycle_scope: 'all',
        sort_by: 'updated_at',
        sort_direction: 'desc',
      },
      { signal }
    )
    return (
      Array.isArray(data?.production_orders) ? data.production_orders : []
    ).filter((order) => [StockReservationStatus.RELEASED, 'CLOSED'].includes(order?.status))
  }, [])
  const processOrdersData = useBusinessVisualizationData({
    enabled: contentView === 'process' && canUseProductionProcessView,
    load: loadProcessOrders,
    actionLabel: '加载生产工序订单',
  })
  const preferredProcessOrderID =
    String(routeSourceType || '').toUpperCase() === 'PRODUCTION_ORDER'
      ? Number(routeSourceID || 0)
      : Number(activeSelectedRow?.production_order_id || 0)
  const [selectedProcessOrderID, setSelectedProcessOrderID] =
    useBusinessPageState('selectedProcessOrderID', 0)
  const lastPreferredProcessOrderID = useRef(0)
  useEffect(() => {
    if (
      contentView !== 'process' ||
      !processOrdersData.loaded ||
      processOrdersData.loading ||
      processOrdersData.error
    ) {
      return
    }
    const availableIDs = new Set(
      processOrdersData.rows.map((order) => Number(order?.id || 0))
    )
    const preferredChanged =
      lastPreferredProcessOrderID.current !== preferredProcessOrderID
    lastPreferredProcessOrderID.current = preferredProcessOrderID
    setSelectedProcessOrderID((current) => {
      if (
        preferredChanged &&
        preferredProcessOrderID &&
        availableIDs.has(preferredProcessOrderID)
      ) {
        return preferredProcessOrderID
      }
      // null 表示主动清空；0 表示首次进入，只默认定位生产中的订单。
      if (current === null) return null
      if (current && availableIDs.has(current)) return current
      return Number(processOrdersData.rows.find((order) => order.status === StockReservationStatus.RELEASED)?.id || 0)
    })
  }, [
    contentView,
    preferredProcessOrderID,
    processOrdersData.loaded,
    processOrdersData.loading,
    processOrdersData.error,
    processOrdersData.rows,
    setSelectedProcessOrderID,
  ])
  const loadProcessAggregate = useCallback(
    async ({ signal }) => {
      if (!selectedProcessOrderID) return []
      return [await getProductionWip(selectedProcessOrderID, { signal })]
    },
    [selectedProcessOrderID]
  )
  const processAggregateData = useBusinessVisualizationData({
    enabled:
      contentView === 'process' &&
      canUseProductionProcessView &&
      selectedProcessOrderID > 0,
    load: loadProcessAggregate,
    actionLabel: '加载生产工序进度',
  })
  const reloadProcessOrders = processOrdersData.reload
  const reloadProcessAggregate = processAggregateData.reload
  useEffect(() => {
    return outletContext?.registerPageRefresh?.(() => {
      if (contentView === 'process' && canUseProductionProcessView) {
        reloadProcessOrders()
        reloadProcessAggregate()
        return false
      }
      if (contentView === 'due' && isFinanceDuePage) {
        reloadFinanceDueData()
      }
      return loadRows(currentActiveKey)
    })
  }, [
    canUseProductionProcessView,
    contentView,
    currentActiveKey,
    isFinanceDuePage,
    loadRows,
    outletContext,
    reloadProcessOrders,
    reloadProcessAggregate,
    reloadFinanceDueData,
  ])
  const selectedProductionDraftSaveAction =
    currentActiveKey === 'production' && activeSelectedRow?.status === OperationalFactStatus.DRAFT
      ? productionDraftSaveActionFor(activeSelectedRow)
      : ''
  const canEditSelectedProductionDraft = Boolean(
    selectedProductionDraftSaveAction &&
    hasAnyPermission(
      adminProfile,
      productionDraftEditPermissions(selectedProductionDraftSaveAction)
    )
  )

  const {
    productionReworkContext,
    productionReworkLoading,
    productionReworkProgressContext,
    productionReworkProgressLoading,
    productionDraftEditContext,
    productionDraftEditLoading,
    productionReworkInitialValues,
    openProductionDraftEditor,
    loadProductionDraftMaterialLots,
    closeProductionDraftEditor,
    submitProductionDraftEdit,
    openProductionRework,
    closeProductionRework,
    openProductionReworkProgress,
    closeProductionReworkProgress,
    submitProductionRework,
  } = useProductionFactActions({
    adminProfile,
    activeCustomerKey,
    loadRows,
    canCreateProductionRework,
    canViewProductionReworkProgress,
    resetPaginationForKey,
  })

  const {
    financeSourceContext,
    financeSourceLoading,
    financeSourceInitialValues,
    openFinanceSourceAction,
    closeFinanceSourceAction,
    submitFinanceSourceAction,
  } = useFinanceReconciliationAction({
    adminProfile,
    activeCustomerKey,
    resetPaginationForKey,
    currentActiveKey,
  })

  const viewOutsourcingPayable = (fact) => {
    if (!fact?.id || !canOpenRelatedPath(BUSINESS_ROUTE_PATHS.payables)) return
    navigate(
      relatedDocumentRoute(
        BUSINESS_ROUTE_PATHS.payables,
        { source_type: 'OUTSOURCING_FACT', source_id: fact.id },
        {
          keyword: fact.fact_no,
          source: 'outsourcing-fact',
          fields: ['source_no'],
        }
      )
    )
  }

  const clearActiveSelection = () => {
    setSelectedByKey((prev) => ({ ...prev, [currentActiveKey]: null }))
  }

  const openProcessingContractPrint = () => {
    try {
      const initialDraft =
        buildProcessingContractDraftFromOutsourcingFact(activeSelectedRow)
      openPrintWorkspaceWindow(PROCESSING_CONTRACT_TEMPLATE_KEY, {
        entrySource: PRINT_WORKSPACE_ENTRY_SOURCE.BUSINESS,
        initialDraft,
        customerKey: activeCustomerKey,
        accountKey: adminProfile?.id,
        configRevision: adminProfile?.effective_session?.config_revision || '',
      })
      message.success('已打开加工合同打印模板，可在窗口补齐工序和明细')
    } catch (error) {
      message.error(getActionErrorMessage(error, '打开加工合同打印模板'))
    }
  }

  const columns = useMemo(() => {
    const factColumns = applyBusinessColumnSorters(buildOperationalFactColumns(currentActiveKey, activeFinanceFactType))
    return showingFinanceDue ? financeDueColumns(factColumns) : factColumns
  }, [currentActiveKey, activeFinanceFactType, showingFinanceDue])
  const activeBoundaryText =
    activeConfig.selectionBoundaryText ||
    '当前操作由系统按业务规则校验和处理；不会直接修改其他业务页面的库存、出货、财务记录或待办任务。'
  const {
    tableColumns,
    exportColumns,
    visibleColumns,
    openColumnOrder,
    columnOrderModal,
  } = useBusinessColumnOrder({
    adminProfile,
    moduleKey: `${toolbarModuleKey}-${currentActiveKey}`,
    moduleTitle: `${pageTitle} / ${activeConfig.title}`,
    columns,
  })

  const exportCount = showingFinanceDue ? dueRows.length : activeTotal
  const { exporting, exportRows } = useBusinessListExport({
    requestKey: `operational-facts-export:${currentActiveKey}`,
    loadRows: showingFinanceDue ? () => dueRows : loadExportRows,
    filename: `业务记录-${currentBusinessDate()}.csv`,
    columns: exportColumns,
    recordLabel: activeConfig.title,
  })
  const canFinanceAction =
    currentActiveKey === 'finance'
      ? canConfirmFinanceFact(adminProfile, activeFinanceFactType)
      : false
  const financeDraftTransitionBlocked =
    currentActiveKey === 'finance' &&
    activeSelectedRow?.status === OperationalFactStatus.DRAFT &&
    !hasValidFinanceTransitionSource(activeSelectedRow)
  const sourceBoundDraftTransitionBlocked =
    ['production', 'outsourcing'].includes(currentActiveKey) &&
    activeSelectedRow?.status === OperationalFactStatus.DRAFT &&
    !hasRequiredOperationalFactDraftSource(currentActiveKey, activeSelectedRow)
  const canViewOutsourcingPayable =
    hasActionPermission(adminProfile, PermissionCode.FINANCE_PAYABLE_READ) &&
    canOpenRelatedPath(BUSINESS_ROUTE_PATHS.payables)
  const canCreateSingleReconciliation = hasActionPermission(
    adminProfile,
    PermissionCode.FINANCE_RECONCILIATION_CONFIRM
  )
  const selectedIsPostedOutsourcingReturn =
    currentActiveKey === 'outsourcing' &&
    isOutsourcingReturnPayableSource(activeSelectedRow)
  const selectedIsSingleReconciliationSource =
    currentActiveKey === 'finance' &&
    isSingleFactReconciliationSource(activeSelectedRow)
  const selectedCanStartProductionRework =
    currentActiveKey === 'production' &&
    isProductionReworkEligible(activeSelectedRow, activeRows)
  const selectedCanViewProductionReworkProgress =
    currentActiveKey === 'production' &&
    String(activeSelectedRow?.fact_type || '').toUpperCase() === 'REWORK' &&
    [OperationalFactStatus.POSTED, OperationalFactStatus.CANCELLED].includes(
      String(activeSelectedRow?.status || '').toUpperCase()
    ) &&
    Number.isSafeInteger(Number(activeSelectedRow?.production_order_id)) &&
    Number(activeSelectedRow.production_order_id) > 0
  const canPostActive =
    canFinanceAction ||
    hasAnyPermission(
      adminProfile,
      activeConfig.postPermissions ||
        activeConfig.confirmPermissions ||
        activeConfig.writePermissions
    )
  const canCancelActive =
    canFinanceAction ||
    hasAnyPermission(
      adminProfile,
      activeConfig.cancelPermissions ||
        activeConfig.confirmPermissions ||
        activeConfig.writePermissions
    )
  const canPostSelected =
    currentActiveKey !== 'production' || !activeSelectedRow
      ? canPostActive
      : hasAnyPermission(
          adminProfile,
          productionFactPostPermissions(activeSelectedRow)
        )
  const canCancelSelected =
    currentActiveKey !== 'production' || !activeSelectedRow
      ? canCancelActive
      : hasAnyPermission(
          adminProfile,
          productionFactCancelPermissions(activeSelectedRow)
        )
  const canReleaseActive = hasAnyPermission(
    adminProfile,
    activeConfig.releasePermissions || activeConfig.writePermissions
  )
  const canConfirmActive =
    canFinanceAction || canPostActive || canCancelActive || canReleaseActive
  const financeSettlementAction =
    currentActiveKey === 'finance' &&
    (!activeFinanceFactType || activeFinanceFactType === 'RECONCILIATION')
      ? financeSettlementActionFor('RECONCILIATION')
      : null
  const selectedCanSettleFinance = Boolean(
    activeSelectedRow?.status === OperationalFactStatus.POSTED &&
    financeSettlementActionFor(activeSelectedRow?.fact_type)
  )
  const selectedLabel = selectedLabelForKey(currentActiveKey, activeSelectedRow)
  const selectedIsProductionCompletion =
    currentActiveKey === 'production' &&
    isFinishedGoodsReceipt(activeSelectedRow)
  const reviewProductBeforePost =
    currentActiveKey === 'production' &&
    Boolean(operationalFactProductID(currentActiveKey, activeSelectedRow))
  const productionReviewOpen =
    currentActiveKey === 'production' &&
    productionReviewID !== null &&
    activeSelectedRow?.id === productionReviewID
  const factActionScope = ['production', 'outsourcing', 'finance'].includes(currentActiveKey)
    ? currentActiveKey : null
  const factActionRecord = activeSelectedRow || { fact_type: activeConfig.listParams?.fact_type }
  const postPresentation = factActionScope
    ? operationalFactActionPresentation(factActionScope, factActionRecord) : null
  const cancelPresentation = factActionScope
    ? operationalFactActionPresentation(factActionScope, factActionRecord, 'cancel') : null
  const postButtonLabel = postPresentation?.label || '确认业务记录'
  const postConfirmTitle = postPresentation?.title
  const cancelButtonLabel = cancelPresentation?.label || '取消'
  const shipmentCancelButtonLabel =
    activeSelectedRow?.status === ShipmentStatus.DRAFT ? '作废草稿' : '取消发货'
  const shipmentCancelActionLabel =
    activeSelectedRow?.status === ShipmentStatus.DRAFT ? '作废出货草稿' : '取消发货'
  const shipmentCancelConfirmTitle =
    activeSelectedRow?.status === ShipmentStatus.DRAFT
      ? '确认作废出货草稿？草稿尚未出库，不会变更库存。'
      : '确认取消出库并恢复相应库存？'
  const activeAttachmentOwnerType =
    getOperationalFactAttachmentOwnerType(currentActiveKey)
  const availableRelatedMenuItems = useMemo(
    () =>
      buildOperationalFactRelatedMenuItems({
        activeKey: currentActiveKey,
        activeSelectedRow,
        canOpenPath: canOpenRelatedPath,
      }),
    [activeSelectedRow, canOpenRelatedPath, currentActiveKey]
  )
  const relatedMenuItems = useMemo(() => {
    const availableKeys = new Set(
      availableRelatedMenuItems.map((item) => item.key)
    )
    const items = []
    const addItem = (key, label, authorized) => {
      if (!authorized) return
      const available = availableKeys.has(key)
      const unavailableReason = !activeSelectedRow
        ? '请先选择一条业务记录'
        : key === 'sales-order'
          ? '当前记录未关联可打开的销售订单'
          : key === 'source'
            ? '当前记录未关联可打开的来源单据'
            : '当前记录暂不能打开该关联页面'
      items.push({
        key,
        disabled: !available,
        label: <span title={available ? '' : unavailableReason}>{label}</span>,
      })
    }

    addItem(
      'sales-order',
      '销售订单',
      ['shipments', 'reservations'].includes(currentActiveKey) &&
        canOpenRelatedPath(BUSINESS_ROUTE_PATHS.salesOrders)
    )
    addItem(
      'inventory',
      '库存台账',
      ['production', 'outsourcing', 'shipments'].includes(currentActiveKey) &&
        canOpenRelatedPath(BUSINESS_ROUTE_PATHS.inventory)
    )
    addItem(
      'receivables',
      '应收管理',
      currentActiveKey === 'shipments' &&
        canOpenRelatedPath(BUSINESS_ROUTE_PATHS.receivables)
    )
    addItem(
      'invoices',
      '发票管理',
      currentActiveKey === 'shipments' &&
        canOpenRelatedPath(BUSINESS_ROUTE_PATHS.invoices)
    )
    addItem(
      'source',
      '来源单据',
      ['production', 'outsourcing', 'finance'].includes(currentActiveKey) &&
        [
          'SALES_ORDER',
          'PRODUCTION_ORDER',
          'PRODUCTION_FACT',
          'OUTSOURCING_ORDER',
          'OUTSOURCING_FACT',
          'PURCHASE_ORDER',
          'PURCHASE_RECEIPT',
          'QUALITY_INSPECTION',
          'SHIPMENT',
        ].some((sourceTypeValue) =>
          canOpenRelatedPath(sourceRouteFor(sourceTypeValue))
        )
    )
    return items
  }, [
    activeSelectedRow,
    availableRelatedMenuItems,
    canOpenRelatedPath,
    currentActiveKey,
  ])
  const hasRelatedCapability = relatedMenuItems.length > 0
  const relatedActionAvailability = resolveRelatedRecordActionAvailability({
    authorized: hasRelatedCapability,
    record: activeSelectedRow,
    itemCount: availableRelatedMenuItems.length,
  })
  const productionReworkProgressAvailability =
    resolveContextualBusinessActionAvailability({
      authorized:
        currentActiveKey === 'production' && canViewProductionReworkProgress,
      selected: Boolean(activeSelectedRow),
      relevant: selectedCanViewProductionReworkProgress,
      busy: productionReworkProgressLoading,
      busyReason: '返工进度加载完成后可查看',
    })
  const outsourcingPayableViewAvailability =
    resolveContextualBusinessActionAvailability({
      authorized:
        currentActiveKey === 'outsourcing' && canViewOutsourcingPayable,
      selected: Boolean(activeSelectedRow),
      relevant: selectedIsPostedOutsourcingReturn,
      busy: saving || financeSourceLoading,
      busyReason: '当前操作完成后可查看应付',
    })

  const openRelatedTable = ({ key }) => {
    if (!activeSelectedRow) return
    const pathByKey = {
      'sales-order': relatedDocumentRoute(
        BUSINESS_ROUTE_PATHS.salesOrders,
        { sales_order_id: activeSelectedRow.sales_order_id },
        {
          keyword: activeSelectedRow.sales_order_no,
          source: 'operational-fact',
          fields: ['sales_order_no'],
        }
      ),
      inventory: businessSourceInventoryRouteFor(
        currentActiveKey,
        activeSelectedRow.id,
        {
          keyword:
            activeSelectedRow.fact_no || activeSelectedRow.shipment_no || '',
          source: 'operational-fact',
        }
      ),
      receivables: relatedDocumentRoute(
        BUSINESS_ROUTE_PATHS.receivables,
        { source_type: 'SHIPMENT', source_id: activeSelectedRow.id },
        {
          keyword: activeSelectedRow.shipment_no,
          source: 'operational-fact',
          fields: ['source_no'],
        }
      ),
      invoices: relatedDocumentRoute(
        BUSINESS_ROUTE_PATHS.invoices,
        { source_type: 'SHIPMENT', source_id: activeSelectedRow.id },
        {
          keyword: activeSelectedRow.shipment_no,
          source: 'operational-fact',
          fields: ['source_no'],
        }
      ),
    }
    if (key === 'source') {
      const targetPath = businessSourceRouteFor(
        activeSelectedRow.source_type,
        activeSelectedRow.source_id,
        {
          keyword: activeSelectedRow.source_no,
          source:
            currentActiveKey === 'finance'
              ? 'finance-fact'
              : 'operational-fact',
        }
      )
      if (targetPath) navigate(targetPath)
      return
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }

  const activeFilterCount = [
    (showingFinanceDue || !['finance', 'production', 'reservations'].includes(currentActiveKey)) && statusFilter,
    hasAdditionalDueFilter,
    routeSalesOrderID,
    routeFactID,
    activeDateRange[0] || activeDateRange[1],
  ].filter(Boolean).length

  const tabItems = Object.entries(configs).map(([key, config]) => ({
    key,
    label: config.title,
  }))
  const workspaceTabs =
    showTabs && tabItems.length > 1 ? (
      <Tabs
        className="erp-business-view-tabs"
        activeKey={currentActiveKey}
        onChange={setActiveKey}
        items={tabItems}
      />
    ) : null
  const contentViewSwitch = isFinanceDuePage && !financeWorkspace ? (
    <BusinessViewSwitch
      value={contentView}
      options={[
        { value: 'list', label: '账款列表' },
        { value: 'due', label: '到期顺序' },
      ]}
      onChange={setContentView}
    />
  ) : null
  const visualizationHeader = workspaceTabs ? (
    <div className="erp-operational-visual-toolbar">
      <div className="erp-operational-visual-toolbar__primary">
        {workspaceTabs}
      </div>
    </div>
  ) : null
  const processAggregate = selectedProcessOrderID
    ? processAggregateData.rows[0] || null
    : null
  const processLoading =
    processOrdersData.loading ||
    Boolean(selectedProcessOrderID && processAggregateData.loading)
  const processError =
    processOrdersData.error ||
    (selectedProcessOrderID ? processAggregateData.error : '')
  useTaskBusinessEditor({
    record: activeSelectedRow,
    enabled: reviewProductBeforePost && canPostSelected &&
      activeSelectedRow?.status === OperationalFactStatus.DRAFT &&
      !sourceBoundDraftTransitionBlocked &&
      outletContext?.taskBusiness?.contract?.actionKeys.includes('operational-fact-post'),
    open: (record) => setProductionReviewID(record.id),
  })
  const postButton = (
    <Button
      size="small"
      type="primary"
      className="erp-business-module-status-action"
      icon={<CheckCircleOutlined />}
      data-business-action-key="operational-fact-post"
      data-business-action-role="primary"
      onClick={reviewProductBeforePost ? () => setProductionReviewID(activeSelectedRow.id) : undefined}
      disabled={
        !activeSelectedRow ||
        activeSelectedRow.status !== OperationalFactStatus.DRAFT ||
        !canPostSelected ||
        sourceBoundDraftTransitionBlocked ||
        saving
      }
    >
      {postButtonLabel}
    </Button>
  )
  const LayoutRoot = productionRecordsWorkspace
    ? React.Fragment
    : BusinessPageLayout
  const layoutProps = productionRecordsWorkspace
    ? {}
    : { className: 'erp-operational-fact-page', inWorkspace: true }

  return (
    <LayoutRoot {...layoutProps}>
      {productionRecordsWorkspace || financeWorkspace ? null : (
        <PageHeaderCard
          compact
          title={pageTitle}
          helpKey={toolbarModuleKey}
          viewSwitch={visualizationHeader}
        />
      )}

      <BusinessOperationPanel
        inWorkspace
        hidden={contentView === 'process'}
        compact
        contentSwitch={contentViewSwitch}
        onClearFilters={() => {
          clearFilters(resolvedRouteKeyword || linkedKeyword || keyword)
          if (showingFinanceDue) {
            setStatusFilter('')
            changeDueFilter(hasAdditionalDueFilter ? 'all' : dueFilter)
          }
        }}
        activeFilterCount={activeFilterCount}
        filters={
          <>
            <SearchInput
              resetKey={currentActiveKey}
              value={resolvedRouteKeyword || linkedKeyword || keyword}
              {...BUSINESS_SEARCH_SCOPES[
                {
                  production: 'production_fact',
                  outsourcing: 'outsourcing_fact',
                  finance: 'finance',
                }[currentActiveKey]
              ]}
              onSearch={(value) => {
                if (
                  resolvedRouteKeyword ||
                  linkedKeyword ||
                  routeFactID ||
                  routeSalesOrderID ||
                  (routeSourceType && routeSourceID)
                ) {
                  clearRouteContext()
                }
                setKeyword(value)
                resetPaginationForKey()
              }}
            />
            {showingFinanceDue && (
              <FinanceDueQuickFilters
                inline
                options={dueOptions}
                value={dueFilter}
                disabled={dueCountsUnavailable}
                onChange={changeDueFilter}
                statusLabel={statusFilter && FINANCE_STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label}
                onClearStatus={() => changeStatusFilter('')}
              />
            )}
            {['finance', 'production', 'reservations'].includes(currentActiveKey) ? (
              <BusinessStatusFilter
                inline={!showingFinanceDue}
                label={showingFinanceDue ? '单据状态' : undefined}
                aria-label="单据状态"
                counts={statusCounts}
                loading={loading}
                value={statusFilter}
                options={currentActiveKey === 'production' ? PRODUCTION_STATUS_OPTIONS : currentActiveKey === 'reservations' ? RESERVATION_STATUS_OPTIONS : FINANCE_STATUS_OPTIONS}
                exact={currentActiveKey === 'production' && Boolean(routeFactID)}
                onChange={changeStatusFilter}
              />
            ) : (
              <SelectFilter
                aria-label="单据状态"
                className="erp-business-filter-control--status"
                value={statusFilter}
                options={STATUS_OPTIONS}
                onChange={changeStatusFilter}
              />
            )}
            {showingFinanceDue && (
              <FilterChipGroup
                label="其他到期情况"
                options={additionalDueOptions}
                value={dueFilter}
                disabled={dueCountsUnavailable}
                onChange={changeDueFilter}
              />
            )}
            <DateRangeFilter
              options={activeConfig.dateOptions || OCCURRED_DATE_FILTER_OPTIONS}
              value={activeDateField}
              startValue={activeDateRange[0] || ''}
              endValue={activeDateRange[1] || ''}
              onRangeChange={(from, to, field) => {
                setDateFieldByKey((prev) => ({ ...prev, [currentActiveKey]: field }))
                setDateRangeByKey((prev) => ({ ...prev, [currentActiveKey]: [from, to] }))
                resetPaginationForKey()
              }}
            />
            {routeSalesOrderID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['sales_order_id'])}
              >
                已按销售订单筛选
              </Tag>
            ) : null}
            {routeSourceType && routeSourceID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['source_type', 'source_id'])}
              >
                已按{sourceTypeLabel(routeSourceType)}筛选
              </Tag>
            ) : null}
            {routeFactID ? (
              <Tag
                closable
                color="blue"
                onClose={() => clearRouteContext(['fact_id'])}
              >
                已定位生产记录
              </Tag>
            ) : null}
          </>
        }
        actions={
          <BusinessListToolbarActions
            moduleTitle={pageTitle}
            onExport={exportRows}
            exportDisabled={loading || exporting || (showingFinanceDue && dueCountsUnavailable) || exportCount === 0}
            exportDisabledReason={
              exporting
                ? '正在准备导出，请稍候'
                : loading || (showingFinanceDue && dueCountsUnavailable)
                  ? `${activeConfig.title}加载完成后可导出`
                  : exportCount === 0
                    ? `当前筛选没有可导出的${activeConfig.title}`
                    : ''
            }
            onOpenColumnOrder={openColumnOrder}
          />
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={Number(Boolean(activeSelectedRow))}
          selectedLabel={selectedLabel}
          boundaryText={activeBoundaryText}
        >
          <SelectionClearAction
            selectedCount={Number(Boolean(activeSelectedRow))}
            selectionLabel="业务记录"
            onClear={clearActiveSelection}
          />
          <BusinessTaskActions
            sourceType={taskContext.sourceType}
            record={taskContext.record}
            adminProfile={adminProfile}
            allowCreate={false}
          />
          {relatedActionAvailability.visible ? (
            <BusinessActionTooltip
              disabled={relatedActionAvailability.disabled}
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条业务记录'
                  : relatedActionAvailability.disabledReason
              }
            >
              <Dropdown
                trigger={['click']}
                destroyOnHidden
                disabled={relatedActionAvailability.disabled}
                menu={{
                  items: relatedMenuItems,
                  onClick: openRelatedTable,
                }}
              >
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  data-business-action-key="related-records"
                  data-business-action-role="related"
                  disabled={relatedActionAvailability.disabled}
                >
                  相关单据 <DownOutlined />
                </Button>
              </Dropdown>
            </BusinessActionTooltip>
          ) : null}
          <BusinessActionTooltip
            disabled={!activeSelectedRow}
            disabledReason="请先选择一条业务记录"
          >
            <Button
              size="small"
              icon={<EyeOutlined />}
              data-business-action-key="operational-fact-details"
              data-business-action-role="view"
              disabled={!activeSelectedRow}
              onClick={() => openOperationalFactDetails(activeSelectedRow)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          {['production', 'outsourcing'].includes(currentActiveKey) &&
          canPostActive ? (
            <BusinessActionTooltip
              visible={
                !activeSelectedRow ||
                (activeSelectedRow.status === OperationalFactStatus.DRAFT && canPostSelected)
              }
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== OperationalFactStatus.DRAFT ||
                !canPostSelected ||
                sourceBoundDraftTransitionBlocked ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条业务记录'
                  : activeSelectedRow.status !== OperationalFactStatus.DRAFT
                    ? '只有业务草稿可以确认生效'
                    : !canPostSelected
                      ? selectedIsProductionCompletion
                        ? '只有仓库岗位可以核对并确认成品入库'
                        : '当前账号没有确认该类生产记录的权限'
                      : sourceBoundDraftTransitionBlocked
                        ? '该历史草稿缺少可核对来源，不能确认或作废'
                        : saving
                          ? '当前操作完成后可确认'
                          : ''
              }
            >
              {reviewProductBeforePost ? postButton : (
                <Popconfirm
                  title={postConfirmTitle}
                  description={postPresentation.description}
                  onConfirm={() =>
                    runRowAction(
                      activeConfig,
                      activeSelectedRow,
                      'post',
                      postButtonLabel
                    )
                  }
                  okText={postButtonLabel}
                  cancelText="返回"
                >
                  {postButton}
                </Popconfirm>
              )}
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'production' && canEditAnyProductionDraft ? (
            <BusinessActionTooltip
              visible={
                !activeSelectedRow ||
                (activeSelectedRow.status === OperationalFactStatus.DRAFT &&
                  Boolean(selectedProductionDraftSaveAction) &&
                  canEditSelectedProductionDraft)
              }
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== OperationalFactStatus.DRAFT ||
                !selectedProductionDraftSaveAction ||
                !canEditSelectedProductionDraft ||
                productionDraftEditLoading
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条生产记录'
                  : activeSelectedRow.status !== OperationalFactStatus.DRAFT
                    ? '只有未过账草稿可以编辑'
                    : !selectedProductionDraftSaveAction
                      ? '该记录来源不支持直接编辑，请作废后重新办理'
                      : !canEditSelectedProductionDraft
                        ? '当前账号没有维护该类生产草稿的权限'
                        : '正在读取草稿完整内容'
              }
            >
              <Button
                size="small"
                icon={<EditOutlined />}
                data-business-action-key="production-fact-edit-draft"
                data-business-action-role="edit"
                disabled={
                  !activeSelectedRow ||
                  activeSelectedRow.status !== OperationalFactStatus.DRAFT ||
                  !selectedProductionDraftSaveAction ||
                  !canEditSelectedProductionDraft ||
                  productionDraftEditLoading
                }
                loading={
                  productionDraftEditLoading && !productionDraftEditContext
                }
                onClick={() => openProductionDraftEditor(activeSelectedRow)}
              >
                编辑草稿
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'production' && canCreateProductionRework ? (
            <BusinessActionTooltip
              visible={!activeSelectedRow || selectedCanStartProductionRework}
              disabled={
                !activeSelectedRow ||
                !selectedCanStartProductionRework ||
                saving ||
                productionReworkLoading
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条生产记录'
                  : !selectedCanStartProductionRework
                    ? '只有符合返工条件的已过账完工记录可以发起返工'
                    : saving || productionReworkLoading
                      ? '当前操作完成后可发起返工'
                      : ''
              }
            >
              <Button
                size="small"
                data-business-action-key="production-rework-start"
                data-business-action-role="primary"
                disabled={
                  !activeSelectedRow ||
                  !selectedCanStartProductionRework ||
                  saving ||
                  productionReworkLoading
                }
                loading={productionReworkLoading && !productionReworkContext}
                onClick={() => openProductionRework(activeSelectedRow)}
              >
                发起返工
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {productionReworkProgressAvailability.visible ? (
            <BusinessActionTooltip
              disabled={productionReworkProgressAvailability.disabled}
              disabledReason={
                productionReworkProgressAvailability.disabledReason
              }
            >
              <Button
                size="small"
                data-business-action-key="production-rework-progress"
                data-business-action-role="related"
                disabled={productionReworkProgressAvailability.disabled}
                loading={productionReworkProgressLoading}
                onClick={() => openProductionReworkProgress(activeSelectedRow)}
              >
                查看返工进度
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'finance' && canFinanceAction ? (
            <BusinessActionTooltip
              visible={
                !activeSelectedRow || activeSelectedRow.status === OperationalFactStatus.DRAFT
              }
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== OperationalFactStatus.DRAFT ||
                financeDraftTransitionBlocked ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条财务记录'
                  : activeSelectedRow.status !== OperationalFactStatus.DRAFT
                    ? '只有财务草稿可以确认'
                    : financeDraftTransitionBlocked
                      ? '该历史草稿缺少可核对来源，不能确认或作废'
                      : saving
                        ? '当前操作完成后可确认'
                        : ''
              }
            >
              <Popconfirm
                title={postPresentation.title}
                description={postPresentation.description}
                onConfirm={() =>
                  runRowAction(activeConfig, activeSelectedRow, 'post', postButtonLabel)
                }
                okText={postButtonLabel}
                cancelText="返回"
              >
                <Button
                  size="small"
                  type="primary"
                  className="erp-business-module-status-action"
                  icon={<CheckCircleOutlined />}
                  data-business-action-key="finance-fact-confirm"
                  data-business-action-role="primary"
                  disabled={
                    !activeSelectedRow ||
                    activeSelectedRow.status !== OperationalFactStatus.DRAFT ||
                    financeDraftTransitionBlocked ||
                    saving
                  }
                >
                  {postButtonLabel}
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'finance' && canCreateSingleReconciliation ? (
            <BusinessActionTooltip
              visible={
                !activeSelectedRow || selectedIsSingleReconciliationSource
              }
              disabled={
                !activeSelectedRow ||
                !selectedIsSingleReconciliationSource ||
                saving ||
                financeSourceLoading
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条财务记录'
                  : !selectedIsSingleReconciliationSource
                    ? '请选择可进行单笔核对的已确认财务记录'
                    : '当前操作完成后可进行单笔核对'
              }
            >
              <Button
                size="small"
                data-business-action-key="finance-single-reconciliation"
                data-business-action-role="action"
                disabled={
                  !activeSelectedRow ||
                  !selectedIsSingleReconciliationSource ||
                  saving ||
                  financeSourceLoading
                }
                onClick={() =>
                  openFinanceSourceAction(
                    FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION,
                    activeSelectedRow
                  )
                }
              >
                单笔核对
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'finance' && canFinanceAction ? (
            <BusinessActionTooltip
              visible={
                !activeSelectedRow ||
                canCancelFinanceFact(activeSelectedRow)
              }
              disabled={
                !activeSelectedRow ||
                !canCancelFinanceFact(activeSelectedRow) ||
                financeDraftTransitionBlocked ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条财务记录'
                  : !canCancelFinanceFact(activeSelectedRow)
                    ? '当前财务状态不能取消'
                    : financeDraftTransitionBlocked
                      ? '该历史草稿缺少可核对来源，不能确认或作废'
                      : saving
                        ? '当前操作完成后可取消'
                        : ''
              }
            >
              <Button
                size="small"
                danger
                className="erp-business-module-status-action"
                icon={<CloseCircleOutlined />}
                data-business-action-key="finance-fact-cancel"
                data-business-action-role="danger"
                disabled={
                  !activeSelectedRow ||
                  !canCancelFinanceFact(activeSelectedRow) ||
                  financeDraftTransitionBlocked ||
                  saving
                }
                onClick={() => {
                  setFinanceCancelReason('')
                  setFinanceCancelOpen(true)
                }}
              >
                {cancelButtonLabel}
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'outsourcing' ? (
            <BusinessActionTooltip
              disabled={!activeSelectedRow}
              disabledReason="请先选择一条委外记录"
            >
              <Button
                size="small"
                icon={<PrinterOutlined />}
                data-business-action-key="outsourcing-contract-print"
                data-business-action-role="output"
                disabled={!activeSelectedRow}
                onClick={openProcessingContractPrint}
              >
                加工合同打印
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {outsourcingPayableViewAvailability.visible ? (
            <BusinessActionTooltip
              disabled={outsourcingPayableViewAvailability.disabled}
              disabledReason={outsourcingPayableViewAvailability.disabledReason}
            >
              <Button
                size="small"
                data-business-action-key="outsourcing-payable"
                data-business-action-role="action"
                data-business-action-group="query"
                disabled={outsourcingPayableViewAvailability.disabled}
                onClick={() => viewOutsourcingPayable(activeSelectedRow)}
              >
                查看应付
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {activeAttachmentOwnerType ? (
            <BusinessAttachmentModalButton
              ownerType={activeAttachmentOwnerType}
              ownerId={activeSelectedRow?.id}
              modalTitle={`${activeConfig.title}附件`}
              panelTitle={`${activeConfig.title}附件`}
              description="上传与当前记录相关的图片、票据、对账或确认资料；附件只作为证据，不改变当前记录状态。"
              canUpload={canWriteActive || canConfirmActive}
              canWithdraw={
                activeAttachmentOwnerType === 'finance_fact'
                  ? canWriteActive || canConfirmActive
                  : activeAttachmentOwnerType === 'outsourcing_fact'
                    ? hasActionPermission(
                        adminProfile,
                        PermissionCode.OUTSOURCING_ORDER_UPDATE
                      )
                    : activeAttachmentOwnerType === 'shipment'
                      ? hasAnyPermission(adminProfile, [
                          PermissionCode.SHIPMENT_UPDATE,
                          PermissionCode.SHIPMENT_SHIP,
                        ])
                      : hasAnyPermission(adminProfile, [
                          PermissionCode.PRODUCTION_FACT_POST,
                          PermissionCode.WAREHOUSE_OUTBOUND_CONFIRM,
                          PermissionCode.PRODUCTION_FACT_CANCEL,
                        ])
              }
              disabled={!activeSelectedRow}
              disabledReason="请先选择一条记录"
              buttonProps={{
                'data-business-action-key': `${currentActiveKey}-attachments`,
              }}
            />
          ) : null}
          {currentActiveKey === 'shipments' && canPostActive ? (
            <BusinessActionTooltip
              visible={
                !activeSelectedRow || activeSelectedRow.status === OperationalFactStatus.DRAFT
              }
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== OperationalFactStatus.DRAFT ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一张出货单'
                  : activeSelectedRow.status !== OperationalFactStatus.DRAFT
                    ? '只有出货草稿可以发货'
                    : saving
                      ? '当前操作完成后可发货'
                      : ''
              }
            >
              <Popconfirm
                title="确认发货并扣减相应库存？"
                onConfirm={() =>
                  runRowAction(activeConfig, activeSelectedRow, 'post', '发货')
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  type="primary"
                  className="erp-business-module-status-action"
                  icon={<CheckCircleOutlined />}
                  data-business-action-key="shipment-post"
                  data-business-action-role="primary"
                  disabled={
                    !activeSelectedRow ||
                    activeSelectedRow.status !== OperationalFactStatus.DRAFT ||
                    saving
                  }
                >
                  发货
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'reservations' && canReleaseActive ? (
            <BusinessActionTooltip
              visible={
                !activeSelectedRow || activeSelectedRow.status === StockReservationStatus.ACTIVE
              }
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== StockReservationStatus.ACTIVE ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条库存预留'
                  : activeSelectedRow.status !== StockReservationStatus.ACTIVE
                    ? '只有有效库存预留可以释放'
                    : saving
                      ? '当前操作完成后可释放'
                      : ''
              }
            >
              <Popconfirm
                title="确认释放库存预留？"
                onConfirm={() =>
                  runRowAction(
                    activeConfig,
                    activeSelectedRow,
                    'release',
                    '释放预留'
                  )
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  className="erp-business-module-status-action"
                  icon={<RollbackOutlined />}
                  data-business-action-key="reservation-release"
                  data-business-action-role="primary"
                  data-business-action-group="lifecycle"
                  disabled={
                    !activeSelectedRow ||
                    activeSelectedRow.status !== StockReservationStatus.ACTIVE ||
                    saving
                  }
                >
                  释放
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {financeSettlementAction && canFinanceAction ? (
            <BusinessActionTooltip
              visible={!activeSelectedRow || selectedCanSettleFinance}
              disabled={
                !activeSelectedRow || !selectedCanSettleFinance || saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条财务记录'
                  : !financeSettlementActionFor(activeSelectedRow.fact_type)
                    ? '只有对账记录可以完成核对'
                    : activeSelectedRow.status !== OperationalFactStatus.POSTED
                      ? '对账记录确认后可完成核对'
                      : saving
                        ? '当前操作完成后可继续'
                        : ''
              }
            >
              <Popconfirm
                title={financeSettlementAction.confirmTitle}
                onConfirm={() =>
                  runRowAction(
                    activeConfig,
                    activeSelectedRow,
                    'settle',
                    financeSettlementAction.label
                  )
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  className="erp-business-module-status-action"
                  icon={<CheckCircleOutlined />}
                  data-business-action-key="finance-reconciliation-settle"
                  data-business-action-role="primary"
                  disabled={
                    !activeSelectedRow || !selectedCanSettleFinance || saving
                  }
                >
                  {financeSettlementAction.label}
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {['production', 'outsourcing'].includes(currentActiveKey) &&
          canCancelActive ? (
            <BusinessActionTooltip
              visible={
                !activeSelectedRow ||
                ([OperationalFactStatus.DRAFT, OperationalFactStatus.POSTED].includes(activeSelectedRow.status) &&
                  canCancelSelected)
              }
              disabled={
                !activeSelectedRow ||
                ![OperationalFactStatus.DRAFT, OperationalFactStatus.POSTED].includes(activeSelectedRow.status) ||
                !canCancelSelected ||
                sourceBoundDraftTransitionBlocked ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条业务记录'
                  : ![OperationalFactStatus.DRAFT, OperationalFactStatus.POSTED].includes(activeSelectedRow.status)
                    ? '当前业务记录状态不能取消'
                    : !canCancelSelected
                      ? selectedIsProductionCompletion &&
                        activeSelectedRow.status === OperationalFactStatus.POSTED
                        ? '只有仓库岗位可以撤销已确认的成品入库'
                        : '当前账号没有取消该类生产记录的权限'
                      : sourceBoundDraftTransitionBlocked
                        ? '该历史草稿缺少可核对来源，不能确认或作废'
                        : saving
                          ? '当前操作完成后可取消'
                          : ''
              }
            >
              <Button
                size="small"
                danger
                className="erp-business-module-status-action"
                icon={<CloseCircleOutlined />}
                data-business-action-key="operational-fact-cancel"
                data-business-action-role="danger"
                disabled={
                  !activeSelectedRow ||
                  ![OperationalFactStatus.DRAFT, OperationalFactStatus.POSTED].includes(activeSelectedRow.status) ||
                  !canCancelSelected ||
                  sourceBoundDraftTransitionBlocked ||
                  saving
                }
                onClick={() => {
                  setFinanceCancelReason('')
                  setFinanceCancelOpen(true)
                }}
              >
                {cancelButtonLabel}
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'shipments' && canCancelActive ? (
            <BusinessActionTooltip
              visible={
                !activeSelectedRow ||
                [ShipmentStatus.DRAFT, ShipmentStatus.SHIPPED].includes(activeSelectedRow.status)
              }
              disabled={
                !activeSelectedRow ||
                ![ShipmentStatus.DRAFT, ShipmentStatus.SHIPPED].includes(activeSelectedRow.status) ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一张出货单'
                  : ![ShipmentStatus.DRAFT, ShipmentStatus.SHIPPED].includes(activeSelectedRow.status)
                    ? '当前出货状态不能取消'
                    : saving
                      ? '当前操作完成后可取消'
                      : ''
              }
            >
              <Popconfirm
                title={shipmentCancelConfirmTitle}
                onConfirm={() =>
                  runRowAction(
                    activeConfig,
                    activeSelectedRow,
                    'cancel',
                    shipmentCancelActionLabel
                  )
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  danger
                  className="erp-business-module-status-action"
                  icon={<CloseCircleOutlined />}
                  data-business-action-key="shipment-cancel"
                  data-business-action-role="danger"
                  disabled={
                    !activeSelectedRow ||
                    ![ShipmentStatus.DRAFT, ShipmentStatus.SHIPPED].includes(activeSelectedRow.status) ||
                    saving
                  }
                >
                  {shipmentCancelButtonLabel}
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
        </SelectionActionBar>
      </BusinessOperationPanel>

      <BusinessViewSurface
        label={showingFinanceDue ? '财务到期顺序' : undefined}
        activeView={contentView}
        preserveViews={isProductionRecordsPage && !outletContext?.taskBusiness ? ['list', 'process'] : undefined}
        loading={
          loading ||
          financeDueData.loading ||
          processOrdersData.loading ||
          processAggregateData.loading
        }
      >
        {showingFinanceDue && financeDueData.error ? (
          <VisualizationState error={financeDueData.error} onRetry={financeDueData.reload} />
        ) : contentView === 'process' && canUseProductionProcessView ? (
          <ProductionProcessProgress
            viewState={visualViewState[selectedProcessOrderID]}
            onViewStateChange={(value) =>
              setVisualViewState((current) => ({
                ...current,
                [selectedProcessOrderID]: value,
              }))
            }
            orders={processOrdersData.rows}
            selectedOrderID={selectedProcessOrderID}
            aggregate={processAggregate}
            loading={processLoading}
            error={processError}
            onRetry={() => {
              processOrdersData.reload()
              processAggregateData.reload()
            }}
            onSelectOrder={setSelectedProcessOrderID}
            canHandle={(matter) => matter.permissions.every((permission) => hasActionPermission(adminProfile, permission))}
            onOpenInspection={canOpenRelatedPath(BUSINESS_ROUTE_PATHS.qualityInspections) ? (inspectionID) => navigate(routeWithQuery(BUSINESS_ROUTE_PATHS.qualityInspections, { quality_inspection_id: inspectionID })) : undefined}
            onOpenRecord={canOpenRelatedPath(BUSINESS_ROUTE_PATHS.productionProgress) ? (factID) => navigate(routeWithQuery(BUSINESS_ROUTE_PATHS.productionProgress, { fact_id: factID })) : undefined}
            onOpenExceptions={canOpenRelatedPath(BUSINESS_ROUTE_PATHS.productionExceptions) ? () => navigate(BUSINESS_ROUTE_PATHS.productionExceptions) : undefined}
            onOpenOrder={canOpenRelatedPath(BUSINESS_ROUTE_PATHS.productionOrders) ? (productionOrderID, batchID, action) =>
              navigate(
                routeWithQuery(BUSINESS_ROUTE_PATHS.productionOrders, {
                  production_order_id: productionOrderID,
                  wip_batch_id: batchID,
                  wip_action: action,
                }),
                { state: { productionProcessReturn: { pathname: location.pathname, search: location.search, hash: location.hash } } }
              ) : undefined
            }
          />
        ) : (
          <BusinessDataTable
            rowKey="id"
            columns={tableColumns}
            taskDetailColumns={visibleColumns}
            dataSource={showingFinanceDue ? (financeDueData.loading ? [] : duePage.rows) : activeRows}
            loading={showingFinanceDue ? financeDueData.loading : loading}
            rowSelection={showingFinanceDue ? undefined : {
              type: 'radio',
              selectedRowKeys: activeSelectedRow ? [activeSelectedRow.id] : [],
              onChange: (_keys, selectedRows) =>
                setSelectedByKey((prev) => ({
                  ...prev,
                  [currentActiveKey]: selectedRows[0] || null,
                })),
            }}
            rowClassName={(record) =>
              record.id === activeSelectedRow?.id
                ? 'ant-table-row-selected'
                : ''
            }
            onRow={(record) => showingFinanceDue ? financeDueRowProps(record, openOperationalFactDetails) : ({
              onClick: () =>
                setSelectedByKey((prev) => ({
                  ...prev,
                  [currentActiveKey]: record,
                })),
            })}
            onOpenRecord={showingFinanceDue ? undefined : openOperationalFactDetails}
            emptyDescription={showingFinanceDue ? '当前筛选暂无数据' : '暂无业务记录'}
            pagination={showingFinanceDue ? {
              current: duePage.page,
              pageSize: duePage.pageSize,
              total: duePage.total,
              showSizeChanger: false,
              onChange: (page) =>
                setVisualViewState((current) => ({ ...current, finance: { ...current.finance, page } })),
            } : createBusinessTablePagination({
              pagination: activePagination,
              total: activeTotal,
              onChange: (current, pageSize) =>
                setPaginationByKey((prev) => ({
                  ...prev,
                  [currentActiveKey]: { current, pageSize },
                })),
            })}
            scroll={showingFinanceDue ? undefined : { x: 1320 }}
          />
        )}
      </BusinessViewSurface>

      <ProductionRecordDrawer
        title="核对本次生产记录"
        summary={productionFactSummary(activeSelectedRow || {})}
        open={productionReviewOpen}
        loading={saving}
        record={activeSelectedRow}
        columns={visibleColumns}
        onClose={saving ? undefined : () => setProductionReviewID(null)}
        actions={
          <Button
            type="primary"
            loading={saving}
            disabled={!canPostSelected || activeSelectedRow?.status !== OperationalFactStatus.DRAFT || sourceBoundDraftTransitionBlocked}
            onClick={async () => {
              if (!canPostSelected || sourceBoundDraftTransitionBlocked || activeSelectedRow?.status !== OperationalFactStatus.DRAFT) return
              const success = await runRowAction(activeConfig, activeSelectedRow, 'post', postButtonLabel)
              if (success) setProductionReviewID(null)
            }}
          >
            {postButtonLabel}
          </Button>
        }
      />

      {columnOrderModal}
      {currentActiveKey === 'production' ? (
        <ProductionRecordDrawer
          title={`${getBusinessDocumentTitle('production_fact')}详情`}
          summary={productionFactSummary(visibleDetailRecord || {})}
          columns={visibleColumns}
          open={Boolean(visibleDetailRecord)}
          record={visibleDetailRecord}
          onClose={() => setDetailRecord(null)}
          actions={detailSourceRoute && canOpenRelatedPath(detailSourceRoute) ? (
            <Button onClick={() => navigate(detailSourceRoute)}>查看来源单据</Button>
          ) : null}
        />
      ) : <BusinessDetailsModal
        descriptionInHelp
        columns={visibleColumns}
        description="当前弹窗只用于查看记录；如需编辑草稿、确认、结清、取消、返工或继续办理，请使用列表上方的当前操作区。"
        open={Boolean(visibleDetailRecord)}
        record={visibleDetailRecord}
        extraActions={
          detailSourceRoute && canOpenRelatedPath(detailSourceRoute) ? (
            <Button onClick={() => navigate(detailSourceRoute)}>
              查看来源单据
            </Button>
          ) : null
        }
        title={`${activeConfig.title}详情`}
        onClose={() => setDetailRecord(null)}
      />}
      <FinanceBusinessSourceModal
        action={financeSourceContext?.action}
        open={Boolean(financeSourceContext)}
        source={financeSourceContext?.source}
        initialValues={financeSourceInitialValues}
        loading={financeSourceLoading}
        onCancel={closeFinanceSourceAction}
        onSubmit={submitFinanceSourceAction}
      />
      <ProductionMaterialIssueModal
        open={productionDraftEditContext?.kind === 'material'}
        mode="edit"
        initialValues={productionDraftEditContext?.initialValues}
        order={productionDraftEditContext?.order}
        orderItem={productionDraftEditContext?.orderItem}
        requirement={productionDraftEditContext?.requirement}
        warehouseOptions={productionDraftEditContext?.warehouseOptions}
        lots={productionDraftEditContext?.lots}
        loading={productionDraftEditLoading}
        lotsLoading={productionDraftEditLoading}
        onWarehouseChange={loadProductionDraftMaterialLots}
        onCancel={closeProductionDraftEditor}
        onSubmit={submitProductionDraftEdit}
      />
      <ProductionCompletionModal
        open={productionDraftEditContext?.kind === 'completion'}
        mode="edit"
        initialValues={productionDraftEditContext?.initialValues}
        excludeFactID={productionDraftEditContext?.record?.id}
        order={productionDraftEditContext?.order}
        items={productionDraftEditContext?.items}
        facts={productionDraftEditContext?.facts}
        wipAggregate={productionDraftEditContext?.wipAggregate}
        warehouseOptions={productionDraftEditContext?.warehouseOptions}
        lots={productionDraftEditContext?.lots}
        loading={productionDraftEditLoading}
        onCancel={closeProductionDraftEditor}
        onSubmit={submitProductionDraftEdit}
      />
      <ProductionReworkModal
        open={productionDraftEditContext?.kind === 'rework'}
        mode="edit"
        source={productionDraftEditContext?.record}
        facts={[]}
        initialValues={productionDraftEditContext?.initialValues}
        loading={productionDraftEditLoading}
        onCancel={closeProductionDraftEditor}
        onSubmit={submitProductionDraftEdit}
      />
      <ProductionReworkModal
        open={Boolean(productionReworkContext)}
        source={productionReworkContext?.source}
        facts={productionReworkContext?.facts}
        initialValues={productionReworkInitialValues}
        loading={productionReworkLoading}
        onCancel={closeProductionRework}
        onSubmit={submitProductionRework}
      />
      <ProductionReworkProgressModal
        open={Boolean(productionReworkProgressContext)}
        order={productionReworkProgressContext?.order}
        aggregate={productionReworkProgressContext?.aggregate}
        facts={productionReworkProgressContext?.facts}
        focusReworkFactID={productionReworkProgressContext?.focusReworkFactID}
        loading={productionReworkProgressLoading}
        onCancel={closeProductionReworkProgress}
        onContinue={
          canOpenRelatedPath(BUSINESS_ROUTE_PATHS.productionOrders)
            ? () => {
                const orderID = productionReworkProgressContext?.order?.id
                closeProductionReworkProgress()
                navigate(
                  routeWithQuery(BUSINESS_ROUTE_PATHS.productionOrders, {
                    production_order_id: orderID,
                  })
                )
              }
            : undefined
        }
      />
      <BusinessModal
        size="confirm"
        title={cancelButtonLabel}
        open={financeCancelOpen}
        okText={cancelButtonLabel}
        cancelText="返回"
        confirmLoading={saving}
        maskClosable={!saving}
        onOk={confirmFinanceCancellation}
        onCancel={() => {
          if (!saving) {
            setFinanceCancelOpen(false)
            setFinanceCancelReason('')
          }
        }}
      >
        <p>
          {cancelPresentation?.description}
        </p>
        <label htmlFor="operational-fact-cancel-reason">业务原因</label>
        <Input.TextArea
          id="operational-fact-cancel-reason"
          value={financeCancelReason}
          maxLength={255}
          showCount
          rows={4}
          placeholder="填写业务原因"
          onChange={(event) => setFinanceCancelReason(event.target.value)}
        />
      </BusinessModal>
    </LayoutRoot>
  )
}

export default function OperationalFactsPage() {
  return <OperationalFactWorkspace />
}
