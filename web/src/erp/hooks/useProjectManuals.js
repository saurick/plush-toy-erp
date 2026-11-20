import { useEffect, useState } from 'react'
import { readProjectManuals } from '../api/projectManualApi.mjs'
import { isRpcAbortError } from '../../common/utils/jsonRpc.js'
import { getAdminProfileAccessKey } from '../utils/adminProfileSync.mjs'

const EMPTY_MANUALS = Object.freeze([])

export default function useProjectManuals(adminProfile) {
  const scope = getAdminProfileAccessKey(adminProfile)
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({
    scope: null,
    status: 'loading',
    manuals: [],
  })
  useEffect(() => {
    const controller = new AbortController()
    setState({ scope, status: 'loading', manuals: [] })
    readProjectManuals({ signal: controller.signal })
      .then((manuals) => {
        if (!controller.signal.aborted) {
          setState({ scope, status: 'ready', manuals })
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isRpcAbortError(error)) {
          setState({ scope, status: 'error', manuals: [] })
        }
      })
    return () => controller.abort()
  }, [scope, retry])
  return {
    ...(state.scope === scope
      ? state
      : { status: 'loading', manuals: EMPTY_MANUALS }),
    reload: () => setRetry((value) => value + 1),
  }
}
