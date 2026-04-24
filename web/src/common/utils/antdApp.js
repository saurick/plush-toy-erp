const createBufferedApi = (methodNames) => {
  let api = null
  const pendingCalls = []

  const flushPendingCalls = () => {
    if (!api || pendingCalls.length === 0) {
      return
    }

    while (pendingCalls.length > 0) {
      const currentCall = pendingCalls.shift()
      const handler = api?.[currentCall.method]
      if (typeof handler === 'function') {
        handler(...currentCall.args)
      }
    }
  }

  const proxy = methodNames.reduce((accumulator, methodName) => {
    accumulator[methodName] = (...args) => {
      const handler = api?.[methodName]
      if (typeof handler === 'function') {
        return handler(...args)
      }

      pendingCalls.push({ method: methodName, args })
      return Promise.resolve()
    }
    return accumulator
  }, {})

  return {
    proxy,
    setApi(nextApi) {
      api = nextApi || null
      flushPendingCalls()
    },
  }
}

const messageBridge = createBufferedApi([
  'open',
  'success',
  'error',
  'warning',
  'info',
  'loading',
  'destroy',
])

const modalBridge = createBufferedApi([
  'confirm',
  'info',
  'success',
  'warning',
  'error',
  'destroyAll',
])

const modalConfigMethodNames = [
  'confirm',
  'info',
  'success',
  'warning',
  'error',
]

const createCenteredModalApi = (modalApi) => {
  if (!modalApi) {
    return modalApi
  }

  return modalConfigMethodNames.reduce(
    (accumulator, methodName) => {
      const handler = modalApi[methodName]
      accumulator[methodName] = (config = {}) => {
        if (typeof handler !== 'function') {
          return undefined
        }

        const normalizedConfig =
          config && typeof config === 'object' && !Array.isArray(config)
            ? config
            : {}

        return handler({
          ...normalizedConfig,
          centered: true,
        })
      }
      return accumulator
    },
    {
      destroyAll: (...args) => modalApi.destroyAll?.(...args),
    }
  )
}

export const registerAntdAppApis = ({ message, modal } = {}) => {
  messageBridge.setApi(message)
  modalBridge.setApi(createCenteredModalApi(modal))
}

export const message = messageBridge.proxy
export const modal = modalBridge.proxy
