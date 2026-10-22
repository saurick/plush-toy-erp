import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../scripts/test/reactRuntime.mjs'
import { createMockAdminSessionToken } from '../../../scripts/mockAdminSessionToken.mjs'
import { WORKBENCH_APPEARANCE_STORAGE_KEY } from './erpAppearance.mjs'

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

const savedAppearance = {
  theme_mode: 'system',
  accent: 'blue',
  density: 'standard',
  tableLines: 'simple',
}
const profile = (id, appearance = savedAppearance) => ({
  user_id: id,
  username: `user-${id}`,
  erp_preferences: {
    column_orders: { customers: ['name'] },
    hidden_columns: { customers: ['status'] },
    appearance,
  },
})

function signIn(id, appearance = savedAppearance) {
  persistAuth({
    ...profile(id, appearance),
    access_token: createMockAdminSessionToken({ userID: id }),
  })
}

async function mount({ browserStorageKey = '' } = {}) {
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
  const render = async (key) => act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(ERPThemeProvider, { browserStorageKey: key }, createElement(Probe))
      )
    )
  )
  await render(browserStorageKey)
  return {
    requests,
    setBrowserStorageKey: render,
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

test('appearance: unsaved accounts use compact grid and saved accounts retain standard simple', async () => {
  localStorage.clear()
  const runtime = await mount()
  try {
    const newDefault = {
      accent: 'blue',
      density: 'compact',
      tableLines: 'grid',
    }
    assert.deepEqual(runtime.theme.appearance, newDefault)
    await settle(() => signIn(1, {}))
    assert.deepEqual(runtime.theme.appearance, newDefault)
    assert.equal(document.documentElement.dataset.erpDensity, 'compact')
    assert.equal(document.documentElement.dataset.erpTableLines, 'grid')
    await settle(() => signIn(2, savedAppearance))
    assert.deepEqual(runtime.theme.appearance, {
      accent: 'blue',
      density: 'standard',
      tableLines: 'simple',
    })
    assert.equal(document.documentElement.dataset.erpDensity, 'standard')
    assert.equal(document.documentElement.dataset.erpTableLines, 'simple')
    assert.equal(
      runtime.requests.length,
      0,
      'reading defaults cannot write account preferences'
    )
    await settle(() => logout())
    assert.deepEqual(runtime.theme.appearance, newDefault)
  } finally {
    await runtime.close()
  }
})

test('appearance: workbench preferences never inherit or update ERP guest and account preferences', async () => {
  localStorage.clear()
  localStorage.setItem('plush_erp_theme_mode', 'dark')
  const guest = JSON.stringify({ accent: 'orange', density: 'standard', tableLines: 'simple' })
  localStorage.setItem('plush_erp_appearance', guest)
  signIn(1, { ...savedAppearance, accent: 'pink' })
  const accountBefore = getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences')
  const runtime = await mount({ browserStorageKey: WORKBENCH_APPEARANCE_STORAGE_KEY })
  const chosen = { theme_mode: 'light', accent: 'teal', density: 'standard', tableLines: 'simple' }
  try {
    assert.equal(runtime.theme.themeMode, 'system')
    assert.deepEqual(runtime.theme.appearance, { accent: 'blue', density: 'compact', tableLines: 'grid' })
    await settle(() => runtime.theme.setThemeMode(chosen.theme_mode))
    await settle(() => runtime.theme.setAppearance(chosen))
    assert.deepEqual(JSON.parse(localStorage.getItem(WORKBENCH_APPEARANCE_STORAGE_KEY)), chosen)
    assert.deepEqual(getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences'), accountBefore)
    assert.equal(localStorage.getItem('plush_erp_theme_mode'), 'dark')
    assert.equal(localStorage.getItem('plush_erp_appearance'), guest)
    for (const changeSession of [() => signIn(2), () => logout(), () => signIn(3)]) {
      await settle(changeSession)
      await settle(() => window.dispatchEvent(new Event('focus')))
      assert.equal(runtime.theme.themeMode, 'light')
      assert.equal(runtime.theme.appearance.accent, 'teal')
      assert.equal(runtime.theme.appearance.density, 'standard')
    }
    assert.equal(runtime.requests.length, 0, 'workbench changes must not send account preference RPCs')
  } finally {
    await runtime.close()
  }
  const restored = await mount({ browserStorageKey: WORKBENCH_APPEARANCE_STORAGE_KEY })
  try {
    assert.equal(restored.theme.themeMode, chosen.theme_mode)
    assert.deepEqual(restored.theme.appearance, { accent: 'teal', density: 'standard', tableLines: 'simple' })
    assert.equal(restored.requests.length, 0)
  } finally {
    await restored.close()
  }
})

test('appearance: workbench storage synchronization accepts only its own namespace', async () => {
  localStorage.clear()
  signIn(1)
  const runtime = await mount({ browserStorageKey: WORKBENCH_APPEARANCE_STORAGE_KEY })
  const chosen = { theme_mode: 'dark', accent: 'purple', density: 'standard', tableLines: 'simple' }
  const storageEvent = (key) => window.dispatchEvent(new window.StorageEvent('storage', { key }))
  try {
    localStorage.setItem(WORKBENCH_APPEARANCE_STORAGE_KEY, JSON.stringify(chosen))
    await settle(() => storageEvent('admin_erp_preferences'))
    assert.equal(runtime.theme.appearance.accent, 'blue', 'ERP storage events must not reload workbench state')
    await settle(() => storageEvent(WORKBENCH_APPEARANCE_STORAGE_KEY))
    assert.equal(runtime.theme.appearance.accent, 'purple')
    assert.equal(runtime.theme.themeMode, 'dark')
    assert.equal(document.documentElement.dataset.erpDensity, 'standard')
    localStorage.removeItem(WORKBENCH_APPEARANCE_STORAGE_KEY)
    await settle(() => storageEvent(WORKBENCH_APPEARANCE_STORAGE_KEY))
    assert.equal(runtime.theme.themeMode, 'system')
    assert.deepEqual(runtime.theme.appearance, { accent: 'blue', density: 'compact', tableLines: 'grid' })
    assert.equal(runtime.requests.length, 0)
  } finally {
    await runtime.close()
  }
})

test('appearance: invalid workbench storage uses defaults without reading the ERP account', async () => {
  localStorage.clear()
  signIn(1, { ...savedAppearance, theme_mode: 'dark', accent: 'orange' })
  localStorage.setItem(WORKBENCH_APPEARANCE_STORAGE_KEY, '{broken')
  const runtime = await mount({ browserStorageKey: WORKBENCH_APPEARANCE_STORAGE_KEY })
  try {
    assert.equal(runtime.theme.themeMode, 'system')
    assert.deepEqual(runtime.theme.appearance, { accent: 'blue', density: 'compact', tableLines: 'grid' })
    assert.equal(runtime.requests.length, 0)
  } finally {
    await runtime.close()
  }
})

test('appearance: failed local saves retain the selection and recover through the existing retry action', async () => {
  localStorage.clear()
  signIn(1)
  const runtime = await mount({ browserStorageKey: WORKBENCH_APPEARANCE_STORAGE_KEY })
  const storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  const restoreStorage = () => {
    if (storageDescriptor) Object.defineProperty(window, 'localStorage', storageDescriptor)
    else delete window.localStorage
  }
  try {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key) => localStorage.getItem(key),
        setItem: () => { throw new Error('quota exceeded') },
      },
    })
    await settle(() => runtime.theme.setAppearance({ accent: 'orange' }))
    assert.match(runtime.theme.appearanceSaveError, /未保存到此浏览器/u)
    assert.equal(runtime.theme.appearanceSaving, false)
    await settle(() => window.dispatchEvent(new Event('focus')))
    assert.equal(runtime.theme.appearance.accent, 'orange')
    restoreStorage()
    await settle(() => runtime.theme.retryAppearanceSave())
    assert.equal(runtime.theme.appearanceSaveError, '')
    assert.equal(JSON.parse(localStorage.getItem(WORKBENCH_APPEARANCE_STORAGE_KEY)).accent, 'orange')
    assert.equal(runtime.requests.length, 0)
  } finally {
    restoreStorage()
    await runtime.close()
  }
})

test('appearance: switching to browser preferences isolates pending ERP responses and restores each scope', async () => {
  localStorage.clear()
  signIn(1, { ...savedAppearance, accent: 'pink' })
  const chosen = { theme_mode: 'dark', accent: 'teal', density: 'compact', tableLines: 'grid' }
  localStorage.setItem(WORKBENCH_APPEARANCE_STORAGE_KEY, JSON.stringify(chosen))
  const runtime = await mount()
  try {
    await settle(() => runtime.theme.setAppearance({ accent: 'orange' }))
    assert.equal(runtime.requests.length, 1)
    await runtime.setBrowserStorageKey(WORKBENCH_APPEARANCE_STORAGE_KEY)
    assert.equal(runtime.theme.appearance.accent, 'teal')
    await settle(() => runtime.requests[0].reply({ ...savedAppearance, accent: 'orange' }))
    assert.equal(runtime.theme.appearance.accent, 'teal')
    assert.equal(runtime.theme.themeMode, 'dark')
    assert.equal(runtime.theme.appearanceSaving, false)
    await runtime.setBrowserStorageKey('')
    assert.equal(runtime.theme.appearance.accent, 'pink')
    await runtime.setBrowserStorageKey(WORKBENCH_APPEARANCE_STORAGE_KEY)
    assert.equal(runtime.theme.appearance.accent, 'teal')
    assert.deepEqual(JSON.parse(localStorage.getItem(WORKBENCH_APPEARANCE_STORAGE_KEY)), chosen)
  } finally {
    await runtime.close()
  }
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
    await settle(() => signIn(1, { ...savedAppearance, accent: 'purple' }))
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
      runtime.requests[0].reply({ ...savedAppearance, density: 'compact' })
    )
    assert.equal(runtime.requests.length, 2)
    assert.deepEqual(runtime.requests[1].params, {
      theme_mode: 'dark',
      accent: 'green',
      tableLines: 'grid',
    })
    assert.equal(runtime.theme.themeMode, 'dark')
    assert.equal(runtime.theme.appearance.accent, 'green')
    assert.equal(
      document.documentElement.style.getPropertyValue('--erp-accent-hover'),
      '#b3c699'
    )
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
      runtime.requests[1].reply({ ...savedAppearance, accent: 'purple' })
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
      signIn(2, { ...savedAppearance, accent: 'yellow' })
    })
    await settle(() =>
      runtime.requests[0].reply({ ...savedAppearance, accent: 'purple' })
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
  signIn(1, { theme_mode: 'light', accent: 'teal', density: 'standard' })
  const runtime = await mount()
  try {
    assert.equal(runtime.theme.themeMode, 'light')
    assert.deepEqual(runtime.theme.appearance, {
      accent: 'teal',
      density: 'standard',
      tableLines: 'grid',
    })
    assert.equal(
      document.documentElement.style.getPropertyValue('--erp-accent'),
      '#257f7c'
    )
    await settle(() => runtime.theme.setThemeMode('system'))
    await settle(() =>
      runtime.requests[0].reply({ ...savedAppearance, accent: 'teal' })
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
