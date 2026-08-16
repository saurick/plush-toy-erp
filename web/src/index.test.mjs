import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const source = readFileSync(
  path.resolve(import.meta.dirname, 'index.jsx'),
  'utf8'
)

test('application keeps StrictMode probes on mock runtime without duplicating real backend RPC', () => {
  assert.match(
    source,
    /const rpcMockEnabled\s*=\s*[\s\S]*?import\.meta\.env\.DEV[\s\S]*?VITE_ENABLE_RPC_MOCK/u
  )
  assert.match(
    source,
    /rpcMockEnabled\s*\?\s*<StrictMode>\{application\}<\/StrictMode>\s*:\s*application/u
  )
  assert.doesNotMatch(source, /root\.render\(\s*<StrictMode>/u)
})
