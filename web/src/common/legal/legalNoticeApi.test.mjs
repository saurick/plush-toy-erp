import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(
  new URL('./legalNoticeApi.mjs', import.meta.url),
  'utf8'
)

test('legal notice API uses authenticated admin methods and minimal identity fields', () => {
  assert.match(source, /'legal_notice_status'/u)
  assert.match(source, /'acknowledge_legal_notice'/u)
  assert.match(source, /notice_version/u)
  assert.match(source, /content_fingerprint/u)
  assert.doesNotMatch(source, /phone|password|token/u)
})
