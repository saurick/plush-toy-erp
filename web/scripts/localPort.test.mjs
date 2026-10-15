import assert from 'node:assert/strict'
import test from 'node:test'
import { isCodexDevSession, selectWebDevPort } from './localPort.mjs'
import { parseStartWebDevArgs } from './startWebDev.mjs'

const ports = { web: 5175, style: 6175, auxStart: 15200 }

test('人工启动固定主端口；Codex 和显式临时验证走已登记辅助端口', async () => {
  assert.equal(await selectWebDevPort({ ports, env: {} }), 5175)
  const findPort = async (actual) => {
    assert.equal(actual, ports)
    return 15207
  }
  for (const env of [{ CODEX_THREAD_ID: 'task' }, { CODEX_CI: '1' }]) {
    assert.equal(await selectWebDevPort({ ports, env, findPort }), 15207)
    assert.equal(
      await selectWebDevPort({ ports, env, isolated: false, findPort }),
      5175
    )
  }
  assert.equal(isCodexDevSession({ CODEX_CI: '0' }), false)
  assert.equal(
    await selectWebDevPort({ ports, env: {}, isolated: true, findPort }),
    15207
  )
})

test('显式端口保持严格校验，辅助端口耗尽不越界占用主入口', async () => {
  assert.equal(
    await selectWebDevPort({
      ports,
      env: { CODEX_CI: '1', ERP_VITE_PORT: '15240' },
    }),
    15240
  )
  await assert.rejects(
    selectWebDevPort({ ports, env: { ERP_VITE_PORT: '5177' } }),
    /auxiliary range/u
  )
  await assert.rejects(
    selectWebDevPort({
      ports,
      env: {},
      isolated: true,
      findPort: async () => {
        throw new Error('aux exhausted')
      },
    }),
    /aux exhausted/u
  )
})

test('启动控制参数不会透传给 Vite，local 与 isolated 不能混用', () => {
  assert.equal(
    parseStartWebDevArgs([], { CODEX_THREAD_ID: 'task' }).isolated,
    true
  )
  const parsed = parseStartWebDevArgs(
    ['--local', '--restart', '--host', '127.0.0.1'],
    { CODEX_CI: '1' }
  )
  assert.equal(parsed.isolated, false)
  assert.equal(parsed.restart, true)
  assert.deepEqual(parsed.viteArgs, ['--host', '127.0.0.1'])
  assert.throws(
    () => parseStartWebDevArgs(['--local', '--isolated'], {}),
    /不能同时使用/u
  )
})
