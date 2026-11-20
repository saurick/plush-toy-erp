import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const controlFoundationSource = readFileSync(
  fileURLToPath(
    new URL('../styles/app/control-foundation.css', import.meta.url)
  ),
  'utf8'
)

test('search input and action keep one connected control outline', () => {
  assert.match(
    controlFoundationSource,
    /\.ant-input-search\s+\.ant-input-affix-wrapper,\s*#root \.ant-input-search \.ant-input-affix-wrapper\s*\{[\s\S]*?border-start-end-radius:\s*0;[\s\S]*?border-end-end-radius:\s*0;/u
  )
  assert.match(
    controlFoundationSource,
    /\.ant-input-search\s+\.ant-input-search-button,\s*#root \.ant-input-search \.ant-input-search-button\s*\{[\s\S]*?border-start-start-radius:\s*0;[\s\S]*?border-start-end-radius:\s*var\(--erp-control-radius\);[\s\S]*?border-end-start-radius:\s*0;[\s\S]*?border-end-end-radius:\s*var\(--erp-control-radius\);/u
  )
})
