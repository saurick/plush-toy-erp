import { useCallback, useEffect, useRef, useState } from 'react'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  listAllOutsourcingOrderItems,
  listAllOutsourcingOrders,
} from '../../api/masterDataOrderApi.mjs'

export async function loadConfirmedOutsourcingSources(options = {}) {
  const data = await listAllOutsourcingOrders(
    { lifecycle_status: 'confirmed' },
    options
  )
  const orders = Array.isArray(data?.outsourcing_orders)
    ? data.outsourcing_orders
    : []
  const groups = new Array(orders.length)
  let cursor = 0
  const runners = Array.from(
    { length: Math.min(4, orders.length) },
    async () => {
      for (;;) {
        const index = cursor
        cursor += 1
        if (index >= orders.length) return
        const order = orders[index]
        const itemData = await listAllOutsourcingOrderItems(
          {
            outsourcing_order_id: order.id,
            expected_version: order.version,
            line_status: 'open',
          },
          options
        )
        groups[index] = (itemData?.outsourcing_order_items || []).map(
          (item) => ({ order, item })
        )
      }
    }
  )
  await Promise.all(runners)
  return groups.flat()
}

export default function useProductionOutsourcingSources(canRead) {
  const [sources, setSources] = useState([])
  const [loadState, setLoadState] = useState('idle')
  const [loadError, setLoadError] = useState('')
  const abortControllerRef = useRef(null)
  const loadStateRef = useRef('idle')

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  const reset = useCallback(() => {
    abort()
    loadStateRef.current = 'idle'
    setSources([])
    setLoadState('idle')
    setLoadError('')
  }, [abort])

  const load = useCallback(
    async ({ force = false } = {}) => {
      if (!canRead) return
      if (!force && ['loading', 'loaded'].includes(loadStateRef.current)) {
        return
      }
      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      loadStateRef.current = 'loading'
      setLoadState('loading')
      setLoadError('')
      try {
        const nextSources = await loadConfirmedOutsourcingSources({
          signal: controller.signal,
        })
        if (abortControllerRef.current !== controller) return
        setSources(nextSources)
        loadStateRef.current = 'loaded'
        setLoadState('loaded')
      } catch (error) {
        if (
          isRpcAbortError(error) ||
          abortControllerRef.current !== controller
        ) {
          return
        }
        loadStateRef.current = 'error'
        setLoadState('error')
        setLoadError(getActionErrorMessage(error, '读取加工合同候选'))
      }
    },
    [canRead]
  )

  useEffect(() => {
    if (!canRead) reset()
  }, [canRead, reset])

  useEffect(() => abort, [abort])

  return {
    abortOutsourcingSources: abort,
    loadOutsourcingSources: load,
    outsourcingLoadError: loadError,
    outsourcingLoadState: loadState,
    outsourcingSources: sources,
    resetOutsourcingSources: reset,
  }
}
