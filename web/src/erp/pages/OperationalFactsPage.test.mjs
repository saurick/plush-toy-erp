import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./OperationalFactsPage.jsx', import.meta.url)),
  'utf8'
)

test('finance cancellation requires a bounded business reason and sends it to the canonical action', () => {
  assert.match(source, /title="取消财务记录"/)
  assert.match(source, /placeholder="请填写客户、供应商或账款调整的业务原因"/)
  assert.match(source, /maxLength=\{255\}/)
  assert.match(source, /\{ reason \}/)
  assert.match(source, /currentActiveKey === 'finance'/)
  assert.match(source, /\['production', 'outsourcing'\]\.includes/)
})

test('post-success refresh failure is not reported as a failed cancellation', () => {
  assert.match(source, /已完成，请稍后刷新查看最新结果/)
  assert.match(source, /return false/)
  assert.match(source, /return true/)
})
