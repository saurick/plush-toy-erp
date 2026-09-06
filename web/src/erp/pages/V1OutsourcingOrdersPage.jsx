import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  PlusOutlined,
  PrinterOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, Space, Tag } from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useOutsourcingOrderLifecycle } from '../components/outsourcing-orders/useOutsourcingOrderLifecycle.jsx'
import { useOutsourcingOrderLineOrder } from '../components/outsourcing-orders/useOutsourcingOrderLineOrder.mjs'
import { useOutsourcingOrderEditor } from '../components/outsourcing-orders/useOutsourcingOrderEditor.mjs'
import { useOutsourcingOrderTasks } from '../components/outsourcing-orders/useOutsourcingOrderTasks.mjs'
import { useOutsourcingOrderQuery } from '../components/outsourcing-orders/useOutsourcingOrderQuery.mjs'
import { useOutsourcingSourceFacts } from '../components/outsourcing-orders/useOutsourcingSourceFacts.jsx'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import { currentBusinessDate } from '../utils/businessDate.mjs'

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

import {
  getPreferredColumnOrder,
  writeStoredColumnOrder,
} from '../components/business-list/businessListPreferences.mjs'
import BusinessFormModal from '../components/business-list/BusinessFormModal.jsx'
import BusinessDetailsModal from '../components/business-list/BusinessDetailsModal.jsx'
import BusinessLineItemOrderModal from '../components/business-list/BusinessLineItemOrderModal.jsx'

import BusinessAttachmentPanel from '../components/business-list/BusinessAttachmentPanel.jsx'
import LifecycleScopeFilter from '../components/business-list/LifecycleScopeFilter.jsx'
import OutsourcingOrderForm, {
  outsourcingOrderLineOrderLabel,
} from '../components/outsourcing-orders/OutsourcingOrderForm.jsx'
import OutsourcingOrderSourceFactModal from '../components/outsourcing-orders/OutsourcingOrderSourceFactModal.jsx'
import OutsourcingReturnRecordsModal from '../components/outsourcing-orders/OutsourcingReturnRecordsModal.jsx'
import OutsourcingReturnQualityInspectionModal from '../components/quality-inspections/OutsourcingReturnQualityInspectionModal.jsx'
import OutsourcingReturnDispositionModal from '../components/quality-inspections/OutsourcingReturnDispositionModal.jsx'
import FinanceBusinessSourceModal from '../components/finance/FinanceBusinessSourceModal.jsx'
import { buildOutsourcingOrderColumns } from '../components/outsourcing-orders/outsourcingOrderColumns.jsx'

import {
  downloadBusinessAttachment,
  listBusinessAttachments,
} from '../api/attachmentApi.mjs'

import useBusinessListExport from '../hooks/useBusinessListExport.js'
import { setERPColumnOrder } from '../api/erpPreferenceApi.mjs'

import {
  OUTSOURCING_ORDER_STATUS_LABELS,
  canRunOutsourcingOrderLifecycleAction,
  hasActionPermission,
  V1_ROUTE_PATHS,
  statusText,
} from '../utils/masterDataOrderView.mjs'

import { OUTSOURCING_ORDER_SUBJECT_TYPES } from '../utils/sourceOrderLineValues.mjs'

import {
  resolveBusinessLifecycleActions,
  resolveContextualBusinessActionAvailability,
} from '../utils/businessActionAvailability.mjs'

import { canReorderSourceDocumentItems } from '../utils/sourceDocumentMutation.mjs'
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
  OUTSOURCING_ORDERS_MODULE_KEY,
  buildOutsourcingOrderStats,
  canEditOutsourcingOrder,
  getOutsourcingOrderDisplayNo,
} from '../components/outsourcing-orders/outsourcingOrderPageConfig.mjs'

import { FINANCE_BUSINESS_SOURCE_ACTIONS } from '../utils/financeBusinessSourceAction.mjs'

import {
  canOpenRelatedDocumentPath,
  clearLinkedDocumentParams,
} from '../utils/relatedDocumentNavigation.mjs'

import { inspectOutsourcingContractReadiness } from '../utils/outsourcingContractReadiness.mjs'
import {
  lifecycleScopeIncludesStatus,
  withLifecycleScopeSearchParam,
} from '../utils/lifecycleScope.mjs'

export default function V1OutsourcingOrdersPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()

  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const {
    searchParams,
    setSearchParams,
    rows,
    setRows,
    total,
    loading,
    keyword,
    setKeyword,
    lifecycleScope,
    setLifecycleScope,
    statusFilter,
    setStatusFilter,
    supplierFilter,
    setSupplierFilter,
    dateField,
    setDateField,
    dateRange,
    setDateRange,
    sortValue,
    setSortValue,
    pagination,
    setPagination,
    selectedRow,
    setSelectedRow,
    lifecycleStatusOptions,
    routeOutsourcingOrderID,
    routeOutsourcingFactID,
    linkedKeyword,
    setResolvedLinkedContext,
    resolvedLinkedKeyword,
    canReadOutsourcingFacts,
    beginLatestRequest,
    loadOrders,
    loadExportOrders,
    hasActiveFilters,
    clearRouteContext,
    clearFilters,
  } = useOutsourcingOrderQuery({ adminProfile })
  const {
    workflowTaskLoadState,
    canReadWorkflowTasks,
    loadWorkflowTasks,
    blockWorkflowTask,
    completeWorkflowTask,
    rejectWorkflowTask,
    resumeWorkflowTask,
    urgeOutsourcingWorkflowTask,
    selectedWorkflowTasks,
  } = useOutsourcingOrderTasks({
    adminProfile,
    beginLatestRequest,
    selectedRow,
  })

  const activeCustomerKey = useMemo(
    () => adminProfile?.effective_session?.customer?.key || '',
    [adminProfile]
  )

  const [saving, setSaving] = useState(false)
  const {
    form,
    itemsLoading,
    modalOpen,
    editingRow,
    detailOrder,
    setDetailOrder,
    orderAttachmentRef,
    suppliers,
    supplierContacts,
    supplierContactsLoading,
    productSKUs,
    warehouses,
    setWarehouses,
    supplierOptions,
    productOptions,
    materialOptions,
    processOptions,
    unitOptions,
    loadOrderItems,
    canUpdate,
    processingPrintTemplateDefaults,
    openCreate,
    openEdit,
    openOutsourcingOrderRecord,
    closeModal,
    handleSubjectTypeChange,
    handleProductChange,
    handleProductSKUChange,
    handleMaterialChange,
    handleProcessChange,
    handleUnitChange,
    handleSupplierChange,
    handleSupplierContactNameChange,
    handleSupplierContactSelect,
    submitForm,
  } = useOutsourcingOrderEditor({
    beginLatestRequest,
    adminProfile,
    rows,
    setSelectedRow,
    setSaving,
    setPagination,
    loadWorkflowTasks,
    loadOrders,
  })

  const [printingAction, setPrintingAction] = useState('')

  const [columnOrder, setColumnOrder] = useState(null)
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const [columnOrderSaving, setColumnOrderSaving] = useState(false)

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

  const canCreate = hasActionPermission(
    adminProfile,
    'outsourcing.order.create'
  )
  const canRead = hasActionPermission(adminProfile, 'outsourcing.order.read')

  const selectedOrderCanReorder = Boolean(
    canUpdate && canReorderSourceDocumentItems('outsourcing_order', selectedRow)
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

  const canUpdateWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.update'
  )
  const canCompleteWorkflowTasks = hasActionPermission(
    adminProfile,
    'workflow.task.complete'
  )

  const {
    sourceFactOpen,
    sourceFactLoading,
    sourceFactContext,
    returnRecordsOpen,
    returnRecordsLoading,
    returnRecordsOrder,
    relatedReturnFacts,
    returnRecordActionLoading,
    qualityInspectionByFactID,
    qualitySourceFact,
    qualitySourceLoading,
    dispositionSourceFact,
    financeSourceFact,
    financeSourceLoading,
    financeSourceInitialValues,
    openRelatedReturnRecords,
    closeRelatedReturnRecords,
    postSelectedOutsourcingFact,
    cancelSelectedOutsourcingFact,
    openOutsourcingReturnQualityInspection,
    closeOutsourcingReturnQualityInspection,
    submitOutsourcingReturnQualityInspection,
    viewOutsourcingReturnQualityInspection,
    openOutsourcingReturnDisposition,
    closeOutsourcingReturnDisposition,
    openOutsourcingReturnPayable,
    closeOutsourcingReturnPayable,
    submitOutsourcingReturnPayable,
    viewOutsourcingReturnPayable,
    openOutsourcingFactDraftEditor,
    closeOutsourcingSourceFact,
    getOutsourcingOrderItemFields,
    loadAllOutsourcingOrderItemsForPreview,
    outsourcingOrderItemsPreview,
    submitOutsourcingSourceFact,
  } = useOutsourcingSourceFacts({
    canReadOutsourcingFacts,
    canReadQualityInspection,
    activeCustomerKey,
    canPostOutsourcingFact,
    canCancelOutsourcingFact,
    canCreateQualityInspection,
    canOpenQualityInspection,
    navigate,
    canCreatePayable,
    canViewPayable,
    setWarehouses,
    canCreateMaterialIssue,
    canCreateReturnReceipt,
    unitOptions,
    rows,
    canRead,
  })

  const {
    lineOrderLoading,
    lineOrderOpen,
    lineOrderContext,
    closeLineOrder,
    openOutsourcingOrderLineOrder,
    applyOutsourcingOrderLineOrder,
  } = useOutsourcingOrderLineOrder({
    selectedRow,
    selectedOrderCanReorder,
    loadOrderItems,
    setSaving,
    activeCustomerKey,
    outsourcingOrderItemsPreview,
    setRows,
    setSelectedRow,
    loadOrders,
  })

  const refreshPageData = useCallback(async () => {
    await Promise.all([loadOrders(), loadWorkflowTasks()])
  }, [loadOrders, loadWorkflowTasks])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPageData)
  }, [outletContext, refreshPageData])

  const { runLifecycleAction } = useOutsourcingOrderLifecycle({
    selectedRow,
    saving,
    setSaving,
    activeCustomerKey,
    setSelectedRow,
    loadOrders,
    loadWorkflowTasks,
    loadOrderItems,
    openEdit,
  })

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

  const { exporting, exportRows: exportOrders } = useBusinessListExport({
    requestKey: 'outsourcing-orders-export',
    loadRows: loadExportOrders,
    filename: `委外订单-${currentBusinessDate()}.csv`,
    columns: visibleDataColumns,
    recordLabel: '加工合同',
  })

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
                  !selectedOrderCanReorder || lineOrderLoading || saving
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
                    !selectedOrderCanReorder || lineOrderLoading || saving
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
          closeLineOrder()
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
