import { register } from 'node:module'
import { Window } from 'happy-dom'

function registerJSXTestLoader() {
  const sourceRootURL = new URL('../../src/', import.meta.url).href
  const viteURL = import.meta.resolve('vite')
  const loaderSource = `
import { readFile, stat } from 'node:fs/promises'
import { transformWithEsbuild } from ${JSON.stringify(viteURL)}

const sourceRootURL = ${JSON.stringify(sourceRootURL)}

async function resolveSourceURL(baseURL) {
  const candidates = [
    baseURL,
    baseURL + '.js',
    baseURL + '.jsx',
    baseURL + '.mjs',
    baseURL + '/index.js',
    baseURL + '/index.jsx',
    baseURL + '/index.mjs',
  ]
  for (const candidate of candidates) {
    try {
      if ((await stat(new URL(candidate))).isFile()) return candidate
    } catch {}
  }
  return baseURL
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return {
      url: await resolveSourceURL(
        new URL(specifier.slice(2), sourceRootURL).href
      ),
      shortCircuit: true,
    }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file:')
    ) {
      const baseURL = new URL(specifier, context.parentURL).href
      const resolvedURL = await resolveSourceURL(baseURL)
      if (resolvedURL !== baseURL) {
        return { url: resolvedURL, shortCircuit: true }
      }
    }
    throw error
  }
}

export async function load(url, context, nextLoad) {
  if (/\\.(?:css|less|scss|sass)$/u.test(url)) {
    return { format: 'module', source: 'export default {}', shortCircuit: true }
  }
  if (url.startsWith(sourceRootURL) && /\\.(?:jsx|js|mjs)$/u.test(url)) {
    const source = await readFile(new URL(url), 'utf8')
    const transformed = await transformWithEsbuild(source, url, {
      loader: 'jsx',
      jsx: 'automatic',
      target: 'esnext',
      define: { 'import.meta.env': '{}' },
    })
    return {
      format: 'module',
      source: transformed.code,
      shortCircuit: true,
    }
  }
  return nextLoad(url, context)
}
`
  register(
    `data:text/javascript,${encodeURIComponent(loaderSource)}`,
    import.meta.url
  )
}

function installTestDOM() {
  const runtimeWindow = new Window({
    url: 'http://127.0.0.1/erp/business-dashboard',
  })
  const globals = {
    window: runtimeWindow,
    document: runtimeWindow.document,
    HTMLElement: runtimeWindow.HTMLElement,
    Element: runtimeWindow.Element,
    Node: runtimeWindow.Node,
    Event: runtimeWindow.Event,
    ShadowRoot: runtimeWindow.ShadowRoot,
    SVGElement: runtimeWindow.SVGElement,
    Document: runtimeWindow.Document,
    DocumentFragment: runtimeWindow.DocumentFragment,
    MutationObserver: runtimeWindow.MutationObserver,
    ResizeObserver: runtimeWindow.ResizeObserver,
    localStorage: runtimeWindow.localStorage,
    sessionStorage: runtimeWindow.sessionStorage,
    navigator: runtimeWindow.navigator,
    AbortController: runtimeWindow.AbortController,
    getComputedStyle: runtimeWindow.getComputedStyle.bind(runtimeWindow),
    requestAnimationFrame:
      runtimeWindow.requestAnimationFrame.bind(runtimeWindow),
    cancelAnimationFrame:
      runtimeWindow.cancelAnimationFrame.bind(runtimeWindow),
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const previousDescriptors = new Map(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  )
  Object.entries(globals).forEach(([key, value]) => {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    })
  })

  return {
    runtimeWindow,
    restore() {
      runtimeWindow.happyDOM.cancelAsync()
      previousDescriptors.forEach((descriptor, key) => {
        if (descriptor) {
          Object.defineProperty(globalThis, key, descriptor)
        } else {
          delete globalThis[key]
        }
      })
    },
  }
}

export { registerJSXTestLoader, installTestDOM }
