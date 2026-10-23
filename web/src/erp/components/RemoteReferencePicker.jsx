import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import SourceImportPickerModal from './business-list/SourceImportPickerModal.jsx'
import { ReferenceRecordsContext } from './RemoteReferenceSelect.jsx'
import {
  canReadReference,
  remoteReferences,
} from '../utils/remoteReferences.mjs'
import { showPageLoadError } from './PageLoadFeedback.jsx'

export default function RemoteReferencePicker({
  referenceType,
  open,
  params = {},
  ...props
}) {
  const context = useContext(ReferenceRecordsContext)
  const scopeKey = JSON.stringify(context?.adminProfile || null)
  const canRead = canReadReference(context?.adminProfile, referenceType)
  const accept = useRef(context)
  accept.current = context
  const [query, setQuery] = useState({ page: 1, keyword: '', retry: 0 })
  const [data, setData] = useState({ rows: [], total: 0, loading: false })
  const paramsKey = JSON.stringify(params)
  const handleSearchChange = useCallback((keyword) => {
    setQuery((current) => current.keyword === keyword
      ? current
      : { ...current, page: 1, keyword })
  }, [])
  useEffect(() => {
    if (!open) setQuery({ page: 1, keyword: '', retry: 0 })
  }, [open])
  useEffect(() => {
    if (!open || !canRead) {
      setData({ rows: [], total: 0, loading: false })
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
          loading: false,
        })
      })
      .catch((error) => {
        if (abort.signal.aborted || isRpcAbortError(error)) return
        setData({ rows: [], total: 0, loading: false })
        showPageLoadError(error, '加载可选资料')
      })
    return () => abort.abort()
  }, [open, referenceType, paramsKey, query, scopeKey, canRead])
  return (
    <SourceImportPickerModal
      key={scopeKey}
      {...props}
      open={open}
      importDisabled={props.importDisabled || !canRead}
      serverPagination
      pageSize={50}
      rows={data.rows}
      total={data.total}
      loading={data.loading}
      current={query.page}
      onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
      onSearchChange={handleSearchChange}
      onReload={() =>
        setQuery((current) => ({ ...current, retry: current.retry + 1 }))
      }
    />
  )
}
