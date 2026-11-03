import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { RpcErrorCode } from '@/common/consts/errorCodes.js'
import FilterSelect from '@/common/components/select/FilterSelect'
import SourceImportPickerModal from './business-list/SourceImportPickerModal.jsx'
import { ReferenceRecordsContext } from './RemoteReferenceSelect.jsx'
import {
  canReadReference,
  remoteReferences,
} from '../utils/remoteReferences.mjs'
import { showPageLoadError } from './PageLoadFeedback.jsx'
import { listAllReferenceRecords } from '../utils/referencePagination.mjs'
import { REFERENCE_RECORDS_CHANGED } from '../utils/referenceRecordChanges.mjs'

export default function RemoteReferencePicker(props) {
  const { referenceType, params } = props
  const context = useContext(ReferenceRecordsContext)
  // A different account or candidate scope cannot reuse the prior selection.
  const scopeKey = JSON.stringify([
    context?.adminProfile || null,
    referenceType,
    params || {},
  ])
  return <RemoteReferencePickerContent key={scopeKey} {...props} context={context} />
}

function RemoteReferencePickerContent({
  referenceType,
  open,
  params = {},
  filters = [],
  context,
  ...props
}) {
  const canRead = canReadReference(context?.adminProfile, referenceType)
  const accept = useRef(context)
  accept.current = context
  const [query, setQuery] = useState({ page: 1, keyword: '', retry: 0, filters: {} })
  const [data, setData] = useState({ rows: [], total: 0, page: 1, loading: false, failed: false })
  const paramsKey = JSON.stringify(params)
  const loadFilteredRows = useCallback(async ({ signal, expectedTotal }) => {
    const descriptor = remoteReferences[referenceType]
    try {
      const result = await listAllReferenceRecords(descriptor.list, {
        ...(descriptor.active ? { active_only: true } : {}),
        ...JSON.parse(paramsKey),
        ...query.filters,
        keyword: query.keyword,
      }, referenceType, { signal })
      if (signal.aborted) return []
      if (result.total !== expectedTotal) {
        const error = new Error('筛选结果已变化，请重新加载后重选')
        error.isInvalidResponse = true
        throw error
      }
      if (!signal.aborted) accept.current?.[referenceType]?.(result[referenceType])
      return result[referenceType]
    } catch (error) {
      if (!signal.aborted && !isRpcAbortError(error)) showPageLoadError(error, '全选筛选结果')
      throw error
    }
  }, [referenceType, paramsKey, query.filters, query.keyword])
  const handleSearchChange = useCallback((keyword) => {
    setQuery((current) => current.keyword === keyword
      ? current
      : { ...current, page: 1, keyword })
  }, [])
  useEffect(() => {
    if (!open) setQuery({ page: 1, keyword: '', retry: 0, filters: {} })
  }, [open])
  useEffect(() => {
    if (!open || !canRead) return undefined
    const changed = ({ detail }) => {
      if (detail?.referenceType === referenceType && Number.isSafeInteger(detail.id) && detail.id > 0) {
        setQuery((current) => ({ ...current, retry: current.retry + 1 }))
      }
    }
    window.addEventListener(REFERENCE_RECORDS_CHANGED, changed)
    return () => window.removeEventListener(REFERENCE_RECORDS_CHANGED, changed)
  }, [open, canRead, referenceType])
  useEffect(() => {
    if (!open || !canRead) {
      setData({ rows: [], total: 0, page: 1, loading: false, failed: false })
      return undefined
    }
    const abort = new AbortController()
    setData((current) => ({ ...current, loading: true }))
    const descriptor = remoteReferences[referenceType]
    descriptor
      .list(
        {
          ...(descriptor.active ? { active_only: true } : {}),
          ...JSON.parse(paramsKey),
          ...query.filters,
          keyword: query.keyword,
          offset: (query.page - 1) * 50,
          limit: 50,
        },
        { signal: abort.signal }
      )
      .then((result) => {
        if (abort.signal.aborted) return
        accept.current?.[referenceType]?.(result[referenceType])
        setData({
          rows: result[referenceType],
          total: result.total,
          page: query.page,
          loading: false,
          failed: false,
        })
      })
      .catch((error) => {
        if (abort.signal.aborted || isRpcAbortError(error)) return
        setData((current) => ({ ...current, loading: false, failed: true, denied: error?.code === RpcErrorCode.PERMISSION_DENIED }))
        showPageLoadError(error, '加载可选资料')
      })
    return () => abort.abort()
  }, [open, referenceType, paramsKey, query, canRead])
  return (
    <SourceImportPickerModal
      {...props}
      renderFilters={filters.length ? () => filters.map((filter) => (
        <FilterSelect
          key={filter.key}
          label={filter.label}
          aria-label={filter.label}
          placeholder={`按${filter.label}筛选`}
          allowClear
          options={filter.options}
          value={query.filters[filter.key]}
          onChange={(value) => setQuery((current) => ({ ...current,
            page: 1,
            filters: { ...current.filters, [filter.key]: value === '' ? undefined : value } }))}
        />
      )) : undefined}
      hasActiveFilters={Object.values(query.filters).some((value) => value !== undefined)}
      onClearFilters={() => setQuery((current) => ({ ...current, page: 1, keyword: '', filters: {} }))}
      open={open}
      readDenied={!canRead || data.denied === true}
      loadError={data.failed ? '资料加载失败，请重新加载' : undefined}
      filteredEmptyDescription="没有符合条件的可选资料"
      importDisabled={props.importDisabled || !canRead || data.failed}
      importDisabledReason={!canRead
        ? '当前账号无权查看可选资料'
        : data.failed
          ? '资料加载失败，请重新加载'
          : props.importDisabledReason}
      serverPagination
      pageSize={50}
      rows={data.rows}
      total={data.total}
      loading={data.loading}
      current={data.page}
      onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
      onSearchChange={handleSearchChange}
      onSelectAllFiltered={canRead ? loadFilteredRows : undefined}
      onReload={canRead ? () =>
        setQuery((current) => ({ ...current, retry: current.retry + 1 }))
        : undefined}
    />
  )
}
