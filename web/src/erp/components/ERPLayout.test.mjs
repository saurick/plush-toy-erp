import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

import { Window } from 'happy-dom'
import { act, createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import {
  ADMIN_TOKEN_AUDIENCE,
  ADMIN_TOKEN_ISSUER,
  ADMIN_TOKEN_SUBJECT,
} from '../../common/auth/adminTokenContract.mjs'
import { RpcErrorCode } from '../../common/consts/errorCodes.js'

let layoutRuntimePromise
let businessProbeRPC
let businessPageMounts = 0
let businessPageRPCAttempts = 0

function registerERPLayoutJSXLoader() {
  const sourceRootURL = new URL('../../', import.meta.url).href
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
  if (url.endsWith('.jsx')) {
    const source = await readFile(new URL(url), 'utf8')
    const transformed = await transformWithEsbuild(source, url, {
      loader: 'jsx',
      jsx: 'automatic',
      target: 'esnext',
      define: { 'import.meta.env.DEV': 'false' },
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

function loadERPLayoutRuntime() {
  if (!layoutRuntimePromise) {
    registerERPLayoutJSXLoader()
    layoutRuntimePromise = Promise.all([
      import('./ERPLayout.jsx'),
      import('../../common/utils/jsonRpc.js'),
    ]).then(([layoutModule, rpcModule]) => ({
      ERPLayout: layoutModule.default,
      JsonRpc: rpcModule.JsonRpc,
    }))
  }
  return layoutRuntimePromise
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

function encodeTokenPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function storeCachedAdminProfile(runtimeWindow) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const sessionID = 'erp-layout-fail-closed-test'
  const token = [
    encodeTokenPart({ alg: 'none', typ: 'JWT' }),
    encodeTokenPart({
      aud: ADMIN_TOKEN_AUDIENCE,
      auth_version: 1,
      exp: issuedAt + 3600,
      iat: issuedAt,
      iss: ADMIN_TOKEN_ISSUER,
      jti: sessionID,
      sid: sessionID,
      sub: ADMIN_TOKEN_SUBJECT,
      uid: 42,
    }),
    'test-signature',
  ].join('.')
  const storedProfile = {
    admin_access_token: token,
    admin_user_id: '42',
    admin_username: 'cached-admin',
    admin_is_super_admin: 'false',
    admin_roles: JSON.stringify([]),
    admin_permissions: JSON.stringify(['dashboard.stats.read']),
    admin_menus: JSON.stringify(['/erp/business-dashboard']),
    admin_erp_preferences: JSON.stringify({ column_orders: {} }),
  }
  Object.entries(storedProfile).forEach(([key, value]) => {
    runtimeWindow.localStorage.setItem(key, value)
  })
}

function BusinessPageProbe() {
  useEffect(() => {
    businessPageMounts += 1
    businessPageRPCAttempts += 1
    businessProbeRPC.call('list', {}).catch(() => {})
  }, [])
  return createElement('div', { 'data-testid': 'business-page-probe' })
}

test('ERPLayout: effective session 失败时不挂载业务子页或启动业务 RPC', async () => {
  const testDOM = installTestDOM()
  const { runtimeWindow } = testDOM
  runtimeWindow.__PLUSH_ERP_CUSTOMER_CONFIG__ = {
    customerKey: 'yoyoosun',
    brand: { companyName: '测试客户' },
  }
  storeCachedAdminProfile(runtimeWindow)
  const { ERPLayout, JsonRpc } = await loadERPLayoutRuntime()
  const rpcCalls = []
  const originalRPCCall = JsonRpc.prototype.call
  const originalWarn = console.warn
  const warnings = []
  businessPageMounts = 0
  businessPageRPCAttempts = 0
  businessProbeRPC = new JsonRpc({ url: 'business-probe' })
  JsonRpc.prototype.call = async function call(method) {
    rpcCalls.push(`${this.url}.${method}`)
    if (this.url === 'system' && method === 'version') {
      return { data: {} }
    }
    if (this.url === 'admin' && method === 'me') {
      return {
        data: {
          id: 42,
          username: 'verified-admin',
          is_super_admin: false,
          roles: [],
          permissions: ['dashboard.stats.read'],
          menus: ['/erp/business-dashboard'],
          erp_preferences: { column_orders: {} },
        },
      }
    }
    if (this.url === 'customer_config' && method === 'get_effective_session') {
      throw Object.assign(new Error('effective session denied'), {
        code: RpcErrorCode.PERMISSION_DENIED,
      })
    }
    if (this.url === 'business-probe') {
      return { data: {} }
    }
    throw new Error(`unexpected RPC ${this.url}.${method}`)
  }
  console.warn = (...args) => warnings.push(args)

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  try {
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ['/erp/business-dashboard'] },
          createElement(
            Routes,
            null,
            createElement(
              Route,
              { path: '/erp', element: createElement(ERPLayout) },
              createElement(Route, {
                path: 'business-dashboard',
                element: createElement(BusinessPageProbe),
              })
            )
          )
        )
      )
    })
    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 50))
    })

    assert(container.querySelector('[data-customer-runtime-boundary="true"]'))
    assert.match(container.textContent, /暂时无法进入工作台/u)
    assert.equal(
      container.querySelector('[data-testid="business-page-probe"]'),
      null
    )
    assert.equal(businessPageMounts, 0)
    assert.equal(businessPageRPCAttempts, 0)
    assert.equal(
      rpcCalls.filter((call) => call === 'business-probe.list').length,
      0
    )
    assert.equal(rpcCalls.filter((call) => call === 'admin.me').length, 1)
    assert.equal(
      rpcCalls.filter(
        (call) => call === 'customer_config.get_effective_session'
      ).length,
      1
    )
    assert(
      warnings.some(
        ([message]) => message === '客户有效配置同步失败，当前业务投影已停用'
      )
    )
  } finally {
    await act(async () => root.unmount())
    container.remove()
    console.warn = originalWarn
    JsonRpc.prototype.call = originalRPCCall
    businessProbeRPC = null
    testDOM.restore()
  }
})
