import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEV_WORKBENCH_SERVE_PLUGIN_NAMES,
  createDevWorkbenchServePlugins,
} from './devWorkbenchPlugins.mjs'
import { createERPViteConfig } from '../vite.shared.mjs'

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
