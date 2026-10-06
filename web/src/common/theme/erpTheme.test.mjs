import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../scripts/test/reactRuntime.mjs'
import { createMockAdminSessionToken } from '../../../scripts/mockAdminSessionToken.mjs'

registerJSXTestLoader()
const dom = installTestDOM()
const { ERPThemeProvider, useERPTheme } = await import('./erpTheme.jsx')
const {
  persistAuth,
  persistAuthMeta,
  persistAdminERPPreferences,
  mergeAdminERPPreferencesRead,
  getAuthMeta,
  getToken,
  logout,
  AUTH_SCOPE,
} = await import('../auth/auth.js')
const originalFetch = globalThis.fetch
after(() => {
  globalThis.fetch = originalFetch
  dom.restore()
})

const defaults = {
  theme_mode: 'system',
  accent: 'blue',
  density: 'standard',
  tableLines: 'simple',
}
const profile = (id, appearance = defaults) => ({
  user_id: id,
  username: `user-${id}`,
  erp_preferences: {
    column_orders: { customers: ['name'] },
    hidden_columns: { customers: ['status'] },
    appearance,
  },
})

function signIn(id, appearance = defaults) {
  persistAuth({
    ...profile(id, appearance),
    access_token: createMockAdminSessionToken({ userID: id }),
  })
}

async function mount() {
  let theme
  const requests = []
  globalThis.fetch = (_url, options) =>
    new Promise((resolve, reject) => {
      const body = JSON.parse(options.body)
      requests.push({
        ...body,
        token: options.headers.Authorization,
        fail: reject,
        reply: (appearance) =>
          resolve(
            new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  code: 0,
                  message: 'OK',
                  data: {
                    erp_preferences: profile(1, appearance).erp_preferences,
                  },
                },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          ),
      })
    })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  function Probe() {
    theme = useERPTheme()
    return null
  }
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(ERPThemeProvider, null, createElement(Probe))
      )
    )
  )
  return {
    requests,
    get theme() {
      return theme
    },
    close: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

const settle = async (fn) =>
  act(async () => {
    fn()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

test('appearance: guest preferences remain local; login loads the account and logout restores the guest', async () => {
  localStorage.clear()
  localStorage.setItem('plush_erp_theme_mode', 'light')
  const runtime = await mount()
  try {
    await settle(() =>
      runtime.theme.setAppearance({
        accent: 'orange',
        density: 'compact',
        tableLines: 'grid',
      })
    )
    assert.equal(runtime.requests.length, 0)
    await settle(() => signIn(1, { ...defaults, accent: 'purple' }))
    assert.deepEqual(runtime.theme.appearance, {
      accent: 'purple',
      density: 'standard',
      tableLines: 'simple',
    })
    assert.equal(runtime.theme.themeMode, 'system')
    await settle(() => logout())
    assert.deepEqual(runtime.theme.appearance, {
      accent: 'orange',
      density: 'compact',
      tableLines: 'grid',
    })
    assert.equal(runtime.theme.themeMode, 'light')
    await settle(() => signIn(2))
    assert.deepEqual(runtime.theme.appearance, {
      accent: 'blue',
      density: 'standard',
      tableLines: 'simple',
    })
  } finally {
    await runtime.close()
  }
})

test('appearance: rapid edits serialize changed fields and preserve independently saved columns', async () => {
  localStorage.clear()
  signIn(1)
  const runtime = await mount()
  try {
    await settle(() => runtime.theme.setAppearance({ density: 'compact' }))
    await settle(() => {
      runtime.theme.setThemeMode('dark')
      runtime.theme.setAppearance({ accent: 'green' })
      runtime.theme.setAppearance({ tableLines: 'grid' })
    })
    assert.equal(runtime.requests.length, 1)
    assert.deepEqual(runtime.requests[0].params, { density: 'compact' })
    const before = getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences')
    await settle(() =>
      persistAdminERPPreferences(
        { column_orders: { suppliers: ['code'] } },
        { userID: 1, token: getToken() }
      )
    )
    await settle(() =>
      runtime.requests[0].reply({ ...defaults, density: 'compact' })
    )
    assert.equal(runtime.requests.length, 2)
    assert.deepEqual(runtime.requests[1].params, {
      theme_mode: 'dark',
      accent: 'green',
      tableLines: 'grid',
    })
    assert.equal(runtime.theme.themeMode, 'dark')
    assert.equal(runtime.theme.appearance.accent, 'green')
    await settle(() =>
      runtime.requests[1].reply({
        theme_mode: 'dark',
        accent: 'green',
        density: 'compact',
        tableLines: 'grid',
      })
    )
    const saved = getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences')
    assert.deepEqual(saved.column_orders, { suppliers: ['code'] })
    assert.equal(runtime.theme.appearanceSaving, false)
    await settle(() =>
      persistAuthMeta({
        ...profile(1),
        erp_preferences: mergeAdminERPPreferencesRead(before, before),
      })
    )
    assert.deepEqual(
      getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences'),
      saved,
      'older profile read cannot overwrite newly saved preference groups'
    )
    await settle(() => runtime.theme.setAppearance({ accent: 'pink' }))
    assert.deepEqual(
      runtime.requests[2].params,
      { accent: 'pink' },
      'mobile patch retains desktop density'
    )
    await settle(() =>
      runtime.requests[2].reply({ ...saved.appearance, accent: 'pink' })
    )
    assert.equal(runtime.theme.appearance.density, 'compact')
    assert.equal(runtime.theme.appearance.tableLines, 'grid')
  } finally {
    await runtime.close()
  }
})

test('appearance: failed saves remain visible and retry only after a user action', async () => {
  localStorage.clear()
  signIn(1)
  const runtime = await mount()
  try {
    await settle(() => runtime.theme.setAppearance({ accent: 'purple' }))
    await settle(() => runtime.requests[0].fail(new TypeError('offline')))
    assert.equal(runtime.theme.appearance.accent, 'purple')
    assert.equal(runtime.theme.appearanceSaving, false)
    assert.match(runtime.theme.appearanceSaveError, /未保存到账号/u)
    assert.equal(
      getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences').appearance.accent,
      'blue'
    )
    await settle(() => window.dispatchEvent(new Event('focus')))
    assert.equal(
      runtime.requests.length,
      1,
      'focus must not retry writes automatically'
    )
    await settle(() => runtime.theme.retryAppearanceSave())
    assert.equal(runtime.requests.length, 2)
    await settle(() =>
      runtime.requests[1].reply({ ...defaults, accent: 'purple' })
    )
    assert.equal(runtime.theme.appearanceSaveError, '')
    assert.equal(
      getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences').appearance.accent,
      'purple'
    )
  } finally {
    await runtime.close()
  }
})

test('appearance: a late response from a previous session cannot change another account', async () => {
  localStorage.clear()
  signIn(1)
  const runtime = await mount()
  try {
    await settle(() => runtime.theme.setAppearance({ accent: 'purple' }))
    await settle(() => {
      logout()
      signIn(2, { ...defaults, accent: 'yellow' })
    })
    await settle(() =>
      runtime.requests[0].reply({ ...defaults, accent: 'purple' })
    )
    assert.equal(runtime.theme.appearance.accent, 'yellow')
    assert.equal(
      getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences').appearance.accent,
      'yellow'
    )
    assert.equal(runtime.theme.appearanceSaving, false)
    assert.equal(
      localStorage.getItem('plush_erp_appearance:admin:2')?.includes('purple'),
      false
    )
  } finally {
    await runtime.close()
  }
})

test('appearance: a fresh browser cache restores server defaults and saved choices without inheriting guest settings', async () => {
  localStorage.clear()
  localStorage.setItem('plush_erp_theme_mode', 'dark')
  localStorage.setItem(
    'plush_erp_appearance',
    JSON.stringify({ accent: 'orange', density: 'compact' })
  )
  signIn(1, { theme_mode: 'light', accent: 'green', density: 'standard' })
  const runtime = await mount()
  try {
    assert.equal(runtime.theme.themeMode, 'light')
    assert.deepEqual(runtime.theme.appearance, {
      accent: 'green',
      density: 'standard',
      tableLines: 'simple',
    })
    await settle(() => runtime.theme.setThemeMode('system'))
    await settle(() =>
      runtime.requests[0].reply({ ...defaults, accent: 'green' })
    )
    assert.equal(
      getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences').appearance.theme_mode,
      'system'
    )
    assert.equal(
      runtime.requests.length,
      1,
      'strict mode must not duplicate a save'
    )
  } finally {
    await runtime.close()
  }
})
