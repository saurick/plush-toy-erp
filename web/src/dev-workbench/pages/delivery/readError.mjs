import { getActionErrorMessage } from '@/common/utils/errorMessage'

const GENERIC_OPERATION_FAILURE = '操作未完成；请刷新版本中心查看已记录状态'

export function deliveryReadErrorMessage(error, action) {
  const contextError =
    error?.message === GENERIC_OPERATION_FAILURE ? null : error
  return getActionErrorMessage(contextError, action, {
    suffix: '请重试，持续失败时查看工作台服务日志',
  })
}

export function deliveryActionErrorMessage(error) {
  return getActionErrorMessage(error, '提交操作', {
    suffix: '请先刷新操作记录核对结果，系统没有自动重试',
  })
}
