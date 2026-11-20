import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import {
  createReactTestHarness,
  installTestDOM,
  registerJSXTestLoader,
} from '../../../scripts/test/reactRuntime.mjs'
import {
  customerConfigStepSearch,
  releaseHistoryForBatch,
  resolveCustomerConfigLocation,
} from './customer-config/navigation.mjs'

registerJSXTestLoader()
const source = (name) => readFileSync(new URL(name, import.meta.url), 'utf8')
const applySource = source('./customer-config/useCustomerConfigTestApply.mjs')
const validationSource = source('./customer-config/ValidationPanel.jsx')

test('test apply retains canonical publish identity and transition CAS', () => {
  for (const expression of [
    /assertPublishedCustomerConfigIdentity\(/u,
    /confirmCustomerConfigTransition\(\{/u,
    /check:\s*checkCustomerConfigTransition/u,
    /activateCustomerConfig\(\s*transition\.mutationPayload\s*\)/u,
    /rollbackCustomerConfig\(\s*transition\.mutationPayload\s*\)/u,
    /resolveCustomerConfigApplyTransitionAction\(/u,
    /assertEffectiveCustomerConfigIdentity\(/u,
    /assertLocalBackendCustomerContext\(/u,
    /用对应客户配置重新启动后端/u,
    /const effectiveSession = await getEffectiveSession\(\)/u,
    /RpcErrorCode\.AUTH_REQUIRED/u,
    /RpcErrorCode\.ADMIN_DISABLED/u,
    /RpcErrorCode\.PERMISSION_DENIED/u,
    /customer_config_active_revision_required/u,
    /已登记的本地开发库/u,
    /!overview\.importSummary\.canApplyTestConfig/u,
    /当前配置包不可应用/u,
  ])
    { assert.match(applySource, expression) }
  assert.doesNotMatch(
    applySource,
    /getEffectiveSession\(\{\s*customer_key:\s*manifest\.customer_key/u
  )
  assert.doesNotMatch(
    applySource,
    /error\?\.message|manifestPayload\?\.message|publishSkipped|catch \(publishError\)/u
  )
  assert.match(
    validationSource,
    /disabled=\{disabled \|\| !importSummary\.canApplyTestConfig\}/u
  )
  assert.match(validationSource, /unavailableReason=\{importSummary\.testApply\.note\}/u)
})

test('route defaults preserve explicit invalid customer identity and clear stale task parameters', () => {
  assert.equal(
    resolveCustomerConfigLocation('').canonicalSearch,
    'customer=yoyoosun'
  )
  assert.equal(
    resolveCustomerConfigLocation('customer=%20').canonicalSearch,
    'customer=yoyoosun'
  )
  assert.equal(
    resolveCustomerConfigLocation('customer=unknown').canonicalSearch,
    'customer=unknown'
  )
  assert.equal(
    resolveCustomerConfigLocation('customer=yoyoosun&customer=unknown')
      .canonicalSearch,
    'customer=yoyoosun&customer=unknown'
  )
  const value = resolveCustomerConfigLocation(
    'customer=yoyoosun&view=diff&section=runtime&action=test-apply&release=batch-a'
  )
  assert.equal(
    value.canonicalSearch,
    'customer=yoyoosun&view=diff&release=batch-a'
  )
  assert.equal(
    resolveCustomerConfigLocation('view=assets&view=diff&release=a&release=b')
      .activeStep,
    'overview'
  )
  assert.equal(
    resolveCustomerConfigLocation('view=assets&view=diff&release=a&release=b')
      .requestedReleaseBatch,
    ''
  )
})

test('release deep links use the fifth step and returning to validation leaves release mode', () => {
  const release = customerConfigStepSearch(
    'customer=yoyoosun&view=preflight&section=flow&release=batch-a',
    'release'
  )
  const route = resolveCustomerConfigLocation(release)
  assert.equal(route.activeStep, 'release')
  assert.equal(route.activeView, 'import')
  assert.equal(route.activeImportAction, 'release')
  assert.equal(route.requestedReleaseBatch, 'batch-a')
  const validation = resolveCustomerConfigLocation(
    customerConfigStepSearch(release, 'import')
  )
  assert.equal(validation.activeStep, 'import')
  assert.equal(validation.activeImportAction, 'dry-run')
  assert.throws(() => customerConfigStepSearch('', '__proto__'), /Unknown/u)
})

test('preflight keeps strategy and extension states visible with different package contents', async (t) => {
  const { container, render } = await createReactTestHarness(t)
  const { buildCustomerConfigDevOverview, DEV_CUSTOMER_CONFIG_REGISTRY } = await import('../config/devCustomerConfig.mjs')
  const { default: CustomerStrategyReview } = await import('./customer-config/CustomerStrategyReview.jsx')
  const { CustomerExtensionRegistry } = await import('./customer-config/CustomerExtensionRegistry.jsx')
  const { customerPackage } = DEV_CUSTOMER_CONFIG_REGISTRY.yoyoosun
  const { customerPackageSummary } = buildCustomerConfigDevOverview({
    customerKey: 'yoyoosun',
    customerPackage: {
      ...customerPackage,
      processPolicies: [],
      runtimeProcessSelections: [{ ...customerPackage.runtimeProcessSelections[0], variantKey: 'unmatched_variant' }],
      extensionPoints: [{ key: 'test_extension', label: '样本扩展', status: 'preview_only', runtimeEnabled: false }],
    },
  })

  await render(h(CustomerStrategyReview, { summary: customerPackageSummary }))
  assert.match(container.textContent, /暂无流程策略草案/u)
  assert.match(container.textContent, /发布候选 · 未核验目标/u)
  assert.match(container.textContent, /此流程选择未匹配登记定义/u)

  await render(h(CustomerStrategyReview, {
    summary: { ...customerPackageSummary, runtimeProcessSelections: [] },
  }))
  assert.match(container.textContent, /暂无流程策略草案/u)
  assert.match(container.textContent, /暂无发布候选流程/u)
  assert.equal(Boolean(container.querySelector('[role="combobox"], [aria-label="当前流程或策略"]')), false)

  await render(h(CustomerExtensionRegistry, { summary: customerPackageSummary }))
  assert.match(container.textContent, /样本扩展/u)
  assert.match(container.textContent, /仅记录待评审扩展候选，当前没有运行时实现/u)
  assert.doesNotMatch(container.textContent, /暂无扩展登记/u)
})

test('release history is bound to the explicitly selected evidence batch', () => {
  const first = {
    action: 'release-readiness',
    status: 'passed',
    result: { releaseBatch: 'batch-a' },
  }
  const second = {
    action: 'release-readiness',
    status: 'blocked',
    result: { releaseBatch: 'batch-b' },
  }
  assert.equal(releaseHistoryForBatch([first, second], 'batch-b'), second)
  assert.equal(releaseHistoryForBatch([first, second], 'batch-a'), first)
  assert.equal(releaseHistoryForBatch([first], ''), null)
  assert.equal(releaseHistoryForBatch([first], 'batch-b'), null)
})

test('URL is the navigation truth across steps, subviews, back and forward', async () => {
  const dom = installTestDOM()
  const { useCustomerConfigRoute } =
    await import('./customer-config/useCustomerConfigRoute.mjs')
  const root = createRoot(document.createElement('div'))
  let controls
  function Probe() {
    controls = {
      ...useCustomerConfigRoute(),
      location: useLocation(),
      history: useNavigate(),
    }
    return null
  }
  try {
    await act(() =>
      root.render(
        h(
          MemoryRouter,
          {
            initialEntries: [
              '/__dev/customer-config?customer=yoyoosun&view=import&action=test-apply',
            ],
            future: { v7_startTransition: true, v7_relativeSplatPath: true },
          },
          h(Probe)
        )
      )
    )
    assert.equal(controls.activeStep, 'import')
    assert.equal(controls.activeImportAction, 'test-apply')
    await act(() => controls.navigate('release'))
    assert.equal(controls.activeStep, 'release')
    await act(() => controls.history(-1))
    assert.equal(controls.activeImportAction, 'test-apply')
    await act(() => controls.history(1))
    assert.equal(controls.activeStep, 'release')
    await act(() => controls.navigate('preflight'))
    await act(() => controls.selectSection('flow'))
    assert.equal(controls.activePreflightSection, 'flow')
    await act(() => controls.navigate('diff'))
    assert.equal(controls.location.search.includes('section='), false)
    await act(() => controls.selectCustomer('unknown'))
    assert.equal(controls.overview.status, 'missing')
  } finally {
    await act(() => root.unmount())
    dom.restore()
  }
})

function deferred() {
  let resolve
  const promise = new Promise((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}
const response = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
})

test('late operation history cannot overwrite a running dry run and unmount aborts all reads', async (t) => {
  const dom = installTestDOM()
  const { useCustomerConfigOperations } =
    await import('./customer-config/useCustomerConfigOperations.mjs')
  const { buildCustomerConfigDevOverviewFromSearch } =
    await import('../config/devCustomerConfig.mjs')
  const { registerAntdAppApis } = await import('../../common/utils/antdApp.js')
  const notices = []
  registerAntdAppApis({
    message: Object.fromEntries(
      ['success', 'error', 'warning'].map((name) => [
        name,
        (...args) => notices.push([name, ...args]),
      ])
    ),
  })
  const history = deferred()
  const run = deferred()
  const signals = []
  let posts = 0
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    signals.push(options.signal)
    if (String(url).includes('/operations')) return history.promise
    if (String(url).includes('/release-batches'))
      { return response({ batches: ['batch-a'] }) }
    if (String(url).endsWith('/session'))
      { return response({
        kind: 'plush.dev-customer-config-session',
        csrfToken: 'x'.repeat(32),
      }) }
    posts += 1
    return run.promise
  })
  const overview = buildCustomerConfigDevOverviewFromSearch('customer=yoyoosun')
  const root = createRoot(document.createElement('div'))
  let controls
  function Probe() {
    controls = useCustomerConfigOperations({
      overview,
      requestedReleaseBatch: '',
    })
    return null
  }
  let request
  try {
    await act(async () => {
      root.render(h(Probe))
      await Promise.resolve()
    })
    await act(async () => {
      request = controls.handleRunDryRun()
      await Promise.resolve()
    })
    assert.equal(controls.dryRunState.status, 'running')
    await act(async () => {
      history.resolve(
        response({
          operations: [
            {
              action: 'dry-run',
              status: 'passed',
              result: { reportPath: 'old-report' },
            },
          ],
        })
      )
      await history.promise
    })
    assert.equal(controls.dryRunState.status, 'running')
    await act(async () => {
      await controls.handleRunDryRun()
    })
    assert.equal(posts, 1, 'busy operation must not be submitted twice')
    await act(() => root.unmount())
    assert(signals.filter(Boolean).every((signal) => signal.aborted))
    run.resolve(response({ summary: {}, reportPath: 'late-report' }))
    await request
    assert.equal(
      notices.length,
      0,
      'a completion after leaving the page must not show a toast'
    )
  } finally {
    registerAntdAppApis({})
    dom.restore()
  }
})

test('historical readiness cannot qualify the current source; changing batch clears a fresh success', async (t) => {
  const dom = installTestDOM()
  const { useCustomerConfigOperations } =
    await import('./customer-config/useCustomerConfigOperations.mjs')
  const { buildCustomerConfigDevOverviewFromSearch } =
    await import('../config/devCustomerConfig.mjs')
  const { registerAntdAppApis } = await import('../../common/utils/antdApp.js')
  registerAntdAppApis({ message: { success() {}, warning() {}, error() {} } })
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('/operations'))
      { return response({
        operations: [
          {
            action: 'release-readiness',
            status: 'passed',
            result: { releaseBatch: 'batch-a' },
          },
        ],
      }) }
    if (String(url).includes('/release-batches'))
      { return response({ batches: ['batch-a', 'batch-b'] }) }
    if (String(url).endsWith('/session'))
      { return response({
        kind: 'plush.dev-customer-config-session',
        csrfToken: 'x'.repeat(32),
      }) }
    return response({
      status: 'ready',
      releaseBatch: JSON.parse(options.body).releaseBatch,
    })
  })
  const overview = buildCustomerConfigDevOverviewFromSearch('customer=yoyoosun')
  const root = createRoot(document.createElement('div'))
  let controls
  function Probe({ batch }) {
    controls = useCustomerConfigOperations({
      overview,
      requestedReleaseBatch: batch,
    })
    return null
  }
  try {
    await act(async () => {
      root.render(h(Probe, { batch: 'batch-a' }))
      await Promise.resolve()
    })
    assert.equal(controls.releaseState.status, 'historical')
    await act(async () => {
      await controls.handleCheckReleaseReadiness()
    })
    assert.equal(controls.releaseState.status, 'success')
    await act(() => root.render(h(Probe, { batch: 'batch-b' })))
    assert.equal(controls.releaseState.status, 'idle')
    await act(() => root.render(h(Probe, { batch: '' })))
    assert.equal(controls.releaseState.status, 'idle')
  } finally {
    await act(() => root.unmount())
    registerAntdAppApis({})
    dom.restore()
  }
})
