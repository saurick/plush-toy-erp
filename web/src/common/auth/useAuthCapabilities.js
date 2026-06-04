import { useEffect, useState } from 'react'

import {
  DEFAULT_AUTH_CAPABILITIES,
  fetchAuthCapabilities,
} from './authCapabilities.mjs'

export function useAuthCapabilities(authRpc) {
  const [capabilities, setCapabilities] = useState(DEFAULT_AUTH_CAPABILITIES)

  useEffect(() => {
    if (!authRpc) return undefined

    const controller = new AbortController()
    fetchAuthCapabilities(authRpc, { signal: controller.signal })
      .then(setCapabilities)
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setCapabilities(DEFAULT_AUTH_CAPABILITIES)
      })

    return () => controller.abort()
  }, [authRpc])

  return capabilities
}
