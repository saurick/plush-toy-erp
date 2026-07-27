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
  assert.match(
    pageSource,
    /rollbackCustomerConfig\(\s*transition\.mutationPayload\s*\)/u
  )
  assert.match(pageSource, /resolveCustomerConfigApplyTransitionAction\(/)
  assert.match(pageSource, /assertEffectiveCustomerConfigIdentity\(/)
  assert.match(pageSource, /assertLocalBackendCustomerContext\(/)
  assert.match(pageSource, /用对应客户配置重新启动后端/)
  assert.match(pageSource, /const effectiveSession = await getEffectiveSession\(\)/)
  assert.doesNotMatch(
    pageSource,
    /getEffectiveSession\(\{\s*customer_key:\s*manifest\.customer_key/u
  )
  assert.match(pageSource, /RpcErrorCode\.AUTH_REQUIRED/)
  assert.match(pageSource, /RpcErrorCode\.ADMIN_DISABLED/)
  assert.match(pageSource, /RpcErrorCode\.PERMISSION_DENIED/)
  assert.match(pageSource, /customer_config_active_revision_required/)
  assert.doesNotMatch(pageSource, /error\?\.message/)
  assert.doesNotMatch(pageSource, /manifestPayload\?\.message/)
  assert.match(pageSource, /已登记的本地开发库/)
  assert.match(pageSource, /!overview\.importSummary\.canApplyTestConfig/)
  assert.match(pageSource, /当前配置包不可应用/)
  assert.match(pageSource, /当前配置只支持预览和试跑/)
  assert.match(pageSource, /当前不会发布或激活/)
  assert.match(pageSource, /当前配置包未开放后端应用/)
  assert.match(pageSource, /importSummary\.testApply\.note/)
  assert.doesNotMatch(pageSource, /publishSkipped/)
  assert.doesNotMatch(pageSource, /catch \(publishError\)/)
})
