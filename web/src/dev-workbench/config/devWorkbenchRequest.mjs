// A deadline covers both headers and the response body. Only record GETs may retry.
export async function requestWorkbenchJson(
  fetchImpl,
  url,
  {
    signal,
    timeoutMs = 30_000,
    attempts = 1,
    failureMessage = '工作台请求暂时不可用',
    exposeResponseMessage = false,
    ...options
  }
) {
  const requestAttempts = options.method === 'GET' ? attempts : 1
  for (let attempt = 0; attempt < requestAttempts; attempt += 1) {
    signal?.throwIfAborted()
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException(
            options.method === 'POST'
              ? '操作响应超时；请先刷新操作记录核对结果，系统没有自动重试'
              : '读取超时，请重新核对状态',
            'TimeoutError'
          )
        ),
      timeoutMs
    )
    let rejectAborted
    const aborted = new Promise((resolve, reject) => {
      rejectAborted = () => reject(controller.signal.reason)
      controller.signal.addEventListener('abort', rejectAborted, { once: true })
    })
    try {
      return await Promise.race([
        aborted,
        (async () => {
          const response = await fetchImpl(url, {
            cache: 'no-store',
            credentials: 'same-origin',
            ...options,
            signal: controller.signal,
          })
          let payload
          try {
            payload = await response.json()
          } catch {
            const error = new Error('工作台返回了无效响应')
            error.status = response.status
            throw error
          }
          controller.signal.throwIfAborted()
          if (!response.ok) {
            const error = new Error(
              exposeResponseMessage && typeof payload?.message === 'string'
                ? payload.message
                : failureMessage
            )
            error.status = response.status
            throw error
          }
          return payload
        })(),
      ])
    } catch (error) {
      signal?.throwIfAborted()
      const reason = controller.signal.aborted
        ? controller.signal.reason
        : error
      if (
        attempt + 1 === requestAttempts ||
        !(
          reason?.name === 'TypeError' ||
          reason?.name === 'TimeoutError' ||
          [408, 429, 502, 503, 504].includes(reason?.status)
        )
      )
        { throw reason }
    } finally {
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', rejectAborted)
      signal?.removeEventListener('abort', abort)
    }
  }
}
