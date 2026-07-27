import { createDevCustomerConfigPlugin } from './devCustomerConfigPlugin.mjs'
import { createDevCustomerImportDryRunPlugin } from './devCustomerImportDryRunPlugin.mjs'
import { createDevQaCoveragePlugin } from './devQaCoveragePlugin.mjs'
import { createDevWorkbenchReceiptPlugin } from './devWorkbenchReceiptPlugin.mjs'

export const DEV_WORKBENCH_SERVE_PLUGIN_NAMES = Object.freeze([
  'plush-dev-customer-import-dry-run-api',
  'plush-dev-customer-config',
  'plush-dev-qa-coverage',
  'plush-dev-workbench-receipts',
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
    createDevQaCoveragePlugin({ projectRoot }),
    createDevWorkbenchReceiptPlugin({ projectRoot }),
  ].filter(Boolean)
}
