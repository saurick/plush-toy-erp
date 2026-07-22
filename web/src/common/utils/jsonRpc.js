// web/src/common/utils/jsonRpc.js
import { RpcError } from '@/common/utils/rpcError'
import { getToken, logout, getLoginPath } from '@/common/auth/auth'
import { authBus } from '@/common/auth/authBus'
import { isAuthFailureCode } from '@/common/consts/errorCodes'
import { getUserFacingErrorMessage } from '@/common/utils/errorMessage'

let globalRpcId = 0

function isAbortLikeError(error) {
  return error?.name === 'AbortError' || error?.cause?.name === 'AbortError'
}

function invalidSuccessResponse(httpStatus) {
  return new RpcError('Invalid JSON-RPC success response from server', {
    httpStatus,
    isInvalidResponse: true,
  })
}

function validateSuccessResponse(json, expectedId, httpStatus) {
  if (
    !json ||
    typeof json !== 'object' ||
    Array.isArray(json) ||
    json.jsonrpc !== '2.0' ||
    String(json.id) !== expectedId ||
    !Object.hasOwn(json, 'result') ||
    !json.result ||
    typeof json.result !== 'object' ||
    Array.isArray(json.result)
  ) {
    throw invalidSuccessResponse(httpStatus)
  }
  return json.result
}

export function isRpcAbortError(error) {
  return Boolean(error?.isAbortError || isAbortLikeError(error))
}

export class JsonRpc {
  constructor({
    url,
    basePath = '/rpc',
    authScope = 'admin',
    withAuth = true,
  }) {
    if (!url) {
      throw new Error('JsonRpc: url is required, e.g. "system" or "auth"')
    }
    this.url = url
    this.basePath = basePath
    this.authScope = authScope
    this.withAuth = withAuth
  }

  async call(method, params = {}, options = {}) {
    const { receiveError = false, signal, withAuth = this.withAuth } = options
    const id = String(++globalRpcId)

    let response
    let json

    // 自动附带 token。
    const token = withAuth ? getToken(this.authScope) : ''
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    try {
      response = await fetch(`${this.basePath}/${this.url}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }),
        signal,
      })
    } catch (e) {
      const isAbortError = isAbortLikeError(e)
      throw new RpcError(isAbortError ? 'Request aborted' : 'Network error', {
        isNetworkError: !isAbortError,
        isAbortError,
        cause: e,
      })
    }

    try {
      json = await response.json()
    } catch (e) {
      throw new RpcError('Invalid JSON response from server', {
        httpStatus: response.status,
        isInvalidResponse: true,
        cause: e,
      })
    }

    // 1) HTTP 非 2xx
    if (!response.ok) {
      const err = RpcError.fromHttp(response.status, json)
      emitAuthFailureIfNeeded(err, this.authScope, withAuth)
      throw err
    }

    // 2) Kratos 框架级错误
    if (typeof json?.code === 'number' && json.message) {
      const err = RpcError.fromKratos(json)
      emitAuthFailureIfNeeded(err, this.authScope, withAuth)
      if (receiveError) return err
      throw err
    }

    // 3) JSON-RPC error 字段
    if (json?.error) {
      const err = RpcError.fromJsonRpc(json)
      emitAuthFailureIfNeeded(err, this.authScope, withAuth)
      if (receiveError) return err
      throw err
    }

    // 4) 业务错误 result.code != 0
    const result = validateSuccessResponse(json, id, response.status)
    if (result && typeof result.code === 'number' && result.code !== 0) {
      const err = RpcError.fromBiz(json)
      emitAuthFailureIfNeeded(err, this.authScope, withAuth)
      if (receiveError) return err
      throw err
    }

    return result
  }
}

function emitAuthFailureIfNeeded(error, authScope, withAuth) {
  if (!withAuth) return
  handleAuthError(error?.code, error?.message, authScope)
}

function handleAuthError(code, message, authScope) {
  // 仅登录态失效才清 token，避免把权限不足误处理成登出。
  if (!isAuthFailureCode(code)) return
  const userMessage = getUserFacingErrorMessage(
    { code, message },
    '登录已过期，请重新登录'
  )

  // 1) 清 token
  logout(authScope)

  // 2) 通知 UI：弹窗 + 跳转交给 React
  authBus.emitUnauthorized?.({
    from: {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    },
    message: userMessage,
    loginPath: getLoginPath(authScope),
  })
}
