import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  compactParams,
  trimOptional,
} from '../../utils/sourceDocumentValues.mjs'
import { getBusinessPaginationParams } from '../../utils/businessPagination.mjs'
import {
  searchParamPositiveInt,
  searchParamText,
} from '../../utils/routeQuery.mjs'
import {
  clearLinkedDocumentParams,
  linkedDocumentContext,
  linkedDocumentRequestKeyword,
} from '../../utils/relatedDocumentNavigation.mjs'
import { listAllProductionFacts } from '../../api/operationalFactApi.mjs'
import { hasAnyPermission } from './OperationalFactForms.jsx'
import { resolveOperationalFactRouteRecord } from '../../utils/operationalFactRelatedNavigation.mjs'
import {
  DEFAULT_OPERATIONAL_FACT_PAGINATION,
  buildOperationalFactViewConfigs,
} from './operationalFactPageConfig.mjs'

export function useOperationalFactQuery({
  initialActiveKey,
  enabledViews,
  viewOverrides,
  adminProfile,
  outletContext,
}) {
  const [searchParams, setSearchParams] = useSearchParams()

  const [activeKey, setActiveKey] = useState(initialActiveKey)

  const [keyword, setKeyword] = useState('')

  const [statusFilter, setStatusFilter] = useState('')

  const [dateFieldByKey, setDateFieldByKey] = useState({})

  const [dateRangeByKey, setDateRangeByKey] = useState({})

  const [loading, setLoading] = useState(false)

  const [rowsByKey, setRowsByKey] = useState({})

  const [totalByKey, setTotalByKey] = useState({})

  const [paginationByKey, setPaginationByKey] = useState({})

  const [selectedByKey, setSelectedByKey] = useState({})

  const [detailRecord, setDetailRecord] = useState(null)

  const listRequestVersionRef = useRef(0)

  const mountedRef = useRef(false)

  const routeSalesOrderID = searchParamPositiveInt(
    searchParams,
    'sales_order_id'
  )

  const routeSourceID = searchParamPositiveInt(searchParams, 'source_id')

  const routeSourceType = searchParamText(searchParams, 'source_type')

  const routeFactID = searchParamPositiveInt(searchParams, 'fact_id')

  const linkedContext = linkedDocumentContext(searchParams)

  const linkedKeyword = linkedContext.keyword

  const baseConfigs = useMemo(() => buildOperationalFactViewConfigs(), [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      listRequestVersionRef.current += 1
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

  const fallbackActiveKey =
    enabledViewKeys.find((key) => configs[key]) || 'production'

  const currentActiveKey = configs[activeKey] ? activeKey : fallbackActiveKey

  const activeConfig = configs[currentActiveKey] || configs[fallbackActiveKey]

  const activeTotal = totalByKey[currentActiveKey] || 0

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

  const activePagination =
    paginationByKey[currentActiveKey] || DEFAULT_OPERATIONAL_FACT_PAGINATION

  const activeDateField =
    dateFieldByKey[currentActiveKey] ||
    activeConfig.defaultDateField ||
    'occurred_at'

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
  const routeView = searchParamText(searchParams, 'view')
  useEffect(() => {
    if (routeView && configs[routeView] && routeView !== activeKey) {
      setActiveKey(routeView)
    }
  }, [activeKey, configs, routeView])
  return {
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
  }
}
