import React, { useCallback, useMemo } from 'react'
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
import { Button, Dropdown, Input, Modal, Popconfirm, Tabs, Tag } from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useOperationalFactQuery } from '../components/operational-facts/useOperationalFactQuery.mjs'
import { useOperationalFactMutations } from '../components/operational-facts/useOperationalFactMutations.mjs'
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
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'

import { createBusinessTablePagination } from '../utils/businessPagination.mjs'
import { applyBusinessColumnSorters } from '../utils/moduleTableColumns.mjs'
import {
  BusinessActionTooltip,
  BusinessDataTable,
  BusinessOperationPanel,
  BusinessPageLayout,
  DateRangeFilter,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  SelectionClearAction,
} from '../components/business-list/BusinessListLayout.jsx'
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

import {
  FINANCE_BUSINESS_SOURCE_ACTIONS,
  hasValidFinanceTransitionSource,
  isOutsourcingReturnPayableSource,
  isSingleFactReconciliationSource,
} from '../utils/financeBusinessSourceAction.mjs'

import useBusinessListExport from '../hooks/useBusinessListExport.js'
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
  DEFAULT_OPERATIONAL_FACT_SUMMARY,
  EMPTY_VIEW_OVERRIDES,
  OCCURRED_DATE_FILTER_OPTIONS,
  STATUS_OPTIONS,
  buildOperationalFactColumns,
  buildOperationalFactRelatedMenuItems,
  buildOperationalFactStats,
  financeSettlementActionFor,
  getOperationalFactAttachmentOwnerType,
  sourceTypeLabel,
} from '../components/operational-facts/operationalFactPageConfig.mjs'

export function OperationalFactWorkspace({
  pageTitle = '业务记录处理',
  pageSummary = DEFAULT_OPERATIONAL_FACT_SUMMARY,
  toolbarModuleKey = 'operational-facts',
  initialActiveKey = 'production',
  enabledViews,
  viewOverrides = EMPTY_VIEW_OVERRIDES,
  showTabs = true,
}) {
  const outletContext = useOutletContext()
  const navigate = useNavigate()

  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
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
    outletContext,
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
    loadRows,
    activeSelectedRow,
    activeConfig,
  })

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
    'production.rework.create'
  )
  const canEditAnyProductionDraft = [
    'production.material_issue.create',
    'production.completion.create',
    'production.rework.create',
    'warehouse.inbound.confirm',
  ].some((permission) => hasActionPermission(adminProfile, permission))
  const canViewProductionReworkProgress =
    hasActionPermission(adminProfile, 'production.fact.read') &&
    hasActionPermission(adminProfile, 'production.wip.read')
  const selectedProductionDraftSaveAction =
    currentActiveKey === 'production' && activeSelectedRow?.status === 'DRAFT'
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
    if (!fact?.id || !canOpenRelatedPath(V1_ROUTE_PATHS.payables)) return
    navigate(
      relatedDocumentRoute(
        V1_ROUTE_PATHS.payables,
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

  const columns = applyBusinessColumnSorters(
    buildOperationalFactColumns(currentActiveKey, activeFinanceFactType)
  )
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

  const { exporting, exportRows } = useBusinessListExport({
    requestKey: `operational-facts-export:${currentActiveKey}`,
    loadRows: loadExportRows,
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
    activeSelectedRow?.status === 'DRAFT' &&
    !hasValidFinanceTransitionSource(activeSelectedRow)
  const sourceBoundDraftTransitionBlocked =
    ['production', 'outsourcing'].includes(currentActiveKey) &&
    activeSelectedRow?.status === 'DRAFT' &&
    !hasRequiredOperationalFactDraftSource(currentActiveKey, activeSelectedRow)
  const canViewOutsourcingPayable =
    hasActionPermission(adminProfile, 'finance.payable.read') &&
    canOpenRelatedPath(V1_ROUTE_PATHS.payables)
  const canCreateSingleReconciliation = hasActionPermission(
    adminProfile,
    'finance.reconciliation.confirm'
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
    ['POSTED', 'CANCELLED'].includes(
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
    activeSelectedRow?.status === 'POSTED' &&
      financeSettlementActionFor(activeSelectedRow?.fact_type)
  )
  const selectedLabel = selectedLabelForKey(currentActiveKey, activeSelectedRow)
  const selectedIsProductionCompletion =
    currentActiveKey === 'production' &&
    isFinishedGoodsReceipt(activeSelectedRow)
  const postButtonLabel = selectedIsProductionCompletion
    ? '确认成品入库'
    : '过账'
  const postConfirmTitle = selectedIsProductionCompletion
    ? '确认实收并增加成品库存？'
    : '确认过账？'
  const cancelButtonLabel = selectedIsProductionCompletion
    ? activeSelectedRow?.status === 'DRAFT'
      ? '作废完工报告'
      : '撤销成品入库'
    : activeSelectedRow?.status === 'DRAFT'
      ? '作废草稿'
      : '取消'
  const shipmentCancelButtonLabel =
    activeSelectedRow?.status === 'DRAFT' ? '作废草稿' : '取消发货'
  const shipmentCancelActionLabel =
    activeSelectedRow?.status === 'DRAFT' ? '作废出货草稿' : '取消发货'
  const shipmentCancelConfirmTitle =
    activeSelectedRow?.status === 'DRAFT'
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
        canOpenRelatedPath(V1_ROUTE_PATHS.salesOrders)
    )
    addItem(
      'inventory',
      '库存台账',
      ['production', 'outsourcing', 'shipments'].includes(currentActiveKey) &&
        canOpenRelatedPath(V1_ROUTE_PATHS.inventory)
    )
    addItem(
      'receivables',
      '应收管理',
      currentActiveKey === 'shipments' &&
        canOpenRelatedPath(V1_ROUTE_PATHS.receivables)
    )
    addItem(
      'invoices',
      '发票管理',
      currentActiveKey === 'shipments' &&
        canOpenRelatedPath(V1_ROUTE_PATHS.invoices)
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
        V1_ROUTE_PATHS.salesOrders,
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
        V1_ROUTE_PATHS.receivables,
        { source_type: 'SHIPMENT', source_id: activeSelectedRow.id },
        {
          keyword: activeSelectedRow.shipment_no,
          source: 'operational-fact',
          fields: ['source_no'],
        }
      ),
      invoices: relatedDocumentRoute(
        V1_ROUTE_PATHS.invoices,
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

  const hasActiveFilters = Boolean(
    keyword.trim() ||
      statusFilter ||
      activeDateRange[0] ||
      activeDateRange[1] ||
      routeSalesOrderID ||
      routeSourceType ||
      routeSourceID ||
      routeFactID ||
      linkedKeyword
  )

  const pageStats = buildOperationalFactStats({
    activeRows,
    activeTotal,
  })
  const tabItems = Object.entries(configs).map(([key, config]) => ({
    key,
    label: config.title,
  }))

  return (
    <BusinessPageLayout className="erp-v1-operational-fact-page">
      <PageHeaderCard
        compact
        title={pageTitle}
        description={pageSummary}
        tags={[
          <Tag color="cyan" key="view">
            {activeConfig.title}
          </Tag>,
          <Tag color="blue" key="fact">
            正式业务记录
          </Tag>,
          <Tag color="green" key="backend">
            系统过账 / 撤销调整
          </Tag>,
          <Tag color="gold" key="boundary">
            任务完成不等于过账
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
              value={resolvedRouteKeyword || linkedKeyword || keyword}
              placeholder="搜索单号"
              searchHint="可搜索：单号、来源、备注"
              onChange={(event) => {
                if (
                  resolvedRouteKeyword ||
                  linkedKeyword ||
                  routeFactID ||
                  routeSalesOrderID ||
                  (routeSourceType && routeSourceID)
                ) {
                  clearRouteContext()
                }
                setKeyword(event.target.value)
                resetPaginationForKey()
              }}
              onPressEnter={() => loadRows(currentActiveKey)}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetPaginationForKey()
              }}
            />
            <DateRangeFilter
              options={activeConfig.dateOptions || OCCURRED_DATE_FILTER_OPTIONS}
              value={activeDateField}
              onTypeChange={(nextField) => {
                setDateFieldByKey((prev) => ({
                  ...prev,
                  [currentActiveKey]:
                    nextField || activeConfig.defaultDateField,
                }))
                resetPaginationForKey()
              }}
              startValue={activeDateRange[0] || ''}
              endValue={activeDateRange[1] || ''}
              onStartChange={(nextStart) => {
                setDateRangeByKey((prev) => ({
                  ...prev,
                  [currentActiveKey]: [
                    nextStart,
                    prev[currentActiveKey]?.[1] || '',
                  ],
                }))
                resetPaginationForKey()
              }}
              onEndChange={(nextEnd) => {
                setDateRangeByKey((prev) => ({
                  ...prev,
                  [currentActiveKey]: [
                    prev[currentActiveKey]?.[0] || '',
                    nextEnd,
                  ],
                }))
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
            exportDisabled={loading || exporting || activeTotal === 0}
            exportDisabledReason={
              exporting
                ? '正在准备导出，请稍候'
                : loading
                  ? `${activeConfig.title}加载完成后可导出`
                  : activeTotal === 0
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
              disabled={!activeSelectedRow}
              onClick={() => openOperationalFactDetails(activeSelectedRow)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          {['production', 'outsourcing'].includes(currentActiveKey) &&
          canPostActive ? (
            <BusinessActionTooltip
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== 'DRAFT' ||
                !canPostSelected ||
                sourceBoundDraftTransitionBlocked ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条业务记录'
                  : activeSelectedRow.status !== 'DRAFT'
                    ? '只有业务草稿可以过账'
                    : !canPostSelected
                      ? selectedIsProductionCompletion
                        ? '只有仓库岗位可以核对并确认成品入库'
                        : '当前账号没有确认该类生产记录的权限'
                      : sourceBoundDraftTransitionBlocked
                        ? '该历史草稿缺少可核对来源，不能过账或作废'
                        : saving
                          ? '当前操作完成后可过账'
                          : ''
              }
            >
              <Popconfirm
                title={postConfirmTitle}
                onConfirm={() =>
                  runRowAction(
                    activeConfig,
                    activeSelectedRow,
                    'post',
                    postButtonLabel
                  )
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  type="primary"
                  className="erp-business-module-status-action"
                  icon={<CheckCircleOutlined />}
                  data-business-action-key="operational-fact-post"
                  disabled={
                    !activeSelectedRow ||
                    activeSelectedRow.status !== 'DRAFT' ||
                    !canPostSelected ||
                    sourceBoundDraftTransitionBlocked ||
                    saving
                  }
                >
                  {postButtonLabel}
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'production' && canEditAnyProductionDraft ? (
            <BusinessActionTooltip
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== 'DRAFT' ||
                !selectedProductionDraftSaveAction ||
                !canEditSelectedProductionDraft ||
                productionDraftEditLoading
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条生产记录'
                  : activeSelectedRow.status !== 'DRAFT'
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
                disabled={
                  !activeSelectedRow ||
                  activeSelectedRow.status !== 'DRAFT' ||
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
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== 'DRAFT' ||
                financeDraftTransitionBlocked ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条财务记录'
                  : activeSelectedRow.status !== 'DRAFT'
                    ? '只有财务草稿可以确认'
                    : financeDraftTransitionBlocked
                      ? '该历史草稿缺少可核对来源，不能确认或作废'
                      : saving
                        ? '当前操作完成后可确认'
                        : ''
              }
            >
              <Popconfirm
                title="确认当前财务记录？"
                onConfirm={() =>
                  runRowAction(activeConfig, activeSelectedRow, 'post', '确认')
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  type="primary"
                  className="erp-business-module-status-action"
                  icon={<CheckCircleOutlined />}
                  data-business-action-key="finance-fact-confirm"
                  disabled={
                    !activeSelectedRow ||
                    activeSelectedRow.status !== 'DRAFT' ||
                    financeDraftTransitionBlocked ||
                    saving
                  }
                >
                  确认
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'finance' && canCreateSingleReconciliation ? (
            <BusinessActionTooltip
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
              disabled={
                !activeSelectedRow ||
                !['DRAFT', 'POSTED'].includes(activeSelectedRow.status) ||
                financeDraftTransitionBlocked ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条财务记录'
                  : !['DRAFT', 'POSTED'].includes(activeSelectedRow.status)
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
                disabled={
                  !activeSelectedRow ||
                  !['DRAFT', 'POSTED'].includes(activeSelectedRow.status) ||
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
              canWithdraw={canWriteActive || canConfirmActive}
              disabled={!activeSelectedRow}
              disabledReason="请先选择一条记录"
              buttonProps={{
                'data-business-action-key': `${currentActiveKey}-attachments`,
              }}
            />
          ) : null}
          {currentActiveKey === 'shipments' && canPostActive ? (
            <BusinessActionTooltip
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== 'DRAFT' ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一张出货单'
                  : activeSelectedRow.status !== 'DRAFT'
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
                  disabled={
                    !activeSelectedRow ||
                    activeSelectedRow.status !== 'DRAFT' ||
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
              disabled={
                !activeSelectedRow ||
                activeSelectedRow.status !== 'ACTIVE' ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条库存预留'
                  : activeSelectedRow.status !== 'ACTIVE'
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
                  disabled={
                    !activeSelectedRow ||
                    activeSelectedRow.status !== 'ACTIVE' ||
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
              disabled={
                !activeSelectedRow || !selectedCanSettleFinance || saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条财务记录'
                  : !financeSettlementActionFor(activeSelectedRow.fact_type)
                    ? '只有对账记录可以完成核对'
                    : activeSelectedRow.status !== 'POSTED'
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
              disabled={
                !activeSelectedRow ||
                !['DRAFT', 'POSTED'].includes(activeSelectedRow.status) ||
                !canCancelSelected ||
                sourceBoundDraftTransitionBlocked ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一条业务记录'
                  : !['DRAFT', 'POSTED'].includes(activeSelectedRow.status)
                    ? '当前业务记录状态不能取消'
                    : !canCancelSelected
                      ? selectedIsProductionCompletion &&
                        activeSelectedRow.status === 'POSTED'
                        ? '只有仓库岗位可以撤销已确认的成品入库'
                        : '当前账号没有取消该类生产记录的权限'
                      : sourceBoundDraftTransitionBlocked
                        ? '该历史草稿缺少可核对来源，不能过账或作废'
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
                disabled={
                  !activeSelectedRow ||
                  !['DRAFT', 'POSTED'].includes(activeSelectedRow.status) ||
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
              disabled={
                !activeSelectedRow ||
                !['DRAFT', 'SHIPPED'].includes(activeSelectedRow.status) ||
                saving
              }
              disabledReason={
                !activeSelectedRow
                  ? '请先选择一张出货单'
                  : !['DRAFT', 'SHIPPED'].includes(activeSelectedRow.status)
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
                  disabled={
                    !activeSelectedRow ||
                    !['DRAFT', 'SHIPPED'].includes(activeSelectedRow.status) ||
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

      <BusinessDataTable
        tableHeader={
          showTabs && tabItems.length > 1 ? (
            <Tabs
              className="erp-business-view-tabs"
              activeKey={currentActiveKey}
              onChange={setActiveKey}
              items={tabItems}
            />
          ) : null
        }
        rowKey="id"
        columns={tableColumns}
        dataSource={activeRows}
        loading={loading}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: activeSelectedRow ? [activeSelectedRow.id] : [],
          onChange: (_keys, selectedRows) =>
            setSelectedByKey((prev) => ({
              ...prev,
              [currentActiveKey]: selectedRows[0] || null,
            })),
        }}
        rowClassName={(record) =>
          record.id === activeSelectedRow?.id ? 'ant-table-row-selected' : ''
        }
        onRow={(record) => ({
          onClick: () =>
            setSelectedByKey((prev) => ({
              ...prev,
              [currentActiveKey]: record,
            })),
        })}
        onOpenRecord={openOperationalFactDetails}
        emptyDescription="暂无业务记录"
        pagination={createBusinessTablePagination({
          pagination: activePagination,
          total: activeTotal,
          onChange: (current, pageSize) =>
            setPaginationByKey((prev) => ({
              ...prev,
              [currentActiveKey]: { current, pageSize },
            })),
        })}
        scroll={{ x: 1320 }}
      />

      {columnOrderModal}
      <BusinessDetailsModal
        columns={visibleColumns}
        description="当前弹窗只用于查看记录；如需编辑草稿、确认、结清、取消、返工或继续办理，请使用列表上方的当前操作区。"
        open={Boolean(detailRecord)}
        record={detailRecord}
        title={`${activeConfig.title}详情`}
        onClose={() => setDetailRecord(null)}
      />
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
          canOpenRelatedPath(V1_ROUTE_PATHS.productionOrders)
            ? () => {
                const orderID = productionReworkProgressContext?.order?.id
                closeProductionReworkProgress()
                navigate(
                  routeWithQuery(V1_ROUTE_PATHS.productionOrders, {
                    production_order_id: orderID,
                  })
                )
              }
            : undefined
        }
      />
      <Modal
        title={
          currentActiveKey === 'finance'
            ? activeSelectedRow?.status === 'DRAFT'
              ? '作废财务草稿'
              : '取消财务记录'
            : selectedIsProductionCompletion
              ? activeSelectedRow?.status === 'DRAFT'
                ? '作废生产完工报告'
                : '撤销成品入库'
              : activeSelectedRow?.status === 'DRAFT'
                ? '作废业务草稿'
                : '取消已过账业务记录'
        }
        open={financeCancelOpen}
        okText={selectedIsProductionCompletion ? cancelButtonLabel : '确认取消'}
        cancelText="暂不取消"
        confirmLoading={saving}
        onOk={confirmFinanceCancellation}
        onCancel={() => {
          if (!saving) {
            setFinanceCancelOpen(false)
            setFinanceCancelReason('')
          }
        }}
      >
        <p>
          {activeSelectedRow?.status === 'DRAFT'
            ? currentActiveKey === 'finance'
              ? '草稿尚未确认，作废不会生成过账或库存变更；系统会记录操作人、时间和原因。'
              : selectedIsProductionCompletion
                ? '完工报告尚未由仓库确认，作废不会变更成品库存；系统会记录操作人、时间和原因。'
                : '草稿尚未过账，不会变更库存；系统会记录操作人、时间和原因。'
            : selectedIsProductionCompletion
              ? '撤销后将保留原入库时间，按系统规则冲正成品库存，并记录本次操作人、时间和原因。'
              : '取消后将保留原过账时间，按系统规则冲正库存，并记录本次操作人、时间和原因。'}
        </p>
        <Input.TextArea
          value={financeCancelReason}
          maxLength={255}
          showCount
          rows={4}
          placeholder={
            currentActiveKey === 'finance'
              ? '请填写客户、供应商或账款调整的业务原因'
              : selectedIsProductionCompletion
                ? '请填写作废完工报告或撤销成品入库的业务原因'
                : '请填写作废或取消的业务原因'
          }
          onChange={(event) => setFinanceCancelReason(event.target.value)}
        />
      </Modal>
    </BusinessPageLayout>
  )
}

export default function OperationalFactsPage() {
  return <OperationalFactWorkspace />
}
