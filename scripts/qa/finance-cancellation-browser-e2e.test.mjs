import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./finance-cancellation-browser-e2e.mjs', import.meta.url),
  'utf8'
)

test('finance cancellation browser E2E executes from a repository-relative CLI path', () => {
  assert.match(source, /path\.resolve\(process\.argv\[1\]/u)
  assert.match(source, /route\.continue/u)
  assert.match(source, /context\.addInitScript/u)
  assert.match(source, /FINANCE_CANCEL_E2E_CUSTOMER_KEY/u)
  assert.doesNotMatch(source, /route\.fulfill|setupJsonRpcMockServer/u)
})
