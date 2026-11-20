import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { buildCustomerConfigDevOverviewFromSearch } from '../../config/devCustomerConfig.mjs'
import {
  customerConfigStepSearch,
  resolveCustomerConfigLocation,
} from './navigation.mjs'

export function useCustomerConfigRoute() {
  const [params, setParams] = useSearchParams()
  const search = params.toString()
  const route = useMemo(() => resolveCustomerConfigLocation(search), [search])
  const overview = useMemo(
    () => buildCustomerConfigDevOverviewFromSearch(params),
    [params]
  )
  useEffect(() => {
    if (route.canonicalSearch !== search) {
      setParams(route.canonicalSearch, { replace: true })
    }
  }, [route.canonicalSearch, search, setParams])

  const update = (key, value, options) => {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    const normalized = resolveCustomerConfigLocation(next).canonicalSearch
    if (normalized !== search) setParams(normalized, options)
  }
  return {
    ...route,
    overview,
    navigate: (step) => {
      const next = customerConfigStepSearch(search, step)
      if (next !== search) setParams(next)
    },
    selectCustomer: (key) => {
      const next = new URLSearchParams(search)
      next.set('customer', key)
      next.delete('release')
      setParams(next)
    },
    selectSection: (section) => update('section', section),
    selectAction: (action) => update('action', action),
    selectReleaseBatch: (batch, options) => update('release', batch, options),
  }
}
