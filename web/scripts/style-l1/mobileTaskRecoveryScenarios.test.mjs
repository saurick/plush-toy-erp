import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./scenarios.mjs', import.meta.url), 'utf8')
const scenario = source.slice(
  source.indexOf("name: 'mobile-nine-role-request-recovery-matrix'"),
  source.indexOf("name: 'mobile-yoyo-boss-urge-only'")
)

test('mobile recovery Style L1 registers every formal role against shared request failures', () => {
  assert.notEqual(scenario.length, 0)
  for (const roleKey of [
    'boss',
    'sales',
    'purchase',
    'pmc',
    'production',
    'warehouse',
    'quality',
    'finance',
    'engineering',
  ]) {
    assert.match(scenario, new RegExp(`roleKey: '${roleKey}'`, 'u'))
    assert.match(scenario, new RegExp(`mobile\\.${roleKey}\\.access`, 'u'))
  }
  for (const failure of [
    'network',
    'timeout',
    'unavailable',
    'invalid-success',
    'permission',
    'stale',
  ]) {
    assert.match(scenario, new RegExp(`failure: '${failure}'`, 'u'))
  }
})

test('mobile recovery Style L1 fails only role-task reads and proves explicit retry recovery', () => {
  assert.match(scenario, /body\.method === 'list_role_tasks'/u)
  assert.match(scenario, /route\.abort\('failed'\)/u)
  assert.match(scenario, /status: 408/u)
  assert.match(scenario, /status: 503/u)
  assert.match(scenario, /status: 403/u)
  assert.match(scenario, /RpcErrorCode\.PERMISSION_DENIED/u)
  assert.match(scenario, /code: 40922/u)
  assert.match(scenario, /result: null/u)
  assert.match(scenario, /expectText\(page, '任务加载失败'\)/u)
  assert.match(scenario, /expectButton\(page, '重新加载'\)/u)
  assert.match(scenario, /state: 'hidden'/u)
  assert.match(scenario, /expectedConsoleErrorPatterns/u)
  assert.match(scenario, /path=\\\/m\\\/boss\\\/tasks/u)
  assert.match(scenario, /status of 408/u)
  assert.match(scenario, /status of 503/u)
  assert.match(scenario, /status of 403/u)
  assert.doesNotMatch(scenario, /create_task|complete_task|post_/u)
})
