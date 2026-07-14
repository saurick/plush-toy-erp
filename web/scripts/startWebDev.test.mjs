import assert from 'node:assert/strict'
import test from 'node:test'

import { createERPViteConfig } from '../vite.shared.mjs'
import { parseStartWebDevArgs } from './startWebDev.mjs'

test('start web dev: 默认启用共享 runtime preflight', () => {
  assert.deepEqual(parseStartWebDevArgs([], {}), {
    apiOrigin: 'http://127.0.0.1:8300',
    frontendOnly: false,
    viteArgs: [],
  })
})

test('start web dev: frontend-only 必须显式启用且保留 Vite 参数', () => {
  assert.deepEqual(
    parseStartWebDevArgs(['--', '--frontend-only', '--host', '127.0.0.1'], {
      API_ORIGIN: 'http://localhost:8300',
    }),
    {
      apiOrigin: 'http://localhost:8300',
      frontendOnly: true,
      viteArgs: ['--host', '127.0.0.1'],
    }
  )
  assert.equal(
    parseStartWebDevArgs([], { ERP_FRONTEND_ONLY: '1' }).frontendOnly,
    false,
    '遗留 shell 环境不能把普通 pnpm start 静默降级'
  )
})

test('start web dev: preflight 地址与 Vite RPC/template 代理使用同一 API_ORIGIN', async () => {
  const previousAPIOrigin = process.env.API_ORIGIN
  process.env.API_ORIGIN = 'http://127.0.0.1:18430/'
  try {
    const configFactory = createERPViteConfig('desktop')
    const config = await configFactory({
      command: 'serve',
      mode: 'development',
    })
    assert.equal(config.server.proxy['/rpc'].target, 'http://127.0.0.1:18430')
    assert.equal(
      config.server.proxy['/templates'].target,
      'http://127.0.0.1:18430'
    )
  } finally {
    if (previousAPIOrigin === undefined) delete process.env.API_ORIGIN
    else process.env.API_ORIGIN = previousAPIOrigin
  }
})
