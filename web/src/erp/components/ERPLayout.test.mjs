import assert from 'node:assert/strict'

import test, { after } from 'node:test'

import { act, createElement, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../scripts/test/reactRuntime.mjs'

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
const sharedDOM = installTestDOM()
const NativeMessageChannel = globalThis.MessageChannel
const testChannels = []
globalThis.MessageChannel = class TestMessageChannel extends (
  NativeMessageChannel
) {
  constructor() {
    super()
    testChannels.push(this)
  }
}
after(() => {
  sharedDOM.restore()
  // rc-overflow 的浏览器调度通道在 Node 中需要显式释放句柄。
  for (const channel of testChannels) {
    channel.port1.close()
    channel.port2.close()
  }
  globalThis.MessageChannel = NativeMessageChannel
})

function loadERPLayoutRuntime() {
  if (!layoutRuntimePromise) {
    registerJSXTestLoader()
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

function encodeTokenPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function storeCachedAdminProfile(
  runtimeWindow,
  sessionID = 'erp-layout-fail-closed-test'
) {
  const issuedAt = Math.floor(Date.now() / 1000)
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
  const testDOM = sharedDOM
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
  }
})

async function mountRecoveryHarness(initialPath = '/erp/business-dashboard') {
  const dom = sharedDOM
  const { runtimeWindow } = dom
  runtimeWindow.localStorage.clear()
  runtimeWindow.__PLUSH_ERP_CUSTOMER_CONFIG__ = { customerKey: 'yoyoosun' }
  storeCachedAdminProfile(runtimeWindow)
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
  const dialogPrototype = Object.getPrototypeOf(
    document.createElement('dialog')
  )
  const originalShowModal = dialogPrototype.showModal
  const originalClose = dialogPrototype.close
  dialogPrototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  dialogPrototype.close = function close() {
    this.removeAttribute('open')
  }
  const { ERPLayout, JsonRpc } = await loadERPLayoutRuntime()
  const { authBus } = await import('../../common/auth/authBus.js')
  const { ERPThemeProvider } = await import('../../common/theme/erpTheme.jsx')
  const events = []
  const unsubscribe = authBus.onUnauthorized((event) => events.push(event))
  const profile = {
    id: 42,
    username: 'verified-admin',
    is_super_admin: false,
    roles: [],
    permissions: ['dashboard.stats.read'],
    menus: [initialPath],
    erp_preferences: { column_orders: {} },
  }
  const session = {
    customer: { key: 'yoyoosun' },
    configRevision: 'recovery-test',
    pages: ['business-dashboard'],
    actions: ['dashboard.stats.read'],
    source: 'active_customer_config_revision',
  }
  const state = {
    me: async () => ({ data: profile }),
    session: async () => ({ data: { session } }),
  }
  const calls = []
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  console.warn = () => {}
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body)
    const namespace = url.split('/').at(-1)
    calls.push(`${namespace}.${body.method}`)
    const result =
      namespace === 'admin'
        ? await state.me()
        : namespace === 'customer_config'
          ? await state.session()
          : { data: {} }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        id: body.id,
        result: { code: 0, ...result },
      }),
    }
  }
  let mounts = 0
  function DraftPage() {
    const [draft, setDraft] = useState('')
    useEffect(() => {
      mounts += 1
    }, [])
    return createElement(
      'div',
      { 'data-testid': 'draft-page' },
      createElement('input', {
        'aria-label': '未保存的备注',
        value: draft,
        onChange: (event) => setDraft(event.target.value),
      }),
      createElement(
        'button',
        { onClick: () => setDraft('保留这段未保存输入') },
        '填写草稿'
      )
    )
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  await act(async () =>
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialPath] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            {
              path: '/erp',
              element: createElement(
                ERPThemeProvider,
                null,
                createElement(ERPLayout)
              ),
            },
            createElement(Route, {
              path: 'business-dashboard',
              element: createElement(DraftPage),
            }),
            createElement(Route, {
              path: 'help-center',
              element: createElement('div', null, '帮助'),
            }),
            createElement(Route, {
              path: 'system/permissions',
              element: createElement(DraftPage),
            })
          )
        )
      )
    )
  )
  await settle()
  const button = (text) =>
    [...container.querySelectorAll('button')].find(
      (node) => node.textContent.replace(/\s/gu, '') === text
    )
  return {
    state,
    calls,
    profile,
    session,
    events,
    runtimeWindow,
    container,
    settle,
    button,
    business: new JsonRpc({ url: 'business_probe' }),
    mounts: () => mounts,
    draft: () =>
      container.querySelector('input[aria-label="未保存的备注"]')?.value,
    dialog: () => container.querySelector('dialog'),
    sync: async () => {
      await act(async () =>
        document.dispatchEvent(new runtimeWindow.Event('visibilitychange'))
      )
      await settle()
    },
    cleanup: async () => {
      await act(async () => root.unmount())
      unsubscribe()
      container.remove()
      globalThis.fetch = originalFetch
      console.warn = originalWarn
      dialogPrototype.showModal = originalShowModal
      dialogPrototype.close = originalClose
    },
  }
}

test('ERPLayout: 断连保留草稿、暂停业务请求，重复重试合并且恢复不重挂载', async () => {
  const h = await mountRecoveryHarness()
  try {
    assert.equal(h.mounts(), 1)
    await act(async () => h.button('填写草稿').click())
    h.state.me = async () => {
      throw new TypeError('network unavailable')
    }
    await h.sync()
    assert.equal(h.dialog().open, true)
    assert.equal(h.draft(), '保留这段未保存输入')
    const beforeBlocked = h.calls.length
    await assert.rejects(h.business.call('save'), { isAbortError: true })
    assert.equal(h.calls.length, beforeBlocked)

    let complete
    h.state.me = () =>
      new Promise((resolve) => {
        complete = resolve
      })
    const readsBefore = h.calls.filter((call) => call === 'admin.me').length
    await act(async () => {
      h.button('重试').click()
      h.button('重试').click()
    })
    assert.equal(
      h.calls.filter((call) => call === 'admin.me').length,
      readsBefore + 1
    )
    assert.equal(h.dialog().open, true)
    await act(async () => complete({ data: h.profile }))
    await h.settle()
    assert.equal(h.dialog().open, false)
    assert.equal(h.mounts(), 1)
    assert.equal(h.draft(), '保留这段未保存输入')
    await h.business.call('list')
    assert.equal(
      h.calls.filter((call) => call === 'business_probe.save').length,
      0
    )
  } finally {
    await h.cleanup()
  }
})

test('ERPLayout: 恢复时访问范围变化必须重建页面，撤回页面权限后不恢复旧表单', async () => {
  const h = await mountRecoveryHarness()
  try {
    await act(async () => h.button('填写草稿').click())
    h.state.session = async () => ({ code: RpcErrorCode.INTERNAL })
    await h.sync()
    assert.equal(h.dialog().open, true)
    h.state.session = async () => ({
      data: {
        session: { ...h.session, configRevision: 'changed', actions: [] },
      },
    })
    await h.sync()
    assert.equal(h.mounts(), 2)
    assert.equal(h.draft(), '')
    h.state.session = async () => ({
      data: { session: { ...h.session, pages: [], actions: [] } },
    })
    await h.sync()
    assert.equal(h.container.querySelector('[data-testid="draft-page"]'), null)
  } finally {
    await h.cleanup()
  }
})

test('ERPLayout: 明确权限拒绝不保留业务页也不退出登录', async () => {
  const h = await mountRecoveryHarness()
  try {
    h.state.session = async () => ({ code: RpcErrorCode.PERMISSION_DENIED })
    await h.sync()
    assert.equal(h.container.querySelector('[data-testid="draft-page"]'), null)
    assert.match(h.container.textContent, /核对岗位和可用页面/u)
    assert.equal(h.events.length, 0)
    assert(h.runtimeWindow.localStorage.getItem('admin_access_token'))
  } finally {
    await h.cleanup()
  }
})

test('ERPLayout: 客户业务配置失败或缺失不阻断本次账号权限已验证的系统管理页', async () => {
  const h = await mountRecoveryHarness('/erp/system/permissions')
  try {
    h.state.session = async () => ({ code: RpcErrorCode.INTERNAL })
    await h.sync()
    assert(h.container.querySelector('[data-testid="draft-page"]'))
    assert.equal(h.dialog().open, false)
    await h.business.call('list')
    h.state.session = async () => ({ data: { session: null } })
    await h.sync()
    assert(h.container.querySelector('[data-testid="draft-page"]'))
    assert.equal(h.dialog().open, false)
    await h.business.call('list')
  } finally {
    await h.cleanup()
  }
})

test('ERPLayout: 断连后的有效配置读取发现登录失效时只通知一次并清除旧表单', async () => {
  const h = await mountRecoveryHarness()
  try {
    h.state.me = async () => {
      throw new TypeError('offline')
    }
    await h.sync()
    h.state.me = async () => ({ data: h.profile })
    h.state.session = async () => ({ code: RpcErrorCode.AUTH_EXPIRED })
    await h.sync()
    assert.equal(h.container.querySelector('[data-testid="draft-page"]'), null)
    assert.equal(
      h.runtimeWindow.localStorage.getItem('admin_access_token'),
      null
    )
    assert.equal(h.events.length, 1)
  } finally {
    await h.cleanup()
  }
})

test('ERPLayout: 切换登录后旧同步响应不能恢复旧权限或旧输入', async () => {
  const h = await mountRecoveryHarness()
  try {
    await act(async () => h.button('填写草稿').click())
    let completeOld
    h.state.me = () =>
      new Promise((resolve) => {
        completeOld = resolve
      })
    await h.sync()
    storeCachedAdminProfile(h.runtimeWindow, 'new-auth-generation')
    h.state.me = async () => ({
      data: { ...h.profile, username: 'new-session' },
    })
    await act(async () =>
      window.dispatchEvent(
        new h.runtimeWindow.StorageEvent('storage', {
          key: 'admin_access_token',
          storageArea: window.localStorage,
        })
      )
    )
    await h.settle()
    await act(async () =>
      completeOld({
        data: { ...h.profile, username: 'stale-session', is_super_admin: true },
      })
    )
    await h.settle()
    assert.equal(h.draft(), '')
    assert.equal(window.localStorage.getItem('admin_username'), 'new-session')
    assert.equal(window.localStorage.getItem('admin_is_super_admin'), 'false')
    assert.doesNotMatch(h.container.textContent, /stale-session/u)
  } finally {
    await h.cleanup()
  }
})
