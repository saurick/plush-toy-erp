import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const pageSource = readFileSync(
  fileURLToPath(new URL('./DevCustomerConfigPage.jsx', import.meta.url)),
  'utf8'
)

test('DevCustomerConfigPage test apply uses canonical publish and transition CAS path', () => {
  assert.match(pageSource, /assertPublishedCustomerConfigIdentity\(/)
  assert.match(pageSource, /confirmCustomerConfigTransition\(\{/)
  assert.match(pageSource, /check:\s*checkCustomerConfigTransition/)
  assert.match(
    pageSource,
    /activateCustomerConfig\(\s*transition\.mutationPayload\s*\)/u
  )
  assert.match(pageSource, /assertEffectiveCustomerConfigIdentity\(/)
  assert.match(pageSource, /!overview\.importSummary\.canApplyTestConfig/)
  assert.match(pageSource, /当前配置包不可应用/)
  assert.match(pageSource, /当前配置只支持预览和试跑/)
  assert.match(pageSource, /当前不会发布或激活/)
  assert.match(pageSource, /当前配置包未开放后端应用/)
  assert.match(pageSource, /importSummary\.testApply\.note/)
  assert.doesNotMatch(pageSource, /publishSkipped/)
  assert.doesNotMatch(pageSource, /catch \(publishError\)/)
})
