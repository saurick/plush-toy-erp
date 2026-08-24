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
import { Button, Dropdown, Input, Modal, Popconfirm, Tabs, Tag } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { currentBusinessDate } from '../utils/businessDate.mjs'
import {
  compactParams,
  hasActionPermission,
  trimOptional,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
} from '../utils/businessPagination.mjs'
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
import {
  routeWithQuery,
  searchParamPositiveInt,
  searchParamText,
} from '../utils/routeQuery.mjs'
import {
  canOpenRelatedDocumentPath,
  clearLinkedDocumentParams,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
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
  createProductionReworkFromCompletion,
  createReconciliationFromFinanceFact,
  listAllProductionFacts,
  listProductionOrderMaterialRequirements,
  saveProductionCompletionDraft,
  saveProductionMaterialIssueDraft,
  saveProductionReworkFromCompletionDraft,
} from '../api/operationalFactApi.mjs'
import { getProductionWip } from '../api/productionWipApi.mjs'
import { getProductionOrder } from '../api/productionOrderApi.mjs'
import { listAllWarehouses } from '../api/masterDataOrderApi.mjs'
import { listAllInventoryLots } from '../api/inventoryApi.mjs'
import {
  FINANCE_BUSINESS_SOURCE_ACTIONS,
  buildFinanceBusinessSourcePayload,
  financeBusinessSourceActionConfig,
  financeBusinessSourceFormValuesFromRequest,
  hasValidFinanceTransitionSource,
  isOutsourcingReturnPayableSource,
  isSingleFactReconciliationSource,
} from '../utils/financeBusinessSourceAction.mjs'
import {
  createSourceBusinessActionAttemptStore,
  isSourceBusinessActionResultUnknown,
} from '../utils/sourceBusinessAction.mjs'
import { matchesOperationalFactLifecycleResult } from '../utils/operationalFactLifecycle.mjs'
import useBusinessListExport from '../hooks/useBusinessListExport.js'
import { resolveContextualBusinessActionAvailability } from '../utils/businessActionAvailability.mjs'
import { resolveRelatedRecordActionAvailability } from '../utils/operationalActionAvailability.mjs'
import {
  buildProductionReworkPayload,
  findProductionReworkResult,
  isPostedProductionCompletion,
  isProductionReworkEligible,
  productionReworkFormValuesFromRequest,
} from '../utils/productionReworkAction.mjs'
import {
  hasAnyPermission,
  isFinishedGoodsReceipt,
  productionFactCancelPermissions,
  productionFactPostPermissions,
  selectedLabelForKey,
} from '../components/operational-facts/OperationalFactForms.jsx'
import { hasRequiredOperationalFactDraftSource } from '../utils/operationalFactDraftSource.mjs'
import {
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS,
  buildOperationalFactDraftSavePayload,
  findOperationalFactDraftSaveResult,
  operationalFactDraftFormValues,
} from '../utils/operationalFactDraftEdit.mjs'
import { filterProductionMaterialIssueLots } from '../utils/productionMaterialIssueAction.mjs'
import {
  uniqueReferenceOptions,
  warehouseOptionFromRecord,
} from '../utils/referenceSelectOptions.mjs'
import {
  businessSourceInventoryRouteFor,
  businessSourceRouteFor,
  sourceRouteFor,
} from '../utils/businessSourceNavigation.mjs'
import { resolveOperationalFactRouteRecord } from '../utils/operationalFactRelatedNavigation.mjs'
import {
  DEFAULT_OPERATIONAL_FACT_PAGINATION,
  DEFAULT_OPERATIONAL_FACT_SUMMARY,
  EMPTY_VIEW_OVERRIDES,
  OCCURRED_DATE_FILTER_OPTIONS,
  STATUS_OPTIONS,
  buildOperationalFactColumns,
  buildOperationalFactRelatedMenuItems,
  buildOperationalFactStats,
  buildOperationalFactViewConfigs,
  financeSettlementActionFor,
  getOperationalFactAttachmentOwnerType,
  sourceTypeLabel,
} from '../components/operational-facts/operationalFactPageConfig.mjs'

function productionDraftSaveActionFor(record = {}) {
  const factType = String(record?.fact_type || '').toUpperCase()
  const sourceType = String(record?.source_type || '').toUpperCase()
  if (factType === 'MATERIAL_ISSUE' && sourceType === 'PRODUCTION_ORDER') {
    return OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
  }
  if (
    factType === 'FINISHED_GOODS_RECEIPT' &&
    sourceType === 'PRODUCTION_ORDER'
  ) {
    return OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION
  }
  if (factType === 'REWORK' && sourceType === 'PRODUCTION_FACT') {
    return OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_COMPLETION
  }
  return ''
}

function productionDraftEditPermissions(action) {
  if (
    action === OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
  ) {
    return ['production.material_issue.create']
  }
  if (action === OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION) {
    return ['production.completion.create', 'warehouse.inbound.confirm']
  }
  return ['production.rework.create']
}

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
  const [searchParams, setSearchParams] = useSearchParams()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const activeCustomerKey = adminProfile?.effective_session?.customer?.key || ''
  const [activeKey, setActiveKey] = useState(initialActiveKey)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFieldByKey, setDateFieldByKey] = useState({})
  const [dateRangeByKey, setDateRangeByKey] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [financeCancelOpen, setFinanceCancelOpen] = useState(false)
  const [financeCancelReason, setFinanceCancelReason] = useState('')
  const [financeSourceContext, setFinanceSourceContext] = useState(null)
  const [financeSourceLoading, setFinanceSourceLoading] = useState(false)
  const [productionReworkContext, setProductionReworkContext] = useState(null)
  const [productionReworkLoading, setProductionReworkLoading] = useState(false)
  const [productionReworkProgressContext, setProductionReworkProgressContext] =
    useState(null)
  const [productionReworkProgressLoading, setProductionReworkProgressLoading] =
    useState(false)
  const [productionDraftEditContext, setProductionDraftEditContext] =
    useState(null)
  const [productionDraftEditLoading, setProductionDraftEditLoading] =
    useState(false)
  const [rowsByKey, setRowsByKey] = useState({})
  const [totalByKey, setTotalByKey] = useState({})
  const [paginationByKey, setPaginationByKey] = useState({})
  const [selectedByKey, setSelectedByKey] = useState({})
  const [detailRecord, setDetailRecord] = useState(null)
  const listRequestVersionRef = useRef(0)
  const mountedRef = useRef(false)
  const financeSourceAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const financeSourceInFlightRef = useRef(false)
  const productionReworkAttemptsRef = useRef(
    createSourceBusinessActionAttemptStore()
  )
  const productionReworkInFlightRef = useRef(false)
  const productionReworkRequestRef = useRef(0)
  const productionReworkProgressRequestRef = useRef(0)
  const productionDraftEditRequestRef = useRef(0)
  const routeSalesOrderID = searchParamPositiveInt(
    searchParams,
    'sales_order_id'
  )
  const routeSourceID = searchParamPositiveInt(searchParams, 'source_id')
  const routeSourceType = searchParamText(searchParams, 'source_type')
  const routeFactID = searchParamPositiveInt(searchParams, 'fact_id')
  const routeView = searchParamText(searchParams, 'view')
  const linkedContext = linkedDocumentContext(searchParams)
  const linkedKeyword = linkedContext.keyword
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

  const baseConfigs = useMemo(() => buildOperationalFactViewConfigs(), [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      listRequestVersionRef.current += 1
      productionReworkRequestRef.current += 1
      productionReworkProgressRequestRef.current += 1
      productionDraftEditRequestRef.current += 1
    }
  }, [])

  const enabledViewKeys = useMemo(() => {
    const requestedKeys =
      Array.isArray(enabledViews) && enabledViews.length > 0
        ? enabledViews
        : Object.keys(baseConfigs)
    const validKeys = requestedKeys.filter((key) => Boolean(baseConfigs[key]))
    return validKeys.length > 0 ? validKeys : ['production']
  }, [baseConfigs, enabledViews])

  const configs = useMemo(() => {
    const nextConfigs = {}
    enabledViewKeys.forEach((key) => {
      const baseConfig = baseConfigs[key]
      const override = viewOverrides?.[key] || {}
      nextConfigs[key] = {
        ...baseConfig,
        ...override,
        listParams: {
          ...(baseConfig.listParams || {}),
          ...(override.listParams || {}),
        },
      }
    })
    return nextConfigs
  }, [baseConfigs, enabledViewKeys, viewOverrides])

  useEffect(() => {
    if (!configs[activeKey]) {
      setActiveKey(enabledViewKeys[0] || 'production')
    }
  }, [activeKey, configs, enabledViewKeys])

  useEffect(() => {
    if (routeView && configs[routeView] && routeView !== activeKey) {
      setActiveKey(routeView)
    }
  }, [activeKey, configs, routeView])

  const fallbackActiveKey =
    enabledViewKeys.find((key) => configs[key]) || 'production'
  const currentActiveKey = configs[activeKey] ? activeKey : fallbackActiveKey
  const activeConfig = configs[currentActiveKey] || configs[fallbackActiveKey]
  const activeRows = useMemo(
    () => rowsByKey[currentActiveKey] || [],
    [currentActiveKey, rowsByKey]
  )
  const activeTotal = totalByKey[currentActiveKey] || 0
  const activeSelectedRow = selectedByKey[currentActiveKey] || null
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
  const openOperationalFactDetails = useCallback(
    (record) => {
      if (!record?.id) return
      setSelectedByKey((prev) => ({
        ...prev,
        [currentActiveKey]: record,
      }))
      setDetailRecord(record)
    },
    [currentActiveKey]
  )
  const financeSourceScope = financeSourceContext?.source?.id
    ? `${financeSourceContext.action}:${financeSourceContext.source.id}`
    : ''
  const financeSourceInitialValues = useMemo(() => {
    if (!financeSourceScope) return undefined
    const retained = financeSourceAttemptsRef.current.peek(financeSourceScope)
    return retained
      ? financeBusinessSourceFormValuesFromRequest(retained.params)
      : undefined
  }, [financeSourceScope])
  const productionReworkScope = productionReworkContext?.source?.id
    ? `production-rework:${productionReworkContext.source.id}`
    : ''
  const productionReworkInitialValues = useMemo(() => {
    if (!productionReworkScope) return undefined
    const retained = productionReworkAttemptsRef.current.peek(
      productionReworkScope
    )
    return retained
      ? productionReworkFormValuesFromRequest(retained.params)
      : undefined
  }, [productionReworkScope])
  const activePagination =
    paginationByKey[currentActiveKey] || DEFAULT_OPERATIONAL_FACT_PAGINATION
  const activeDateField =
    dateFieldByKey[currentActiveKey] ||
    activeConfig.defaultDateField ||
    'occurred_at'
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

  const resetPaginationForKey = useCallback(
    (key = currentActiveKey) => {
      setPaginationByKey((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || DEFAULT_OPERATIONAL_FACT_PAGINATION),
          current: 1,
        },
      }))
    },
    [currentActiveKey]
  )

  const routeListParamsForKey = useCallback(
    (key) => {
      if (['shipments', 'reservations'].includes(key) && routeSalesOrderID) {
        return { source_id: routeSalesOrderID }
      }
      if (
        ['production', 'outsourcing'].includes(key) &&
        routeSourceType &&
        routeSourceID
      ) {
        return {
          source_type: routeSourceType,
          source_id: routeSourceID,
        }
      }
      if (key === 'finance' && routeSourceType && routeSourceID) {
        return {
          source_type: routeSourceType,
          source_id: routeSourceID,
        }
      }
      return {}
    },
    [routeSalesOrderID, routeSourceID, routeSourceType]
  )

  const loadRows = useCallback(
    async (key = currentActiveKey) => {
      const config = configs[key]
      if (!config) {
        return
      }
      if (
        Array.isArray(config.readPermissions) &&
        config.readPermissions.length > 0 &&
        !hasAnyPermission(adminProfile, config.readPermissions)
      ) {
        setRowsByKey((prev) => ({ ...prev, [key]: [] }))
        setSelectedByKey((prev) => ({ ...prev, [key]: null }))
        setTotalByKey((prev) => ({ ...prev, [key]: 0 }))
        setLoading(false)
        return
      }
      const requestVersion = listRequestVersionRef.current + 1
      listRequestVersionRef.current = requestVersion
      const shouldApplyRequest = () =>
        mountedRef.current && requestVersion === listRequestVersionRef.current
      setLoading(true)
      try {
        const pagination = paginationByKey[key] || activePagination
        const exactRouteContext = Boolean(
          routeFactID || routeSalesOrderID || (routeSourceType && routeSourceID)
        )
        const exactProductionFactID =
          key === 'production' ? Number(routeFactID || 0) : 0
        const data =
          exactProductionFactID > 0
            ? await listAllProductionFacts({
                keyword: String(exactProductionFactID),
              })
            : await config.list(
                compactParams({
                  status: statusFilter,
                  keyword: trimOptional(
                    linkedDocumentRequestKeyword({
                      localKeyword: keyword,
                      linkedKeyword,
                      hasExactContext: exactRouteContext,
                    })
                  ),
                  date_field: dateFieldByKey[key] || config.defaultDateField,
                  date_from: dateRangeByKey[key]?.[0] || undefined,
                  date_to: dateRangeByKey[key]?.[1] || undefined,
                  ...(config.listParams || {}),
                  ...routeListParamsForKey(key),
                  ...getBusinessPaginationParams(pagination),
                })
              )
        const listedRows = Array.isArray(data?.[config.listKey])
          ? data[config.listKey]
          : []
        const nextRows =
          exactProductionFactID > 0
            ? listedRows.filter(
                (item) => Number(item?.id || 0) === exactProductionFactID
              )
            : listedRows
        if (!shouldApplyRequest()) {
          return
        }
        setRowsByKey((prev) => ({
          ...prev,
          [key]: nextRows,
        }))
        setSelectedByKey((prev) => {
          const routeRecord = resolveOperationalFactRouteRecord(nextRows, {
            activeKey: key,
            factID: routeFactID,
            sourceType: routeSourceType,
            sourceID: routeSourceID,
            total:
              exactProductionFactID > 0
                ? nextRows.length
                : Number(data?.total || 0),
          })
          const hasRouteSelection = Boolean(
            (key === 'production' && routeFactID) ||
              (key === 'finance' && routeSourceType && routeSourceID)
          )
          if (hasRouteSelection) {
            return {
              ...prev,
              [key]: routeRecord,
            }
          }
          const current = prev[key]
          if (!current?.id) return prev
          const refreshed = nextRows.find((item) => item.id === current.id)
          return {
            ...prev,
            [key]: refreshed || null,
          }
        })
        setTotalByKey((prev) => ({
          ...prev,
          [key]:
            exactProductionFactID > 0
              ? nextRows.length
              : Number(data?.total || 0),
        }))
        return nextRows
      } catch (error) {
        if (shouldApplyRequest()) {
          setSelectedByKey((prev) => ({ ...prev, [key]: null }))
          setDetailRecord(null)
          message.error(getActionErrorMessage(error, `加载${config.title}`))
        }
        return null
      } finally {
        if (shouldApplyRequest()) {
          setLoading(false)
        }
      }
    },
    [
      activePagination,
      adminProfile,
      configs,
      currentActiveKey,
      dateFieldByKey,
      dateRangeByKey,
      keyword,
      linkedKeyword,
      paginationByKey,
      routeFactID,
      routeListParamsForKey,
      routeSalesOrderID,
      routeSourceID,
      routeSourceType,
      statusFilter,
    ]
  )

  useEffect(() => {
    loadRows(currentActiveKey)
  }, [currentActiveKey, loadRows])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(() =>
      loadRows(currentActiveKey)
    )
  }, [currentActiveKey, loadRows, outletContext])

  const runRowAction = async (
    config,
    row,
    actionKey,
    actionLabel,
    extraParams = {}
  ) => {
    const action = config[actionKey]
    if (!action || !row?.id) {
      return false
    }
    const usesStrictFactLifecycle =
      ['production', 'outsourcing', 'finance'].includes(currentActiveKey) &&
      ['post', 'settle', 'cancel'].includes(actionKey)
    const targetStatus = usesStrictFactLifecycle
      ? {
          post: 'POSTED',
          settle: 'SETTLED',
          cancel: 'CANCELLED',
        }[actionKey]
      : ''
    const attempt = Object.freeze({
      id: row.id,
      ...(usesStrictFactLifecycle
        ? {
            expected_version: row.version,
            ...(activeCustomerKey ? { customer_key: activeCustomerKey } : {}),
          }
        : currentActiveKey === 'outsourcing' && activeCustomerKey
          ? { customer_key: activeCustomerKey }
          : {}),
      ...extraParams,
    })
    let resultUnknown = false
    try {
      setSaving(true)
      await action(attempt)
    } catch (error) {
      if (
        !usesStrictFactLifecycle ||
        !isSourceBusinessActionResultUnknown(error) ||
        !targetStatus
      ) {
        message.error(getActionErrorMessage(error, actionLabel))
        setSaving(false)
        return false
      }
      resultUnknown = true
    }
    const refreshedRows = await loadRows(currentActiveKey)
    if (resultUnknown) {
      const confirmed = refreshedRows?.find((record) =>
        matchesOperationalFactLifecycleResult(record, attempt, targetStatus)
      )
      if (!confirmed) {
        message.warning(
          '暂时无法确认操作结果，已清除当前选择；请刷新核对后再决定是否重试'
        )
        setSaving(false)
        return false
      }
    }
    message.success(
      currentActiveKey === 'production' &&
        actionKey === 'post' &&
        String(row.fact_type || '')
          .trim()
          .toUpperCase() === 'REWORK'
        ? '返工记录已过账，返工补制批次和生产异常任务已生成'
        : resultUnknown
          ? `已重新读取并确认${actionLabel}完成`
          : `${actionLabel}已完成`
    )
    if (!refreshedRows) {
      message.warning(`${actionLabel}已完成，请稍后刷新查看最新结果`)
    }
    setSaving(false)
    return true
  }

  const openProductionDraftEditor = async (record) => {
    const action = productionDraftSaveActionFor(record)
    if (
      !action ||
      record?.status !== 'DRAFT' ||
      !hasAnyPermission(adminProfile, productionDraftEditPermissions(action))
    ) {
      message.warning('当前记录状态或权限已变化，请刷新后重试')
      return
    }
    const requestID = productionDraftEditRequestRef.current + 1
    productionDraftEditRequestRef.current = requestID
    setProductionDraftEditLoading(true)
    try {
      const exactData = await listAllProductionFacts({
        keyword: String(record.id),
      })
      if (productionDraftEditRequestRef.current !== requestID) return
      const fresh = (exactData?.production_facts || []).find(
        (item) => Number(item?.id || 0) === Number(record.id)
      )
      if (
        !fresh ||
        fresh.status !== 'DRAFT' ||
        productionDraftSaveActionFor(fresh) !== action
      ) {
        message.warning('草稿状态或来源已变化，请刷新后重试')
        return
      }
      const initialValues = operationalFactDraftFormValues(fresh)
      if (
        action ===
        OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_COMPLETION
      ) {
        setProductionDraftEditContext({
          kind: 'rework',
          action,
          record: fresh,
          initialValues,
        })
        return
      }
      const orderID = Number(fresh.source_id || 0)
      if (!orderID) throw new Error('生产来源不完整')
      const [aggregate, warehouseData, lotData, factData, requirements] =
        await Promise.all([
          getProductionOrder(orderID),
          listAllWarehouses({ active_only: true }),
          listAllInventoryLots(
            action ===
              OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
              ? {
                  subject_type: 'MATERIAL',
                  subject_id: fresh.subject_id,
                  warehouse_id: fresh.warehouse_id,
                  status: 'ACTIVE',
                }
              : { status: 'ACTIVE' }
          ),
          listAllProductionFacts({
            source_type: 'PRODUCTION_ORDER',
            source_id: orderID,
          }),
          action ===
          OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
            ? listProductionOrderMaterialRequirements({
                customer_key: activeCustomerKey || undefined,
                production_order_id: orderID,
              })
            : Promise.resolve([]),
        ])
      if (productionDraftEditRequestRef.current !== requestID) return
      const warehouseOptions = uniqueReferenceOptions(
        warehouseData?.warehouses,
        warehouseOptionFromRecord
      )
      const facts = Array.isArray(factData?.production_facts)
        ? factData.production_facts
        : []
      const lots = Array.isArray(lotData?.inventory_lots)
        ? lotData.inventory_lots
        : []
      if (
        action === OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE
      ) {
        const requirement = (
          Array.isArray(requirements) ? requirements : []
        ).find((item) => Number(item?.id || 0) === Number(fresh.source_line_id))
        const orderItem = (aggregate?.items || []).find(
          (item) =>
            Number(item?.id || 0) ===
            Number(requirement?.production_order_item_id || 0)
        )
        if (!requirement || !orderItem) throw new Error('生产领料来源已变化')
        setProductionDraftEditContext({
          kind: 'material',
          action,
          record: fresh,
          initialValues,
          order: aggregate.order,
          orderItem,
          requirement,
          warehouseOptions,
          lots: filterProductionMaterialIssueLots(requirement, lots),
        })
        return
      }
      const wipAggregate = fresh.production_wip_batch_id
        ? await getProductionWip(orderID)
        : null
      if (productionDraftEditRequestRef.current !== requestID) return
      setProductionDraftEditContext({
        kind: 'completion',
        action,
        record: fresh,
        initialValues: {
          ...initialValues,
          production_order_item_id: fresh.source_line_id,
          production_wip_batch_id: fresh.production_wip_batch_id,
        },
        order: aggregate.order,
        items: aggregate.items || [],
        facts,
        wipAggregate,
        warehouseOptions,
        lots,
      })
    } catch (error) {
      if (productionDraftEditRequestRef.current === requestID) {
        message.error(getActionErrorMessage(error, '加载生产草稿'))
      }
    } finally {
      if (productionDraftEditRequestRef.current === requestID) {
        setProductionDraftEditLoading(false)
      }
    }
  }

  const loadProductionDraftMaterialLots = async (warehouseID) => {
    const context = productionDraftEditContext
    const requestID = productionDraftEditRequestRef.current
    if (context?.kind !== 'material' || !Number(warehouseID || 0)) return
    setProductionDraftEditLoading(true)
    try {
      const data = await listAllInventoryLots({
        subject_type: 'MATERIAL',
        subject_id: context.requirement.material_id,
        warehouse_id: Number(warehouseID),
        status: 'ACTIVE',
      })
      if (productionDraftEditRequestRef.current !== requestID) return
      setProductionDraftEditContext((current) =>
        current?.kind === 'material'
          ? {
              ...current,
              lots: filterProductionMaterialIssueLots(
                current.requirement,
                data?.inventory_lots
              ),
            }
          : current
      )
    } catch (error) {
      if (productionDraftEditRequestRef.current === requestID) {
        message.error(getActionErrorMessage(error, '加载材料批次'))
      }
    } finally {
      if (productionDraftEditRequestRef.current === requestID) {
        setProductionDraftEditLoading(false)
      }
    }
  }

  const closeProductionDraftEditor = () => {
    productionDraftEditRequestRef.current += 1
    setProductionDraftEditLoading(false)
    setProductionDraftEditContext(null)
  }

  const submitProductionDraftEdit = async (values) => {
    const context = productionDraftEditContext
    if (!context?.record?.id || productionDraftEditLoading) return
    let request
    try {
      request = {
        ...buildOperationalFactDraftSavePayload(
          context.action,
          values,
          context.record
        ),
        ...(activeCustomerKey ? { customer_key: activeCustomerKey } : {}),
      }
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备草稿内容'))
      return
    }
    const saveByAction = {
      [OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE]:
        saveProductionMaterialIssueDraft,
      [OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION]:
        saveProductionCompletionDraft,
      [OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_COMPLETION]:
        saveProductionReworkFromCompletionDraft,
    }
    const save = saveByAction[context.action]
    if (!save) return
    setProductionDraftEditLoading(true)
    try {
      try {
        await save(request, context.record)
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) throw error
        const data = await listAllProductionFacts({
          keyword: String(context.record.id),
        })
        const confirmed = findOperationalFactDraftSaveResult(
          data?.production_facts,
          request,
          context.record,
          context.action
        )
        if (!confirmed) throw error
      }
      setProductionDraftEditContext(null)
      message.success(
        context.action ===
          OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION
          ? '待入库草稿已保存，请由仓库核对后确认成品入库'
          : '生产草稿已保存，请核对后再过账'
      )
      await loadRows('production')
    } catch (error) {
      message.error(getActionErrorMessage(error, '保存生产草稿'))
    } finally {
      setProductionDraftEditLoading(false)
    }
  }

  const openProductionRework = async (source) => {
    if (!canCreateProductionRework) {
      message.warning('当前账号没有发起返工的权限')
      return
    }
    if (!isPostedProductionCompletion(source)) {
      message.warning('仅已过账且来源完整的成品入库记录可以发起返工')
      return
    }
    const requestID = productionReworkRequestRef.current + 1
    productionReworkRequestRef.current = requestID
    setProductionReworkLoading(true)
    try {
      const data = await listAllProductionFacts({
        source_type: 'PRODUCTION_FACT',
        source_id: source.id,
      })
      if (productionReworkRequestRef.current !== requestID) return
      const facts = Array.isArray(data?.production_facts)
        ? data.production_facts
        : []
      if (!isProductionReworkEligible(source, facts)) {
        message.warning('当前完工记录已没有可返工数量，请刷新后核对')
        return
      }
      setProductionReworkContext({ source, facts })
    } catch (error) {
      if (productionReworkRequestRef.current === requestID) {
        message.error(getActionErrorMessage(error, '加载返工来源'))
      }
    } finally {
      if (productionReworkRequestRef.current === requestID) {
        setProductionReworkLoading(false)
      }
    }
  }

  const closeProductionRework = () => {
    if (productionReworkInFlightRef.current) return
    productionReworkRequestRef.current += 1
    setProductionReworkLoading(false)
    setProductionReworkContext(null)
  }

  const openProductionReworkProgress = async (source) => {
    const orderID = Number(source?.production_order_id || 0)
    if (!canViewProductionReworkProgress) {
      message.warning('当前账号不能同时查看生产工序和生产记录')
      return
    }
    if (
      String(source?.fact_type || '').toUpperCase() !== 'REWORK' ||
      !['POSTED', 'CANCELLED'].includes(
        String(source?.status || '').toUpperCase()
      ) ||
      !Number.isSafeInteger(orderID) ||
      orderID <= 0
    ) {
      message.warning('请选择已过账或已撤销且来源完整的返工记录')
      return
    }
    const requestID = productionReworkProgressRequestRef.current + 1
    productionReworkProgressRequestRef.current = requestID
    setProductionReworkProgressLoading(true)
    try {
      const [aggregate, factData] = await Promise.all([
        getProductionWip(orderID),
        listAllProductionFacts({
          source_type: 'PRODUCTION_ORDER',
          source_id: orderID,
        }),
      ])
      if (productionReworkProgressRequestRef.current !== requestID) return
      const hasExactRoot = aggregate.batches.some(
        (batch) =>
          Number(batch?.origin_rework_fact_id || 0) === Number(source.id) &&
          !Number(batch?.source_batch_id)
      )
      if (!hasExactRoot) {
        message.warning('该返工记录尚未关联可核对的成品返工补制批次')
        return
      }
      const facts = Array.isArray(factData?.production_facts)
        ? factData.production_facts
        : []
      setProductionReworkProgressContext({
        order: aggregate.productionOrder,
        aggregate,
        facts: facts.some((fact) => Number(fact?.id) === Number(source.id))
          ? facts
          : [source, ...facts],
        focusReworkFactID: source.id,
      })
    } catch (error) {
      if (productionReworkProgressRequestRef.current === requestID) {
        message.error(getActionErrorMessage(error, '加载成品返工进度'))
      }
    } finally {
      if (productionReworkProgressRequestRef.current === requestID) {
        setProductionReworkProgressLoading(false)
      }
    }
  }

  const closeProductionReworkProgress = () => {
    productionReworkProgressRequestRef.current += 1
    setProductionReworkProgressLoading(false)
    setProductionReworkProgressContext(null)
  }

  const submitProductionRework = async (values) => {
    const source = productionReworkContext?.source
    const facts = productionReworkContext?.facts || []
    if (productionReworkInFlightRef.current || !source?.id) return

    const scope = `production-rework:${source.id}`
    let attempt
    try {
      const payload = {
        ...buildProductionReworkPayload(values, source, facts),
        customer_key: activeCustomerKey || undefined,
      }
      attempt = productionReworkAttemptsRef.current.prepare(scope, payload)
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备返工记录'))
      return
    }

    productionReworkInFlightRef.current = true
    setProductionReworkLoading(true)
    try {
      let result
      let confirmedByReread = false
      try {
        result = await createProductionReworkFromCompletion(attempt.params)
      } catch (error) {
        if (!isSourceBusinessActionResultUnknown(error)) {
          productionReworkAttemptsRef.current.settle(scope, attempt, error)
          message.error(getActionErrorMessage(error, '生成返工草稿'))
          return
        }
        let currentFacts = []
        try {
          const data = await listAllProductionFacts({
            source_type: 'PRODUCTION_FACT',
            source_id: source.id,
          })
          currentFacts = Array.isArray(data?.production_facts)
            ? data.production_facts
            : []
          result = findProductionReworkResult(currentFacts, attempt.params)
        } catch {
          result = null
        }
        if (!result) {
          productionReworkAttemptsRef.current.settle(scope, attempt, error)
          message.warning(
            '暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录'
          )
          return
        }
        confirmedByReread = true
      }

      productionReworkAttemptsRef.current.settle(scope, attempt, null)
      productionReworkRequestRef.current += 1
      setProductionReworkContext(null)
      message.success(
        confirmedByReread
          ? '已重新读取并确认返工草稿，请核对后过账'
          : '返工草稿已生成，请核对后过账'
      )
      resetPaginationForKey('production')
    } finally {
      productionReworkInFlightRef.current = false
      setProductionReworkLoading(false)
    }
  }

  const confirmFinanceCancellation = async () => {
    const reason = financeCancelReason.trim()
    if (!reason) {
      message.error('请填写取消原因')
      return
    }
    if ([...reason].length > 255) {
      message.error('取消原因不能超过 255 个字')
      return
    }
    const actionLabel =
      currentActiveKey === 'finance'
        ? activeSelectedRow?.status === 'DRAFT'
          ? '作废财务草稿'
          : '取消财务记录'
        : currentActiveKey === 'production' &&
            isFinishedGoodsReceipt(activeSelectedRow)
          ? activeSelectedRow?.status === 'DRAFT'
            ? '作废生产完工报告'
            : '撤销成品入库'
          : activeSelectedRow?.status === 'DRAFT'
            ? '作废业务草稿'
            : '取消业务记录'
    const succeeded = await runRowAction(
      activeConfig,
      activeSelectedRow,
      'cancel',
      actionLabel,
      { reason }
    )
    if (succeeded) {
      setFinanceCancelOpen(false)
      setFinanceCancelReason('')
    }
  }

  const openFinanceSourceAction = (action, source) => {
    const canRun =
      action === FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION &&
      hasActionPermission(adminProfile, 'finance.reconciliation.confirm') &&
      isSingleFactReconciliationSource(source)
    if (!canRun) {
      message.warning('当前记录状态或权限已变化，请刷新后重试')
      return
    }
    setFinanceSourceContext({ action, source })
  }

  const closeFinanceSourceAction = () => {
    if (financeSourceInFlightRef.current) return
    setFinanceSourceContext(null)
  }

  const submitFinanceSourceAction = async (values) => {
    const action = financeSourceContext?.action
    const source = financeSourceContext?.source
    if (financeSourceInFlightRef.current || !action || !source?.id) return

    const config = financeBusinessSourceActionConfig(action)
    const scope = `${action}:${source.id}`
    let attempt
    try {
      const payload = {
        ...buildFinanceBusinessSourcePayload(action, values, source),
        customer_key: activeCustomerKey || undefined,
      }
      attempt = financeSourceAttemptsRef.current.prepare(scope, payload)
    } catch (error) {
      message.error(getActionErrorMessage(error, '准备财务记录'))
      return
    }

    financeSourceInFlightRef.current = true
    setFinanceSourceLoading(true)
    try {
      await createReconciliationFromFinanceFact(attempt.params)
      financeSourceAttemptsRef.current.settle(scope, attempt, null)
      setFinanceSourceContext(null)
      message.success(config.successMessage)
      resetPaginationForKey(currentActiveKey)
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
        message.error(getActionErrorMessage(error, config.title))
      }
    } finally {
      financeSourceInFlightRef.current = false
      setFinanceSourceLoading(false)
    }
  }

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
  const loadExportRows = useCallback(
    async ({ signal }) => {
      if (
        Array.isArray(activeConfig.readPermissions) &&
        activeConfig.readPermissions.length > 0 &&
        !hasAnyPermission(adminProfile, activeConfig.readPermissions)
      ) {
        return []
      }
      const exactProductionFactID =
        currentActiveKey === 'production' ? Number(routeFactID || 0) : 0
      const exactRouteContext = Boolean(
        routeFactID || routeSalesOrderID || (routeSourceType && routeSourceID)
      )
      const data =
        exactProductionFactID > 0
          ? await listAllProductionFacts(
              { keyword: String(exactProductionFactID) },
              { signal }
            )
          : await activeConfig.listAll(
              compactParams({
                status: statusFilter,
                keyword: trimOptional(
                  linkedDocumentRequestKeyword({
                    localKeyword: keyword,
                    linkedKeyword,
                    hasExactContext: exactRouteContext,
                  })
                ),
                date_field: activeDateField,
                date_from: dateRangeByKey[currentActiveKey]?.[0] || undefined,
                date_to: dateRangeByKey[currentActiveKey]?.[1] || undefined,
                ...(activeConfig.listParams || {}),
                ...routeListParamsForKey(currentActiveKey),
              }),
              { signal }
            )
      const exportRows = data?.[activeConfig.listKey]
      return exactProductionFactID > 0 && Array.isArray(exportRows)
        ? exportRows.filter(
            (item) => Number(item?.id || 0) === exactProductionFactID
          )
        : exportRows
    },
    [
      activeConfig,
      activeDateField,
      adminProfile,
      currentActiveKey,
      dateRangeByKey,
      keyword,
      linkedKeyword,
      routeFactID,
      routeListParamsForKey,
      routeSalesOrderID,
      routeSourceID,
      routeSourceType,
      statusFilter,
    ]
  )
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
  const clearRouteContext = useCallback(
    (keys) => {
      const nextParams = clearLinkedDocumentParams(searchParams)
      const keysToDelete =
        Array.isArray(keys) && keys.length > 0
          ? keys
          : ['sales_order_id', 'source_type', 'source_id', 'fact_id']
      keysToDelete.forEach((key) => nextParams.delete(key))
      setSearchParams(nextParams, { replace: true })
      resetPaginationForKey()
    },
    [resetPaginationForKey, searchParams, setSearchParams]
  )
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
  const clearFilters = useCallback(() => {
    setKeyword('')
    setStatusFilter('')
    setDateFieldByKey((prev) => ({
      ...prev,
      [currentActiveKey]: activeConfig.defaultDateField || 'occurred_at',
    }))
    setDateRangeByKey((prev) => ({
      ...prev,
      [currentActiveKey]: ['', ''],
    }))
    clearRouteContext()
  }, [activeConfig.defaultDateField, clearRouteContext, currentActiveKey])
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
