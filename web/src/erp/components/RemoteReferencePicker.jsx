import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import SourceImportPickerModal from './business-list/SourceImportPickerModal.jsx'
import { ReferenceRecordsContext } from './RemoteReferenceSelect.jsx'
import {
  canReadReference,
  remoteReferences,
} from '../utils/remoteReferences.mjs'
import { showPageLoadError } from './PageLoadFeedback.jsx'

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
  context,
  ...props
}) {
  const canRead = canReadReference(context?.adminProfile, referenceType)
  const accept = useRef(context)
  accept.current = context
  const [query, setQuery] = useState({ page: 1, keyword: '', retry: 0 })
  const [data, setData] = useState({ rows: [], total: 0, page: 1, loading: false, failed: false })
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
        setData((current) => ({ ...current, loading: false, failed: true }))
        showPageLoadError(error, '加载可选资料')
      })
    return () => abort.abort()
  }, [open, referenceType, paramsKey, query, canRead])
  return (
    <SourceImportPickerModal
      {...props}
      open={open}
      importDisabled={props.importDisabled || !canRead || data.failed}
      serverPagination
      pageSize={50}
      rows={data.rows}
      total={data.total}
      loading={data.loading}
      current={data.page}
      onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
      onSearchChange={handleSearchChange}
      onReload={() =>
        setQuery((current) => ({ ...current, retry: current.retry + 1 }))
      }
    />
  )
}
