import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import {
  listAllOutsourcingOrders,
  getOutsourcingOrder,
  listOutsourcingOrders,
} from '../../api/masterDataOrderApi.mjs'
import { listAllOutsourcingFacts } from '../../api/operationalFactApi.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import {
  DEFAULT_OUTSOURCING_ORDER_PAGINATION,
  OUTSOURCING_ORDER_STATUS_OPTIONS,
  parseOutsourcingOrderSortValue,
} from './outsourcingOrderPageConfig.mjs'
import { searchParamPositiveInt } from '../../utils/routeQuery.mjs'
import {
  clearLinkedDocumentParams,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
} from '../../utils/relatedDocumentNavigation.mjs'
import { resolveExactRecordPage } from '../../utils/businessPagination.mjs'
import {
  LIFECYCLE_SCOPE,
  filterLifecycleStatusOptions,
  lifecycleScopeFromSearchParams,
  withLifecycleScopeSearchParam,
} from '../../utils/lifecycleScope.mjs'

export function useOutsourcingOrderQuery({ adminProfile }) {
  const [searchParams, setSearchParams] = useSearchParams()

  const [rows, setRows] = useState([])

  const [total, setTotal] = useState(0)

  const [loading, setLoading] = useState(false)

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

  const lifecycleStatusOptions = useMemo(
    () =>
      filterLifecycleStatusOptions(
        OUTSOURCING_ORDER_STATUS_OPTIONS,
        lifecycleScope,
        ['closed', 'canceled']
      ),
    [lifecycleScope]
  )

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

  const beginLatestRequest = useLatestRequestCoordinator()

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

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

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
  return {
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
  }
}
