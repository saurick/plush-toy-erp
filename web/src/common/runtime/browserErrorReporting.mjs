const errorNames = new Set([
  'Error',
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
])
const pathSegments = new Set([
  'erp',
  'mobile',
  'admin-login',
  'dashboard',
  'workbench',
  'workflow',
  'inventory',
  'purchase',
  'sales',
  'finance',
  'master-data',
  'products',
  'materials',
  'units',
  'warehouses',
  'customers',
  'suppliers',
  'shipments',
  'production',
  'quality',
  'outsourcing',
  'orders',
  'help',
  'print',
  'tasks',
])

export function safeBrowserPath(path) {
  const segments = String(path || '/')
    .split(/[?#]/u)[0]
    .split('/')
  if (segments.length > 12) return '/unknown'
  return (
    '/' +
    segments
      .filter(Boolean)
      .map((segment) => (pathSegments.has(segment) ? segment : '{page}'))
      .join('/')
  )
}

function fingerprint(text) {
  let value = 2166136261
  for (const char of text.slice(0, 4000)) {
    value ^= char.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return (value >>> 0).toString(16).padStart(8, '0')
}

function safeFrames(stack) {
  const frames = []
  for (const match of String(stack || '')
    .slice(0, 16_000)
    .matchAll(
      /(?:https?:\/\/[^\s/]+)?(\/(?:assets|src)\/[A-Za-z0-9_./-]+\.(?:js|jsx|mjs|ts|tsx))(?::|\?[^\s:)]*:)(\d{1,7}):(\d{1,7})/gu
    )) {
    const frame = `${match[1]}:${match[2]}:${match[3]}`
    if (frame.length <= 210 && !frame.includes('..')) frames.push(frame)
    if (frames.length === 5) break
  }
  return frames
}

export function createBrowserErrorReporter({
  send,
  getPath,
  build = 'unknown',
  now = Date.now,
}) {
  let windowStart = now(),
    sent = 0
  const seen = new Set()
  return (error, kind = 'runtime') => {
    try {
      // RPC failures already have server request evidence. Report browser faults
      // without serializing messages, arbitrary rejection values or form data.
      if (error?.name === 'RpcError') return Promise.resolve(false)
      if (now() - windowStart >= 60_000) {
        windowStart = now()
        sent = 0
        seen.clear()
      }
      const name = errorNames.has(error?.name) ? error.name : 'Error'
      const path = safeBrowserPath(getPath())
      const frames = safeFrames(error?.stack)
      const hash = fingerprint(`${name}:${path}:${frames.join('|')}`)
      const key = `${kind}:${path}:${hash}`
      if (sent >= 10 || seen.has(key)) return Promise.resolve(false)
      sent++
      seen.add(key)
      const originId =
        typeof error?.requestId === 'string' &&
        /^[A-Za-z0-9._:-]{1,128}$/u.test(error.requestId)
          ? error.requestId
          : ''
      return Promise.resolve()
        .then(() =>
          send({
            kind,
            error_name: name,
            fingerprint: hash,
            path,
            build: /^(?:local|unknown|[0-9a-f]{40})$/u.test(build)
              ? build
              : 'unknown',
            frames,
            origin_request_id: originId,
          })
        )
        .then(
          () => true,
          () => false
        )
    } catch {
      return Promise.resolve(false)
    }
  }
}

export function installBrowserErrorListeners(target, report) {
  const onError = (event) => {
    if (event.error) void report(event.error, 'runtime')
  }
  const onRejection = (event) => {
    void report(event.reason, 'unhandled_rejection')
  }
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
