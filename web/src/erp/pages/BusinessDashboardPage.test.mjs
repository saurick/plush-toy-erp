import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { transformWithEsbuild } from 'vite'

const source = readFileSync(
  fileURLToPath(new URL('./BusinessDashboardPage.jsx', import.meta.url)),
  'utf8'
)

test('business dashboard remains valid JSX', async () => {
  await transformWithEsbuild(source, 'BusinessDashboardPage.jsx', {
    loader: 'jsx',
    jsx: 'automatic',
  })
})
