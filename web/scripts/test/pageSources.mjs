import fs from 'node:fs'

const modules = new Map([
  ['DevVersionCenterPage.jsx', 'delivery/version'],
  ['DevDatabaseMigrationPage.jsx', 'delivery/migration'],
  ['DevDrillRecoveryPage.jsx', 'delivery/recovery'],
  ['DevCustomerConfigPage.jsx', 'customer-config'],
])

// Static contracts follow the actual page modules after presentation and
// lifecycle code are separated; no execution or runtime dependency is added.
export function readDevWorkbenchPageSource(name) {
  const directory = modules.get(name)
  if (!directory) throw new Error('Unsupported workbench contract page')
  const root = new URL('../../src/dev-workbench/pages/', import.meta.url)
  const moduleRoot = new URL(`${directory}/`, root)
  const files = fs
    .readdirSync(moduleRoot)
    .filter(
      (file) => /\.(?:jsx|mjs)$/u.test(file) && !file.endsWith('.test.mjs')
    )
    .sort()
  return [
    fs.readFileSync(new URL(name, root), 'utf8'),
    ...files.map((file) => fs.readFileSync(new URL(file, moduleRoot), 'utf8')),
  ].join('\n')
}
