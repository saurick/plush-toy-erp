import { useCallback, useEffect, useState } from 'react'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

export default function useBusinessVisualizationData({
  enabled,
  load,
  actionLabel,
}) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({
    loading: false,
    rows: [],
    error: '',
  })

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    setState((current) => ({ ...current, loading: true, error: '' }))
    Promise.resolve(load({ signal: controller.signal }))
      .then((rows) => {
        if (controller.signal.aborted) return
        setState({
          loading: false,
          rows: Array.isArray(rows) ? rows : [],
          error: '',
        })
      })
      .catch((error) => {
        if (controller.signal.aborted || isRpcAbortError(error)) return
        setState((current) => ({
          ...current,
          loading: false,
          error: getActionErrorMessage(error, actionLabel),
        }))
      })
    return () => controller.abort()
  }, [actionLabel, enabled, load, revision])

  const reload = useCallback(() => setRevision((value) => value + 1), [])
  return { ...state, reload }
}
