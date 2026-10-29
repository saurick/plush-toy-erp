import { useCallback, useEffect, useRef, useState } from 'react'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  loadReferenceIDs,
  mergeReferenceRecords,
} from '../utils/remoteReferences.mjs'
import { showPageLoadError } from '../components/PageLoadFeedback.jsx'
import useLatestRequestCoordinator from './useLatestRequestCoordinator.js'

export function useReferenceRecords(profile) {
  const scopeKey = JSON.stringify(profile || null)
  const currentScope = useRef(scopeKey)
  currentScope.current = scopeKey
  const [state, setState] = useState({ scopeKey, records: [] })
  const setRecords = useCallback(
    (update) => {
      if (currentScope.current !== scopeKey) return
      setState((current) => {
        const records = current.scopeKey === scopeKey ? current.records : []
        return {
          scopeKey,
          records: typeof update === 'function' ? update(records) : update,
        }
      })
    },
    [scopeKey]
  )
  const merge = useCallback(
    (incoming) => {
      setRecords((current) => mergeReferenceRecords(current, incoming))
    },
    [setRecords]
  )
  return [state.scopeKey === scopeKey ? state.records : [], setRecords, merge]
}

// Callers provide only the IDs displayed by the current page/detail. This cache
// lives with that page and never bypasses the endpoint's current authorization.
export function useReferenceHydration(requests, profile, refreshKey) {
  const beginLatestRequest = useLatestRequestCoordinator()
  const latest = useRef(requests)
  latest.current = requests
  const refreshed = useRef(
    new Map(Object.keys(requests).map((type) => [type, refreshKey]))
  )
  const scopeKey = JSON.stringify(profile || null)
  const key = JSON.stringify(
    Object.entries(requests).map(([type, request]) => [
      type,
      request.enabled !== false,
      [
        ...new Set(
          request.ids
            .map(Number)
            .filter((id) => Number.isSafeInteger(id) && id > 0)
        ),
      ].sort((a, b) => a - b),
    ])
  )
  useEffect(() => {
    const hydration = beginLatestRequest('reference-hydration')
    const pending = []
    for (const [type, enabled, ids] of JSON.parse(key)) {
      if (!enabled) continue
      const request = latest.current[type]
      const known = new Set(request.records.map((row) => row.id))
      const missing =
        refreshed.current.get(type) !== refreshKey
          ? ids
          : ids.filter((id) => !known.has(id))
      if (!missing.length) continue
      pending.push(loadReferenceIDs(type, missing, { signal: hydration.signal })
        .then((data) => {
          if (hydration.isCurrent()) {
            refreshed.current.set(type, refreshKey)
            latest.current[type].onRecords(data[type])
          }
        })
        .catch((error) => {
          if (hydration.isCurrent() && !isRpcAbortError(error)) {
            showPageLoadError(error, '加载关联资料')
          }
        }))
    }
    Promise.all(pending).finally(hydration.finish)
    return () => beginLatestRequest('reference-hydration').finish()
  }, [beginLatestRequest, key, scopeKey, refreshKey])
}
