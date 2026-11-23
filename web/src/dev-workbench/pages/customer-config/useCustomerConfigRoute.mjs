import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  buildCustomerConfigDevOverviewFromSearch,
  DEV_CUSTOMER_CONFIG_QUERY_KEY,
} from '../../config/devCustomerConfig.mjs'
import {
  customerConfigTaskSearch,
  REVIEW_FIELDS,
  REVIEW_TASK,
  resolveCustomerConfigLocation,
} from './navigation.mjs'

export function useCustomerConfigRoute() {
  const [params, setParams] = useSearchParams()
  const search = params.toString()
  const route = useMemo(() => resolveCustomerConfigLocation(search), [search])
  const lastReviewSection = useRef(REVIEW_FIELDS)
  const customerSearch = new URLSearchParams(
    params.getAll(DEV_CUSTOMER_CONFIG_QUERY_KEY).map((value) => [DEV_CUSTOMER_CONFIG_QUERY_KEY, value])
  ).toString()
  const overview = useMemo(
    () => buildCustomerConfigDevOverviewFromSearch(customerSearch),
    [customerSearch]
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
    navigate: (task) => {
      if (route.activeTask === REVIEW_TASK) lastReviewSection.current = route.activeSection
      const next = customerConfigTaskSearch(search, task, lastReviewSection.current)
      if (next !== search) setParams(next)
    },
    selectCustomer: (key) => {
      const next = new URLSearchParams(search)
      next.set('customer', key)
      next.delete('release')
      setParams(next)
    },
    selectSection: (section) => {
      const next = customerConfigTaskSearch(search, REVIEW_TASK, section)
      if (next !== search) setParams(next)
    },
    selectDetail: (detail) => update('detail', detail, { replace: true }),
    selectReleaseBatch: (batch, options) => update('release', batch, options),
  }
}
