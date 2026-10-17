import { getActionErrorMessage } from '@/common/utils/errorMessage'

const GENERIC_OPERATION_FAILURE = '操作未完成；请刷新版本中心查看已记录状态'

export function deliveryReadErrorMessage(error, action) {
  const contextError =
    error?.message === GENERIC_OPERATION_FAILURE ? null : error
  return getActionErrorMessage(contextError, action, {
    suffix: '请重试，持续失败时查看工作台服务日志',
  })
}
