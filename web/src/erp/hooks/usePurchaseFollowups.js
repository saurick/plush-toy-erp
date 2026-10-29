import { useEffect, useState, useCallback } from 'react'
import { listPurchaseFollowups } from '../api/masterDataOrderApi.mjs'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

export default function usePurchaseFollowups({ enabled, params }) {
  const [revision, setRevision] = useState(0)
  const requestKey = JSON.stringify(params)
  const [state, setState] = useState({
    key: '',
    board: null,
    loading: false,
    error: '',
  })
  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    setState({ key: requestKey, board: null, loading: true, error: '' })
    listPurchaseFollowups(JSON.parse(requestKey), { signal: controller.signal })
      .then((board) => {
        if (!controller.signal.aborted) {
          setState({ key: requestKey, board, loading: false, error: '' })
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isRpcAbortError(error)) {
          setState({
            key: requestKey,
            board: null,
            loading: false,
            error: getActionErrorMessage(error, '加载采购跟进'),
          })
        }
      })
    return () => controller.abort()
  }, [enabled, requestKey, revision])
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  return {
    ...state,
    board: state.key === requestKey ? state.board : null,
    error: state.key === requestKey ? state.error : '',
    loading: enabled && (state.key !== requestKey || state.loading),
    reload,
  }
}
