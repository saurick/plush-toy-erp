import { createElement } from 'react'
import { CONFIRM_MODAL_WIDTH } from './feedbackConfig.mjs'

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

const notificationBridge = createBufferedApi([
  'open', 'success', 'error', 'warning', 'info', 'destroy',
])

// Preserve Ant Design's keys, durations, close handles and promise-like return values.
export function withMessageSemantics(api) {
  if (!api) return api
  const className = (value) => ['erp-feedback-message', value].filter(Boolean).join(' ')
  const content = (value, type) => createElement('span', {
    role: type === 'error' || type === 'warning' ? 'alert' : 'status',
    'aria-atomic': true,
  }, value)
  return Object.fromEntries([
    ['destroy', (...args) => api.destroy(...args)],
    ['open', (config) => api.open({ ...config, className: className(config.className), content: content(config.content, config.type) })],
    ...['success', 'error', 'warning', 'info', 'loading'].map((type) => [
      type,
      (value, ...args) => api[type](
        value && typeof value === 'object' && 'content' in value
          ? { ...value, className: className(value.className), content: content(value.content, type) }
          : { className: className(), content: content(value, type) },
        ...args
      ),
    ]),
  ])
}

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
          width: CONFIRM_MODAL_WIDTH,
          autoFocusButton: methodName === 'confirm' ? 'cancel' : 'ok',
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

export const registerAntdAppApis = ({ message, modal, notification } = {}) => {
  messageBridge.setApi(withMessageSemantics(message))
  modalBridge.setApi(createCenteredModalApi(modal))
  notificationBridge.setApi(notification)
}

export const message = messageBridge.proxy
export const modal = modalBridge.proxy
export const notification = notificationBridge.proxy
