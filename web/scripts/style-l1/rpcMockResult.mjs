export function unsupportedRpcMethod(domain, method) {
  return {
    __style_l1_unsupported_method: {
      domain: String(domain || '').trim() || 'unknown',
      method: String(method || '').trim() || '(empty)',
    },
  }
}

export function styleRpcResult(data) {
  const unsupported = data?.__style_l1_unsupported_method
  if (unsupported) {
    return {
      code: 40010,
      message: `${unsupported.domain} method ${unsupported.method} is not supported`,
      data: {},
    }
  }
  return { code: 0, message: 'OK', data }
}
