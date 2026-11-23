import { useSyncExternalStore } from 'react'

const COMPACT_TABLE_QUERY = '(max-width: 640px)'

function subscribe(onChange) {
  const viewport = window.matchMedia(COMPACT_TABLE_QUERY)
  viewport.addEventListener('change', onChange)
  return () => viewport.removeEventListener('change', onChange)
}

function isCompact() {
  return window.matchMedia(COMPACT_TABLE_QUERY).matches
}

export function useCustomerConfigCompactTable() {
  return useSyncExternalStore(subscribe, isCompact)
}
