import { useCallback, useEffect, useState } from 'react'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { PermissionCode } from '@/common/consts/permissions.generated.mjs'
import { getSalesDeliveryProgress } from '../../api/salesDeliveryProgressApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'

export const SALES_DELIVERY_PAGE_SIZE = 20

export function useSalesDeliveryWorkspace(profile, show = true) {
  const enabled = Boolean(show && profile?.id &&
    hasActionPermission(profile, PermissionCode.SALES_ORDER_READ) &&
    hasActionPermission(profile, PermissionCode.SALES_ORDER_ITEM_READ))
  const begin = useLatestRequestCoordinator()
  const [selection, setSelection] = useState(null)
  const [detail, setDetail] = useState(null)
  const frame = enabled && selection?.profile === profile ? selection : null

  const loadProgress = useCallback(async () => {
    if (!frame) return
    const request = begin('delivery-progress')
    setDetail({ frame, loading: true })
    try {
      const data = await getSalesDeliveryProgress(frame.orderID, {
        limit: SALES_DELIVERY_PAGE_SIZE,
        offset: (frame.page - 1) * SALES_DELIVERY_PAGE_SIZE,
      }, { signal: request.signal })
      if (!request.isCurrent()) return
      const lastPage = Math.max(1, Math.ceil(data.total / SALES_DELIVERY_PAGE_SIZE))
      if (frame.page > lastPage) {
        setSelection((current) => current === frame ? { ...current, page: lastPage } : current)
      } else {
        setDetail({ frame, data })
      }
    } catch (error) {
      if (request.isCurrent()) setDetail({ frame, error: getActionErrorMessage(error, '查看交付进度') })
    } finally {
      request.finish()
    }
  }, [begin, frame])

  useEffect(() => {
    loadProgress()
    return () => begin('delivery-progress').finish()
  }, [begin, loadProgress])

  const openProgress = useCallback((orderID) => {
    if (Number.isSafeInteger(orderID) && orderID > 0) {
      setSelection({ profile, orderID, page: 1 })
    }
  }, [profile])
  const close = useCallback(() => setSelection(null), [])
  const setPage = (page) => setSelection({ ...frame, page })

  return {
    enabled,
frame,
detailState: frame && detail?.frame === frame ? detail : null,
    openProgress,
close,
setPage,
loadProgress,
  }
}
