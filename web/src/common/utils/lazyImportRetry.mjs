import { lazy } from 'react'

const DEFAULT_RETRY_DELAYS_MS = Object.freeze([120, 360, 900])

const DYNAMIC_IMPORT_ERROR_PATTERNS = Object.freeze([
  /failed to fetch dynamically imported module/iu,
  /error loading dynamically imported module/iu,
  /importing a module script failed/iu,
  /loading chunk \d+ failed/iu,
  /chunkloaderror/iu,
])

const wait = (delayMs) =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs)
  })

export function isDynamicImportLoadError(error) {
  const text = String(error?.message || error || '').trim()
  if (!text) return false
  return DYNAMIC_IMPORT_ERROR_PATTERNS.some((pattern) => pattern.test(text))
}

export async function loadWithDynamicImportRetry(
  importer,
  {
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    shouldRetry = isDynamicImportLoadError,
  } = {}
) {
  let lastError
  const attempts = [0, ...retryDelaysMs]

  for (let index = 0; index < attempts.length; index += 1) {
    if (index > 0) {
      await wait(attempts[index])
    }

    try {
      return await importer()
    } catch (error) {
      lastError = error
      if (!shouldRetry(error) || index === attempts.length - 1) {
        throw error
      }
    }
  }

  throw lastError
}

export function lazyWithDynamicImportRetry(importer, options = {}) {
  return lazy(() => loadWithDynamicImportRetry(importer, options))
}
