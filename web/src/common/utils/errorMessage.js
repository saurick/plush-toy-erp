// web/src/common/utils/errorMessage.js
import { logout } from '../auth/auth.js'
import {
  DEFAULT_RPC_ERROR_MESSAGES,
  RpcErrorCode,
  isAuthFailureCode,
} from '../consts/errorCodes.js'

const RAW_ERROR_MESSAGE_MAP = Object.freeze({
  'business error': '请求失败，请稍后重试',
  expired: DEFAULT_RPC_ERROR_MESSAGES[RpcErrorCode.AUTH_EXPIRED],
  forbidden: DEFAULT_RPC_ERROR_MESSAGES[RpcErrorCode.PERMISSION_DENIED],
  'invalid json response from server': '系统暂时不可用，请稍后重试',
  'json-rpc error': '请求失败，请稍后重试',
  'network error': '网络错误，请稍后重试',
  'request failed': '请求失败，请稍后重试',
  'request failed, network error': '网络错误，请稍后重试',
  'rpc error': '请求失败，请稍后重试',
  'server error': '系统暂时不可用，请稍后重试',
  'session expired': DEFAULT_RPC_ERROR_MESSAGES[RpcErrorCode.AUTH_REQUIRED],
  'token expired': DEFAULT_RPC_ERROR_MESSAGES[RpcErrorCode.AUTH_EXPIRED],
  unauthorized: DEFAULT_RPC_ERROR_MESSAGES[RpcErrorCode.AUTH_REQUIRED],
  'unknown error': '未知错误，请稍后重试',
})

const RAW_ERROR_PATTERNS = Object.freeze([
  [
    /^http error 401$/iu,
    DEFAULT_RPC_ERROR_MESSAGES[RpcErrorCode.AUTH_REQUIRED],
  ],
  [
    /^http error 403$/iu,
    DEFAULT_RPC_ERROR_MESSAGES[RpcErrorCode.PERMISSION_DENIED],
  ],
  [/^http error \d+$/iu, '系统暂时不可用，请稍后重试'],
])

const TECHNICAL_ERROR_MESSAGE_PATTERN =
  /(?:\b(?:api|decimal|exception|fact|hold|http|json|migration|out|panic|payload|rbac|revision|rpc|runtime|schema|shipped|sql|stack|usecase|workflow)\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b[a-z][a-z0-9]*(?:Id|Key|Payload|Revision|Status|Type|Version)\b|业务源单|事实记录|对象族|数据口径|业务口径|权限码|运行态|运行时|投影|上下文|泳道|前端|后端|服务端|客户端|服务器|数据库|数据表|请求体|响应体|请求参数|响应无效|安全请求标识|请求信息不完整|批次参数|不允许的字段|接口)/iu

const TECHNICAL_ERROR_LOCATION_PATTERNS = Object.freeze([
  /(?:^|[\s"'(:：[（【])(?:file|webpack|vite):\/\/[^\s，。；）)\]}]+/iu,
  /(?:^|[\s"'(:：[（【])[a-z]:[\\/][^\s，。；）)\]}]+/iu,
  /(?:^|[\s"'(:：[（【])\/(?:Users|home|root|private|var|tmp|opt|app|workspace|srv|usr|go|build|runner|mnt|Volumes|code|src|server|web|internal|node_modules|scripts|data)(?:[\\/][^\s，。；）)\]}]*)?/iu,
  /(?:^|[\s"'(:：[（【])(?:web[\\/]src|server[\\/](?:internal|cmd|pkg)|internal[\\/](?:biz|data|service|pkg)|src[\\/](?:components|pages|utils|services)|node_modules[\\/]|scripts[\\/])[^\s，。；）)\]}]*/iu,
  /\b(?:node:internal[\\/][^\s，。；）)\]}]+|[a-z0-9_.-]+\.(?:go|js|jsx|mjs|cjs|ts|tsx|java|py|rb|php|rs|cs|c|cc|cpp|h|hpp):\d+(?::\d+)?)\b/iu,
  /(?:^|[\s:：])(?:goroutine\s+\d+\s+\[[^\]]+\]:|at\s+(?:async\s+)?(?:new\s+)?[-\w$.<>[\]]+(?:\s+\(|\s*$))/iu,
])

function containsCjk(text) {
  return /[\u3400-\u9fff]/u.test(String(text || ''))
}

function containsTechnicalErrorText(text) {
  const value = String(text || '')
  return (
    TECHNICAL_ERROR_MESSAGE_PATTERN.test(value) ||
    TECHNICAL_ERROR_LOCATION_PATTERNS.some((pattern) => pattern.test(value))
  )
}

function normalizeErrorText(message) {
  const text = String(message || '').trim()
  if (!text) return ''
  return text.replace(/^(rpcerror|error):\s*/iu, '')
}

function translateKnownErrorMessage(message) {
  const normalized = normalizeErrorText(message)
  if (!normalized) return ''

  const mapped = RAW_ERROR_MESSAGE_MAP[normalized.toLowerCase()]
  if (mapped) return mapped

  for (const [pattern, translated] of RAW_ERROR_PATTERNS) {
    if (pattern.test(normalized)) return translated
  }

  if (containsTechnicalErrorText(normalized)) return ''
  if (containsCjk(normalized)) return normalized
  return ''
}

function resolveActionErrorFallback(
  action,
  { fallback, suffix = '请稍后重试', defaultAction = '请求' } = {}
) {
  if (fallback) return fallback

  const normalizedAction = String(action || '').trim()
  const normalizedSuffix = String(suffix || '').trim() || '请稍后重试'
  if (!normalizedAction) {
    return `${defaultAction}失败，${normalizedSuffix}`
  }

  // 允许调用点只传“登录/保存/加载”这类动作词，统一在这里补完整兜底。
  if (
    /[，,]/u.test(normalizedAction) ||
    /(失败|异常)$/u.test(normalizedAction)
  ) {
    return normalizedAction
  }

  return `${normalizedAction}失败，${normalizedSuffix}`
}

// 用户可见错误统一走这里，避免把 transport 层英文兜底原文直接显示到页面。
export function getUserFacingErrorMessage(
  err,
  fallback = '请求失败，请稍后重试'
) {
  const code = Number(err?.code)
  const mappedCodeMessage = DEFAULT_RPC_ERROR_MESSAGES[code]
  if (mappedCodeMessage && !containsTechnicalErrorText(mappedCodeMessage)) {
    return mappedCodeMessage
  }
  if (err?.isNetworkError) {
    return '网络错误，请稍后重试'
  }

  const translated = translateKnownErrorMessage(
    typeof err === 'string' ? err : (err?.message ?? err)
  )
  if (translated) return translated

  return fallback
}

export function getActionErrorMessage(err, action, options = {}) {
  return getUserFacingErrorMessage(
    err,
    resolveActionErrorFallback(action, options)
  )
}

export function handleRpcError(err, { onNeedLogin } = {}) {
  const code = err?.code
  const msg = getUserFacingErrorMessage(err)

  // 仅登录态失效才触发登出，权限不足要保留当前会话。
  if (isAuthFailureCode(code)) {
    logout()
    onNeedLogin?.()
  }

  return msg
}

export const ERROR_MESSAGES = DEFAULT_RPC_ERROR_MESSAGES
