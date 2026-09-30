import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_WORKBENCH_SERVE_PLUGIN_NAMES,
  createDevWorkbenchServePlugins,
} from './devWorkbenchPlugins.mjs'
import { createERPViteConfig } from '../vite.shared.mjs'
import {
  DEV_DATABASE_MIGRATION_RECOVERY_PLUGIN_NAME,
  createDevDatabaseMigrationRecoveryController,
} from './devDatabaseMigrationRecoveryPlugin.mjs'
import {
  DEV_BACKEND_RECOVERY_ROUTE,
  DEV_DATABASE_MIGRATION_RECOVERY_ROUTE,
  DEV_RUNTIME_RECOVERY_HEADER,
} from '../src/dev-workbench/config/devRuntimeRecovery.mjs'

test('development serve registry is exact with and without a customer, and absent from all builds', async (t) => {
  const previousCustomerKey = process.env.ERP_DEV_CUSTOMER_KEY
  t.after(() => {
    if (previousCustomerKey === undefined) {
      delete process.env.ERP_DEV_CUSTOMER_KEY
    } else {
      process.env.ERP_DEV_CUSTOMER_KEY = previousCustomerKey
    }
  })
  assert.deepEqual(DEV_WORKBENCH_SERVE_PLUGIN_NAMES, [
    'plush-dev-web-instance',
    'plush-dev-customer-import-dry-run-api',
    'plush-dev-customer-config',
    'plush-dev-database-migration',
    'plush-dev-data-preparation',
    'plush-dev-qa-testing',
    'plush-dev-quality-gates',
    'plush-dev-qa-coverage',
    'plush-dev-delivery-bridge',
  ])
  assert.deepEqual(
    createDevWorkbenchServePlugins({
      command: 'build',
      mode: 'development',
      projectRoot: '/unused/project',
    }),
    []
  )
  assert.deepEqual(
    createDevWorkbenchServePlugins({
      command: 'serve',
      mode: 'production',
      projectRoot: '/unused/project',
    }),
    []
  )

  for (const customerKey of ['', 'test-customer']) {
    process.env.ERP_DEV_CUSTOMER_KEY = customerKey
    const configFactory = createERPViteConfig('desktop')
    const pluginNames = (config) => config.plugins.map((plugin) => plugin.name)
    const developmentServe = await configFactory({
      command: 'serve',
      mode: 'development',
    })
    const developmentBuild = await configFactory({
      command: 'build',
      mode: 'development',
    })
    const productionBuild = await configFactory({
      command: 'build',
      mode: 'production',
    })
    const installedServePlugins = pluginNames(developmentServe).filter((name) =>
      DEV_WORKBENCH_SERVE_PLUGIN_NAMES.includes(name)
    )
    assert.deepEqual(installedServePlugins, [
      'plush-dev-web-instance',
      'plush-dev-customer-import-dry-run-api',
      ...(customerKey ? ['plush-dev-customer-config'] : []),
      'plush-dev-database-migration',
      'plush-dev-data-preparation',
      'plush-dev-qa-testing',
      'plush-dev-quality-gates',
      'plush-dev-qa-coverage',
      'plush-dev-delivery-bridge',
    ])
    for (const config of [developmentBuild, productionBuild]) {
      assert.deepEqual(
        pluginNames(config).filter((name) =>
          DEV_WORKBENCH_SERVE_PLUGIN_NAMES.includes(name)
        ),
        []
      )
    }
  }
})

function runRecoveryMiddleware(middleware, { url, accept = '*/*' }) {
  return new Promise((resolve) => {
    const headers = {}
    const response = {
      statusCode: 200,
      setHeader(name, value) {
        headers[name.toLowerCase()] = value
      },
      end(body = '') {
        resolve({
          body: String(body),
          headers,
          nextCalled: false,
          statusCode: this.statusCode,
        })
      },
    }
    middleware({ method: 'GET', url, headers: { accept } }, response, () =>
      resolve({
        body: '',
        headers,
        nextCalled: true,
        statusCode: response.statusCode,
      })
    )
  })
}

test('database migration recovery plugin blocks ERP traffic until verified runtime recovery', async () => {
  const recovery = createDevDatabaseMigrationRecoveryController({
    mode: 'database-migration',
  })
  assert.equal(
    recovery.plugin.name,
    DEV_DATABASE_MIGRATION_RECOVERY_PLUGIN_NAME
  )
  let middleware
  recovery.plugin.configureServer({
    middlewares: {
      use(candidate) {
        middleware = candidate
      },
    },
  })

  const migrationApi = await runRecoveryMiddleware(middleware, {
    url: '/__dev/api/database-migration/summary',
  })
  assert.equal(migrationApi.nextCalled, true)

  const rpc = await runRecoveryMiddleware(middleware, { url: '/rpc' })
  assert.equal(rpc.statusCode, 503)
  assert.equal(JSON.parse(rpc.body).code, 'dev_runtime_recovery_active')

  const productPage = await runRecoveryMiddleware(middleware, {
    url: '/erp/dashboard',
    accept: 'text/html,application/xhtml+xml',
  })
  assert.equal(productPage.statusCode, 302)
  assert.equal(
    productPage.headers.location,
    DEV_DATABASE_MIGRATION_RECOVERY_ROUTE
  )

  recovery.markRuntimeReady()
  const released = await runRecoveryMiddleware(middleware, { url: '/rpc' })
  assert.equal(released.nextCalled, true)
  const scripts = recovery.plugin.transformIndexHtml()
  assert.match(scripts[0].children, /= false;/u)
  assert.equal(scripts[1].injectTo, 'head-prepend')
  assert.equal(scripts[1].attrs.type, 'module')
  assert.match(
    scripts[1].children,
    /import \{ installDevRuntimeRecoveryFetch \} from "\/src\/dev-workbench\/config\/devRuntimeRecovery\.mjs"; installDevRuntimeRecoveryFetch\(window\);/u
  )
})

test('Vite recovery mode opens the migration page and installs the guard only for development serve', async () => {
  const previousRecoveryMode = process.env.ERP_DEV_RECOVERY_MODE
  process.env.ERP_DEV_RECOVERY_MODE = 'database-migration'
  try {
    const configFactory = createERPViteConfig('desktop')
    const serve = await configFactory({ command: 'serve', mode: 'development' })
    const build = await configFactory({ command: 'build', mode: 'production' })
    assert.equal(
      serve.server.open,
      `http://127.0.0.1:${serve.server.port}${DEV_DATABASE_MIGRATION_RECOVERY_ROUTE}`
    )
    assert.equal(
      serve.plugins.some(
        (plugin) => plugin.name === DEV_DATABASE_MIGRATION_RECOVERY_PLUGIN_NAME
      ),
      true
    )
    assert.equal(
      build.plugins.some(
        (plugin) => plugin.name === DEV_DATABASE_MIGRATION_RECOVERY_PLUGIN_NAME
      ),
      false
    )
  } finally {
    if (previousRecoveryMode === undefined) {
      delete process.env.ERP_DEV_RECOVERY_MODE
    } else {
      process.env.ERP_DEV_RECOVERY_MODE = previousRecoveryMode
    }
  }
})

test('停服恢复同时接住电脑、手机和登录入口，总览与迁移页均可达', async () => {
  const recovery = createDevDatabaseMigrationRecoveryController({
    mode: 'database-migration',
    reason: 'local_backend_unavailable',
  })
  let middleware
  recovery.plugin.configureServer({
    middlewares: {
      use: (handler) => {
        middleware = handler
      },
    },
  })
  for (const url of [
    '/erp/dashboard',
    '/m/boss/tasks',
    '/admin-login',
    '/entry',
    '/',
  ]) {
    const response = await runRecoveryMiddleware(middleware, {
      url,
      accept: 'text/html',
    })
    assert.equal(response.statusCode, 302)
    assert.equal(response.headers.location, DEV_BACKEND_RECOVERY_ROUTE)
  }
  for (const url of [
    '/__dev',
    '/__dev/',
    '/__dev/database-migration',
    '/__dev/api/database-migration/summary',
    '/src/index.jsx',
  ]) {
    const response = await runRecoveryMiddleware(middleware, {
      url,
      accept:
        url.startsWith('/__dev/api') || url.startsWith('/src')
          ? '*/*'
          : 'text/html',
    })
    assert.equal(response.nextCalled, true)
  }
  for (const url of ['/rpc/admin', '/templates', '/__dev/api/qa/testing']) {
    const response = await runRecoveryMiddleware(middleware, { url })
    assert.equal(response.statusCode, 503)
    assert.equal(
      response.headers[DEV_RUNTIME_RECOVERY_HEADER],
      DEV_BACKEND_RECOVERY_ROUTE
    )
  }
})

test('前端已启动后停服会关闭业务，恢复必须由完整就绪检查显式解除', async () => {
  let online = true
  const recovery = createDevDatabaseMigrationRecoveryController({
    runtimeChecks: true,
    fetchImpl: async () => {
      if (!online) throw new Error('ECONNREFUSED private diagnostic')
      return new Response('ok')
    },
  })
  let middleware
  recovery.plugin.configureServer({
    middlewares: {
      use: (handler) => {
        middleware = handler
      },
    },
  })
  assert.equal(
    (await runRecoveryMiddleware(middleware, { url: '/rpc/admin' })).nextCalled,
    true
  )
  online = false
  const offline = await runRecoveryMiddleware(middleware, { url: '/rpc/admin' })
  assert.equal(offline.statusCode, 503)
  assert.equal(
    offline.headers[DEV_RUNTIME_RECOVERY_HEADER],
    DEV_BACKEND_RECOVERY_ROUTE
  )
  assert.doesNotMatch(offline.body, /ECONNREFUSED|private/u)
  online = true
  assert.equal(
    (await runRecoveryMiddleware(middleware, { url: '/rpc/admin' })).statusCode,
    503
  )
  recovery.markRuntimeReady()
  assert.equal(
    (await runRecoveryMiddleware(middleware, { url: '/rpc/admin' })).nextCalled,
    true
  )
})

test('并发业务读取共用健康检查，静态资源、仅前端调试和外部后端不检查', async () => {
  let resolveHealth
  let calls = 0
  const recovery = createDevDatabaseMigrationRecoveryController({
    runtimeChecks: true,
    fetchImpl: () => {
      calls += 1
      return new Promise((resolve) => {
        resolveHealth = resolve
      })
    },
  })
  let middleware
  recovery.plugin.configureServer({
    middlewares: {
      use: (handler) => {
        middleware = handler
      },
    },
  })
  assert.equal(
    (await runRecoveryMiddleware(middleware, { url: '/src/index.jsx' }))
      .nextCalled,
    true
  )
  assert.equal(
    (
      await runRecoveryMiddleware(middleware, {
        url: '/__dev/',
        accept: 'text/html',
      })
    ).nextCalled,
    true
  )
  assert.equal(calls, 0)
  const pending = ['/rpc/admin', '/rpc/workflow', '/rpc/customer_config'].map(
    (url) => runRecoveryMiddleware(middleware, { url })
  )
  assert.equal(calls, 1)
  resolveHealth(new Response('ok'))
  assert.equal(
    (await Promise.all(pending)).every((response) => response.nextCalled),
    true
  )
  for (const options of [
    { runtimeChecks: false },
    { runtimeChecks: true, apiOrigin: 'https://example.com' },
  ]) {
    assert.equal(
      createDevDatabaseMigrationRecoveryController(options).plugin,
      null
    )
  }
})

test('服务未启动时 Vite 打开总览，生产构建不安装恢复插件', async (t) => {
  const previousMode = process.env.ERP_DEV_RECOVERY_MODE
  const previousReason = process.env.ERP_DEV_RECOVERY_REASON
  t.after(() => {
    for (const [key, value] of [
      ['ERP_DEV_RECOVERY_MODE', previousMode],
      ['ERP_DEV_RECOVERY_REASON', previousReason],
    ]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  process.env.ERP_DEV_RECOVERY_MODE = 'database-migration'
  process.env.ERP_DEV_RECOVERY_REASON = 'local_backend_unavailable'
  const configFactory = createERPViteConfig('desktop')
  const serve = await configFactory({ command: 'serve', mode: 'development' })
  const build = await configFactory({ command: 'build', mode: 'production' })
  assert.equal(
    serve.server.open,
    `http://127.0.0.1:${serve.server.port}${DEV_BACKEND_RECOVERY_ROUTE}`
  )
  assert.equal(
    build.plugins.some(
      (plugin) => plugin.name === DEV_DATABASE_MIGRATION_RECOVERY_PLUGIN_NAME
    ),
    false
  )
})
