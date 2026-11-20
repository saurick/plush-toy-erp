import { useCallback, useEffect, useMemo } from 'react'

import {
  buildDevCustomerScopeSearch,
  resolveDevCustomerScope,
} from '../config/devCustomerScope.mjs'

export default function useDevCustomerScope({
  searchParams,
  setSearchParams,
  normalize = true,
}) {
  const searchParamsKey = searchParams.toString()
  const scope = useMemo(
    () => resolveDevCustomerScope(searchParamsKey),
    [searchParamsKey]
  )

  useEffect(() => {
    if (!normalize || !scope.defaulted || scope.status !== 'ready') return
    setSearchParams(
      (current) => buildDevCustomerScopeSearch(current, scope.customerKey),
      { replace: true }
    )
  }, [
    normalize,
    scope.customerKey,
    scope.defaulted,
    scope.status,
    searchParamsKey,
    setSearchParams,
  ])

  const selectCustomer = useCallback(
    (customerKey) => {
      setSearchParams((current) =>
        buildDevCustomerScopeSearch(current, customerKey)
      )
    },
    [setSearchParams]
  )

  return Object.freeze({ ...scope, selectCustomer })
}
