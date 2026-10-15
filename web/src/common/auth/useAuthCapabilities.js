import { useEffect, useState } from 'react'

import {
  DEFAULT_AUTH_CAPABILITIES,
  fetchAuthCapabilities,
} from './authCapabilities.mjs'

const DEFAULT_AUTH_CAPABILITIES_STATE = Object.freeze({
  ...DEFAULT_AUTH_CAPABILITIES,
  authCapabilitiesLoaded: false,
})

export function isAuthCapabilitiesAbortError(error) {
  return error?.name === 'AbortError' || error?.cause?.name === 'AbortError'
}

export function useAuthCapabilities(authRpc) {
  const [capabilities, setCapabilities] = useState(
    DEFAULT_AUTH_CAPABILITIES_STATE
  )

  useEffect(() => {
    if (!authRpc) return undefined

    const controller = new AbortController()
    setCapabilities(DEFAULT_AUTH_CAPABILITIES_STATE)
    fetchAuthCapabilities(authRpc, { signal: controller.signal })
      .then((nextCapabilities) => {
        setCapabilities({
          ...nextCapabilities,
          authCapabilitiesLoaded: true,
        })
      })
      .catch((error) => {
        if (isAuthCapabilitiesAbortError(error)) return
        setCapabilities({
          ...DEFAULT_AUTH_CAPABILITIES,
          authCapabilitiesLoaded: true,
        })
      })

    return () => controller.abort()
  }, [authRpc])

  return capabilities
}
