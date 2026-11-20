import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useBusinessPageContext from './useBusinessPageContext.js'
import { workflowTaskBusinessReceipt } from '../utils/workflowTaskNavigation.mjs'
import { formatAdminIdentity } from '../utils/adminIdentity.mjs'
import { requireSourceActionRecord } from '../utils/sourceBusinessAction.mjs'

export default function useWorkflowTaskBusinessResult() {
  const location = useLocation()
  const navigate = useNavigate()
  const context = useBusinessPageContext()
  const onTaskResult = context?.taskBusiness?.onResult
  const navigation = context?.workflowTaskNavigation || location.state?.workflowTaskNavigation
  const actorLabel = formatAdminIdentity(context?.adminProfile)
  const pending = useRef(null)
  useEffect(() => () => pending.current?.abort(), [location.key, context?.taskFormScope, navigation?.taskID, context?.adminProfile?.id])
  return useCallback(async (message, record = {}, readRecord = null) => {
    if (!onTaskResult && !navigation) return
    pending.current?.abort()
    let confirmed = record
    // 流程提交只返回节点。用单据身份定点读取；读取失败时只保留已确认的提交结果。
    if (readRecord) {
      const controller = new AbortController()
      pending.current = controller
      try {
        confirmed = requireSourceActionRecord(await readRecord({ id: record.id }, { signal: controller.signal }), record.id)
      } catch {
        message += '，单据状态暂未核对'
      }
      if (controller.signal.aborted) return
      pending.current = null
    }
    if (onTaskResult) return onTaskResult(message, confirmed, { actorLabel })
    navigate(location.pathname + location.search + location.hash, {
      replace: true,
      state: {
        ...location.state,
        workflowTaskNavigation: {
          ...navigation,
          businessReceipt: workflowTaskBusinessReceipt(message, confirmed, { actorLabel }),
        },
      },
    })
  }, [location, navigate, navigation, onTaskResult, actorLabel])
}
