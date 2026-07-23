import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
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
} from '../components/business-list/BusinessListLayout.jsx'
import {
  BusinessListToolbarActions,
  downloadBusinessListCSV,
  useBusinessColumnOrder,
} from '../components/business-list/BusinessListToolbarActions.jsx'
import BusinessAttachmentModalButton from '../components/business-list/BusinessAttachmentModalButton.jsx'
import BusinessRecordDetailsModal from '../components/business-list/BusinessRecordDetailsModal.jsx'
import FinanceBusinessSourceModal from '../components/finance/FinanceBusinessSourceModal.jsx'
import ProductionReworkModal from '../components/production-facts/ProductionReworkModal.jsx'
import {
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
} from '../api/operationalFactApi.mjs'
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
import {
  buildProductionReworkPayload,
  findProductionReworkResult,
  isPostedProductionCompletion,
  isProductionReworkEligible,
  productionReworkFormValuesFromRequest,
} from '../utils/productionReworkAction.mjs'
import {
  hasAnyPermission,
  selectedLabelForKey,
} from '../components/operational-facts/OperationalFactForms.jsx'
import { hasRequiredOperationalFactDraftSource } from '../utils/operationalFactDraftSource.mjs'
import {
  businessRecordInventoryRouteFor,
  businessSourceRouteFor,
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
            [key]: refreshed || current,
          }
        })
        setTotalByKey((prev) => ({
          ...prev,
          [key]:
            exactProductionFactID > 0
              ? nextRows.length
              : Number(data?.total || 0),
        }))
      } catch (error) {
        if (shouldApplyRequest()) {
          message.error(getActionErrorMessage(error, `加载${config.title}`))
        }
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
      return
    }
    try {
      setSaving(true)
      await action({
        id: row.id,
        ...(currentActiveKey === 'outsourcing' && activeCustomerKey
          ? { customer_key: activeCustomerKey }
          : {}),
        ...extraParams,
      })
      message.success(
        currentActiveKey === 'production' &&
          actionKey === 'post' &&
          String(row.fact_type || '')
            .trim()
            .toUpperCase() === 'REWORK'
          ? '返工记录已过账，生产异常任务已生成'
          : `${actionLabel}已完成`
      )
    } catch (error) {
      message.error(getActionErrorMessage(error, actionLabel))
      setSaving(false)
      return false
    }
    try {
      await loadRows(currentActiveKey)
    } catch (_error) {
      message.warning(`${actionLabel}已完成，请稍后刷新查看最新结果`)
    } finally {
      setSaving(false)
    }
    return true
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
    const succeeded = await runRowAction(
      activeConfig,
      activeSelectedRow,
      'cancel',
      activeSelectedRow?.status === 'DRAFT' ? '作废财务草稿' : '取消财务记录',
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
  const { tableColumns, visibleColumns, openColumnOrder, columnOrderModal } =
    useBusinessColumnOrder({
      adminProfile,
      moduleKey: `${toolbarModuleKey}-${currentActiveKey}`,
      moduleTitle: `${pageTitle} / ${activeConfig.title}`,
      columns,
    })
  const exportRows = useCallback(() => {
    downloadBusinessListCSV({
      filename: `业务记录-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: visibleColumns,
      rows: activeRows,
    })
  }, [activeRows, visibleColumns])
  const canFinanceAction =
    currentActiveKey === 'finance'
      ? canConfirmFinanceFact(adminProfile, activeSelectedRow?.fact_type)
      : false
  const financeDraftTransitionBlocked =
    currentActiveKey === 'finance' &&
    activeSelectedRow?.status === 'DRAFT' &&
    !hasValidFinanceTransitionSource(activeSelectedRow)
  const sourceBoundDraftTransitionBlocked =
    ['production', 'outsourcing'].includes(currentActiveKey) &&
    activeSelectedRow?.status === 'DRAFT' &&
    !hasRequiredOperationalFactDraftSource(
      currentActiveKey,
      activeSelectedRow
    )
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
  const canReleaseActive = hasAnyPermission(
    adminProfile,
    activeConfig.releasePermissions || activeConfig.writePermissions
  )
  const canConfirmActive =
    canFinanceAction || canPostActive || canCancelActive || canReleaseActive
  const financeSettlementAction =
    currentActiveKey === 'finance'
      ? financeSettlementActionFor(
          activeSelectedRow?.fact_type || activeFinanceFactType
        )
      : null
  const selectedLabel = selectedLabelForKey(currentActiveKey, activeSelectedRow)
  const activeAttachmentOwnerType =
    getOperationalFactAttachmentOwnerType(currentActiveKey)
  const relatedMenuItems = useMemo(
    () =>
      buildOperationalFactRelatedMenuItems({
        activeKey: currentActiveKey,
        activeSelectedRow,
        canOpenPath: canOpenRelatedPath,
      }),
    [activeSelectedRow, canOpenRelatedPath, currentActiveKey]
  )

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
      inventory: businessRecordInventoryRouteFor(
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
            exportDisabled={activeRows.length === 0}
            onOpenColumnOrder={openColumnOrder}
          />
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={activeSelectedRow ? 1 : 0}
          selectedLabel={selectedLabel}
          boundaryText={activeBoundaryText}
        >
          <Button
            type="link"
            size="small"
            disabled={!activeSelectedRow}
            onClick={clearActiveSelection}
          >
            清空已选
          </Button>
          {relatedMenuItems.length > 0 ? (
            <Dropdown
              trigger={['click']}
              destroyOnHidden
              menu={{
                items: relatedMenuItems,
                onClick: openRelatedTable,
              }}
            >
              <Button size="small" icon={<LinkOutlined />}>
                相关单据 <DownOutlined />
              </Button>
            </Dropdown>
          ) : null}
          <BusinessActionTooltip
            disabled={!activeSelectedRow}
            disabledReason="请先选择一条业务记录"
          >
            <Button
              size="small"
              icon={<EyeOutlined />}
              disabled={!activeSelectedRow}
              onClick={() => openOperationalFactDetails(activeSelectedRow)}
            >
              查看详情
            </Button>
          </BusinessActionTooltip>
          {['production', 'outsourcing'].includes(currentActiveKey) &&
          canPostActive &&
          (!activeSelectedRow || activeSelectedRow.status === 'DRAFT') ? (
            <BusinessActionTooltip
              disabled={
                !activeSelectedRow ||
                sourceBoundDraftTransitionBlocked ||
                saving
              }
              disabledReason={
                sourceBoundDraftTransitionBlocked
                  ? '该历史草稿缺少可核对来源，不能过账或作废'
                  : saving
                    ? '当前操作完成后可过账'
                    : '请先选择一条业务草稿'
              }
            >
              <Popconfirm
                title="确认过账？"
                onConfirm={() =>
                  runRowAction(activeConfig, activeSelectedRow, 'post', '过账')
                }
                okText="确认"
                cancelText="取消"
              >
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={
                    !activeSelectedRow ||
                    sourceBoundDraftTransitionBlocked ||
                    saving
                  }
                >
                  过账
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'production' && canCreateProductionRework ? (
            <Button
              size="small"
              disabled={
                !selectedCanStartProductionRework ||
                saving ||
                productionReworkLoading
              }
              loading={productionReworkLoading && !productionReworkContext}
              onClick={() => openProductionRework(activeSelectedRow)}
            >
              发起返工
            </Button>
          ) : null}
          {currentActiveKey === 'finance' &&
          canFinanceAction &&
          activeSelectedRow?.status === 'DRAFT' ? (
            <BusinessActionTooltip
              disabled={financeDraftTransitionBlocked || saving}
              disabledReason={
                financeDraftTransitionBlocked
                  ? '该历史草稿缺少可核对来源，不能确认或作废'
                  : '当前操作完成后可确认'
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
                  icon={<CheckCircleOutlined />}
                  disabled={financeDraftTransitionBlocked || saving}
                >
                  确认
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {selectedIsSingleReconciliationSource &&
          canCreateSingleReconciliation ? (
            <Button
              size="small"
              disabled={saving || financeSourceLoading}
              onClick={() =>
                openFinanceSourceAction(
                  FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION,
                  activeSelectedRow
                )
              }
            >
              单笔核对
            </Button>
          ) : null}
          {currentActiveKey === 'finance' &&
          canFinanceAction &&
          ['DRAFT', 'POSTED'].includes(activeSelectedRow?.status) ? (
            <BusinessActionTooltip
              disabled={financeDraftTransitionBlocked || saving}
              disabledReason={
                financeDraftTransitionBlocked
                  ? '该历史草稿缺少可核对来源，不能确认或作废'
                  : '当前操作完成后可取消'
              }
            >
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                disabled={financeDraftTransitionBlocked || saving}
                onClick={() => {
                  setFinanceCancelReason('')
                  setFinanceCancelOpen(true)
                }}
              >
                {activeSelectedRow?.status === 'DRAFT' ? '作废草稿' : '取消'}
              </Button>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'outsourcing' ? (
            <Button
              size="small"
              icon={<PrinterOutlined />}
              disabled={!activeSelectedRow}
              onClick={openProcessingContractPrint}
            >
              加工合同打印
            </Button>
          ) : null}
          {selectedIsPostedOutsourcingReturn && canViewOutsourcingPayable ? (
            <Button
              size="small"
              disabled={saving || financeSourceLoading}
              onClick={() => viewOutsourcingPayable(activeSelectedRow)}
            >
              查看应付
            </Button>
          ) : null}
          {activeAttachmentOwnerType ? (
            <BusinessAttachmentModalButton
              ownerType={activeAttachmentOwnerType}
              ownerId={activeSelectedRow?.id}
              modalTitle={`${activeConfig.title}附件`}
              panelTitle={`${activeConfig.title}附件`}
              description="上传与当前记录相关的图片、票据、对账或确认资料；附件只作为证据，不改变当前记录状态。"
              canUpload={canWriteActive || canConfirmActive}
              canDelete={canWriteActive || canConfirmActive}
              disabled={!activeSelectedRow}
              disabledReason="请先选择一条记录"
            />
          ) : null}
          {currentActiveKey === 'shipments' &&
          canPostActive &&
          (!activeSelectedRow || activeSelectedRow.status === 'DRAFT') ? (
            <BusinessActionTooltip
              disabled={!activeSelectedRow || saving}
              disabledReason={
                saving ? '当前操作完成后可发货' : '请先选择一张出货草稿'
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
                  icon={<CheckCircleOutlined />}
                  disabled={!activeSelectedRow || saving}
                >
                  发货
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'reservations' &&
          canReleaseActive &&
          (!activeSelectedRow || activeSelectedRow.status === 'ACTIVE') ? (
            <BusinessActionTooltip
              disabled={!activeSelectedRow || saving}
              disabledReason={
                saving ? '当前操作完成后可释放' : '请先选择一条有效库存预留'
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
                  icon={<RollbackOutlined />}
                  disabled={!activeSelectedRow || saving}
                >
                  释放
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {financeSettlementAction &&
          canFinanceAction &&
          activeSelectedRow?.status === 'POSTED' ? (
            <BusinessActionTooltip
              disabled={saving}
              disabledReason="当前操作完成后可继续"
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
                  icon={<CheckCircleOutlined />}
                  disabled={saving}
                >
                  {financeSettlementAction.label}
                </Button>
              </Popconfirm>
            </BusinessActionTooltip>
          ) : null}
          {['production', 'outsourcing'].includes(currentActiveKey) &&
          canCancelActive &&
          (!activeSelectedRow ||
            ['DRAFT', 'POSTED'].includes(activeSelectedRow.status)) ? (
              <BusinessActionTooltip
                disabled={
                !activeSelectedRow ||
                sourceBoundDraftTransitionBlocked ||
                saving
              }
                disabledReason={
                sourceBoundDraftTransitionBlocked
                  ? '该历史草稿缺少可核对来源，不能过账或作废'
                  : saving
                    ? '当前操作完成后可取消'
                    : '请先选择一条业务记录'
              }
              >
                <Popconfirm
                  title={
                  activeSelectedRow?.status === 'DRAFT'
                    ? '确认作废草稿？草稿尚未过账，不会变更库存。'
                    : '确认取消并按系统规则生成撤销调整记录？'
                }
                  onConfirm={() =>
                  runRowAction(
                    activeConfig,
                    activeSelectedRow,
                    'cancel',
                    activeSelectedRow?.status === 'DRAFT' ? '作废草稿' : '取消'
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
                    !activeSelectedRow ||
                    sourceBoundDraftTransitionBlocked ||
                    saving
                  }
                  >
                    {activeSelectedRow?.status === 'DRAFT' ? '作废草稿' : '取消'}
                  </Button>
                </Popconfirm>
              </BusinessActionTooltip>
          ) : null}
          {currentActiveKey === 'shipments' &&
          canCancelActive &&
          (!activeSelectedRow ||
            ['DRAFT', 'SHIPPED'].includes(activeSelectedRow.status)) ? (
              <BusinessActionTooltip
                disabled={!activeSelectedRow || saving}
                disabledReason={
                saving ? '当前操作完成后可取消' : '请先选择一张出货单'
              }
              >
                <Popconfirm
                  title={
                  activeSelectedRow?.status === 'DRAFT'
                    ? '确认作废出货草稿？草稿尚未出库，不会变更库存。'
                    : '确认取消出库并恢复相应库存？'
                }
                  onConfirm={() =>
                  runRowAction(
                    activeConfig,
                    activeSelectedRow,
                    'cancel',
                    activeSelectedRow?.status === 'DRAFT'
                      ? '作废出货草稿'
                      : '取消发货'
                  )
                }
                  okText="确认"
                  cancelText="取消"
                >
                  <Button
                    size="small"
                    danger
                    icon={<CloseCircleOutlined />}
                    disabled={!activeSelectedRow || saving}
                  >
                    {activeSelectedRow?.status === 'DRAFT'
                    ? '作废草稿'
                    : '取消发货'}
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
      <BusinessRecordDetailsModal
        columns={visibleColumns}
        description="当前弹窗只用于查看记录；如需确认、结清、取消、返工或继续办理，请使用列表上方的当前操作区。"
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
      <ProductionReworkModal
        open={Boolean(productionReworkContext)}
        source={productionReworkContext?.source}
        facts={productionReworkContext?.facts}
        initialValues={productionReworkInitialValues}
        loading={productionReworkLoading}
        onCancel={closeProductionRework}
        onSubmit={submitProductionRework}
      />
      <Modal
        title={
          activeSelectedRow?.status === 'DRAFT'
            ? '作废财务草稿'
            : '取消财务记录'
        }
        open={financeCancelOpen}
        okText="确认取消"
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
            ? '草稿尚未确认，作废不会生成过账或库存变更；系统会记录操作人、时间和原因。'
            : '取消后将保留原过账时间，并记录本次操作人、时间和原因。'}
        </p>
        <Input.TextArea
          value={financeCancelReason}
          maxLength={255}
          showCount
          rows={4}
          placeholder="请填写客户、供应商或账款调整的业务原因"
          onChange={(event) => setFinanceCancelReason(event.target.value)}
        />
      </Modal>
    </BusinessPageLayout>
  )
}

export default function OperationalFactsPage() {
  return <OperationalFactWorkspace />
}
