export function installRpcCallHarness(registerCleanup) {
  const originalFetchDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'fetch'
  )
  let rpcCall

  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    async value(url, init) {
      if (typeof rpcCall !== 'function') {
        throw new Error('RPC test handler is not configured')
      }
      const request = JSON.parse(init.body)
      const result = await rpcCall(request.method, request.params, {
        init,
        url,
      })
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result,
          }
        },
      }
    },
  })

  registerCleanup(() => {
    if (originalFetchDescriptor) {
      Object.defineProperty(globalThis, 'fetch', originalFetchDescriptor)
    } else {
      delete globalThis.fetch
    }
  })

  return (call) => {
    rpcCall = call
  }
}
