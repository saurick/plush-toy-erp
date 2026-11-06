function abortedRead() {
  return new DOMException('付款方式读取已取消', 'AbortError')
}

// 仅合并同一读取范围内尚未结束的请求；结束后释放，不缓存权限或付款方式。
export function createPaymentMethodReadLoader() {
  const pending = new Map()
  return (key, read, signal) => {
    if (signal?.aborted) return Promise.reject(abortedRead())
    let entry = pending.get(key)
    if (!entry) {
      const controller = new AbortController()
      entry = { controller, consumers: 0 }
      entry.promise = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw abortedRead()
        return read(controller.signal)
      }).finally(() => {
        if (pending.get(key) === entry) pending.delete(key)
      })
      pending.set(key, entry)
    }
    entry.consumers++
    return new Promise((resolve, reject) => {
      let finished = false
      const finish = (complete, value) => {
        if (finished) return false
        finished = true
        signal?.removeEventListener('abort', cancel)
        entry.consumers--
        complete(value)
        return true
      }
      const cancel = () => {
        if (!finish(reject, abortedRead()) || entry.consumers > 0) return
        if (pending.get(key) === entry) pending.delete(key)
        entry.controller.abort()
      }
      signal?.addEventListener('abort', cancel, { once: true })
      entry.promise.then((value) => finish(resolve, value), (error) => finish(reject, error))
      if (signal?.aborted) cancel()
    })
  }
}
