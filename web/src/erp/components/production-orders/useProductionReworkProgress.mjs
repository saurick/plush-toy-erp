import { useLayoutEffect, useMemo, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listAllProductionFacts } from '../../api/operationalFactApi.mjs'
import { getProductionWip } from '../../api/productionWipApi.mjs'
import { createLatestRequestCoordinator } from '../../hooks/useLatestRequestCoordinator.js'
import { PRODUCTION_ORDER_STATUS } from '../../utils/productionOrderModel.mjs'
import { isFinishedGoodsReworkRoot } from '../../utils/productionWipModel.mjs'
import { showPageLoadError } from '../PageLoadFeedback.jsx'

export default function useProductionReworkProgress(order, canRead) {
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(false)
  const requests = useMemo(createLatestRequestCoordinator, [])
  const orderID = order?.id
  const eligible =
    order?.status === PRODUCTION_ORDER_STATUS.RELEASED ||
    order?.status === PRODUCTION_ORDER_STATUS.CLOSED

  useLayoutEffect(() => {
    setContext(null)
    setLoading(false)
    return () => requests.abortAll()
  }, [requests, orderID, canRead, eligible])

  function close() {
    requests.abortAll()
    setContext(null)
    setLoading(false)
  }

  async function open() {
    if (!canRead) {
      message.warning('当前账号不能同时查看生产工序和生产记录')
      return
    }
    if (!orderID || !eligible) {
      message.warning('请先选择已发布或已关闭的生产订单')
      return
    }
    const request = requests.begin('production-rework-progress')
    setLoading(true)
    try {
      const options = { signal: request.signal }
      const [aggregate, data] = await Promise.all([
        getProductionWip(orderID, options),
        listAllProductionFacts(
          { source_type: 'PRODUCTION_ORDER', source_id: orderID },
          options
        ),
      ])
      if (!request.isCurrent()) return
      if (!aggregate.batches.some(isFinishedGoodsReworkRoot)) {
        message.info('当前生产订单暂无成品返工进度')
        return
      }
      setContext({
        order: aggregate.productionOrder,
        aggregate,
        facts: data.production_facts,
      })
    } catch (error) {
      if (request.isCurrent() && !isRpcAbortError(error)) {
        showPageLoadError(error, '加载成品返工进度')
      }
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }

  return { context, loading, open, close }
}
