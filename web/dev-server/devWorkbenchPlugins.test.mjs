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
import { DEV_DATABASE_MIGRATION_RECOVERY_ROUTE } from '../src/dev-workbench/config/devRuntimeRecovery.mjs'

test('development serve registry is exact and absent from all builds', async () => {
  assert.deepEqual(DEV_WORKBENCH_SERVE_PLUGIN_NAMES, [
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
    'plush-dev-customer-import-dry-run-api',
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
  assert.match(recovery.plugin.transformIndexHtml()[0].children, /= false;/u)
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
      `http://127.0.0.1:5175${DEV_DATABASE_MIGRATION_RECOVERY_ROUTE}`
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
