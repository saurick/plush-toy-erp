// 统一维护前端消费侧错误码分组与默认文案；原始码表由生成文件提供。
import { RpcErrorCode } from './errorCodes.generated.js'

export { RpcErrorCode }

export const AUTH_FAILURE_ERROR_CODES = Object.freeze([
  RpcErrorCode.AUTH_EXPIRED,
  RpcErrorCode.AUTH_INVALID,
  RpcErrorCode.AUTH_REQUIRED,
])

export const ADMIN_SESSION_UNAVAILABLE_ERROR_CODES = Object.freeze([
  RpcErrorCode.HTTP_UNAUTHORIZED,
  RpcErrorCode.ADMIN_REQUIRED,
  RpcErrorCode.ADMIN_DISABLED,
  RpcErrorCode.ADMIN_NOT_FOUND,
  RpcErrorCode.AUTH_CURRENT_USER_FAILED,
])

// 仅登录态失效错误会触发登出，权限不足必须保留当前会话。
export function isAuthFailureCode(code) {
  return AUTH_FAILURE_ERROR_CODES.includes(Number(code))
}

export function isAdminSessionUnavailableCode(code) {
  return ADMIN_SESSION_UNAVAILABLE_ERROR_CODES.includes(Number(code))
}

export const DEFAULT_RPC_ERROR_MESSAGES = Object.freeze({
  [RpcErrorCode.ADMIN_REQUIRED]: '只有管理员才能操作',
  [RpcErrorCode.AUTH_REQUIRED]: '请先登录',
  [RpcErrorCode.ADMIN_DISABLED]: '账号已停用',
  [RpcErrorCode.PERMISSION_DENIED]: '权限不足',
  [RpcErrorCode.ADMIN_NOT_FOUND]: '账号不存在',
  [RpcErrorCode.AUTH_USER_NOT_FOUND]: '用户不存在',
  [RpcErrorCode.AUTH_INVALID_PASSWORD]: '密码错误',
  [RpcErrorCode.AUTH_USER_DISABLED]: '账号已停用',
  [RpcErrorCode.AUTH_USER_EXISTS]: '用户名已存在',
  [RpcErrorCode.AUTH_EXPIRED]: '登录已过期，请重新登录',
  [RpcErrorCode.AUTH_INVALID]: '登录无效，请重新登录',
  [RpcErrorCode.AUTH_INVALID_PHONE]: '手机号格式不正确',
  [RpcErrorCode.AUTH_INVALID_SMS_CODE]: '验证码错误',
  [RpcErrorCode.AUTH_SMS_CODE_EXPIRED]: '验证码已过期，请重新获取',
  [RpcErrorCode.AUTH_SMS_CODE_TOO_FREQUENT]: '验证码发送过于频繁，请稍后再试',
  [RpcErrorCode.AUTH_SMS_CODE_ATTEMPTS_EXCEEDED]:
    '验证码错误次数过多，请重新获取',
  [RpcErrorCode.AUTH_PHONE_NOT_BOUND]: '该手机号未开通登录权限，请联系管理员',
  [RpcErrorCode.AUTH_MOBILE_ROLE_DENIED]:
    '该账号暂无当前岗位任务端登录权限，请联系管理员',
  [RpcErrorCode.AUTH_SMS_LOGIN_DISABLED]: '短信登录暂未开通，请使用密码登录',
  [RpcErrorCode.AUTH_SMS_SERVICE_UNAVAILABLE]:
    '短信服务暂不可用，请稍后再试或联系管理员',
  [RpcErrorCode.AUTH_SMS_SERVICE_QUOTA_EXCEEDED]:
    '短信服务额度已用完，请联系管理员处理',
  [RpcErrorCode.ADMIN_EXISTS]: '账号已存在',
  [RpcErrorCode.ADMIN_PHONE_EXISTS]: '手机号已绑定其他账号',
  [RpcErrorCode.IDEMPOTENCY_CONFLICT]:
    '重复请求内容与首次提交不一致，请刷新后重试',
  [RpcErrorCode.PROCESS_DOMAIN_COMMAND_RECOVERY_REQUIRED]:
    '此前业务处理结果需要人工核对，当前流程暂时无法继续，请联系管理员',
  [RpcErrorCode.RESOURCE_VERSION_CONFLICT]:
    '记录已被其他操作更新，请刷新后重试',
})
