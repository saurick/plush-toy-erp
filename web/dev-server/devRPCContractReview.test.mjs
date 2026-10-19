import assert from 'node:assert/strict'
import test from 'node:test'
import { readDevRPCContractReview } from './devRPCContractReview.mjs'
import { createDevQualityGateMiddleware } from './devQualityGatePlugin.mjs'

test('RPC review reader executes only the existing fixed generator flags', async () => {
  let command
  const execute = async (...values) => { command = values; return { stdout: '{}' } }
  await assert.rejects(readDevRPCContractReview('/project', { range: 'staged', execute }), /检查结果不完整/u)
  assert.equal(command[0], process.execPath)
  assert.deepEqual(command[1], ['/project/scripts/gen-public-contracts.mjs', '--review', '--json', '--staged'])
  assert.equal(command[2].env.GIT_OPTIONAL_LOCKS, '0')
  assert.equal(command[2].cwd, '/project')
  let called = false
  await assert.rejects(readDevRPCContractReview('/project', { range: '--write', execute: async () => { called = true } }), /比较范围无效/u)
  assert.equal(called, false)
})

test('RPC review middleware permits only the existing trusted GET scope and rejects arbitrary targets', async () => {
  let calls = 0
  const middleware = createDevQualityGateMiddleware({ projectRoot: '/project', service: {}, readRPCReview: async (root, options) => { calls++; assert.equal(root, '/project'); assert.equal(options.range, 'staged'); return { kind: 'review-fixture' } } })
  const invoke = async (url, { method = 'GET', remoteAddress = '127.0.0.1' } = {}) => {
    const response = { statusCode: 0, destroyed: false, headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value }, end(value) { this.body = JSON.parse(value) } }
    await middleware({ method, url, headers: { host: '127.0.0.1:15200' }, socket: { remoteAddress } }, response, () => {})
    return response
  }
  const accepted = await invoke('/__dev/api/qa/quality-gates/rpc-contract-review?range=staged')
  assert.equal(accepted.statusCode, 200)
  assert.equal(accepted.headers['cache-control'], 'no-store')
  assert.equal(calls, 1)
  for (const query of ['range=invalid', 'range=staged&range=staged', 'path=/etc/passwd', 'base=other']) assert.equal((await invoke(`/__dev/api/qa/quality-gates/rpc-contract-review?${query}`)).statusCode, 400)
  assert.equal((await invoke('/__dev/api/qa/quality-gates/rpc-contract-review', { remoteAddress: '8.8.8.8' })).statusCode, 403)
  assert.equal((await invoke('/__dev/api/qa/quality-gates/rpc-contract-review', { method: 'POST' })).statusCode, 405)
  assert.equal(calls, 1)
})
