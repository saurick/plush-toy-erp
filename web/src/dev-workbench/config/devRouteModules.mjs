import { lazy } from 'react'
import { loadWithDynamicImportRetry } from '../../common/utils/lazyImportRetry.mjs'

const routeImporters = new Map()
const modulePromises = new Map()

function normalizeRoutePathname(pathname = '') {
  const routePathname = String(pathname || '')
  return routePathname === '/'
    ? routePathname
    : routePathname.replace(/\/+$/, '')
}

export function loadDevRouteModule(pathname) {
  const routePathname = normalizeRoutePathname(pathname)
  const importer = routeImporters.get(routePathname)

  if (!importer) {
    return Promise.reject(
      new Error(
        `DEV workbench route module is not registered: ${routePathname}`
      )
    )
  }

  const cachedPromise = modulePromises.get(importer)
  if (cachedPromise) return cachedPromise

  const modulePromise = loadWithDynamicImportRetry(importer).catch((error) => {
    if (modulePromises.get(importer) === modulePromise) {
      modulePromises.delete(importer)
    }
    throw error
  })
  modulePromises.set(importer, modulePromise)
  return modulePromise
}

export function createDevLazyRoute(pathname, importer) {
  const routePathname = normalizeRoutePathname(pathname)
  if (!routePathname || typeof importer !== 'function') {
    throw new TypeError('DEV workbench lazy route requires a path and importer')
  }

  const previousImporter = routeImporters.get(routePathname)
  if (previousImporter && previousImporter !== importer) {
    modulePromises.delete(previousImporter)
  }
  routeImporters.set(routePathname, importer)
  return lazy(() => loadDevRouteModule(routePathname))
}

export function preloadDevRoute(pathname) {
  return loadDevRouteModule(pathname).then(
    () => true,
    () => false
  )
}
