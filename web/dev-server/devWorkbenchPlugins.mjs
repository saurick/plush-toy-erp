import { createDevCustomerConfigPlugin } from './devCustomerConfigPlugin.mjs'
import { createDevCustomerImportDryRunPlugin } from './devCustomerImportDryRunPlugin.mjs'
import { createDevDatabaseMigrationPlugin } from './devDatabaseMigrationPlugin.mjs'
import { createDevDataPreparationPlugin } from './devDataPreparationPlugin.mjs'
import { createDevDeliveryBridgePlugin } from './devDeliveryBridgePlugin.mjs'
import { createDevQaCoveragePlugin } from './devQaCoveragePlugin.mjs'
import { createDevQaTestingPlugin } from './devQaTestingPlugin.mjs'
import { createDevQualityGatePlugin } from './devQualityGatePlugin.mjs'

export const DEV_WORKBENCH_SERVE_PLUGIN_NAMES = Object.freeze([
  'plush-dev-customer-import-dry-run-api',
  'plush-dev-customer-config',
  'plush-dev-database-migration',
  'plush-dev-data-preparation',
  'plush-dev-qa-testing',
  'plush-dev-quality-gates',
  'plush-dev-qa-coverage',
  'plush-dev-delivery-bridge',
])

export function createDevWorkbenchServePlugins({
  apiOrigin,
  command,
  devCustomerKey = '',
  mode,
  projectRoot,
} = {}) {
  if (command !== 'serve' || mode !== 'development') return []
  return [
    createDevCustomerImportDryRunPlugin({
      projectRoot,
      apiOrigin,
      devCustomerKey,
    }),
    createDevCustomerConfigPlugin({ projectRoot }),
    createDevDatabaseMigrationPlugin({ projectRoot, apiOrigin }),
    createDevDataPreparationPlugin({ projectRoot }),
    createDevQaTestingPlugin({ projectRoot }),
    createDevQualityGatePlugin({ projectRoot }),
    createDevQaCoveragePlugin({ projectRoot }),
    createDevDeliveryBridgePlugin({ projectRoot }),
  ].filter(Boolean)
}
