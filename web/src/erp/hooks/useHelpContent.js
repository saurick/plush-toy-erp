import { useEffect, useState } from 'react'
import { readHelpContent } from '../api/helpContentApi.mjs'
import { isRpcAbortError } from '../../common/utils/jsonRpc.js'
import { getAdminProfileAccessKey } from '../utils/adminProfileSync.mjs'

const EMPTY = Object.freeze([])
export default function useHelpContent(profile) {
  const scope = getAdminProfileAccessKey(profile)
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({
    scope: null,
    status: 'loading',
    documents: [],
    published: [],
  })
  useEffect(() => {
    const controller = new AbortController()
    setState((previous) =>
      previous.scope === scope
        ? { ...previous, status: 'loading' }
        : { scope, status: 'loading', documents: [], published: [] }
    )
    readHelpContent(controller.signal)
      .then((data) => {
        if (!Array.isArray(data.documents) || !Array.isArray(data.published)) {
          throw new Error('invalid help content')
        }
        if (!controller.signal.aborted) {
          setState({ scope, status: 'ready', ...data })
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isRpcAbortError(error)) {
          setState((previous) => ({ ...previous, scope, status: 'error' }))
        }
      })
    return () => controller.abort()
  }, [scope, retry])
  return {
    ...(state.scope === scope
      ? state
      : { status: 'loading', documents: EMPTY, published: EMPTY }),
    reload: () => setRetry((value) => value + 1),
  }
}
