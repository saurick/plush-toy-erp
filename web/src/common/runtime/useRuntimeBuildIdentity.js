import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { JsonRpc, isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  buildIdentitySupportText,
  compareBuildIdentities,
  parseServerBuildIdentity,
  readEmbeddedBuildIdentity,
} from './buildIdentity.mjs'

export default function useRuntimeBuildIdentity() {
  const web = useMemo(() => readEmbeddedBuildIdentity(), [])
  const rpc = useMemo(
    () =>
      new JsonRpc({
        url: 'system',
        basePath: '/rpc',
        withAuth: false,
      }),
    []
  )
  const requestRef = useRef({ controller: null, sequence: 0 })
  const [state, setState] = useState({
    loading: true,
    server: null,
    unavailable: false,
  })

  const retry = useCallback(async () => {
    requestRef.current.controller?.abort()
    const controller = new AbortController()
    const sequence = requestRef.current.sequence + 1
    requestRef.current = { controller, sequence }
    setState((current) => ({
      ...current,
      loading: true,
      unavailable: false,
    }))
    try {
      const result = await rpc.call(
        'version',
        {},
        { signal: controller.signal }
      )
      if (requestRef.current.sequence !== sequence) return
      setState({
        loading: false,
        server: parseServerBuildIdentity(result),
        unavailable: false,
      })
    } catch (error) {
      if (isRpcAbortError(error) || requestRef.current.sequence !== sequence) {
        return
      }
      setState({ loading: false, server: null, unavailable: true })
    }
  }, [rpc])

  useEffect(() => {
    retry()
    return () => requestRef.current.controller?.abort()
  }, [retry])

  const status = useMemo(
    () =>
      compareBuildIdentities({
        web,
        server: state.server,
        loading: state.loading,
        unavailable: state.unavailable,
      }),
    [state.loading, state.server, state.unavailable, web]
  )
  const supportText = useMemo(
    () => buildIdentitySupportText({ web, server: state.server, status }),
    [state.server, status, web]
  )

  return {
    ...state,
    web,
    status,
    supportText,
    retry,
  }
}
